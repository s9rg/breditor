use std::fmt;

use crate::local_log::{LocalLogStorageDatabaseIncarnationId, LocalLogStorageTransactionId};

use super::{
    LocalLogStorageRetiredTransactionBinding, LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectionReceiptBinding,
};

/// Physical/profile finding reported by one terminal root-resolution probe.
///
/// These names describe storage shapes rather than semantic outcomes. The core
/// combines a finding with the exact retained plan and its source provenance;
/// for example, `PlannedScopeAbsent` can become retry eligibility for a
/// negative/uncertain source but reset/indeterminate for a previously
/// host-attested commit.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionObservationKind {
    /// The expected profile database is missing or has another incarnation.
    ExpectedDatabaseUnavailable,
    /// The planned scope and every complete scope artifact range are absent.
    PlannedScopeAbsent,
    /// The exact candidate is the current selected root.
    CandidateSelected,
    /// The exact candidate is the immediate predecessor of a valid selection.
    CandidateImmediatePredecessor,
    /// Only the candidate's immutable retired transaction identity remains.
    CandidateRetiredIdentity,
    /// Another complete valid scope incarnation occupies the logical scope.
    OtherValidScope,
    /// A permanently allocated planned identity has conflicting stored facts.
    PlannedIdentityCollision,
    /// The profile database or expected-scope graph is broken.
    BrokenProfileAssociation,
}

impl LocalLogStorageRootResolutionObservationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseUnavailable => "expected_database_unavailable",
            Self::PlannedScopeAbsent => "planned_scope_absent",
            Self::CandidateSelected => "candidate_selected",
            Self::CandidateImmediatePredecessor => "candidate_immediate_predecessor",
            Self::CandidateRetiredIdentity => "candidate_retired_identity",
            Self::OtherValidScope => "other_valid_scope",
            Self::PlannedIdentityCollision => "planned_identity_collision",
            Self::BrokenProfileAssociation => "broken_profile_association",
        }
    }
}

/// Planned root identity whose stored key or value conflicts.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionIdentityCollision {
    /// Candidate transaction key or immutable record facts conflict.
    CandidateTransaction,
    /// Candidate committed-head unique-index entry conflicts.
    CandidateCommittedHeadIndex,
    /// Permanent checkpoint-only generation identity conflicts.
    PlannedCheckpointGeneration,
    /// Planned active-generation identity conflicts.
    PlannedActiveGeneration,
    /// A supposedly absent complete scope artifact range is nonempty.
    ScopeArtifactRange,
}

impl LocalLogStorageRootResolutionIdentityCollision {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CandidateTransaction => "candidate_transaction",
            Self::CandidateCommittedHeadIndex => "candidate_committed_head_index",
            Self::PlannedCheckpointGeneration => "planned_checkpoint_generation",
            Self::PlannedActiveGeneration => "planned_active_generation",
            Self::ScopeArtifactRange => "scope_artifact_range",
        }
    }
}

/// Broken association in the expected storage-profile graph.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRootResolutionBrokenAssociation {
    /// Profile metadata is missing or malformed in a nonempty profile database.
    ProfileMetadata,
    /// The expected scope incarnation exists but its append-only candidate is absent.
    ExpectedScopeCandidateMissing,
    /// Scope control does not point to one valid selected transaction graph.
    ScopeControl,
    /// The selected transaction and scope-control facts disagree.
    SelectedTransaction,
    /// Selected checkpoint-generation facts are missing or inconsistent.
    SelectedCheckpointGeneration,
    /// Selected active-generation facts are missing or inconsistent.
    SelectedActiveGeneration,
    /// A current committed-head index mapping is missing or inconsistent.
    CurrentCommittedHeadIndex,
    /// Scope artifacts exist without one valid owning scope graph.
    OrphanScopeArtifact,
}

impl LocalLogStorageRootResolutionBrokenAssociation {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProfileMetadata => "profile_metadata",
            Self::ExpectedScopeCandidateMissing => "expected_scope_candidate_missing",
            Self::ScopeControl => "scope_control",
            Self::SelectedTransaction => "selected_transaction",
            Self::SelectedCheckpointGeneration => "selected_checkpoint_generation",
            Self::SelectedActiveGeneration => "selected_active_generation",
            Self::CurrentCommittedHeadIndex => "current_committed_head_index",
            Self::OrphanScopeArtifact => "orphan_scope_artifact",
        }
    }
}

