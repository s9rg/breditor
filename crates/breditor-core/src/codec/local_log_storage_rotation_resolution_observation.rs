use std::fmt;

use crate::local_log::{LocalLogStorageDatabaseIncarnationId, LocalLogStorageTransactionId};

use super::{
    LocalLogStorageRetiredTransactionBinding, LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectionReceiptBinding,
};

/// Physical/profile finding reported by one terminal rotation-resolution probe.
///
/// These are storage shapes, not semantic outcomes. The rotation resolver
/// combines one finding with the retained exact plan and source provenance.
/// In particular, clean candidate absence can become advisory retry eligibility
/// for a negative or uncertain source but collision/corruption for a surviving
/// host-attested commit.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionObservationKind {
    /// The expected profile database is missing or has another incarnation.
    ExpectedDatabaseUnavailable,
    /// The expected logical scope lifetime is missing or has another incarnation.
    ExpectedScopeUnavailable,
    /// The candidate namespace is absent and the exact prior selection is current.
    CandidateAbsentPriorStillSelected,
    /// The candidate namespace is absent and a direct competing rotation is current.
    CandidateAbsentDifferentCurrent,
    /// The exact candidate is the current selected rotation.
    CandidateSelected,
    /// The exact candidate is the immediate predecessor of a valid later selection.
    CandidateImmediatePredecessor,
    /// Only the candidate's immutable retired transaction identity remains.
    CandidateRetiredIdentity,
    /// A permanently allocated candidate identity has conflicting stored facts.
    PlannedIdentityCollision,
    /// The profile database or expected-scope graph is broken.
    BrokenProfileAssociation,
}

impl LocalLogStorageRotationResolutionObservationKind {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpectedDatabaseUnavailable => "expected_database_unavailable",
            Self::ExpectedScopeUnavailable => "expected_scope_unavailable",
            Self::CandidateAbsentPriorStillSelected => "candidate_absent_prior_still_selected",
            Self::CandidateAbsentDifferentCurrent => "candidate_absent_different_current",
            Self::CandidateSelected => "candidate_selected",
            Self::CandidateImmediatePredecessor => "candidate_immediate_predecessor",
            Self::CandidateRetiredIdentity => "candidate_retired_identity",
            Self::PlannedIdentityCollision => "planned_identity_collision",
            Self::BrokenProfileAssociation => "broken_profile_association",
        }
    }
}

/// Planned rotation identity whose stored key, value, or range conflicts.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionIdentityCollision {
    /// Candidate transaction key or immutable record facts conflict.
    CandidateTransaction,
    /// Candidate committed-head unique-index entry conflicts.
    CandidateCommittedHeadIndex,
    /// Candidate active-generation key or immutable record facts conflict.
    CandidateActiveGeneration,
    /// The candidate active generation's supposedly empty complete chunk prefix conflicts.
    CandidateActiveChunkPrefix,
}

impl LocalLogStorageRotationResolutionIdentityCollision {
    /// Returns the stable profile-neutral spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CandidateTransaction => "candidate_transaction",
            Self::CandidateCommittedHeadIndex => "candidate_committed_head_index",
            Self::CandidateActiveGeneration => "candidate_active_generation",
            Self::CandidateActiveChunkPrefix => "candidate_active_chunk_prefix",
        }
    }
}

/// Broken association in the expected rotation storage-profile graph.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageRotationResolutionBrokenAssociation {
    /// Profile metadata is missing or malformed in a nonempty profile database.
    ProfileMetadata,
    /// The expected scope exists but a host-attested candidate association is missing.
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
    /// A plan-known prior transaction or its permanent index association is broken.
    PlanKnownTransaction,
    /// Scope artifacts exist without one valid owning scope graph.
    OrphanScopeArtifact,
}

impl LocalLogStorageRotationResolutionBrokenAssociation {
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
            Self::PlanKnownTransaction => "plan_known_transaction",
            Self::OrphanScopeArtifact => "orphan_scope_artifact",
        }
    }
}

