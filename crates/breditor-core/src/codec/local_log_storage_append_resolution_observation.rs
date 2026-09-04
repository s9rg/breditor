use std::fmt;

use crate::local_log::{
    LocalLogStorageChunkStart, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
    LocalLogStorageTransactionId, LocalLogStorageWriterEpoch,
};

use super::{LocalLogStorageMutationFenceBinding, LocalLogStorageSelectedRoot};

/// Physical finding reported by one terminal append-resolution probe.
///
/// These variants describe records and scan boundaries, not semantic results.
/// In particular, an adapter cannot assert retry eligibility or head presence;
/// the core derives those outcomes by comparing these owned facts with the
/// private retained queue head.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionObservationKind {
    /// The expected profile database is missing or has another incarnation.
    ExpectedDatabaseUnavailable,
    /// The expected scope lifetime is absent or has been replaced.
    ExpectedScopeUnavailableOrReplaced,
    /// A well-formed same-scope current selection or writer context advanced.
    CurrentContextChanged,
    /// The target key is absent at the end of one complete valid prefix.
    HeadAbsentAtTail,
    /// A target record is the final record after one complete valid prefix.
    HeadRecordFinal,
    /// At least one record was observed after the target position.
    LaterRecordObserved,
    /// The adapter directly encountered a bounded collision/profile defect.
    CollisionOrBrokenProfile,
}

impl LocalLogStorageAppendResolutionObservationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseUnavailable => "expected_database_unavailable",
            Self::ExpectedScopeUnavailableOrReplaced => "expected_scope_unavailable_or_replaced",
            Self::CurrentContextChanged => "current_context_changed",
            Self::HeadAbsentAtTail => "head_absent_at_tail",
            Self::HeadRecordFinal => "head_record_final",
            Self::LaterRecordObserved => "later_record_observed",
            Self::CollisionOrBrokenProfile => "collision_or_broken_profile",
        }
    }
}

/// Bounded physical/profile defect reported directly by the adapter.
///
/// This value carries no browser error text, key, document bytes, JSON, or
/// identifier. It is a trusted host assertion only after the correlated
/// resolver transaction reaches its terminal-complete boundary.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAppendResolutionObservedDefect {
    /// Profile metadata is absent or malformed in a nonempty database.
    ProfileMetadata,
    /// Scope control is malformed or points outside its valid scope graph.
    ScopeControl,
    /// The selected transaction or its current-head index is inconsistent.
    SelectedTransaction,
    /// A selected checkpoint-generation association is inconsistent.
    SelectedCheckpointGeneration,
    /// The selected active-generation association or frame policy is inconsistent.
    SelectedActiveGeneration,
    /// The current writer epoch/fence record has an invalid physical shape.
    WriterFenceRecord,
    /// A chunk key is noncanonical, duplicated, out of order, or overlaps.
    ChunkKeyOrOrder,
    /// A chunk value is malformed, incomplete, or violates the selected frame policy.
    ChunkFrame,
    /// A complete scanned chunk range contains a gap or trailing bytes.
    ChunkPrefix,
    /// Scope artifacts exist without one valid owning scope graph.
    OrphanScopeArtifact,
}

impl LocalLogStorageAppendResolutionObservedDefect {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileMetadata => "profile_metadata",
            Self::ScopeControl => "scope_control",
            Self::SelectedTransaction => "selected_transaction",
            Self::SelectedCheckpointGeneration => "selected_checkpoint_generation",
            Self::SelectedActiveGeneration => "selected_active_generation",
            Self::WriterFenceRecord => "writer_fence_record",
            Self::ChunkKeyOrOrder => "chunk_key_or_order",
            Self::ChunkFrame => "chunk_frame",
            Self::ChunkPrefix => "chunk_prefix",
            Self::OrphanScopeArtifact => "orphan_scope_artifact",
        }
    }
}