/// Complete exact-current finding for the root candidate.
///
/// `selected` must already have passed strict selected-root normalization. The
/// transaction ID is the value read through the candidate committed-head index
/// key. Constructing this value is still only a caller-supplied physical
/// finding; terminal completion is asserted separately by resolution evidence.
pub struct LocalLogStorageRootSelectedObservation {
    selected: LocalLogStorageSelectedRoot,
    committed_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRootSelectedObservation {
    /// Creates one complete candidate-selected finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { selected, committed_head_index_transaction_id }
    }

    /// Returns the normalized selected root.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the candidate head-index key.
    #[must_use]
    pub const fn committed_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.committed_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageRootSelectedObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootSelectedObservation")
            .field("selected", &self.selected)
            .field("committed_head_index_transaction_id", &self.committed_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Complete immediate-predecessor finding for the root candidate.
///
/// The later current value must already be strictly normalized. The finding
/// also carries the permanent planned checkpoint-only generation and both the
/// candidate and later-current head-index return values. The core separately
/// verifies the candidate bytes as the immediate predecessor and validates its
/// formerly active generation as the later checkpoint.
pub struct LocalLogStorageRootSupersededObservation {
    selected: LocalLogStorageSelectedRoot,
    candidate_head_index_transaction_id: LocalLogStorageTransactionId,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
    planned_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
}

impl LocalLogStorageRootSupersededObservation {
    /// Creates one complete candidate-immediate-predecessor finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        candidate_head_index_transaction_id: LocalLogStorageTransactionId,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
        planned_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    ) -> Self {
        Self {
            selected,
            candidate_head_index_transaction_id,
            current_head_index_transaction_id,
            planned_checkpoint_generation,
        }
    }

    /// Returns the normalized later selected value.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the candidate head-index key.
    #[must_use]
    pub const fn candidate_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.candidate_head_index_transaction_id
    }

    /// Returns the transaction found through the later-current head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }

    /// Returns the separately observed permanent checkpoint-only generation.
    #[must_use]
    pub const fn planned_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.planned_checkpoint_generation
    }
}

impl fmt::Debug for LocalLogStorageRootSupersededObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootSupersededObservation")
            .field("selected", &self.selected)
            .field("candidate_head_index_transaction_id", &self.candidate_head_index_transaction_id)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .field("planned_checkpoint_generation", &self.planned_checkpoint_generation)
            .finish_non_exhaustive()
    }
}

/// Immutable direct-successor edge observed for a retired root candidate.
///
/// The closed constructors preserve whether Profile V1 still stores an exact
/// receipt or has retired that record to its identity/length tombstone. The
/// adapter must also report the transaction returned by the successor's
/// committed-head index. For the exact case, the separately normalized current
/// selection retains byte-derived sealed-generation facts for that visible
/// predecessor. A retired successor no longer has those discarded JSON facts.
/// Neither case attests currentness or ancestry by itself.
pub struct LocalLogStorageRootDirectSuccessorObservation {
    data: LocalLogStorageRootDirectSuccessorObservationData,
    committed_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRootDirectSuccessorObservation {
    /// Reports the visible exact immediate-predecessor receipt as the successor.
    #[must_use]
    pub const fn exact(
        receipt: LocalLogStorageSelectionReceiptBinding,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self {
            data: LocalLogStorageRootDirectSuccessorObservationData::Exact(receipt),
            committed_head_index_transaction_id,
        }
    }

    /// Reports an older retired direct-successor transaction tombstone.
    #[must_use]
    pub const fn retired(
        transaction: LocalLogStorageRetiredTransactionBinding,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self {
            data: LocalLogStorageRootDirectSuccessorObservationData::Retired(transaction),
            committed_head_index_transaction_id,
        }
    }

    /// Returns the transaction found through the successor head-index key.
    #[must_use]
    pub const fn committed_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.committed_head_index_transaction_id
    }