/// One retired transaction record paired with its committed-head index lookup.
///
/// The tombstone contains only the immutable fields and selection byte length
/// retained by Profile V1. The separate index value is the transaction ID read
/// through that tombstone's committed-head key. This caller-constructed value
/// proves neither record existence nor completion of a resolver transaction.
pub struct LocalLogStorageRotationIndexedRetiredTransactionObservation {
    retired_transaction: LocalLogStorageRetiredTransactionBinding,
    committed_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRotationIndexedRetiredTransactionObservation {
    /// Creates one indexed retired-transaction finding.
    #[must_use]
    pub const fn new(
        retired_transaction: LocalLogStorageRetiredTransactionBinding,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { retired_transaction, committed_head_index_transaction_id }
    }

    /// Returns the complete record-shaped retired transaction facts.
    #[must_use]
    pub const fn retired_transaction(&self) -> &LocalLogStorageRetiredTransactionBinding {
        &self.retired_transaction
    }

    /// Returns the transaction found through the tombstone's committed-head index key.
    #[must_use]
    pub const fn committed_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.committed_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageRotationIndexedRetiredTransactionObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationIndexedRetiredTransactionObservation")
            .field("retired_transaction", &self.retired_transaction)
            .field("committed_head_index_transaction_id", &self.committed_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Immutable direct-successor edge observed for a retired rotation candidate.
///
/// An exact successor supplies its complete receipt and committed-head index
/// lookup. The resolver obtains the successor's sealed log ID and frame only
/// from the strictly normalized exact predecessor bytes retained by the current
/// selected graph; callers cannot supply a second scalar description of those
/// bytes. A retired successor supplies only its indexed Profile V1 tombstone,
/// whose discarded JSON and sealed-generation fields cannot be reconstructed.
pub struct LocalLogStorageRotationDirectSuccessorObservation {
    data: LocalLogStorageRotationDirectSuccessorObservationData,
}

impl LocalLogStorageRotationDirectSuccessorObservation {
    /// Reports the visible exact successor receipt and its head-index lookup.
    #[must_use]
    pub const fn exact(
        receipt: LocalLogStorageSelectionReceiptBinding,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationDirectSuccessorObservationData::Exact {
                receipt,
                committed_head_index_transaction_id,
            },
        }
    }

    /// Reports an already-retired direct successor and its head-index lookup.
    #[must_use]
    pub const fn retired(
        transaction: LocalLogStorageRotationIndexedRetiredTransactionObservation,
    ) -> Self {
        Self { data: LocalLogStorageRotationDirectSuccessorObservationData::Retired(transaction) }
    }

    /// Returns the exact successor receipt when its transaction remains exact.
    #[must_use]
    pub const fn exact_receipt(&self) -> Option<&LocalLogStorageSelectionReceiptBinding> {
        match &self.data {
            LocalLogStorageRotationDirectSuccessorObservationData::Exact { receipt, .. } => {
                Some(receipt)
            }
            LocalLogStorageRotationDirectSuccessorObservationData::Retired(_) => None,
        }
    }

    /// Returns the indexed successor tombstone when its transaction is retired.
    #[must_use]
    pub const fn retired_transaction(
        &self,
    ) -> Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation> {
        match &self.data {
            LocalLogStorageRotationDirectSuccessorObservationData::Exact { .. } => None,
            LocalLogStorageRotationDirectSuccessorObservationData::Retired(transaction) => {
                Some(transaction)
            }
        }
    }

    /// Returns the transaction found through the successor's committed-head index key.
    #[must_use]
    pub const fn committed_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        match &self.data {
            LocalLogStorageRotationDirectSuccessorObservationData::Exact {
                committed_head_index_transaction_id,
                ..
            } => committed_head_index_transaction_id,
            LocalLogStorageRotationDirectSuccessorObservationData::Retired(transaction) => {
                transaction.committed_head_index_transaction_id()
            }
        }
    }

    pub(super) const fn data(&self) -> &LocalLogStorageRotationDirectSuccessorObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageRotationDirectSuccessorObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.data {
            LocalLogStorageRotationDirectSuccessorObservationData::Exact {
                receipt,
                committed_head_index_transaction_id,
            } => formatter
                .debug_struct("Exact")
                .field("receipt", receipt)
                .field("committed_head_index_transaction_id", committed_head_index_transaction_id)
                .finish(),
            LocalLogStorageRotationDirectSuccessorObservationData::Retired(transaction) => {
                formatter.debug_tuple("Retired").field(transaction).finish()
            }
        }
    }
}

