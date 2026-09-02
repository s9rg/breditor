use crate::local_log::{LocalLogStorageDatabaseIncarnationId, LocalLogStorageScopeIncarnationId};

use super::{
    LocalLogStorageAttemptPreparationError, LocalLogStoragePreparedAttempt,
    LocalLogStorageRootJsonCodec, LocalLogStorageRootSelection,
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_attempt_plan::LocalLogStorageAttemptPlan,
};

impl LocalLogStorageRootJsonCodec {
    /// Closes one checked root selection into an owned exact attempt plan.
    ///
    /// The database incarnation and planned scope incarnation are trusted host
    /// facts absent from Storage Root V1 JSON. This action revalidates and
    /// canonical-encodes the borrowed selection and derives its complete
    /// receipt/checkpoint/active-generation binding. A final strict
    /// normalization rechecks that binding against the exact candidate bytes;
    /// its reconstructed anchor is immediately dropped before `Prepared` is
    /// published.
    ///
    /// Success performs no I/O and proves no provisioning, emptiness,
    /// currentness, writer authority, dispatch, commit, or durability. The
    /// borrowed inputs remain reusable and can prepare an equivalent plan.
    ///
    /// # Errors
    ///
    /// Returns a payload-free [`LocalLogStorageAttemptPreparationError`] when
    /// candidate encoding, binding closure, or final normalization fails. Final
    /// normalization applies the codec's input limit as well as its output and
    /// nested-checkpoint limits.
    pub fn prepare_root_attempt(
        &self,
        database_incarnation_id: &LocalLogStorageDatabaseIncarnationId,
        scope_incarnation_id: &LocalLogStorageScopeIncarnationId,
        selection: &LocalLogStorageRootSelection,
    ) -> Result<LocalLogStoragePreparedAttempt, LocalLogStorageAttemptPreparationError> {
        let candidate_json = self.encode_root(selection).map_err(|error| {
            LocalLogStorageAttemptPreparationError::InvalidCandidate {
                kind: LocalLogStorageSelectionKind::Root,
                code: error.code(),
            }
        })?;
        let candidate_receipt = LocalLogStorageSelectionReceiptBinding::try_new(
            selection.profile_id().clone(),
            selection.profile_version(),
            database_incarnation_id.clone(),
            selection.scope_id().clone(),
            scope_incarnation_id.clone(),
            selection.transaction_id().clone(),
            None,
            selection.committed_head_id().clone(),
            LocalLogStorageSelectionKind::Root,
            selection.session_id().clone(),
        )
        .map_err(|error| {
            LocalLogStorageAttemptPreparationError::InvalidCandidateReceipt {
                kind: LocalLogStorageSelectionKind::Root,
                code: error.code(),
            }
        })?;
        let candidate_binding = LocalLogStorageSelectedBinding::try_new(
            candidate_receipt,
            None,
            LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                selection.checkpoint_log_id().clone(),
                selection.session_id().clone(),
                selection.committed_head_id().clone(),
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                selection.active_log_id().clone(),
                selection.session_id().clone(),
                selection.active_frame(),
                selection.fence_id().clone(),
                selection.committed_head_id().clone(),
            ),
        )
        .map_err(|error| {
            LocalLogStorageAttemptPreparationError::InvalidCandidateBinding {
                kind: LocalLogStorageSelectionKind::Root,
                code: error.code(),
            }
        })?;
        let normalized_candidate =
            LocalLogStorageSelectedJsonCodec::new(self.context().clone(), candidate_binding)
                .with_limits(*self.limits())
                .normalize_root(&candidate_json)
                .map_err(|error| {
                    LocalLogStorageAttemptPreparationError::InvalidCandidateEnvelope {
                        kind: LocalLogStorageSelectionKind::Root,
                        code: error.code(),
                    }
                })?;

        Ok(LocalLogStoragePreparedAttempt::new(LocalLogStorageAttemptPlan::root(
            normalized_candidate,
        )?))
    }
}