    pub(super) const fn data(&self) -> &LocalLogStorageRootDirectSuccessorObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageRootDirectSuccessorObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = formatter.debug_struct("LocalLogStorageRootDirectSuccessorObservation");
        match &self.data {
            LocalLogStorageRootDirectSuccessorObservationData::Exact(receipt) => {
                debug.field("exact_receipt", receipt);
            }
            LocalLogStorageRootDirectSuccessorObservationData::Retired(transaction) => {
                debug.field("retired_transaction", transaction);
            }
        }
        debug
            .field("committed_head_index_transaction_id", &self.committed_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

pub(super) enum LocalLogStorageRootDirectSuccessorObservationData {
    Exact(LocalLogStorageSelectionReceiptBinding),
    Retired(LocalLogStorageRetiredTransactionBinding),
}

/// Complete retained-identity finding for a retired root candidate.
///
/// The retired transaction has no candidate bytes. The complete current scope
/// graph and both permanent planned generation records are carried separately
/// so a tombstone cannot hide a broken current scope or reused generation ID.
pub struct LocalLogStorageRootRetiredObservation {
    retired_transaction: LocalLogStorageRetiredTransactionBinding,
    candidate_head_index_transaction_id: LocalLogStorageTransactionId,
    direct_successor: LocalLogStorageRootDirectSuccessorObservation,
    current_selected: LocalLogStorageSelectedRoot,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
    planned_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    planned_active_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
}

impl LocalLogStorageRootRetiredObservation {
    /// Creates one complete retired-candidate finding.
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub const fn new(
        retired_transaction: LocalLogStorageRetiredTransactionBinding,
        candidate_head_index_transaction_id: LocalLogStorageTransactionId,
        direct_successor: LocalLogStorageRootDirectSuccessorObservation,
        current_selected: LocalLogStorageSelectedRoot,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
        planned_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        planned_active_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    ) -> Self {
        Self {
            retired_transaction,
            candidate_head_index_transaction_id,
            direct_successor,
            current_selected,
            current_head_index_transaction_id,
            planned_checkpoint_generation,
            planned_active_generation,
        }
    }

    /// Returns the candidate's retained transaction tombstone facts.
    #[must_use]
    pub const fn retired_transaction(&self) -> &LocalLogStorageRetiredTransactionBinding {
        &self.retired_transaction
    }

    /// Returns the transaction found through the candidate head-index key.
    #[must_use]
    pub const fn candidate_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.candidate_head_index_transaction_id
    }

    /// Returns the candidate's independently observed direct-successor edge.
    #[must_use]
    pub const fn direct_successor(&self) -> &LocalLogStorageRootDirectSuccessorObservation {
        &self.direct_successor
    }

    /// Returns the normalized current selected scope graph.
    pub const fn current_selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.current_selected
    }

    /// Returns the transaction found through the current head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }

    /// Returns the permanent planned checkpoint-only generation.
    #[must_use]
    pub const fn planned_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.planned_checkpoint_generation
    }

    /// Returns the planned active generation's later retired/reclaimed record.
    #[must_use]
    pub const fn planned_active_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.planned_active_generation
    }
}

impl fmt::Debug for LocalLogStorageRootRetiredObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootRetiredObservation")
            .field("retired_transaction", &self.retired_transaction)
            .field("candidate_head_index_transaction_id", &self.candidate_head_index_transaction_id)
            .field("direct_successor", &self.direct_successor)
            .field("current_selected", &self.current_selected)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .field("planned_checkpoint_generation", &self.planned_checkpoint_generation)
            .field("planned_active_generation", &self.planned_active_generation)
            .finish_non_exhaustive()
    }
}

/// Complete valid-current finding for another scope incarnation.
///
/// The observation additionally asserts that the planned-incarnation candidate
/// key, head index, generation keys, and complete candidate generation/chunk
/// prefixes were absent in the same transaction. It does not claim the complete
/// logical-scope ranges are empty: those contain the occupying scope's valid
/// records. The core verifies that the normalized selection belongs to the same
/// database/logical scope but a distinct scope lifetime.
pub struct LocalLogStorageRootOtherScopeObservation {
    selected: LocalLogStorageSelectedRoot,
    committed_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRootOtherScopeObservation {
    /// Creates one complete other-valid-scope finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { selected, committed_head_index_transaction_id }
    }