pub(super) enum LocalLogStorageRotationDirectSuccessorObservationData {
    Exact {
        receipt: LocalLogStorageSelectionReceiptBinding,
        committed_head_index_transaction_id: LocalLogStorageTransactionId,
    },
    Retired(LocalLogStorageRotationIndexedRetiredTransactionObservation),
}

/// Complete valid-current finding for a replacement scope incarnation.
///
/// The normalized selection must belong to the same profile database and
/// logical scope as the plan but to a different scope lifetime. The separate
/// value is the transaction returned by its current committed-head index. This
/// prevents a bare or malformed scope record from being classified as reset.
pub struct LocalLogStorageRotationOtherScopeObservation {
    selected: LocalLogStorageSelectedRoot,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRotationOtherScopeObservation {
    /// Creates one complete replacement-scope finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { selected, current_head_index_transaction_id }
    }

    /// Returns the normalized selected graph for the replacement lifetime.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the replacement head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageRotationOtherScopeObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationOtherScopeObservation")
            .field("selected", &self.selected)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Complete clean-absence finding while the snapshotted prior selection remains current.
///
/// `selected` must be a strictly normalized observation of the plan's prior
/// selection. The constructor is a trusted host assertion that the candidate
/// transaction key, committed-head index key, active-generation key, and the
/// complete active-generation chunk prefix were all exhausted absent in the
/// same fixed-scope resolver transaction. Rust additionally compares the prior
/// binding directionally and requires exact current and optional predecessor
/// bytes. This value alone is not retry evidence.
pub struct LocalLogStorageRotationPriorStillSelectedObservation {
    selected: LocalLogStorageSelectedRoot,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRotationPriorStillSelectedObservation {
    /// Creates one complete prior-still-selected clean-absence finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { selected, current_head_index_transaction_id }
    }

    /// Returns the normalized current selection observed in storage.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the current head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }
}

impl fmt::Debug for LocalLogStorageRotationPriorStillSelectedObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationPriorStillSelectedObservation")
            .field("selected", &self.selected)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .finish_non_exhaustive()
    }
}

/// Complete exact-current finding for the rotation candidate.
///
/// The normalized current graph must contain the candidate's exact bytes and
/// the plan's exact prior-current bytes as its immediate predecessor. The
/// separately observed prior checkpoint generation remains permanent but is no
/// longer named by the candidate. When the plan's prior selection was itself a
/// rotation, its old predecessor must appear as the supplied indexed tombstone;
/// a prior root instead requires `None`.
pub struct LocalLogStorageRotationSelectedObservation {
    selected: LocalLogStorageSelectedRoot,
    candidate_head_index_transaction_id: LocalLogStorageTransactionId,
    prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_predecessor_retirement:
        Option<LocalLogStorageRotationIndexedRetiredTransactionObservation>,
}

impl LocalLogStorageRotationSelectedObservation {
    /// Creates one complete candidate-selected finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        candidate_head_index_transaction_id: LocalLogStorageTransactionId,
        prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_predecessor_retirement: Option<
            LocalLogStorageRotationIndexedRetiredTransactionObservation,
        >,
    ) -> Self {
        Self {
            selected,
            candidate_head_index_transaction_id,
            prior_checkpoint_generation,
            prior_predecessor_retirement,
        }
    }

    /// Returns the normalized candidate-selected graph.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the candidate head-index key.
    #[must_use]
    pub const fn candidate_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.candidate_head_index_transaction_id
    }

    /// Returns the independently observed prior checkpoint generation.
    #[must_use]
    pub const fn prior_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.prior_checkpoint_generation
    }

    /// Returns the prior selection's old-predecessor tombstone when one is required.
    #[must_use]
    pub const fn prior_predecessor_retirement(
        &self,
    ) -> Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation> {
        self.prior_predecessor_retirement.as_ref()
    }
}