/// Complete current-selection facts shared by append tail observations.
///
/// `binding` must be built from a strictly normalized selected envelope and
/// the writer pair independently read in the same resolver transaction. The
/// transaction ID is a separate value read through the selected committed-head
/// index. The constructor consumes a non-`Clone` normalized selected root and
/// does not accept a mutation binding directly, keeping observed evidence on
/// the strict normalization path. A caller can still retain or renormalize the
/// same input bytes, so construction alone proves neither independent I/O,
/// provenance, freshness, atomic co-observation, nor currentness.
///
/// The complete mutation binding remains core-private, so an observation
/// cannot be repurposed as writer-acquisition input or used to recover the
/// normalized selection JSON through another public protocol.
///
/// ```compile_fail
/// fn extract_binding(
///     observed: &breditor_core::codec::LocalLogStorageAppendResolutionCurrentObservation,
/// ) {
///     let _ = observed.binding();
/// }
/// ```
pub struct LocalLogStorageAppendResolutionCurrentObservation {
    binding: LocalLogStorageMutationFenceBinding,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageAppendResolutionCurrentObservation {
    /// Creates one record-shaped current-selection observation.
    ///
    /// `selected`, `writer_epoch`, `current_writer_fence_id`, and the indexed
    /// transaction ID must all come from the same completed resolver snapshot.
    /// Rust preserves their relationship but cannot authenticate host I/O.
    #[must_use]
    pub fn new(
        selected: LocalLogStorageSelectedRoot,
        writer_epoch: LocalLogStorageWriterEpoch,
        current_writer_fence_id: LocalLogStorageFenceId,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        let (selected_binding, current_selection_json, predecessor_selection_json) =
            selected.into_attempt_envelope();
        let binding = LocalLogStorageMutationFenceBinding::from_parts(
            selected_binding,
            current_selection_json,
            predecessor_selection_json,
            writer_epoch,
            current_writer_fence_id,
        );
        Self { binding, current_head_index_transaction_id }
    }

    pub(super) const fn binding(&self) -> &LocalLogStorageMutationFenceBinding {
        &self.binding
    }

    /// Returns the transaction read through the selected head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionCurrentObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionCurrentObservation")
            .field("binding", &self.binding)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Complete target-absent finding at one observed valid-prefix tail.
pub struct LocalLogStorageAppendResolutionHeadAbsentAtTailObservation {
    current: LocalLogStorageAppendResolutionCurrentObservation,
    valid_prefix_end: u64,
}

impl LocalLogStorageAppendResolutionHeadAbsentAtTailObservation {
    /// Creates one target-absent physical finding.
    #[must_use]
    pub const fn new(
        current: LocalLogStorageAppendResolutionCurrentObservation,
        valid_prefix_end: u64,
    ) -> Self {
        Self { current, valid_prefix_end }
    }

    /// Returns the independently normalized current-selection facts.
    #[must_use]
    pub const fn current(&self) -> &LocalLogStorageAppendResolutionCurrentObservation {
        &self.current
    }

    /// Returns the exclusive end of the complete valid scanned prefix.
    #[must_use]
    pub const fn valid_prefix_end(&self) -> u64 {
        self.valid_prefix_end
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionHeadAbsentAtTailObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionHeadAbsentAtTailObservation")
            .field("current", &self.current)
            .field("valid_prefix_end", &self.valid_prefix_end)
            .finish_non_exhaustive()
    }
}

/// Complete final-target-record finding from a full active-generation scan.
///
/// The owned record bytes are intentionally available only to the core. Public
/// inspection exposes their length, while `Debug` never emits their contents.
/// The constructor moves an existing `Box<[u8]>` without making a hidden copy;
/// the adapter must enforce the normalized selected Frame V1 limit before it
/// allocates that box.
pub struct LocalLogStorageAppendResolutionHeadRecordFinalObservation {
    current: LocalLogStorageAppendResolutionCurrentObservation,
    observed_chunk_start: LocalLogStorageChunkStart,
    observed_frame: Box<[u8]>,
    valid_prefix_before_target_end: u64,
}

impl LocalLogStorageAppendResolutionHeadRecordFinalObservation {
    /// Creates one record-shaped final-target finding.
    #[must_use]
    pub fn new(
        current: LocalLogStorageAppendResolutionCurrentObservation,
        observed_chunk_start: LocalLogStorageChunkStart,
        observed_frame: Box<[u8]>,
        valid_prefix_before_target_end: u64,
    ) -> Self {
        Self { current, observed_chunk_start, observed_frame, valid_prefix_before_target_end }
    }

    /// Returns the independently normalized current-selection facts.
    #[must_use]
    pub const fn current(&self) -> &LocalLogStorageAppendResolutionCurrentObservation {
        &self.current
    }

    /// Returns the observed target record's generation-relative key.
    #[must_use]
    pub const fn observed_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.observed_chunk_start
    }

    /// Returns the observed target byte length without exposing its contents.
    #[must_use]
    pub fn observed_frame_bytes(&self) -> usize {
        self.observed_frame.len()
    }

    /// Returns the valid-prefix end immediately before the observed target.
    #[must_use]
    pub const fn valid_prefix_before_target_end(&self) -> u64 {
        self.valid_prefix_before_target_end
    }

    pub(super) fn observed_frame(&self) -> &[u8] {
        &self.observed_frame
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionHeadRecordFinalObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionHeadRecordFinalObservation")
            .field("current", &self.current)
            .field("observed_chunk_start", &self.observed_chunk_start)
            .field("observed_frame_bytes", &self.observed_frame.len())
            .field("valid_prefix_before_target_end", &self.valid_prefix_before_target_end)
            .finish_non_exhaustive()
    }
}

/// Target-key shape observed when at least one later record also exists.
///
/// This type intentionally cannot express semantic head presence. Even an
/// exact target is not a positive result when a later record exists.
pub struct LocalLogStorageAppendResolutionLaterTargetObservation {
    data: LocalLogStorageAppendResolutionLaterTargetObservationData,
}

impl LocalLogStorageAppendResolutionLaterTargetObservation {
    /// Creates a missing-target shape with its scanned prefix boundary.
    #[must_use]
    pub const fn absent(valid_prefix_end: u64) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionLaterTargetObservationData::Absent {
                valid_prefix_end,
            },
        }
    }

    /// Creates a present-target shape with owned bytes and prefix boundary.
    ///
    /// This moves the box without a hidden copy. The adapter must validate the
    /// normalized selected Frame V1 limit before allocating it.
    #[must_use]
    pub fn present(
        observed_chunk_start: LocalLogStorageChunkStart,
        observed_frame: Box<[u8]>,
        valid_prefix_before_target_end: u64,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionLaterTargetObservationData::Present {
                observed_chunk_start,
                observed_frame,
                valid_prefix_before_target_end,
            },
        }
    }

    /// Returns whether a target-key record was physically observed.
    #[must_use]
    pub const fn is_present(&self) -> bool {
        matches!(
            self.data,
            LocalLogStorageAppendResolutionLaterTargetObservationData::Present { .. }
        )
    }

    /// Returns the observed target byte length when a target record exists.
    #[must_use]
    pub fn observed_frame_bytes(&self) -> Option<usize> {
        match &self.data {
            LocalLogStorageAppendResolutionLaterTargetObservationData::Absent { .. } => None,
            LocalLogStorageAppendResolutionLaterTargetObservationData::Present {
                observed_frame,
                ..
            } => Some(observed_frame.len()),
        }
    }

    pub(super) const fn data(&self) -> &LocalLogStorageAppendResolutionLaterTargetObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionLaterTargetObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.data {
            LocalLogStorageAppendResolutionLaterTargetObservationData::Absent {
                valid_prefix_end,
            } => formatter
                .debug_struct("Absent")
                .field("valid_prefix_end", valid_prefix_end)
                .finish(),
            LocalLogStorageAppendResolutionLaterTargetObservationData::Present {
                observed_chunk_start,
                observed_frame,
                valid_prefix_before_target_end,
            } => formatter
                .debug_struct("Present")
                .field("observed_chunk_start", observed_chunk_start)
                .field("observed_frame_bytes", &observed_frame.len())
                .field("valid_prefix_before_target_end", valid_prefix_before_target_end)
                .finish(),
        }
    }
}

