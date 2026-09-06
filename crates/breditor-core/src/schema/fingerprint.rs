use std::fmt;

/// Collision-resistant identity of one complete compiled content schema.
///
/// A fingerprint is derived from Breditor's versioned canonical schema
/// encoding. It identifies content meaning; it is not a package signature,
/// authorization token, provenance proof, or process-local validation proof.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SchemaFingerprint([u8; 32]);

impl SchemaFingerprint {
    pub(super) const fn from_digest(digest: [u8; 32]) -> Self {
        Self(digest)
    }

    /// Returns the exact 32-byte SHA-256 digest.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Display for SchemaFingerprint {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("sha256:")?;
        for byte in self.0 {
            write!(formatter, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl fmt::Debug for SchemaFingerprint {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        // The digest is safe diagnostic identity. Deliberately expose neither
        // canonical input bytes nor any process-local proof identity.
        formatter.debug_tuple("SchemaFingerprint").field(&self.to_string()).finish()
    }
}

#[cfg(test)]
mod tests {
    use super::SchemaFingerprint;

    #[test]
    fn display_is_fixed_lowercase_sha256_text() {
        let fingerprint = SchemaFingerprint::from_digest([
            0x00, 0x01, 0x0a, 0x10, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88, 0x77, 0x66,
            0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02,
            0x01, 0xab, 0xcd, 0xef,
        ]);

        assert_eq!(
            fingerprint.to_string(),
            "sha256:00010a10ffeeddccbbaa99887766554433221100090807060504030201abcdef"
        );
        assert_eq!(fingerprint.as_bytes()[4], 0xff);
    }

    #[test]
    fn debug_exposes_only_the_canonical_digest_identity() {
        let fingerprint = SchemaFingerprint::from_digest([0x5a; 32]);
        assert_eq!(
            format!("{fingerprint:?}"),
            "SchemaFingerprint(\"sha256:5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a\")"
        );
    }
}
