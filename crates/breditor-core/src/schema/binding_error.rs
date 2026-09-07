use thiserror::Error;

use crate::schema::{SchemaFingerprint, SchemaId};

/// Why a durable schema binding cannot be admitted by a compiled schema.
///
/// A durable binding consists of both the human-readable [`SchemaId`] and the
/// collision-resistant [`SchemaFingerprint`]. Matching only one component is
/// never sufficient.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum SchemaBindingError {
    /// The human-readable schema selectors differ.
    #[error("schema binding targets {found}; expected {expected}")]
    SchemaIdMismatch {
        /// Selector required by the compiled schema.
        expected: SchemaId,
        /// Selector presented by the durable value.
        found: SchemaId,
    },
    /// The selectors match but the complete-definition fingerprints differ.
    #[error("schema binding fingerprint {found} does not match expected fingerprint {expected}")]
    SchemaFingerprintMismatch {
        /// Fingerprint required by the compiled schema.
        expected: SchemaFingerprint,
        /// Fingerprint presented by the durable value.
        found: SchemaFingerprint,
    },
    /// A legacy exact-base-only boundary received another compiled definition.
    #[error(
        "legacy V1 requires exact {expected_schema} ({expected_fingerprint}); found {found_schema} ({found_fingerprint})"
    )]
    LegacyV1RequiresExactBase {
        /// Exact built-in base selector required by the legacy boundary.
        expected_schema: SchemaId,
        /// Exact built-in base fingerprint required by the legacy boundary.
        expected_fingerprint: SchemaFingerprint,
        /// Selector owned by the supplied compiled schema.
        found_schema: SchemaId,
        /// Fingerprint owned by the supplied compiled schema.
        found_fingerprint: SchemaFingerprint,
    },
}