    /// Returns the normalized selected value from the occupying scope.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through that scope's current head index.
    #[must_use]
    pub const fn committed_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.committed_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageRootOtherScopeObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootOtherScopeObservation")
            .field("selected", &self.selected)
            .field("committed_head_index_transaction_id", &self.committed_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Closed physical finding produced by a root-resolution adapter read.
///
/// This is not evidence that the read transaction committed. Ordinary findings
/// are associated by
/// [`LocalLogStorageRootResolutionEvidence::transaction_completed`](super::LocalLogStorageRootResolutionEvidence::transaction_completed)
/// after the exact fixed-scope transaction emits terminal `complete`. Physical
/// absence is created only inside the separate correlated
/// [`LocalLogStorageRootResolutionEvidence::database_open_absent`](super::LocalLogStorageRootResolutionEvidence::database_open_absent)
/// boundary. The constructors are trusted host assertions; Rust validates plan
/// relationships and source-dependent meaning but cannot inspect `IndexedDB`.
#[must_use = "a root-resolution observation must be completed or discarded"]
pub struct LocalLogStorageRootResolutionObservation {
    data: LocalLogStorageRootResolutionObservationData,
}

impl LocalLogStorageRootResolutionObservation {
    /// Reports a different incarnation read from an existing profile database.
    pub const fn expected_database_incarnation_mismatch(
        observed_database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    ) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRootExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed_database_incarnation_id,
                ),
            ),
        }
    }

    /// Reports a completely empty compatible database without `meta/profile`.
    ///
    /// This is a trusted assertion that all five profile stores were exhaustively
    /// observed empty in the ordinary fixed-scope transaction before it emitted
    /// terminal `complete`. A database containing any record without valid
    /// profile metadata is instead a
    /// [`LocalLogStorageRootResolutionBrokenAssociation::ProfileMetadata`]
    /// collision. This observation is also distinct from physical database
    /// absence during open.
    pub const fn empty_database_without_profile_record() -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRootExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord,
            ),
        }
    }

    pub(super) const fn database_physically_absent() -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRootExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent,
            ),
        }
    }

    /// Reports a clean absent planned scope in the exact expected database.
    ///
    /// This asserts that the scope key, planned transaction and committed-head
    /// index keys, both planned generation keys, and every complete
    /// transaction/generation/chunk range for the scope were exhausted empty.
    pub const fn planned_scope_absent() -> Self {
        Self { data: LocalLogStorageRootResolutionObservationData::PlannedScopeAbsent }
    }

    /// Reports the exact candidate as the current selected root.
    pub fn candidate_selected(observation: LocalLogStorageRootSelectedObservation) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::CandidateSelected(Box::new(
                observation,
            )),
        }
    }

    /// Reports the exact candidate as one valid selection's immediate predecessor.
    pub fn candidate_immediate_predecessor(
        observation: LocalLogStorageRootSupersededObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::CandidateImmediatePredecessor(
                Box::new(observation),
            ),
        }
    }

    /// Reports only the candidate's retained retired identity.
    pub fn candidate_retired_identity(observation: LocalLogStorageRootRetiredObservation) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::CandidateRetiredIdentity(Box::new(
                observation,
            )),
        }
    }

    /// Reports another complete valid scope incarnation at the logical scope key.
    pub fn other_valid_scope(observation: LocalLogStorageRootOtherScopeObservation) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::OtherValidScope(Box::new(
                observation,
            )),
        }
    }

    /// Reports one conflicting permanent planned identity.
    pub const fn planned_identity_collision(
        identity: LocalLogStorageRootResolutionIdentityCollision,
    ) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::PlannedIdentityCollision {
                identity,
            },
        }
    }

    /// Reports a broken profile-database or expected-scope association.
    pub const fn broken_profile_association(
        association: LocalLogStorageRootResolutionBrokenAssociation,
    ) -> Self {
        Self {
            data: LocalLogStorageRootResolutionObservationData::BrokenProfileAssociation {
                association,
            },
        }
    }

    /// Returns the physical finding category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageRootResolutionObservationKind {
        match self.data {
            LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(_) => {
                LocalLogStorageRootResolutionObservationKind::ExpectedDatabaseUnavailable
            }
            LocalLogStorageRootResolutionObservationData::PlannedScopeAbsent => {
                LocalLogStorageRootResolutionObservationKind::PlannedScopeAbsent
            }
            LocalLogStorageRootResolutionObservationData::CandidateSelected(_) => {
                LocalLogStorageRootResolutionObservationKind::CandidateSelected
            }
            LocalLogStorageRootResolutionObservationData::CandidateImmediatePredecessor(_) => {
                LocalLogStorageRootResolutionObservationKind::CandidateImmediatePredecessor
            }
            LocalLogStorageRootResolutionObservationData::CandidateRetiredIdentity(_) => {
                LocalLogStorageRootResolutionObservationKind::CandidateRetiredIdentity
            }
            LocalLogStorageRootResolutionObservationData::OtherValidScope(_) => {
                LocalLogStorageRootResolutionObservationKind::OtherValidScope
            }
            LocalLogStorageRootResolutionObservationData::PlannedIdentityCollision { .. } => {
                LocalLogStorageRootResolutionObservationKind::PlannedIdentityCollision
            }
            LocalLogStorageRootResolutionObservationData::BrokenProfileAssociation { .. } => {
                LocalLogStorageRootResolutionObservationKind::BrokenProfileAssociation
            }
        }
    }

    pub(super) const fn data(&self) -> &LocalLogStorageRootResolutionObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.data {
            LocalLogStorageRootResolutionObservationData::ExpectedDatabaseUnavailable(reason) => {
                let mut debug = formatter.debug_struct("ExpectedDatabaseUnavailable");
                match reason {
                    LocalLogStorageRootExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent => {
                        debug.field("reason", &"physical_database_absent");
                    }
                    LocalLogStorageRootExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord => {
                        debug.field("reason", &"empty_without_profile_record");
                    }
                    LocalLogStorageRootExpectedDatabaseUnavailableData::IncarnationMismatch(
                        observed_database_incarnation_id,
                    ) => {
                        debug
                            .field("reason", &"incarnation_mismatch")
                            .field(
                                "observed_database_incarnation_id",
                                observed_database_incarnation_id,
                            );
                    }
                }
                debug.finish()
            }
            LocalLogStorageRootResolutionObservationData::PlannedScopeAbsent => {
                formatter.write_str("PlannedScopeAbsent")
            }
            LocalLogStorageRootResolutionObservationData::CandidateSelected(observation) => {
                formatter.debug_tuple("CandidateSelected").field(observation).finish()
            }
            LocalLogStorageRootResolutionObservationData::CandidateImmediatePredecessor(
                observation,
            ) => formatter.debug_tuple("CandidateImmediatePredecessor").field(observation).finish(),
            LocalLogStorageRootResolutionObservationData::CandidateRetiredIdentity(observation) => {
                formatter.debug_tuple("CandidateRetiredIdentity").field(observation).finish()
            }
            LocalLogStorageRootResolutionObservationData::OtherValidScope(observation) => {
                formatter.debug_tuple("OtherValidScope").field(observation).finish()
            }
            LocalLogStorageRootResolutionObservationData::PlannedIdentityCollision { identity } => {
                formatter.debug_tuple("PlannedIdentityCollision").field(identity).finish()
            }
            LocalLogStorageRootResolutionObservationData::BrokenProfileAssociation {
                association,
            } => formatter.debug_tuple("BrokenProfileAssociation").field(association).finish(),
        }
    }
}

pub(super) enum LocalLogStorageRootResolutionObservationData {
    ExpectedDatabaseUnavailable(LocalLogStorageRootExpectedDatabaseUnavailableData),
    PlannedScopeAbsent,
    CandidateSelected(Box<LocalLogStorageRootSelectedObservation>),
    CandidateImmediatePredecessor(Box<LocalLogStorageRootSupersededObservation>),
    CandidateRetiredIdentity(Box<LocalLogStorageRootRetiredObservation>),
    OtherValidScope(Box<LocalLogStorageRootOtherScopeObservation>),
    PlannedIdentityCollision { identity: LocalLogStorageRootResolutionIdentityCollision },
    BrokenProfileAssociation { association: LocalLogStorageRootResolutionBrokenAssociation },
}

pub(super) enum LocalLogStorageRootExpectedDatabaseUnavailableData {
    PhysicalDatabaseAbsent,
    EmptyWithoutProfileRecord,
    IncarnationMismatch(LocalLogStorageDatabaseIncarnationId),
}
