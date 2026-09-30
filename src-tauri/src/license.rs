//! Offline Ed25519 license verification for Orblune Premium.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Replace with the production license public key (32-byte hex) before shipping.
pub const LICENSE_PUBLIC_KEY_HEX: &str =
    "52c51f57421b563e100f604202e17413991ecd7cfaae8868422c67cb632b2053";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub tier: String,
    pub issued_at: i64,
    pub order_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseToken {
    pub payload: LicensePayload,
    pub signature: String,
}

fn verifying_key() -> Result<VerifyingKey, String> {
    let bytes = hex::decode(LICENSE_PUBLIC_KEY_HEX).map_err(|e| e.to_string())?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "License public key must be 32 bytes".to_string())?;
    VerifyingKey::from_bytes(&arr).map_err(|e| e.to_string())
}

fn canonical_message(payload: &LicensePayload) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(payload.tier.as_bytes());
    hasher.update(b"|");
    hasher.update(payload.issued_at.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(payload.order_id.as_bytes());
    hasher.finalize().to_vec()
}

pub fn verify_license_token(token: &str) -> Result<LicensePayload, String> {
    let decoded = B64.decode(token.trim()).map_err(|e| e.to_string())?;
    let license: LicenseToken =
        serde_json::from_slice(&decoded).map_err(|e| format!("Invalid license format: {e}"))?;

    if license.payload.tier != "premium" {
        return Err("License tier is not premium".into());
    }

    let sig_bytes = B64
        .decode(license.signature.trim())
        .map_err(|e| e.to_string())?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "Invalid signature length".to_string())?;
    let signature = Signature::from_bytes(&sig_arr);

    let key = verifying_key()?;
    let message = canonical_message(&license.payload);
    key.verify(&message, &signature)
        .map_err(|_| "License signature is invalid".to_string())?;

    Ok(license.payload)
}

#[tauri::command]
pub fn verify_license(token: String) -> Result<LicensePayload, String> {
    verify_license_token(&token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_tampered_token() {
        assert!(verify_license_token("not-a-real-license").is_err());
        assert!(verify_license_token("").is_err());
    }
}
