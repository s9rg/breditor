use crate::local_log::{LocalLogStorageFenceId, LocalLogStorageTransactionId};

use super::LocalLogFrameLimits;

/// Caller-owned non-authority inputs for one inspected rotation proposal.
///
/// The committed head and all prior/checkpoint associations come from the
/// codec's trusted binding and the borrowed compaction outcome. A fence ID is
/// correlation metadata only and never carries the writer capability.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationPreparationInputs {
    transaction_id: LocalLogStorageTransactionId,
    fence_id: LocalLogStorageFenceId,
    successor_frame_limits: LocalLogFrameLimits,
}

impl LocalLogStorageGenerationPreparationInputs {
    /// Creates one complete set of caller-owned preparation inputs.
    #[must_use]
    pub const fn new(
        transaction_id: LocalLogStorageTransactionId,
        fence_id: LocalLogStorageFenceId,
        successor_frame_limits: LocalLogFrameLimits,
    ) -> Self {
        Self { transaction_id, fence_id, successor_frame_limits }
    }

    /// Returns the transaction identity the caller asserts is lifetime-unique.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the non-secret writer-fence correlation identity.
    #[must_use]
    pub const fn fence_id(&self) -> &LocalLogStorageFenceId {
        &self.fence_id
    }

    /// Returns the Frame V1 policy selected for the intended empty successor.
    ///
    /// The input does not prove that any storage generation is empty or reserved.
    #[must_use]
    pub const fn successor_frame_limits(&self) -> LocalLogFrameLimits {
        self.successor_frame_limits
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogFrameLimits, LocalLogStorageFenceId, LocalLogStorageGenerationPreparationInputs,
        LocalLogStorageTransactionId,
    };

    #[test]
    fn inputs_own_only_bounded_non_authority_metadata() -> Result<(), Box<dyn std::error::Error>> {
        let transaction = LocalLogStorageTransactionId::try_new("transaction:test")?;
        let fence = LocalLogStorageFenceId::try_new("fence:test")?;
        let inputs = LocalLogStorageGenerationPreparationInputs::new(
            transaction.clone(),
            fence.clone(),
            LocalLogFrameLimits::new(7),
        );

        assert_eq!(inputs.transaction_id(), &transaction);
        assert_eq!(inputs.fence_id(), &fence);
        assert_eq!(inputs.successor_frame_limits().max_payload_bytes(), 7);
        Ok(())
    }
}
