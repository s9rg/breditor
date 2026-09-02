use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageTransactionId};

use super::LocalLogFrameLimits;

/// Caller-owned non-authority inputs for one inspected initial root proposal.
///
/// Profile, scope, and committed-head facts come from the codec's trusted
/// binding. Session and generation identities come from the borrowed
/// compaction outcome. The fence is non-secret correlation metadata only.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageRootPreparationInputs {
    transaction_id: LocalLogStorageTransactionId,
    fence_id: LocalLogStorageFenceId,
    active_frame_limits: LocalLogFrameLimits,
}

impl LocalLogStorageRootPreparationInputs {
    /// Creates one complete set of caller-owned root preparation inputs.
    #[must_use]
    pub const fn new(
        transaction_id: LocalLogStorageTransactionId,
        fence_id: LocalLogStorageFenceId,
        active_frame_limits: LocalLogFrameLimits,
    ) -> Self {
        Self { transaction_id, fence_id, active_frame_limits }
    }

    /// Returns the provisioning transaction identity the caller asserts is
    /// lifetime-unique.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the non-secret activation-fence correlation identity.
    #[must_use]
    pub const fn fence_id(&self) -> &LocalLogStorageFenceId {
        &self.fence_id
    }

    /// Returns the explicit Frame V1 policy selected for the active generation.
    ///
    /// This input does not prove that the generation exists, is empty, or is
    /// writable.
    #[must_use]
    pub const fn active_frame_limits(&self) -> LocalLogFrameLimits {
        self.active_frame_limits
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageRootPreparationInputs;
    use crate::{
        codec::LocalLogFrameLimits,
        local_log::{LocalLogStorageFenceId, LocalLogStorageTransactionId},
    };

    #[test]
    fn inputs_own_only_bounded_root_choices() -> Result<(), Box<dyn std::error::Error>> {
        let transaction = LocalLogStorageTransactionId::try_new("transaction:root")?;
        let fence = LocalLogStorageFenceId::try_new("fence:root")?;
        let inputs = LocalLogStorageRootPreparationInputs::new(
            transaction.clone(),
            fence.clone(),
            LocalLogFrameLimits::new(8_192),
        );

        assert_eq!(inputs.transaction_id(), &transaction);
        assert_eq!(inputs.fence_id(), &fence);
        assert_eq!(inputs.active_frame_limits().max_payload_bytes(), 8_192);
        Ok(())
    }
}
