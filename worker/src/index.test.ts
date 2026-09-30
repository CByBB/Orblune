import { describe, expect, it } from "vitest";
import { sortObject, verifyIpnSignature } from "./index";

describe("IPN signature", () => {
  it("sorts keys recursively", () => {
    expect(sortObject({ b: 1, a: { d: 2, c: 3 } })).toEqual({
      a: { c: 3, d: 2 },
      b: 1,
    });
  });

  it("rejects a wrong HMAC", async () => {
    const body = { payment_status: "finished", order_id: "abc" };
    const ok = await verifyIpnSignature(body, "deadbeef", "secret");
    expect(ok).toBe(false);
  });

  it("accepts a correct HMAC-SHA512", async () => {
    const body = { payment_status: "finished", order_id: "abc" };
    const secret = "test-secret";
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
    expect(await verifyIpnSignature(body, hex, secret)).toBe(true);
  });
});
