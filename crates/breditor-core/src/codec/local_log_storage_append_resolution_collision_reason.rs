use super::LocalLogStorageAppendResolutionObservedDefect;

/// Stable bounded reason an append-resolution finding failed closed.
///
/// These diagnostics retain no frame bytes, selection JSON, browser error
/// text, record keys, or identifiers. They neither prove storage corruption nor
/// grant repair, retry, acknowledgement, or writer authority.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionCollisionReason {
    /// An unavailable-database finding named the exact expected incarnation.
    ExpectedDatabaseObservationMismatch,
    /// A replaced-scope finding named the exact expected scope incarnation.
    ExpectedScopeObservationMismatch,
    /// The current head-index lookup disagreed with the normalized selection.
    CurrentHeadIndexMismatch,
    /// A current-context finding used another database, scope lifetime, or session.
    CurrentContextLifetimeMismatch,
    /// The same selected receipt carried different immutable envelope facts.
    SelectedEnvelopeMismatch,
    /// The same selected receipt carried different canonical current JSON.
    CurrentSelectionBytesMismatch,
    /// The same selected receipt carried different predecessor JSON.
    PredecessorSelectionBytesMismatch,
    /// The observed writer epoch moved backwards.
    WriterEpochRegression,
    /// The selected receipt changed without advancing the writer epoch.
    SelectionChangedWithoutWriterAdvance,
    /// The writer fence changed without advancing the writer epoch.
    CurrentWriterFenceMismatch,
    /// A context-changed finding reported no qualifying context change.
    CurrentContextReportedUnchanged,
    /// A supposedly absent target did not follow the expected valid prefix.
    HeadAbsentPrefixEndMismatch,
    /// The observed target record used a different physical chunk key.
    HeadChunkStartMismatch,
    /// The valid prefix immediately before a present target ended elsewhere.
    HeadPrefixBeforeTargetMismatch,
    /// The observed target record's computed end differs from the expected end.
    HeadFrameEndMismatch,
    /// The target record bytes differ from the private retained queue head.
    HeadFrameBytesMismatch,
    /// A reported later record was not strictly after the target position.
    LaterRecordOrderMismatch,
    /// The expected target was absent even though a later record existed.
    LaterRecordAfterAbsentHead,
    /// A present target and its reported first later record were not contiguous.
    LaterRecordBoundaryMismatch,
    /// The adapter directly reported a bounded physical/profile defect.
    ObservedCollisionOrBrokenProfile {
        /// Defect category reported by the completed resolver transaction.
        reason: LocalLogStorageAppendResolutionObservedDefect,
    },
}

impl LocalLogStorageAppendResolutionCollisionReason {
    /// Returns the stable namespaced diagnostic code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseObservationMismatch => {
                "local_log_storage_append_resolution.expected_database_observation_mismatch"
            }
            Self::ExpectedScopeObservationMismatch => {
                "local_log_storage_append_resolution.expected_scope_observation_mismatch"
            }
            Self::CurrentHeadIndexMismatch => {
                "local_log_storage_append_resolution.current_head_index_mismatch"
            }
            Self::CurrentContextLifetimeMismatch => {
                "local_log_storage_append_resolution.current_context_lifetime_mismatch"
            }
            Self::SelectedEnvelopeMismatch => {
                "local_log_storage_append_resolution.selected_envelope_mismatch"
            }
            Self::CurrentSelectionBytesMismatch => {
                "local_log_storage_append_resolution.current_selection_bytes_mismatch"
            }
            Self::PredecessorSelectionBytesMismatch => {
                "local_log_storage_append_resolution.predecessor_selection_bytes_mismatch"
            }
            Self::WriterEpochRegression => {
                "local_log_storage_append_resolution.writer_epoch_regression"
            }
            Self::SelectionChangedWithoutWriterAdvance => {
                "local_log_storage_append_resolution.selection_changed_without_writer_advance"
            }
            Self::CurrentWriterFenceMismatch => {
                "local_log_storage_append_resolution.current_writer_fence_mismatch"
            }
            Self::CurrentContextReportedUnchanged => {
                "local_log_storage_append_resolution.current_context_reported_unchanged"
            }
            Self::HeadAbsentPrefixEndMismatch => {
                "local_log_storage_append_resolution.head_absent_prefix_end_mismatch"
            }
            Self::HeadChunkStartMismatch => {
                "local_log_storage_append_resolution.head_chunk_start_mismatch"
            }
            Self::HeadPrefixBeforeTargetMismatch => {
                "local_log_storage_append_resolution.head_prefix_before_target_mismatch"
            }
            Self::HeadFrameEndMismatch => {
                "local_log_storage_append_resolution.head_frame_end_mismatch"
            }
            Self::HeadFrameBytesMismatch => {
                "local_log_storage_append_resolution.head_frame_bytes_mismatch"
            }
            Self::LaterRecordOrderMismatch => {
                "local_log_storage_append_resolution.later_record_order_mismatch"
            }
            Self::LaterRecordAfterAbsentHead => {
                "local_log_storage_append_resolution.later_record_after_absent_head"
            }
            Self::LaterRecordBoundaryMismatch => {
                "local_log_storage_append_resolution.later_record_boundary_mismatch"
            }
            Self::ObservedCollisionOrBrokenProfile { .. } => {
                "local_log_storage_append_resolution.observed_collision_or_broken_profile"
            }
        }
    }
}