impl fmt::Debug for LocalLogStorageRotationSelectedObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationSelectedObservation")
            .field("selected", &self.selected)
            .field("candidate_head_index_transaction_id", &self.candidate_head_index_transaction_id)
            .field("prior_checkpoint_generation", &self.prior_checkpoint_generation)
            .field("prior_predecessor_retirement", &self.prior_predecessor_retirement)
            .finish_non_exhaustive()
    }
}

/// Complete immediate-predecessor finding for the rotation candidate.
///
/// `selected` is a valid later current graph whose exact predecessor is the
/// candidate. The candidate and later-current index results are reported
/// independently. The candidate checkpoint and the plan's prior checkpoint
/// remain permanent generation records. The plan's prior current transaction,
/// and its optional old predecessor, must now have the supplied indexed
/// tombstone shapes.
pub struct LocalLogStorageRotationSupersededObservation {
    selected: LocalLogStorageSelectedRoot,
    candidate_head_index_transaction_id: LocalLogStorageTransactionId,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
    candidate_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_current_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
    prior_predecessor_retirement:
        Option<LocalLogStorageRotationIndexedRetiredTransactionObservation>,
}

impl LocalLogStorageRotationSupersededObservation {
    /// Creates one complete candidate-immediate-predecessor finding.
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        candidate_head_index_transaction_id: LocalLogStorageTransactionId,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
        candidate_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_current_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
        prior_predecessor_retirement: Option<
            LocalLogStorageRotationIndexedRetiredTransactionObservation,
        >,
    ) -> Self {
        Self {
            selected,
            candidate_head_index_transaction_id,
            current_head_index_transaction_id,
            candidate_checkpoint_generation,
            prior_checkpoint_generation,
            prior_current_retirement,
            prior_predecessor_retirement,
        }
    }

    /// Returns the normalized later-current graph.
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

    /// Returns the independently observed candidate checkpoint generation.
    #[must_use]
    pub const fn candidate_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.candidate_checkpoint_generation
    }

    /// Returns the independently observed prior checkpoint generation.
    #[must_use]
    pub const fn prior_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.prior_checkpoint_generation
    }

    /// Returns the plan's prior-current indexed transaction tombstone.
    #[must_use]
    pub const fn prior_current_retirement(
        &self,
    ) -> &LocalLogStorageRotationIndexedRetiredTransactionObservation {
        &self.prior_current_retirement
    }

    /// Returns the plan's prior-predecessor indexed tombstone when one is required.
    #[must_use]
    pub const fn prior_predecessor_retirement(
        &self,
    ) -> Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation> {
        self.prior_predecessor_retirement.as_ref()
    }
}

impl fmt::Debug for LocalLogStorageRotationSupersededObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationSupersededObservation")
            .field("selected", &self.selected)
            .field("candidate_head_index_transaction_id", &self.candidate_head_index_transaction_id)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .field("candidate_checkpoint_generation", &self.candidate_checkpoint_generation)
            .field("prior_checkpoint_generation", &self.prior_checkpoint_generation)
            .field("prior_current_retirement", &self.prior_current_retirement)
            .field("prior_predecessor_retirement", &self.prior_predecessor_retirement)
            .finish_non_exhaustive()
    }
}

/// Complete retained-identity finding for a retired rotation candidate.
///
/// The candidate and all plan-known prior transactions are indexed tombstones.
/// `current_selected` is the complete valid current scope graph. The candidate
/// checkpoint, candidate active retirement record, and prior checkpoint remain
/// separately observable permanent generations. `direct_successor` preserves
/// whether the transaction that retired the candidate active generation remains
/// exact or has itself lost its JSON to Profile V1 retirement.
pub struct LocalLogStorageRotationRetiredObservation {
    candidate_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
    direct_successor: LocalLogStorageRotationDirectSuccessorObservation,
    current_selected: LocalLogStorageSelectedRoot,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
    candidate_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    candidate_active_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_current_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
    prior_predecessor_retirement:
        Option<LocalLogStorageRotationIndexedRetiredTransactionObservation>,
}

