/**
 * Orblune payment worker: NOWPayments checkout + IPN + Ed25519 license signing.
 *
 * Secrets (wrangler secret put):
 * - NOWPAYMENTS_API_KEY
 * - NOWPAYMENTS_IPN_SECRET
 * - LICENSE_SIGNING_KEY_HEX  (64-byte seed hex for Ed25519)
 */

export interface Env {
  NOWPAYMENTS_API_KEY: string;
  NOWPAYMENTS_IPN_SECRET: string;
  LICENSE_SIGNING_KEY_HEX: string;
  NOWPAYMENTS_API_URL: string;
  PRODUCT_NAME: string;
  PRICE_AMOUNT: string;
  PRICE_CURRENCY: string;
  ORDERS: KVNamespace;
}

type OrderRecord = {
  status: "pending" | "confirming" | "finished" | "failed" | "expired";
  invoiceUrl?: string;
  paymentId?: string;
  license?: string;
  createdAt: number;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Sort object keys recursively for NOWPayments IPN signature. */
export function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export async function verifyIpnSignature(
  body: unknown,
  signature: string,
  secret: string,
): Promise<boolean> {
  const payload = JSON.stringify(sortObject(body));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === signature.toLowerCase();
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const dig = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(dig);
}

/**
 * Sign with WebCrypto Ed25519 when available; otherwise produce a
 * deterministic placeholder for local/dev without secrets.
 */
async function signLicense(
  env: Env,
  payload: { tier: string; issuedAt: number; orderId: string },
): Promise<string> {
  const message = await sha256(
    new TextEncoder().encode(`${payload.tier}|${payload.issuedAt}|${payload.orderId}`),
  );

  if (!env.LICENSE_SIGNING_KEY_HEX || env.LICENSE_SIGNING_KEY_HEX.length < 64) {
    throw new Error("LICENSE_SIGNING_KEY_HEX is not configured");
  }

  // Prefer SubtleCrypto Ed25519 (supported on modern Workers)
  try {
    const pkcs8 = buildPkcs8FromSeed(hexToBytes(env.LICENSE_SIGNING_KEY_HEX).slice(0, 32));
    const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, [
      "sign",
    ]);
    const signature = await crypto.subtle.sign("Ed25519", key, message);
    const token = {
      payload,
      signature: b64(signature),
    };
    return b64(new TextEncoder().encode(JSON.stringify(token)));
  } catch (e) {
    throw new Error(`License signing failed: ${String(e)}`);
  }
}

/** Minimal PKCS8 wrapper for a 32-byte Ed25519 seed. */
function buildPkcs8FromSeed(seed: Uint8Array): ArrayBuffer {
  // ASN.1 DER for Ed25519 private key
  const prefix = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const out = new Uint8Array(prefix.length + 32);
  out.set(prefix, 0);
  out.set(seed.subarray(0, 32), prefix.length);
  return out.buffer;
}

function htmlPage(title: string, body: string): Response {
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #071018; color: #e8f1f6;
    }
    main {
      max-width: 28rem; padding: 2rem 1.5rem; text-align: center;
    }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.5; color: #a9c0cd; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`;
  return new Response(page, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
  });
}

async function createInvoice(env: Env, orderId: string, origin: string) {
  const res = await fetch(`${env.NOWPAYMENTS_API_URL}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.NOWPAYMENTS_API_KEY,
    },
    body: JSON.stringify({
      price_amount: Number(env.PRICE_AMOUNT),
      price_currency: env.PRICE_CURRENCY,
      order_id: orderId,
      order_description: env.PRODUCT_NAME,
      ipn_callback_url: `${origin}/api/ipn`,
      success_url: `${origin}/success`,
      cancel_url: `${origin}/cancel`,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments invoice error ${res.status}: ${text}`);
  }
  return res.json() as Promise<{ id: string; invoice_url: string }>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/checkout") {
      if (!env.NOWPAYMENTS_API_KEY) {
        return json({ error: "Payments are not configured" }, 503);
      }
      const orderId = crypto.randomUUID();
      try {
        const invoice = await createInvoice(env, orderId, url.origin);
        const record: OrderRecord = {
          status: "pending",
          invoiceUrl: invoice.invoice_url,
          paymentId: String(invoice.id),
          createdAt: Date.now(),
        };
        await env.ORDERS.put(orderId, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 7 });
        return json({ orderId, invoiceUrl: invoice.invoice_url });
      } catch (e) {
        return json({ error: String(e) }, 502);
      }
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/orders/")) {
      const orderId = url.pathname.split("/").pop()!;
      const raw = await env.ORDERS.get(orderId);
      if (!raw) return json({ status: "expired" });
      const order = JSON.parse(raw) as OrderRecord;
      return json({ status: order.status, license: order.license });
    }

    if (request.method === "POST" && url.pathname === "/api/ipn") {
      const signature = request.headers.get("x-nowpayments-sig") ?? "";
      const body = await request.json();
      const ok = await verifyIpnSignature(body, signature, env.NOWPAYMENTS_IPN_SECRET || "");
      if (!ok) return json({ error: "invalid signature" }, 401);

      const paymentStatus = String((body as { payment_status?: string }).payment_status ?? "");
      const orderId = String((body as { order_id?: string }).order_id ?? "");
      if (!orderId) return json({ error: "missing order_id" }, 400);

      const raw = await env.ORDERS.get(orderId);
      if (!raw) return json({ error: "unknown order" }, 404);
      const order = JSON.parse(raw) as OrderRecord;

      if (paymentStatus === "finished") {
        const payload = {
          tier: "premium",
          issuedAt: Math.floor(Date.now() / 1000),
          orderId,
        };
        const license = await signLicense(env, payload);
        order.status = "finished";
        order.license = license;
      } else if (["failed", "refunded", "expired"].includes(paymentStatus)) {
        order.status = paymentStatus === "expired" ? "expired" : "failed";
      } else if (["confirming", "sending", "partially_paid", "waiting"].includes(paymentStatus)) {
        order.status = "confirming";
      }

      await env.ORDERS.put(orderId, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 30 });
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/success") {
      return htmlPage(
        "Payment received",
        "You can close this tab and return to Orblune. Premium unlocks automatically once payment is confirmed.",
      );
    }

    if (request.method === "GET" && url.pathname === "/cancel") {
      return htmlPage(
        "Payment canceled",
        "No charge was completed. You can close this tab and try Unlock again in Orblune whenever you’re ready.",
      );
    }

    return json({ name: "orblune-pay", ok: true });
  },
};
