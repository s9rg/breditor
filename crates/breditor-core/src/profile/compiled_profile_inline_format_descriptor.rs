use crate::{
    extension::InlineFormatPropertyContractV1, identity::QualifiedName,
    schema::PersistedTypeRevision,
};

/// Owned persisted identity of one inline format admitted by a profile.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileInlineFormatDescriptor {
    kind: QualifiedName,
    revision: PersistedTypeRevision,
    property_contract: Option<InlineFormatPropertyContractV1>,
}

impl CompiledProfileInlineFormatDescriptor {
    pub(super) const fn new(
        kind: QualifiedName,
        revision: PersistedTypeRevision,
        property_contract: Option<InlineFormatPropertyContractV1>,
    ) -> Self {
        Self { kind, revision, property_contract }
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

    /// Returns this format's typed property contract, if it is property-bearing.
    #[must_use]
    pub const fn property_contract(&self) -> Option<&InlineFormatPropertyContractV1> {
        self.property_contract.as_ref()
    }
}
