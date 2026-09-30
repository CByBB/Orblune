/**
 * Generate a matching Ed25519 seed + public key for Orblune Premium.
 * Run: node scripts/gen-license-keys.mjs
 *
 * Put the seed hex in Cloudflare: LICENSE_SIGNING_KEY_HEX
 * Put the public hex in:
 *   - src-tauri/src/license.rs  LICENSE_PUBLIC_KEY_HEX
 *   - src/lib/license.ts        LICENSE_PUBLIC_KEY_HEX
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privDer = privateKey.export({ format: "der", type: "pkcs8" });
// PKCS8 Ed25519 ends with 0x04 0x20 + 32-byte seed
const seed = Buffer.from(privDer).subarray(privDer.length - 32);

const pubDer = publicKey.export({ format: "der", type: "spki" });
const pub = Buffer.from(pubDer).subarray(pubDer.length - 32);

console.log("LICENSE_SIGNING_KEY_HEX=");
console.log(seed.toString("hex"));
console.log("");
console.log("LICENSE_PUBLIC_KEY_HEX=");
console.log(pub.toString("hex"));
