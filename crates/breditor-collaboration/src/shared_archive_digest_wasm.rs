//! Thin bounded integrity owner. It owns no editor, profile, provider or native file.
use crate::archive_digest::{
    ArchiveDigest, MAX_ARCHIVE_DIGEST_BYTES, MAX_ARCHIVE_DIGEST_CHUNK_BYTES,
};
use wasm_bindgen::prelude::*;

/// Dedicated SHA-256 stream. File callers must bound byte copies before entering Wasm,
/// and free this owner on success, refusal, cancellation or host/source changes.
#[wasm_bindgen]
pub struct SharedArchiveDigest {
    inner: ArchiveDigest,
}
#[wasm_bindgen]
impl SharedArchiveDigest {
    /// Exact independent integrity-stream revision, never a document/history protocol version.
    pub fn version() -> String {
        "1".into()
    }
    /// Independent total hash ceiling as a canonical decimal, not a storage limit increase.
    pub fn maximum_bytes() -> String {
        MAX_ARCHIVE_DIGEST_BYTES.to_string()
    }
    /// Largest byte copy admitted per update, as a canonical decimal.
    pub fn maximum_chunk_bytes() -> String {
        MAX_ARCHIVE_DIGEST_CHUNK_BYTES.to_string()
    }
    /// Select an exact canonical decimal total before any input, avoiding numeric ABI coercion.
    /// # Errors
    /// Noncanonical/overflowing strings or an overlarge total refuse without an owner.
    pub fn create(expected_bytes: &str) -> Result<Self, JsValue> {
        if expected_bytes.len() > 10 {
            return Err(JsValue::from_str("archive digest selected length"));
        }
        let expected = expected_bytes
            .parse::<u32>()
            .map_err(|_| JsValue::from_str("archive digest selected length"))?;
        if expected.to_string() != expected_bytes {
            return Err(JsValue::from_str("archive digest canonical selected length"));
        }
        Ok(Self {
            inner: ArchiveDigest::new(expected)
                .map_err(|error| JsValue::from_str(&error.to_string()))?,
        })
    }
    /// Consume bounded bytes without retaining their input buffer.
    /// # Errors
    /// Budget, selected-length overflow and completed state refuse before hash-state mutation.
    pub fn update(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner.update(bytes).map_err(|error| JsValue::from_str(&error.to_string()))
    }
    /// Finish once at the exact selected length, returning lowercase SHA-256 hex.
    /// The native owner remains valid only for explicit cleanup; no further updates succeed.
    /// # Errors
    /// Premature completion refuses without mutation; repeated completion refuses as closed.
    pub fn finish(&mut self) -> Result<String, JsValue> {
        use std::fmt::Write;
        let bytes = self.inner.finish().map_err(|error| JsValue::from_str(&error.to_string()))?;
        let mut output = String::with_capacity(64);
        for byte in bytes {
            let _ = write!(&mut output, "{byte:02x}");
        }
        Ok(output)
    }
}
