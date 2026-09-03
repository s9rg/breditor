use std::fmt;

use crate::local_log::{
    LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::{
    LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageWriterFenceAcquisitionPlan,
};

/// Revocable process-local authority issued after one exact host attestation.
///
/// The core creates this token only after the host attests that the exact
/// request-correlated writer-fence acquisition transaction emitted terminal
/// `complete`. Its binding contains the plan's unchanged selected envelope and
/// exact JSON allocations with only the writer pair advanced to the checked
/// target epoch and proposed fence.
///
/// Completion is historical evidence, not proof that this token remains
/// current when its callback runs. Another acquisition, rotation, reset, or
/// conflicting mutation may already have revoked it. Every protected storage
/// mutation must re-read and directionally compare the complete binding inside
/// that mutation's own serialized transaction. Checkpoint cleanup from
/// `Retired` to `Reclaimed` alone remains compatible with the binding.
///
/// This token is deliberately non-`Clone`, non-serializable, and has no public
/// constructor. A copied fence ID, reconstructed epoch/fence tuple, selected
/// receipt, persisted request ID, or decoded binding cannot recreate mutation
/// authority. The token also grants no long-lived lock, durability, checkpoint
/// anchor, or semantic editor owner.
///
/// Non-`Clone` is ownership hygiene, not linear-type enforcement: safe callers
/// can retain shared references or place the token in an `Arc`. Storage
/// currentness checks, rather than Rust aliasing alone, enforce revocation and
/// single-writer behavior.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageMutationToken>();
/// ```
///
/// ```compile_fail
/// fn forge(
///     plan: breditor_core::codec::LocalLogStorageWriterFenceAcquisitionPlan,
///     request_id: breditor_core::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
/// ) {
///     let _ = breditor_core::codec::LocalLogStorageMutationToken::from_acquired_plan(
///         plan,
///         request_id,
///     );
/// }
/// ```
///
/// The authority has no serialization contract:
///
/// ```compile_fail
/// fn serialize(token: &breditor_core::codec::LocalLogStorageMutationToken) {
///     let _ = serde_json::to_string(token);
/// }
/// ```
#[must_use = "a storage mutation token is revocable authority that must be explicitly handled"]
pub struct LocalLogStorageMutationToken {
    binding: LocalLogStorageMutationFenceBinding,
    request_id: LocalLogStorageWriterFenceAcquisitionRequestId,
}

impl LocalLogStorageMutationToken {
    /// Creates a token from one exactly correlated, host-attested acquisition.
    pub(super) fn from_acquired_plan(
        plan: LocalLogStorageWriterFenceAcquisitionPlan,
        request_id: LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self { binding: plan.into_target_binding(), request_id }
    }

    /// Returns the complete exact post-acquisition comparison binding.
    ///
    /// The returned binding is clonable non-authority data. It does not make
    /// the token clonable or prove that the token remains current.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogStorageMutationFenceBinding {
        &self.binding
    }

    /// Returns the complete selected-envelope scalar binding.
    #[must_use]
    pub const fn selected_binding(&self) -> &LocalLogStorageSelectedBinding {
        self.binding.selected_binding()
    }

    /// Returns the exact acquired writer epoch.
    #[must_use]
    pub const fn writer_epoch(&self) -> LocalLogStorageWriterEpoch {
        self.binding.writer_epoch()
    }

    /// Returns the exact acquired current writer-fence identity.
    #[must_use]
    pub const fn current_writer_fence_id(&self) -> &LocalLogStorageFenceId {
        self.binding.current_writer_fence_id()
    }

    /// Returns the physical acquisition attempt whose request completed.
    ///
    /// This opaque identity is diagnostic correlation, not mutation authority.
    #[must_use]
    pub const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        self.request_id.attempt_id()
    }

    /// Returns the exact host-attested acquisition request identity.
    ///
    /// This opaque, clonable identity is diagnostic correlation only. It is
    /// neither storage evidence nor authority without this token.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageWriterFenceAcquisitionRequestId {
        &self.request_id
    }

    /// Returns the UTF-8 byte length of the exact current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.binding.current_selection_json_bytes()
    }

    /// Returns the exact predecessor byte length, present for a rotation.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.binding.predecessor_selection_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageMutationToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageMutationToken")
            .field("attempt_id", self.attempt_id())
            .field("binding", &self.binding)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        codec::{
            LocalLogStorageMutationFenceBinding, LocalLogStorageMutationToken,
            LocalLogStorageSelectionKind,
            local_log_storage_generation_selected_tests::SelectedRotationFixture,
        },
        local_log::{
            LocalLogStorageFenceId, LocalLogStorageWriterEpoch,
            LocalLogStorageWriterFenceAcquisitionAttemptId,
            LocalLogStorageWriterFenceAcquisitionRequestId,
        },
    };

    type TestResult = Result<(), Box<dyn Error>>;

    #[test]
    fn acquired_target_changes_only_the_writer_pair_and_preserves_json_allocations() -> TestResult {
        for selection_kind in
            [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation]
        {
            let fixture = SelectedRotationFixture::new(selection_kind)?;
            let expected = LocalLogStorageMutationFenceBinding::from_selected(
                &fixture.selected,
                LocalLogStorageWriterEpoch::try_new(41)?,
                LocalLogStorageFenceId::try_new("fence:current")?,
            );
            let expected_selected = expected.selected_binding().clone();
            let current_pointer = expected.current_selection_json().as_ptr();
            let predecessor_pointer = expected.predecessor_selection_json().map(str::as_ptr);
            let current_bytes = expected.current_selection_json_bytes();
            let predecessor_bytes = expected.predecessor_selection_json_bytes();
            let proposal = LocalLogStorageFenceId::try_new("fence:target")?;
            let proposal_pointer = proposal.as_str().as_ptr();
            let plan = expected.try_prepare_writer_fence_acquisition(proposal)?;
            let attempt_id = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
            let request_id = LocalLogStorageWriterFenceAcquisitionRequestId::new(&attempt_id);

            let token = LocalLogStorageMutationToken::from_acquired_plan(plan, request_id);

            assert_eq!(token.selected_binding(), &expected_selected);
            assert_eq!(token.writer_epoch(), LocalLogStorageWriterEpoch::try_new(42)?);
            assert_eq!(token.current_writer_fence_id().as_str(), "fence:target");
            assert_eq!(token.current_writer_fence_id().as_str().as_ptr(), proposal_pointer);
            assert_eq!(token.attempt_id(), &attempt_id);
            assert_eq!(token.current_selection_json_bytes(), current_bytes);
            assert_eq!(token.predecessor_selection_json_bytes(), predecessor_bytes);
            assert_eq!(token.binding().current_selection_json().as_ptr(), current_pointer);
            assert_eq!(
                token.binding().predecessor_selection_json().map(str::as_ptr),
                predecessor_pointer
            );
            assert!(
                token.binding().current_selection_json().contains("ROTATIONATTEMPTPAYLOADSENTINEL")
            );
            assert!(!format!("{token:?}").contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        }
        Ok(())
    }
}