pub(super) enum LocalLogStorageAppendResolutionLaterTargetObservationData {
    Absent {
        valid_prefix_end: u64,
    },
    Present {
        observed_chunk_start: LocalLogStorageChunkStart,
        observed_frame: Box<[u8]>,
        valid_prefix_before_target_end: u64,
    },
}

/// Complete finding that at least one record follows the target position.
pub struct LocalLogStorageAppendResolutionLaterRecordObservation {
    current: LocalLogStorageAppendResolutionCurrentObservation,
    target: LocalLogStorageAppendResolutionLaterTargetObservation,
    first_later_chunk_start: LocalLogStorageChunkStart,
}

impl LocalLogStorageAppendResolutionLaterRecordObservation {
    /// Creates one target-plus-first-later physical finding.
    #[must_use]
    pub const fn new(
        current: LocalLogStorageAppendResolutionCurrentObservation,
        target: LocalLogStorageAppendResolutionLaterTargetObservation,
        first_later_chunk_start: LocalLogStorageChunkStart,
    ) -> Self {
        Self { current, target, first_later_chunk_start }
    }

    /// Returns the independently normalized current-selection facts.
    #[must_use]
    pub const fn current(&self) -> &LocalLogStorageAppendResolutionCurrentObservation {
        &self.current
    }

