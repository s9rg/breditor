use crate::{identity::QualifiedName, schema::PersistedTypeRevision};

/// A sealed property-free inline-format declaration for the base-text seam.
///
/// The containing [`super::ExtensionManifest`] owns the declaration. Version
/// `V1` names this checked Rust declaration contract, not a JSON or persistence
/// format. Properties, entity identity, inclusivity, exclusions, groups,
/// normalization, callbacks, and custom codecs are intentionally impossible to
/// express.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InlineFormatSpecV1 {
    kind: QualifiedName,
    revision: PersistedTypeRevision,
}

impl InlineFormatSpecV1 {
    /// Creates a property-free inline-format declaration from checked parts.
    #[must_use]
    pub const fn new(kind: QualifiedName, revision: PersistedTypeRevision) -> Self {
        Self { kind, revision }
    }

    /// Returns the qualified semantic format kind.
    #[must_use]
    pub const fn kind(&self) -> &QualifiedName {
        &self.kind
    }

    /// Returns the independent persisted revision of this format kind.
    #[must_use]
    pub const fn revision(&self) -> PersistedTypeRevision {
        self.revision
    }
}
