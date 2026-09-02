use crate::local_log::{
    LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
    LocalLogStorageScopeId,
};

/// Independently trusted association for one initial storage-root selection.
///
/// These values must originate outside root JSON. They identify the storage
/// profile, scope, and first authoritative head, but are not authorization,
/// durability evidence, or proof that the named storage was provisioned.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageRootBinding {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    committed_head_id: LocalLogStorageHeadId,
}

impl LocalLogStorageRootBinding {
    /// Creates one complete trusted root association.
    #[must_use]
    pub const fn new(
        profile_id: LocalLogStorageProfileId,
        profile_version: LocalLogStorageProfileVersion,
        scope_id: LocalLogStorageScopeId,
        committed_head_id: LocalLogStorageHeadId,
    ) -> Self {
        Self { profile_id, profile_version, scope_id, committed_head_id }
    }

    /// Returns the trusted storage-profile identity.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        &self.profile_id
    }

    /// Returns the trusted storage-profile contract version.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.profile_version
    }

    /// Returns the trusted storage scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the trusted first authoritative head identity.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageRootBinding;
    use crate::local_log::{
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId,
    };

    #[test]
    fn binding_owns_exactly_the_independently_trusted_root_fields()
    -> Result<(), Box<dyn std::error::Error>> {
        let profile = LocalLogStorageProfileId::try_new("breditor/test-storage")?;
        let version = LocalLogStorageProfileVersion::try_new(1)?;
        let scope = LocalLogStorageScopeId::try_new("scope:test")?;
        let committed = LocalLogStorageHeadId::try_new("head:root")?;
        let binding = LocalLogStorageRootBinding::new(
            profile.clone(),
            version,
            scope.clone(),
            committed.clone(),
        );

        assert_eq!(binding.profile_id(), &profile);
        assert_eq!(binding.profile_version(), version);
        assert_eq!(binding.scope_id(), &scope);
        assert_eq!(binding.committed_head_id(), &committed);
        Ok(())
    }
}