    /// Returns the physical shape at the expected target key.
    #[must_use]
    pub const fn target(&self) -> &LocalLogStorageAppendResolutionLaterTargetObservation {
        &self.target
    }

    /// Returns the first physical chunk key strictly after the target position.
    #[must_use]
    pub const fn first_later_chunk_start(&self) -> LocalLogStorageChunkStart {
        self.first_later_chunk_start
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionLaterRecordObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionLaterRecordObservation")
            .field("current", &self.current)
            .field("target", &self.target)
            .field("first_later_chunk_start", &self.first_later_chunk_start)
            .finish_non_exhaustive()
    }
}

/// Closed physical finding produced by an append-resolution adapter probe.
///
/// Ordinary observations become evidence only when the exact five-store
/// `readonly` resolver transaction emits terminal `complete` after all reads
/// and scans. It performs no writes and has no durability option. Physical database absence
/// is constructible only through the distinct non-creating open-proof evidence
/// boundary. Constructors are trusted host assertions; the core cannot inspect
/// browser storage, but it does validate all retained-plan relationships.
#[must_use = "an append-resolution observation must be completed or discarded"]
pub struct LocalLogStorageAppendResolutionObservation {
    data: LocalLogStorageAppendResolutionObservationData,
}

impl LocalLogStorageAppendResolutionObservation {
    /// Reports another incarnation read from an existing profile database.
    pub const fn expected_database_incarnation_mismatch(
        observed_database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageAppendExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed_database_incarnation_id,
                ),
            ),
        }
    }

    /// Reports a compatible database whose complete five-store scan was empty.
    ///
    /// A nonempty database without valid profile metadata must instead use the
    /// bounded `ProfileMetadata` defect. This is distinct from physical absence
    /// during a non-creating open probe.
    pub const fn empty_database_without_profile_record() -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageAppendExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord,
            ),
        }
    }

    pub(super) const fn database_physically_absent() -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageAppendExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent,
            ),
        }
    }

    /// Reports that no record exists for the exact expected scope lifetime.
    ///
    /// This also asserts that every complete transaction, generation, index,
    /// and chunk range owned by that lifetime was exhaustively observed empty.
    /// Any orphan record must use the bounded `OrphanScopeArtifact` defect.
    pub const fn expected_scope_absent() -> Self {
        Self {
            data:
                LocalLogStorageAppendResolutionObservationData::ExpectedScopeUnavailableOrReplaced(
                    LocalLogStorageAppendExpectedScopeUnavailableData::Absent,
                ),
        }
    }

    /// Reports another normalized lifetime at the expected logical scope key.
    ///
    /// The core verifies its current-head index and compares its database,
    /// logical-scope, and lifetime identities against the retained expectation.
    pub fn expected_scope_replaced(
        current: LocalLogStorageAppendResolutionCurrentObservation,
    ) -> Self {
        Self {
            data:
                LocalLogStorageAppendResolutionObservationData::ExpectedScopeUnavailableOrReplaced(
                    LocalLogStorageAppendExpectedScopeUnavailableData::Replaced(Box::new(current)),
                ),
        }
    }

    /// Reports a well-formed current selection or writer context that advanced.
    ///
    /// This variant carries no claim about target presence or absence. It is a
    /// conservative indeterminate finding for a valid later context. Supplying
    /// the unchanged context contradicts this physical shape and fails closed.
    pub fn current_context_changed(
        current: LocalLogStorageAppendResolutionCurrentObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::CurrentContextChanged(Box::new(
                current,
            )),
        }
    }

    /// Reports target-key absence at a complete valid active-generation tail.
    pub fn head_absent_at_tail(
        observation: LocalLogStorageAppendResolutionHeadAbsentAtTailObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::HeadAbsentAtTail(Box::new(
                observation,
            )),
        }
    }

    /// Reports a target record as the final record in the complete valid scan.
    pub fn head_record_final(
        observation: LocalLogStorageAppendResolutionHeadRecordFinalObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::HeadRecordFinal(Box::new(
                observation,
            )),
        }
    }

    /// Reports a first later record and the separately observed target shape.
    pub fn later_record_observed(
        observation: LocalLogStorageAppendResolutionLaterRecordObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::LaterRecordObserved(Box::new(
                observation,
            )),
        }
    }

    /// Reports a directly encountered bounded collision/profile defect.
    pub const fn collision_or_broken_profile(
        reason: LocalLogStorageAppendResolutionObservedDefect,
    ) -> Self {
        Self {
            data: LocalLogStorageAppendResolutionObservationData::CollisionOrBrokenProfile {
                reason,
            },
        }
    }

    /// Returns the physical finding category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageAppendResolutionObservationKind {
        match self.data {
            LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(_) => {
                LocalLogStorageAppendResolutionObservationKind::ExpectedDatabaseUnavailable
            }
            LocalLogStorageAppendResolutionObservationData::ExpectedScopeUnavailableOrReplaced(
                _,
            ) => LocalLogStorageAppendResolutionObservationKind::ExpectedScopeUnavailableOrReplaced,
            LocalLogStorageAppendResolutionObservationData::CurrentContextChanged(_) => {
                LocalLogStorageAppendResolutionObservationKind::CurrentContextChanged
            }
            LocalLogStorageAppendResolutionObservationData::HeadAbsentAtTail(_) => {
                LocalLogStorageAppendResolutionObservationKind::HeadAbsentAtTail
            }
            LocalLogStorageAppendResolutionObservationData::HeadRecordFinal(_) => {
                LocalLogStorageAppendResolutionObservationKind::HeadRecordFinal
            }
            LocalLogStorageAppendResolutionObservationData::LaterRecordObserved(_) => {
                LocalLogStorageAppendResolutionObservationKind::LaterRecordObserved
            }
            LocalLogStorageAppendResolutionObservationData::CollisionOrBrokenProfile { .. } => {
                LocalLogStorageAppendResolutionObservationKind::CollisionOrBrokenProfile
            }
        }
    }

    pub(super) const fn data(&self) -> &LocalLogStorageAppendResolutionObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.data {
            LocalLogStorageAppendResolutionObservationData::ExpectedDatabaseUnavailable(reason) => {
                formatter.debug_tuple("ExpectedDatabaseUnavailable").field(reason).finish()
            }
            LocalLogStorageAppendResolutionObservationData::ExpectedScopeUnavailableOrReplaced(
                reason,
            ) => formatter.debug_tuple("ExpectedScopeUnavailableOrReplaced").field(reason).finish(),
            LocalLogStorageAppendResolutionObservationData::CurrentContextChanged(current) => {
                formatter.debug_tuple("CurrentContextChanged").field(current).finish()
            }
            LocalLogStorageAppendResolutionObservationData::HeadAbsentAtTail(observation) => {
                formatter.debug_tuple("HeadAbsentAtTail").field(observation).finish()
            }
            LocalLogStorageAppendResolutionObservationData::HeadRecordFinal(observation) => {
                formatter.debug_tuple("HeadRecordFinal").field(observation).finish()
            }
            LocalLogStorageAppendResolutionObservationData::LaterRecordObserved(observation) => {
                formatter.debug_tuple("LaterRecordObserved").field(observation).finish()
            }
            LocalLogStorageAppendResolutionObservationData::CollisionOrBrokenProfile { reason } => {
                formatter.debug_tuple("CollisionOrBrokenProfile").field(reason).finish()
            }
        }
    }
}