impl LocalLogStorageRotationRetiredObservation {
    /// Creates one complete retired-candidate finding.
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub const fn new(
        candidate_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
        direct_successor: LocalLogStorageRotationDirectSuccessorObservation,
        current_selected: LocalLogStorageSelectedRoot,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
        candidate_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        candidate_active_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_current_retirement: LocalLogStorageRotationIndexedRetiredTransactionObservation,
        prior_predecessor_retirement: Option<
            LocalLogStorageRotationIndexedRetiredTransactionObservation,
        >,
    ) -> Self {
        Self {
            candidate_retirement,
            direct_successor,
            current_selected,
            current_head_index_transaction_id,
            candidate_checkpoint_generation,
            candidate_active_generation,
            prior_checkpoint_generation,
            prior_current_retirement,
            prior_predecessor_retirement,
        }
    }

    /// Returns the candidate's indexed retired transaction facts.
    #[must_use]
    pub const fn candidate_retirement(
        &self,
    ) -> &LocalLogStorageRotationIndexedRetiredTransactionObservation {
        &self.candidate_retirement
    }

    /// Returns the independently observed candidate direct-successor edge.
    #[must_use]
    pub const fn direct_successor(&self) -> &LocalLogStorageRotationDirectSuccessorObservation {
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

    /// Returns the independently observed candidate checkpoint generation.
    #[must_use]
    pub const fn candidate_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.candidate_checkpoint_generation
    }

    /// Returns the candidate active generation's retired or reclaimed record.
    #[must_use]
    pub const fn candidate_active_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.candidate_active_generation
    }

    /// Returns the independently observed prior checkpoint generation.
    #[must_use]
    pub const fn prior_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.prior_checkpoint_generation
    }

    /// Returns the plan's prior-current indexed transaction tombstone.
    #[must_use]
    pub const fn prior_current_retirement(
        &self,
    ) -> &LocalLogStorageRotationIndexedRetiredTransactionObservation {
        &self.prior_current_retirement
    }

    /// Returns the plan's prior-predecessor indexed tombstone when one is required.
    #[must_use]
    pub const fn prior_predecessor_retirement(
        &self,
    ) -> Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation> {
        self.prior_predecessor_retirement.as_ref()
    }
}

impl fmt::Debug for LocalLogStorageRotationRetiredObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationRetiredObservation")
            .field("candidate_retirement", &self.candidate_retirement)
            .field("direct_successor", &self.direct_successor)
            .field("current_selected", &self.current_selected)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .field("candidate_checkpoint_generation", &self.candidate_checkpoint_generation)
            .field("candidate_active_generation", &self.candidate_active_generation)
            .field("prior_checkpoint_generation", &self.prior_checkpoint_generation)
            .field("prior_current_retirement", &self.prior_current_retirement)
            .field("prior_predecessor_retirement", &self.prior_predecessor_retirement)
            .finish_non_exhaustive()
    }
}

/// Complete clean-candidate finding for one direct competing rotation.
///
/// `selected` must be a strictly normalized rotation whose exact immediate
/// predecessor receipt and bytes equal the attempt plan's snapshotted prior
/// current selection. Its checkpoint therefore represents that prior active
/// generation retired by the competing head. The constructor is also a trusted
/// assertion that the attempted candidate transaction, committed-head index,
/// active-generation key, and complete active-generation chunk prefix were all
/// absent in the same completed resolver transaction.
///
/// This v0.0.40 shape intentionally does not represent an arbitrary far-later
/// current head. Profile V1 retains only current and immediate-predecessor exact
/// JSON, so a more distant competing edge needs a separately designed
/// exact-or-retired direct-successor proof before it can classify conflict.
pub struct LocalLogStorageRotationDifferentCurrentObservation {
    selected: LocalLogStorageSelectedRoot,
    current_head_index_transaction_id: LocalLogStorageTransactionId,
    prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
    prior_predecessor_retirement:
        Option<LocalLogStorageRotationIndexedRetiredTransactionObservation>,
}

