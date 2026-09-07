use crate::{identity::QualifiedName, schema::PersistedTypeRevision};

/// Owned persisted identity of one inline format admitted by a profile.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileInlineFormatDescriptor {
    kind: QualifiedName,
    revision: PersistedTypeRevision,
}

impl CompiledProfileInlineFormatDescriptor {
    pub(super) const fn new(kind: QualifiedName, revision: PersistedTypeRevision) -> Self {
        Self { kind, revision }
    }

    /// Returns the namespaced inline-format kind.
    #[must_use]
    pub const fn kind(&self) -> &QualifiedName {
        &self.kind
    }

    /// Returns the persisted semantic revision of this format definition.
    #[must_use]
    pub const fn revision(&self) -> PersistedTypeRevision {
        self.revision
    }
}
