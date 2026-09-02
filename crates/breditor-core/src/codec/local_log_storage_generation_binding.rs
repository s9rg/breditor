use thiserror::Error;

use crate::local_log::{
    LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
    LocalLogStorageScopeId,
};

/// Trusted host association for one ordinary storage-generation rotation.
///
/// These values must originate outside manifest JSON. The binding identifies
/// the profile, scope, selected prior head, and proposed replacement head; it
/// is not authorization, a fence capability, or evidence of storage finality.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageGenerationBinding {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    expected_head_id: LocalLogStorageHeadId,
    committed_head_id: LocalLogStorageHeadId,
}

impl LocalLogStorageGenerationBinding {
    /// Creates one trusted, head-advancing rotation association.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationBindingError::HeadNotAdvanced`] when
    /// the expected and proposed committed head identities are equal.
    pub fn try_new(
        profile_id: LocalLogStorageProfileId,
        profile_version: LocalLogStorageProfileVersion,
        scope_id: LocalLogStorageScopeId,
        expected_head_id: LocalLogStorageHeadId,
        committed_head_id: LocalLogStorageHeadId,
    ) -> Result<Self, LocalLogStorageGenerationBindingError> {
        if expected_head_id == committed_head_id {
            return Err(LocalLogStorageGenerationBindingError::HeadNotAdvanced);
        }
        Ok(Self { profile_id, profile_version, scope_id, expected_head_id, committed_head_id })
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

    /// Returns the authoritative prior-head identity expected by the rotation.
    #[must_use]
    pub const fn expected_head_id(&self) -> &LocalLogStorageHeadId {
        &self.expected_head_id
    }

    /// Returns the distinct proposed committed-head identity.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }
}

/// Why a trusted storage-generation binding is not a rotation.
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationBindingError {
    /// One rotation cannot reuse its expected authoritative head.
    #[error("storage-generation binding must advance to a distinct committed head")]
    HeadNotAdvanced,
}

impl LocalLogStorageGenerationBindingError {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HeadNotAdvanced => "local_log_storage_generation_binding.head_not_advanced",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingError};
    use crate::local_log::{
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId,
    };

    #[test]
    fn binding_rejects_one_equal_head_edge() -> Result<(), Box<dyn std::error::Error>> {
        let profile = LocalLogStorageProfileId::try_new("breditor/test-storage")?;
        let version = LocalLogStorageProfileVersion::try_new(1)?;
        let scope = LocalLogStorageScopeId::try_new("scope:test")?;
        let old = LocalLogStorageHeadId::try_new("head:old")?;
        let new = LocalLogStorageHeadId::try_new("head:new")?;
        let binding = LocalLogStorageGenerationBinding::try_new(
            profile.clone(),
            version,
            scope.clone(),
            old.clone(),
            new.clone(),
        )?;

        assert_eq!(binding.profile_id(), &profile);
        assert_eq!(binding.profile_version(), version);
        assert_eq!(binding.scope_id(), &scope);
        assert_eq!(binding.expected_head_id(), &old);
        assert_eq!(binding.committed_head_id(), &new);
        assert_eq!(
            LocalLogStorageGenerationBinding::try_new(profile, version, scope, old.clone(), old),
            Err(LocalLogStorageGenerationBindingError::HeadNotAdvanced)
        );
        Ok(())
    }
}