impl LocalLogStorageRotationDifferentCurrentObservation {
    /// Creates one complete direct-competing-current clean-candidate finding.
    #[must_use]
    pub const fn new(
        selected: LocalLogStorageSelectedRoot,
        current_head_index_transaction_id: LocalLogStorageTransactionId,
        prior_checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBinding,
        prior_predecessor_retirement: Option<
            LocalLogStorageRotationIndexedRetiredTransactionObservation,
        >,
    ) -> Self {
        Self {
            selected,
            current_head_index_transaction_id,
            prior_checkpoint_generation,
            prior_predecessor_retirement,
        }
    }

    /// Returns the normalized direct competing rotation.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRoot {
        &self.selected
    }

    /// Returns the transaction found through the competing current head-index key.
    #[must_use]
    pub const fn current_head_index_transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.current_head_index_transaction_id
    }

    /// Returns the independently observed prior checkpoint generation.
    #[must_use]
    pub const fn prior_checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBinding {
        &self.prior_checkpoint_generation
    }

    /// Returns the prior selection's old-predecessor tombstone when one is required.
    #[must_use]
    pub const fn prior_predecessor_retirement(
        &self,
    ) -> Option<&LocalLogStorageRotationIndexedRetiredTransactionObservation> {
        self.prior_predecessor_retirement.as_ref()
    }
}

impl fmt::Debug for LocalLogStorageRotationDifferentCurrentObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationDifferentCurrentObservation")
            .field("selected", &self.selected)
            .field("current_head_index_transaction_id", &self.current_head_index_transaction_id)
            .field("prior_checkpoint_generation", &self.prior_checkpoint_generation)
            .field("prior_predecessor_retirement", &self.prior_predecessor_retirement)
            .finish_non_exhaustive()
    }
}

/// Closed physical finding produced by a rotation-resolution adapter probe.
///
/// This value is not evidence that a read committed. Ordinary findings become
/// applicable only through the nominal rotation-resolution evidence boundary
/// after the exact fixed-scope resolver transaction emits terminal `complete`.
/// Physical database absence is constructed privately by the separate
/// correlated non-creating open attestation. All public constructors are
/// trusted host assertions; Rust still validates their plan relationships and
/// source-dependent meaning.
#[must_use = "a rotation-resolution observation must be completed or discarded"]
pub struct LocalLogStorageRotationResolutionObservation {
    data: LocalLogStorageRotationResolutionObservationData,
}

