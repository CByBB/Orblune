import { friendlyError } from "./errors";

/** License public key must match the Cloudflare Worker signing key (hex). */
export const LICENSE_PUBLIC_KEY_HEX =
  "52c51f57421b563e100f604202e17413991ecd7cfaae8868422c67cb632b2053";

/** Checkout Worker base URL — replace after deploy. */
export const WORKER_URL =
  import.meta.env.VITE_ORBLUNE_WORKER_URL ?? "https://orblune-pay.orblune-pay.workers.dev";

export type LicensePayload = {
  tier: string;
  issuedAt: number;
  orderId: string;
};

export type CheckoutResponse = {
  orderId: string;
  invoiceUrl: string;
};

export type OrderStatus = {
  status: "pending" | "confirming" | "finished" | "failed" | "expired";
  license?: string;
};

export async function startCheckout(): Promise<CheckoutResponse> {
  if (!WORKER_URL || WORKER_URL.includes("example.workers.dev")) {
    throw new Error(
      "Payments are not set up yet. The checkout server still needs to be deployed.",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "orblune-premium" }),
    });
  } catch (e) {
    throw new Error(
      friendlyError(e, "Could not reach the payment server. Check your internet connection and try again."),
    );
  }
  if (!res.ok) {
    throw new Error("The payment service is temporarily unavailable. Please try again in a moment.");
  }
  return res.json() as Promise<CheckoutResponse>;
}

export async function pollOrder(orderId: string): Promise<OrderStatus> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/orders/${orderId}`);
  } catch (e) {
    throw new Error(
      friendlyError(e, "Lost connection while confirming payment. Check your internet and try again."),
    );
  }
  if (!res.ok) {
    throw new Error("Could not confirm payment status. Please try again in a moment.");
  }
  return res.json() as Promise<OrderStatus>;
}

export async function verifyLicenseNative(token: string): Promise<LicensePayload> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LicensePayload>("verify_license", { token });
}
