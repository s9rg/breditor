use std::{fmt, str::FromStr};

use crate::schema::SchemaFingerprintParseError;

const PREFIX: &str = "sha256:";
const DIGEST_HEX_BYTES: usize = 64;
const TEXT_BYTES: usize = PREFIX.len() + DIGEST_HEX_BYTES;

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

impl FromStr for SchemaFingerprint {
    type Err = SchemaFingerprintParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes = value.as_bytes();
        if bytes.len() != TEXT_BYTES {
            return Err(SchemaFingerprintParseError::InvalidLength {
                actual: bytes.len(),
                expected: TEXT_BYTES,
            });
        }
        if !bytes.starts_with(PREFIX.as_bytes()) {
            return Err(SchemaFingerprintParseError::InvalidPrefix);
        }

        let mut digest = [0_u8; 32];
        for (digest_index, output) in digest.iter_mut().enumerate() {
            let high_index = PREFIX.len() + digest_index * 2;
            let low_index = high_index + 1;
            let high = lower_hex_value(bytes[high_index])
                .ok_or(SchemaFingerprintParseError::InvalidHexDigit { index: high_index })?;
            let low = lower_hex_value(bytes[low_index])
                .ok_or(SchemaFingerprintParseError::InvalidHexDigit { index: low_index })?;
            *output = high << 4 | low;
        }
        Ok(Self(digest))
    }
}

impl TryFrom<&str> for SchemaFingerprint {
    type Error = SchemaFingerprintParseError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl TryFrom<String> for SchemaFingerprint {
    type Error = SchemaFingerprintParseError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

const fn lower_hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
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
    use crate::schema::SchemaFingerprintParseError;

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

    #[test]
    fn canonical_text_roundtrips_without_serde() -> Result<(), SchemaFingerprintParseError> {
        const TEXT: &str =
            "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
        let fingerprint: SchemaFingerprint = TEXT.parse()?;
        assert_eq!(fingerprint.to_string(), TEXT);
        assert_eq!(SchemaFingerprint::try_from(TEXT), Ok(fingerprint));
        assert_eq!(SchemaFingerprint::try_from(TEXT.to_owned()), Ok(fingerprint));
        Ok(())
    }

    #[test]
    fn parser_rejects_noncanonical_text_without_retaining_payload() {
        assert_eq!(
            "sha256:00".parse::<SchemaFingerprint>(),
            Err(SchemaFingerprintParseError::InvalidLength { actual: 9, expected: 71 })
        );
        assert_eq!(
            "sha512:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173"
                .parse::<SchemaFingerprint>(),
            Err(SchemaFingerprintParseError::InvalidPrefix)
        );
        assert_eq!(
            "sha256:68Aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173"
                .parse::<SchemaFingerprint>(),
            Err(SchemaFingerprintParseError::InvalidHexDigit { index: 9 })
        );
        assert_eq!(
            "sha256:68gecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173"
                .parse::<SchemaFingerprint>(),
            Err(SchemaFingerprintParseError::InvalidHexDigit { index: 9 })
        );
    }
}