impl LocalLogStorageRotationResolutionObservation {
    /// Reports a different incarnation read from an existing profile database.
    pub const fn expected_database_incarnation_mismatch(
        observed_database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRotationExpectedDatabaseUnavailableData::IncarnationMismatch(
                    observed_database_incarnation_id,
                ),
            ),
        }
    }

    /// Reports a completely empty compatible database without `meta/profile`.
    ///
    /// This trusted assertion requires all five stores to have been exhaustively
    /// observed empty in the completed ordinary transaction. Any stored record
    /// without valid profile metadata is a broken profile association instead.
    pub const fn empty_database_without_profile_record() -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRotationExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord,
            ),
        }
    }

    pub(super) const fn database_physically_absent() -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(
                LocalLogStorageRotationExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent,
            ),
        }
    }

    /// Reports that the expected logical scope lifetime is completely absent.
    ///
    /// This trusted assertion requires the scope key and every complete
    /// transaction, generation, and chunk range for the expected incarnation
    /// to be empty. Artifacts without their owning scope must instead be
    /// reported as `OrphanScopeArtifact`.
    pub const fn expected_scope_absent() -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::ExpectedScopeUnavailable(
                LocalLogStorageRotationExpectedScopeUnavailableData::Absent,
            ),
        }
    }

    /// Reports a complete valid replacement lifetime at the logical scope key.
    pub fn expected_scope_incarnation_mismatch(
        observation: LocalLogStorageRotationOtherScopeObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::ExpectedScopeUnavailable(
                LocalLogStorageRotationExpectedScopeUnavailableData::IncarnationMismatch(Box::new(
                    observation,
                )),
            ),
        }
    }

    /// Reports clean candidate absence while the exact prior selection remains current.
    pub fn candidate_absent_prior_still_selected(
        observation: LocalLogStorageRotationPriorStillSelectedObservation,
    ) -> Self {
        Self {
            data:
                LocalLogStorageRotationResolutionObservationData::CandidateAbsentPriorStillSelected(
                    Box::new(observation),
                ),
        }
    }

    /// Reports clean candidate absence with one direct competing rotation current.
    pub fn candidate_absent_different_current(
        observation: LocalLogStorageRotationDifferentCurrentObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::CandidateAbsentDifferentCurrent(
                Box::new(observation),
            ),
        }
    }

    /// Reports the exact candidate as the current selected rotation.
    pub fn candidate_selected(observation: LocalLogStorageRotationSelectedObservation) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::CandidateSelected(Box::new(
                observation,
            )),
        }
    }

    /// Reports the exact candidate as one valid selection's immediate predecessor.
    pub fn candidate_immediate_predecessor(
        observation: LocalLogStorageRotationSupersededObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::CandidateImmediatePredecessor(
                Box::new(observation),
            ),
        }
    }

    /// Reports only the candidate's retained retired identity and required history.
    pub fn candidate_retired_identity(
        observation: LocalLogStorageRotationRetiredObservation,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::CandidateRetiredIdentity(
                Box::new(observation),
            ),
        }
    }

    /// Reports one conflicting permanent candidate identity or namespace.
    pub const fn planned_identity_collision(
        identity: LocalLogStorageRotationResolutionIdentityCollision,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::PlannedIdentityCollision {
                identity,
            },
        }
    }

    /// Reports a broken profile-database or expected-scope association.
    pub const fn broken_profile_association(
        association: LocalLogStorageRotationResolutionBrokenAssociation,
    ) -> Self {
        Self {
            data: LocalLogStorageRotationResolutionObservationData::BrokenProfileAssociation {
                association,
            },
        }
    }

    /// Returns the physical finding category.
    #[must_use]
    pub const fn kind(&self) -> LocalLogStorageRotationResolutionObservationKind {
        match self.data {
            LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(_) => {
                LocalLogStorageRotationResolutionObservationKind::ExpectedDatabaseUnavailable
            }
            LocalLogStorageRotationResolutionObservationData::ExpectedScopeUnavailable(_) => {
                LocalLogStorageRotationResolutionObservationKind::ExpectedScopeUnavailable
            }
            LocalLogStorageRotationResolutionObservationData::CandidateAbsentPriorStillSelected(
                _,
            ) => {
                LocalLogStorageRotationResolutionObservationKind::CandidateAbsentPriorStillSelected
            }
            LocalLogStorageRotationResolutionObservationData::CandidateAbsentDifferentCurrent(
                _,
            ) => LocalLogStorageRotationResolutionObservationKind::CandidateAbsentDifferentCurrent,
            LocalLogStorageRotationResolutionObservationData::CandidateSelected(_) => {
                LocalLogStorageRotationResolutionObservationKind::CandidateSelected
            }
            LocalLogStorageRotationResolutionObservationData::CandidateImmediatePredecessor(_) => {
                LocalLogStorageRotationResolutionObservationKind::CandidateImmediatePredecessor
            }
            LocalLogStorageRotationResolutionObservationData::CandidateRetiredIdentity(_) => {
                LocalLogStorageRotationResolutionObservationKind::CandidateRetiredIdentity
            }
            LocalLogStorageRotationResolutionObservationData::PlannedIdentityCollision {
                ..
            } => LocalLogStorageRotationResolutionObservationKind::PlannedIdentityCollision,
            LocalLogStorageRotationResolutionObservationData::BrokenProfileAssociation {
                ..
            } => LocalLogStorageRotationResolutionObservationKind::BrokenProfileAssociation,
        }
    }

    pub(super) const fn data(&self) -> &LocalLogStorageRotationResolutionObservationData {
        &self.data
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionObservation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.data {
            LocalLogStorageRotationResolutionObservationData::ExpectedDatabaseUnavailable(
                reason,
            ) => {
                let mut debug = formatter.debug_struct("ExpectedDatabaseUnavailable");
                match reason {
                    LocalLogStorageRotationExpectedDatabaseUnavailableData::PhysicalDatabaseAbsent => {
                        debug.field("reason", &"physical_database_absent");
                    }
                    LocalLogStorageRotationExpectedDatabaseUnavailableData::EmptyWithoutProfileRecord => {
                        debug.field("reason", &"empty_without_profile_record");
                    }
                    LocalLogStorageRotationExpectedDatabaseUnavailableData::IncarnationMismatch(
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
            LocalLogStorageRotationResolutionObservationData::ExpectedScopeUnavailable(reason) => {
                let mut debug = formatter.debug_struct("ExpectedScopeUnavailable");
                match reason {
                    LocalLogStorageRotationExpectedScopeUnavailableData::Absent => {
                        debug.field("reason", &"absent");
                    }
                    LocalLogStorageRotationExpectedScopeUnavailableData::IncarnationMismatch(
                        observation,
                    ) => {
                        debug
                            .field("reason", &"incarnation_mismatch")
                            .field("observation", observation);
                    }
                }
                debug.finish()
            }
            LocalLogStorageRotationResolutionObservationData::CandidateAbsentPriorStillSelected(
                observation,
            ) => formatter
                .debug_tuple("CandidateAbsentPriorStillSelected")
                .field(observation)
                .finish(),
            LocalLogStorageRotationResolutionObservationData::CandidateAbsentDifferentCurrent(
                observation,
            ) => {
                formatter.debug_tuple("CandidateAbsentDifferentCurrent").field(observation).finish()
            }
            LocalLogStorageRotationResolutionObservationData::CandidateSelected(observation) => {
                formatter.debug_tuple("CandidateSelected").field(observation).finish()
            }
            LocalLogStorageRotationResolutionObservationData::CandidateImmediatePredecessor(
                observation,
            ) => formatter.debug_tuple("CandidateImmediatePredecessor").field(observation).finish(),
            LocalLogStorageRotationResolutionObservationData::CandidateRetiredIdentity(
                observation,
            ) => formatter.debug_tuple("CandidateRetiredIdentity").field(observation).finish(),
            LocalLogStorageRotationResolutionObservationData::PlannedIdentityCollision {
                identity,
            } => formatter.debug_tuple("PlannedIdentityCollision").field(identity).finish(),
            LocalLogStorageRotationResolutionObservationData::BrokenProfileAssociation {
                association,
            } => formatter.debug_tuple("BrokenProfileAssociation").field(association).finish(),
        }
    }
}

pub(super) enum LocalLogStorageRotationResolutionObservationData {
    ExpectedDatabaseUnavailable(LocalLogStorageRotationExpectedDatabaseUnavailableData),
    ExpectedScopeUnavailable(LocalLogStorageRotationExpectedScopeUnavailableData),
    CandidateAbsentPriorStillSelected(Box<LocalLogStorageRotationPriorStillSelectedObservation>),
    CandidateAbsentDifferentCurrent(Box<LocalLogStorageRotationDifferentCurrentObservation>),
    CandidateSelected(Box<LocalLogStorageRotationSelectedObservation>),
    CandidateImmediatePredecessor(Box<LocalLogStorageRotationSupersededObservation>),
    CandidateRetiredIdentity(Box<LocalLogStorageRotationRetiredObservation>),
    PlannedIdentityCollision { identity: LocalLogStorageRotationResolutionIdentityCollision },
    BrokenProfileAssociation { association: LocalLogStorageRotationResolutionBrokenAssociation },
}

pub(super) enum LocalLogStorageRotationExpectedDatabaseUnavailableData {
    PhysicalDatabaseAbsent,
    EmptyWithoutProfileRecord,
    IncarnationMismatch(LocalLogStorageDatabaseIncarnationId),
}

pub(super) enum LocalLogStorageRotationExpectedScopeUnavailableData {
    Absent,
    IncarnationMismatch(Box<LocalLogStorageRotationOtherScopeObservation>),
}