pub(super) enum LocalLogStorageAppendResolutionObservationData {
    ExpectedDatabaseUnavailable(LocalLogStorageAppendExpectedDatabaseUnavailableData),
    ExpectedScopeUnavailableOrReplaced(LocalLogStorageAppendExpectedScopeUnavailableData),
    CurrentContextChanged(Box<LocalLogStorageAppendResolutionCurrentObservation>),
    HeadAbsentAtTail(Box<LocalLogStorageAppendResolutionHeadAbsentAtTailObservation>),
    HeadRecordFinal(Box<LocalLogStorageAppendResolutionHeadRecordFinalObservation>),
    LaterRecordObserved(Box<LocalLogStorageAppendResolutionLaterRecordObservation>),
    CollisionOrBrokenProfile { reason: LocalLogStorageAppendResolutionObservedDefect },
}

#[derive(Debug)]
pub(super) enum LocalLogStorageAppendExpectedDatabaseUnavailableData {
    PhysicalDatabaseAbsent,
    EmptyWithoutProfileRecord,
    IncarnationMismatch(LocalLogStorageDatabaseIncarnationId),
}

#[derive(Debug)]
pub(super) enum LocalLogStorageAppendExpectedScopeUnavailableData {
    Absent,
    Replaced(Box<LocalLogStorageAppendResolutionCurrentObservation>),
}
