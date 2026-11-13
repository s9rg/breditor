//! Serialized room authority. Each account/ownership/edit transition appends durably before
//! in-memory publication; ephemeral leases never enter the portable editor checkpoint.
use crate::{
    Admission, DurableReceipt, Error, Lease, Recovery, Registration, Result, Role, access,
    credentials,
    log::{Event, Log, Record},
    protocol::Receipt,
};
use breditor_collab_feasibility::rich_replica::{
    RichReplica, SharedRichProfile, WriterGroupPreparation,
};
use std::{collections::BTreeMap, path::Path};
mod asset_references;
mod atomic_transport_v2;
mod backup;
mod deployment_binding;
mod document_presence;
mod layout_v3;
mod log_generations;
#[cfg(feature = "server")]
pub(crate) use log_generations::GenerationOperationCustody;
pub use log_generations::InspectedNativeGenerationTail;
pub use log_generations::{
    GenerationRecoveryRegistrationCoverage, MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES,
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationParticipantMetadata, VerifiedGenerationRecoveryRegistrations,
};
pub use log_generations::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, ServerLogGenerationBackup,
    ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
};
pub use log_generations::{
    MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES, OperationalLogGenerationServerRoom,
    RecoveredLogGenerationServerRoom, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo,
    ServerLogGenerationRoomRecovery, ServerLogGenerationRoomRecoveryProgress,
};
pub use log_generations::{
    RecoveredLogGenerationRoom, ServerLogGenerationRecovery, ServerLogGenerationRecoveryProgress,
};
#[cfg(feature = "server")]
pub(crate) mod metadata_receipts;
mod native_history;
mod observers;
mod participant_inventory;
mod recovery;
mod review;
mod source_boundaries;
mod storage_capacity;
pub use storage_capacity::{ServerRasterStorageCapacity, ServerRoomStorageCapacity};
mod suggestions;
mod versions;
pub use asset_references::{
    MAX_SERVER_ASSET_REFERENCE_BYTES, MAX_SERVER_ASSET_REFERENCE_PAIRS,
    ServerAssetReferenceOutcome, ServerAssetReferencePending, ServerAssetReferenceSource,
    ServerLogGenerationRetainedAssetReferences, ServerRetainedAssetReferences,
};
pub use atomic_transport_v2::AtomicTransportProfile;
pub use backup::{
    MAX_ROOM_BACKUP_BYTES, RoomBackup, RoomBackupIdentity, RoomBackupInfo, RoomRecoveryPolicy,
};
pub(crate) use native_history::NativeHistoryBoundary;
pub use native_history::{
    ServerNativeHistoryBoundary, ServerNativeHistoryDescriptor, ServerNativeHistoryFamily,
    ServerNativeHistoryLane, ServerNativeHistoryReceipt,
};
pub use participant_inventory::{
    MAX_ROOM_PARTICIPANT_INVENTORY_BYTES, MissingRecoveryRegistration, RecoveryAccount,
    RecoveryDocumentClock, RecoveryDocumentCredential, RecoveryDocumentRegistration,
    RecoveryRegistrationCoverage, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RecoveryReviewInventory, RecoveryReviewRegistration, RecoveryServerAuthor,
    RecoveryServerAuthorKind, RoomParticipantInventory, RoomParticipantInventoryIdentity,
    RoomParticipantInventoryMetadata, VerifiedRecoveryRegistrations,
};
pub use recovery::{
    MAX_SERVER_ROOM_BACKUP_BYTES, OperationalServerRoom, RecoveredServerRoom, ServerRoomBackup,
    ServerRoomBackupIdentity, ServerRoomBackupInfo, ServerRoomRecovery, ServerRoomRecoveryProgress,
};
pub use review::{
    DurableReviewReceipt, ReviewAdmission, ReviewCatchup, ReviewCursor, ReviewCursorProof,
    ReviewDescriptor, ReviewLease, ReviewOriginalAuthorizationPending,
    ReviewOriginalAuthorizationPendingReason, ReviewOriginalAuthorizationRange,
    ReviewOriginalAuthorizationRead, ReviewOriginalAuthorizationStatus,
    ReviewOriginalAuthorizationWindow, ReviewPrefixProof, ReviewRegistration, ReviewRole,
    ReviewSource, StoredReviewBatch,
};
pub use suggestions::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, DocumentSuggestionEntry,
    DocumentSuggestionPublication, DocumentSuggestionsCursor, DocumentSuggestionsDescriptor,
    DocumentSuggestionsPage, DurableDocumentSuggestion, DurableSuggestionDecision,
    DurableSuggestionRevision, StoredSuggestionDecision, StoredSuggestionRevision,
    SuggestionDecision, SuggestionDecisionRequest, SuggestionEffect, SuggestionPermissions,
    SuggestionRevisionAdmission, SuggestionRevisionRequest, SuggestionRevisionsCursor,
    SuggestionRevisionsDescriptor, SuggestionRevisionsPage, SuggestionRole, SuggestionUpdate,
};
pub use versions::{
    DocumentVersionAdmission, DocumentVersionCatalogEntry, DocumentVersionCatalogPage,
    DocumentVersionsCursor, DocumentVersionsDescriptor, DurableDocumentVersion,
};
#[cfg(test)]
mod layout_v3_tests;

/// Durable seed tags select their exact compiler; configuration content never selects a grammar.
#[derive(Clone, Copy)]
enum ProfileSeed {
    Original,
    StructuralV2(bool),
    LayoutV3(bool),
}

const MAX_WRITERS: usize = 1024;
const MAX_PRINCIPALS: usize = 1024;
struct Writer {
    principal: String,
    resume_hash: [u8; 32],
    observer: bool,
}

/// Exclusively locked durable rich room. Supply only server-authenticated principal identifiers.
///
/// The file lock prevents two processes from owning the same room. A network adapter must also
/// serialize calls on this value, including permission changes, lease resume and edit admission.
/// Open the log on a local filesystem with working file locks and sync semantics; do not unlink
/// or replace a live log. It is private service state, not an interchangeable document export.
pub struct Room {
    atomic_transport_v2: bool,
    profile_seed: ProfileSeed,
    log: Log,
    profile: SharedRichProfile,
    replica: RichReplica,
    owner: String,
    asset_binding: String,
    roles: BTreeMap<String, Role>,
    writers: BTreeMap<String, Writer>,
    leases: BTreeMap<String, String>,
    receipts: BTreeMap<(String, String, String), DurableReceipt>,
    presence: crate::presence::Presence,
    review: Option<review::ReviewState>,
    versions: Option<versions::VersionsState>,
    suggestions: Option<suggestions::SuggestionsState>,
    /// Immutable seed boundary; later service-authored actions must not redefine genesis.
    seed_writer_through: String,
    native_history_boundaries: BTreeMap<String, ServerNativeHistoryReceipt>,
}

impl Room {
    /// Create a never-overwritten room log in an existing host-owned directory.
    /// # Errors
    /// Rejects invalid initial content/configuration/account, existing files and persistence failure.
    pub fn create(path: &Path, configuration: &str, document: &str, owner: &str) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_configuration_json(configuration)?;
        Self::create_bound(path, configuration, document, owner, profile, ProfileSeed::Original)
    }

    /// Create an explicitly selected structural V2 room using configuration format 2.
    /// Original creation and existing seed records remain V1-only; no migration is attempted.
    /// # Errors
    /// Rejects wrong profiles, content, owner, existing files and persistence failures.
    pub fn create_structural_v2(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_configuration_json_v2(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::StructuralV2(false),
        )
    }

    /// Compose standard inline V1 with an explicit structural V2 durable room.
    /// # Errors
    /// Rejects wrong configuration revision, conflicting declarations and invalid room state.
    pub fn create_standard_structural_v2(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
    ) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_standard_configuration_json_v2(configuration)?;
        Self::create_bound(
            path,
            configuration,
            document,
            owner,
            profile,
            ProfileSeed::StructuralV2(true),
        )
    }

    fn create_bound(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: SharedRichProfile,
        profile_seed: ProfileSeed,
    ) -> Result<Self> {
        Self::create_bound_transport(
            path,
            configuration,
            document,
            owner,
            profile,
            profile_seed,
            false,
        )
    }
    fn create_bound_transport(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: SharedRichProfile,
        profile_seed: ProfileSeed,
        atomic_transport_v2: bool,
    ) -> Result<Self> {
        Self::create_with_log(
            configuration,
            document,
            owner,
            profile,
            profile_seed,
            atomic_transport_v2,
            |seed| Log::create(path, seed),
        )
    }
    fn create_with_log(
        configuration: &str,
        document: &str,
        owner: &str,
        profile: SharedRichProfile,
        profile_seed: ProfileSeed,
        atomic_transport_v2: bool,
        make_log: impl FnOnce(Event) -> Result<Log>,
    ) -> Result<Self> {
        let replica = profile.create(document, "1".into())?;
        let seed_writer_through = replica.writer_clock("1")?.through;
        let journal = replica.checkpoint()?;
        let asset_binding =
            Self::bind_assets(configuration, replica.document_id(), owner, &journal)?;
        let seed = if atomic_transport_v2 {
            Event::SeedAtomicTransportV2 {
                configuration: configuration.into(),
                profile: AtomicTransportProfile::from_seed(profile_seed),
                room: replica.document_id().into(),
                owner: owner.into(),
                journal,
            }
        } else {
            match profile_seed {
                ProfileSeed::Original => Event::Seed {
                    configuration: configuration.into(),
                    room: replica.document_id().into(),
                    owner: owner.into(),
                    journal,
                },
                ProfileSeed::StructuralV2(standard_inline_v1) => Event::SeedStructuralV2 {
                    configuration: configuration.into(),
                    standard_inline_v1,
                    room: replica.document_id().into(),
                    owner: owner.into(),
                    journal,
                },
                ProfileSeed::LayoutV3(standard_inline_v1) => Event::SeedLayoutV3 {
                    configuration: configuration.into(),
                    standard_inline_v1,
                    room: replica.document_id().into(),
                    owner: owner.into(),
                    journal,
                },
            }
        };
        let log = make_log(seed)?;
        Ok(Self {
            atomic_transport_v2,
            profile_seed,
            log,
            profile,
            replica,
            owner: owner.into(),
            asset_binding,
            roles: BTreeMap::new(),
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            receipts: BTreeMap::new(),
            presence: crate::presence::Presence::default(),
            review: None,
            versions: None,
            suggestions: None,
            seed_writer_through,
            native_history_boundaries: BTreeMap::new(),
        })
    }

    /// Acquire the file lock and replay every complete durable record through native admission.
    /// Old connections have no lease after restart. A torn final record is truncated only after
    /// all complete records pass integrity, ownership, permission and semantic replay checks.
    /// # Errors
    /// Rejects competing ownership, incompatible/corrupt state, invalid replay and I/O failure.
    pub fn open(path: &Path) -> Result<(Self, Recovery)> {
        Self::open_with_tail_policy(path, true)
    }

    /// Operational provenance admission must never trim an uncertain tail on a rejected reopen.
    pub(crate) fn open_complete(path: &Path) -> Result<Self> {
        Self::open_with_tail_policy(path, false).map(|(room, _)| room)
    }

    fn open_with_tail_policy(path: &Path, truncate_tail: bool) -> Result<(Self, Recovery)> {
        let (log, records, recovery) = Log::open(path)?;
        Self::replay_loaded(log, records, recovery, truncate_tail)
    }
    fn replay_loaded(
        log: Log,
        records: Vec<Record>,
        recovery: Recovery,
        truncate_tail: bool,
    ) -> Result<(Self, Recovery)> {
        if !truncate_tail && recovery.truncated_bytes != 0 {
            return Err(Error::Contract("operational log has an incomplete tail"));
        }
        let mut room = Self::replay_records(log, records)?;
        if truncate_tail {
            room.log.finish_recovery(recovery)?;
        } else {
            room.log.finish_complete_recovery(recovery)?;
        }
        Ok((room, recovery))
    }

    fn replay_records(log: Log, records: Vec<Record>) -> Result<Self> {
        let mut records = records.into_iter();
        let seed = records.next().ok_or(Error::Contract("log has no complete seed"))?;
        let (configuration, room, owner, journal, profile_seed, atomic_transport_v2) = match seed
            .event
        {
            Event::Seed { configuration, room, owner, journal } => {
                (configuration, room, owner, journal, ProfileSeed::Original, false)
            }
            Event::SeedStructuralV2 { configuration, standard_inline_v1, room, owner, journal } => {
                (
                    configuration,
                    room,
                    owner,
                    journal,
                    ProfileSeed::StructuralV2(standard_inline_v1),
                    false,
                )
            }
            Event::SeedLayoutV3 { configuration, standard_inline_v1, room, owner, journal } => (
                configuration,
                room,
                owner,
                journal,
                ProfileSeed::LayoutV3(standard_inline_v1),
                false,
            ),
            Event::SeedAtomicTransportV2 { configuration, profile, room, owner, journal } => {
                (configuration, room, owner, journal, profile.seed(), true)
            }
            _ => return Err(Error::Contract("first relay record must seed room")),
        };
        access::principal(&owner)?;
        let asset_binding = Self::bind_assets(&configuration, &room, &owner, &journal)?;
        let profile = match profile_seed {
            ProfileSeed::Original => SharedRichProfile::from_configuration_json(&configuration)?,
            ProfileSeed::StructuralV2(false) => {
                SharedRichProfile::from_configuration_json_v2(&configuration)?
            }
            ProfileSeed::StructuralV2(true) => {
                SharedRichProfile::from_standard_configuration_json_v2(&configuration)?
            }
            ProfileSeed::LayoutV3(false) => {
                SharedRichProfile::from_configuration_json_v3(&configuration)?
            }
            ProfileSeed::LayoutV3(true) => {
                SharedRichProfile::from_standard_configuration_json_v3(&configuration)?
            }
        };
        let replica = profile.restore(&room, &journal)?;
        let seed_writer_through = replica.writer_clock("1")?.through;
        if replica.writer() != "1" || replica.undo_count() != 0 || replica.redo_count() != 0 {
            return Err(Error::Contract("relay seed writer or history"));
        }
        let mut result = Self {
            atomic_transport_v2,
            profile_seed,
            log,
            profile,
            replica,
            owner,
            asset_binding,
            roles: BTreeMap::new(),
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            receipts: BTreeMap::new(),
            presence: crate::presence::Presence::default(),
            review: None,
            versions: None,
            suggestions: None,
            seed_writer_through,
            native_history_boundaries: BTreeMap::new(),
        };
        for record in records {
            result.replay(record)?;
        }
        result.abandon_suggestion_revision_preparation();
        Ok(result)
    }

    fn replay(&mut self, record: Record) -> Result<()> {
        if !matches!(&record.event, Event::CommitDocumentSuggestionRevisionV1 { .. }) {
            self.abandon_suggestion_revision_preparation();
        }
        match record.event {
            Event::Seed { .. }
            | Event::SeedStructuralV2 { .. }
            | Event::SeedLayoutV3 { .. }
            | Event::SeedAtomicTransportV2 { .. } => {
                return Err(Error::Contract("duplicate relay seed"));
            }
            Event::Grant { actor, principal, role } => {
                self.check_grant(&actor, &principal, role)?;
                self.apply_grant(principal, role);
            }
            Event::Register { principal, writer, resume_hash } => {
                self.editor(&principal)?;
                if self.next_writer()? != writer {
                    return Err(Error::Contract("writer allocation lineage"));
                }
                self.writers.insert(writer, Writer { principal, resume_hash, observer: false });
            }
            Event::Commit { principal, writer, frame, receipt } => {
                self.owns(&principal, &writer)?;
                let WriterGroupPreparation::Prepared(prepared) =
                    self.prepare_writer_group(&writer, &frame)?
                else {
                    return Err(Error::Contract("durable group did not prepare"));
                };
                if Receipt::from(prepared.receipt().clone()) != receipt {
                    return Err(Error::Contract("durable receipt replay differs"));
                }
                self.replica.commit_writer_group(*prepared)?;
                self.remember(record.sequence, receipt);
            }
            Event::RegisterObserverV1 { principal, writer, resume_hash } => {
                self.replay_observer(principal, writer, resume_hash)?;
            }
            Event::NativeHistoryBoundaryV1 { actor, lane, boundary, before, after } => {
                if matches!(boundary, NativeHistoryBoundary::ContinueReview { .. }) {
                    return Err(Error::Contract(
                        "review continuation requires its own durable record",
                    ));
                }
                self.replay_native_history(
                    record.sequence,
                    &actor,
                    lane,
                    &boundary,
                    before,
                    after,
                )?;
            }
            Event::NativeReviewContinuationV2 { actor, next, before, after } => {
                self.replay_native_history(
                    record.sequence,
                    &actor,
                    ServerNativeHistoryLane::Review,
                    &NativeHistoryBoundary::ContinueReview { next },
                    before,
                    after,
                )?;
            }
            event @ (Event::EnableReviewV1 { .. }
            | Event::GrantReviewV1 { .. }
            | Event::RegisterReviewV1 { .. }
            | Event::RegisterReviewObserverV1 { .. }
            | Event::CommitReviewV1 { .. }) => self.replay_review(record.sequence, event)?,
            event @ (Event::EnableDocumentVersionsV1 { .. }
            | Event::PublishDocumentVersionV1 { .. }) => {
                self.replay_document_versions(record.sequence, event)?;
            }
            event @ (Event::EnableDocumentSuggestionsV1 { .. }
            | Event::GrantDocumentSuggestionsV1 { .. }
            | Event::PublishDocumentSuggestionV1 { .. }
            | Event::DecideDocumentSuggestionV1 { .. }
            | Event::DecideOwnedDocumentSuggestionV1 { .. }
            | Event::EnableDocumentSuggestionRevisionsV1 { .. }
            | Event::PrepareDocumentSuggestionRevisionV1 { .. }
            | Event::CommitDocumentSuggestionRevisionV1 { .. }) => {
                self.replay_document_suggestions(record.sequence, event)?;
            }
        }
        Ok(())
    }

    pub(crate) fn reader(&self, principal: &str) -> Result<()> {
        self.log.ready()?;
        access::principal(principal)?;
        if principal == self.owner || self.roles.contains_key(principal) {
            Ok(())
        } else {
            Err(Error::Permission)
        }
    }
    pub(crate) fn editor(&self, principal: &str) -> Result<()> {
        self.reader(principal)?;
        if principal == self.owner || self.roles.get(principal) == Some(&Role::Editor) {
            Ok(())
        } else {
            Err(Error::Permission)
        }
    }

    fn bind_assets(configuration: &str, room: &str, owner: &str, journal: &str) -> Result<String> {
        Ok(crate::assets::asset_id(&serde_json::to_vec(&(
            "breditor/room-asset-binding/1",
            configuration,
            room,
            owner,
            journal,
        ))?))
    }
    /// Immutable seed/authority identity for a separate asset store. This is not a credential.
    #[must_use]
    pub fn asset_binding(&self) -> &str {
        &self.asset_binding
    }

    /// Persist separately admitted bytes under current editor permission. Does not append a
    /// document action or change history. The caller serializes this with role changes.
    /// # Errors
    /// Rejects missing write permission, wrong store binding and storage errors.
    pub fn put_asset(
        &self,
        principal: &str,
        store: &mut crate::assets::AssetStore,
        asset: crate::assets::PreparedAsset,
    ) -> Result<crate::assets::AssetReceipt> {
        self.editor(principal)?;
        if store.binding() != self.asset_binding {
            return Err(Error::Contract("asset store room binding"));
        }
        store.put(asset)
    }
    /// Read verified bytes under current reader permission, independently of document history.
    /// Revocation prevents future reads; it cannot erase a reader's already cached offline bytes.
    /// # Errors
    /// Rejects missing read permission, wrong store binding and storage corruption/failure.
    pub fn read_asset(
        &self,
        principal: &str,
        store: &crate::assets::AssetStore,
        asset: &str,
    ) -> Result<Option<crate::assets::StoredAsset>> {
        self.reader(principal)?;
        if store.binding() != self.asset_binding {
            return Err(Error::Contract("asset store room binding"));
        }
        store.get(asset)
    }
    fn owns(&self, principal: &str, writer: &str) -> Result<()> {
        self.editor(principal)?;
        if self.writers.get(writer).is_some_and(|w| w.principal == principal && !w.observer) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    fn check_grant(&self, actor: &str, principal: &str, role: Option<Role>) -> Result<()> {
        self.log.ready()?;
        if actor != self.owner {
            return Err(Error::Permission);
        }
        access::principal(principal)?;
        if principal == self.owner {
            return Err(Error::Contract("initial owner is immutable"));
        }
        if role.is_some()
            && !self.roles.contains_key(principal)
            && self.roles.len() >= MAX_PRINCIPALS
        {
            return Err(Error::Contract("room account budget"));
        }
        Ok(())
    }
    fn apply_grant(&mut self, principal: String, role: Option<Role>) {
        // Permission changes and admission are in the same room serialization domain. Even a
        // later regrant requires a new resume; no stale socket silently regains write authority.
        self.leases.retain(|id, _| self.writers.get(id).is_none_or(|w| w.principal != principal));
        if let Some(review) = &mut self.review {
            review.fence(&principal);
        }
        for (writer, record) in &self.writers {
            if record.principal == principal {
                self.presence.remove(writer);
            }
        }
        if let Some(role) = role {
            self.roles.insert(principal, role);
        } else {
            self.roles.remove(&principal);
        }
    }

    /// Persist an owner-authorized role change (or revocation) and fence this account's old leases.
    /// # Errors
    /// Rejects non-owner administration, invalid/bounded accounts and uncertain storage.
    pub fn grant(&mut self, actor: &str, principal: &str, role: Option<Role>) -> Result<()> {
        self.check_grant(actor, principal, role)?;
        self.log.append(Event::Grant { actor: actor.into(), principal: principal.into(), role })?;
        self.apply_grant(principal.into(), role);
        Ok(())
    }
    fn next_writer(&self) -> Result<String> {
        if self.writers.len() >= MAX_WRITERS {
            return Err(Error::Contract("room writer budget"));
        }
        // Server owns 1. Allocations are contiguous, never recycled after revocation or restart.
        Ok((u64::try_from(self.writers.len())
            .map_err(|_| Error::Contract("room writer budget"))?
            + 2)
        .to_string())
    }

    /// Allocate a distinct causal writer and persist principal/hashed-credential ownership before
    /// returning its secret. Do not author until the browser has saved this separate credential.
    /// # Errors
    /// Rejects missing write permission, allocation budget, entropy and persistence failures.
    pub fn register(&mut self, principal: &str) -> Result<Registration> {
        self.editor(principal)?;
        if self.suggestions.is_some() {
            self.check_suggestion_author_budget(1)?;
        }
        let writer = self.next_writer()?;
        let credential = credentials::issue()?;
        let resume_hash = credentials::hash(&credential)?;
        let token = credentials::issue()?;
        self.log.append(Event::Register {
            principal: principal.into(),
            writer: writer.clone(),
            resume_hash,
        })?;
        self.writers.insert(
            writer.clone(),
            Writer { principal: principal.into(), resume_hash, observer: false },
        );
        self.leases.insert(writer.clone(), token.clone());
        Ok(Registration { lease: Lease { writer, token }, credential })
    }

    /// Reacquire the same writer with its separate account-bound credential. Replaces every old
    /// connection fence, including a concurrent tab's fence. Does not clear or rewrite local work.
    /// # Errors
    /// Rejects wrong account/credential, revoked/reader permissions, entropy or storage recovery.
    pub fn resume(&mut self, principal: &str, writer: &str, credential: &str) -> Result<Lease> {
        self.owns(principal, writer)?;
        let record = self.writers.get(writer).ok_or(Error::Lease)?;
        if credentials::hash(credential)? != record.resume_hash {
            return Err(Error::Lease);
        }
        let token = credentials::issue()?;
        self.leases.insert(writer.into(), token.clone());
        self.presence.remove(writer);
        Ok(Lease { writer: writer.into(), token })
    }

    /// Check that this authenticated writer session still owns its connection fence before
    /// sending author-sensitive catchup as well as before accepting writes.
    /// # Errors
    /// Rejects revoked permissions, foreign ownership, replaced fences or uncertain storage.
    pub fn validate_lease(&self, principal: &str, lease: &Lease) -> Result<()> {
        self.owns(principal, &lease.writer)?;
        if self.leases.get(&lease.writer) == Some(&lease.token) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    /// Release this connection only if it still owns the active fence. Old disconnect callbacks
    /// cannot clear a newer resumed connection. No credential or authored history is deleted.
    pub fn release(&mut self, lease: &Lease) {
        if self.leases.get(&lease.writer) == Some(&lease.token) {
            self.leases.remove(&lease.writer);
            self.presence.remove(&lease.writer);
        }
    }

    /// Publish the latest ephemeral selection for a currently leased authenticated writer.
    /// Rust validates the opaque frame without importing content or mutating document history.
    /// # Errors
    /// Rejects revoked/replaced authority, wrong origin/binding, malformed frames and budgets.
    pub fn publish_presence(
        &mut self,
        principal: &str,
        lease: &Lease,
        sequence: &str,
        frame: &str,
    ) -> Result<bool> {
        self.validate_lease(principal, lease)?;
        let resolved = self.replica.resolve_presence_frame(frame)?;
        let writer = match resolved {
            breditor_collab_feasibility::rich_replica::PresenceResolution::Resolved {
                writer,
                ..
            }
            | breditor_collab_feasibility::rich_replica::PresenceResolution::Pending { writer }
            | breditor_collab_feasibility::rich_replica::PresenceResolution::Cleared {
                writer,
                ..
            } => writer,
        };
        if writer != lease.writer {
            return Err(Error::Lease);
        }
        self.presence.publish(
            crate::PresencePeer {
                writer,
                session: crate::presence::session(&lease.token),
                label: principal.into(),
                sequence: sequence.into(),
                frame: frame.into(),
            },
            std::time::Instant::now(),
        )
    }
    /// Read current authenticated peers, pruning expired display bytes. No presence survives
    /// restart or enters the log. A supplied writer lease fences author-sensitive connections.
    /// # Errors
    /// Rejects missing current read permission, a replaced lease or uncertain room storage.
    pub fn presence_snapshot(
        &mut self,
        principal: &str,
        lease: Option<&Lease>,
    ) -> Result<Vec<crate::PresencePeer>> {
        self.reader(principal)?;
        if let Some(lease) = lease {
            self.validate_lease(principal, lease)?;
        }
        Ok(self.presence.snapshot(std::time::Instant::now()))
    }

    /// Read a trusted full-state catchup under current account permissions. Clients must not use
    /// this multi-author format as their authenticated outbound edit submission.
    /// # Errors
    /// Rejects missing read permission, uncertain storage or existing core frame budgets.
    pub fn catchup(&self, principal: &str) -> Result<String> {
        self.reader(principal)?;
        Ok(self.replica.update_frame()?)
    }
    /// Read the exact profile contract after authentication, without granting writer ownership.
    /// # Errors
    /// Rejects missing read permission or uncertain storage.
    pub fn descriptor(&self, principal: &str) -> Result<String> {
        self.reader(principal)?;
        Ok(self.profile.descriptor_json())
    }
    /// Read applied author progress and canonical lineage for resumable outbound group cursors.
    /// # Errors
    /// Rejects missing read permission, uncertain storage or invalid writer identity.
    pub fn writer_clock(&self, principal: &str, writer: &str) -> Result<serde_json::Value> {
        self.reader(principal)?;
        Ok(serde_json::to_value(if self.atomic_transport_v2 {
            self.replica.writer_clock_v2(writer)?
        } else {
            self.replica.writer_clock(writer)?
        })?)
    }
    fn key(receipt: &Receipt) -> (String, String, String) {
        (receipt.writer.clone(), receipt.from.clone(), receipt.through.clone())
    }
    fn remember(&mut self, sequence: u64, receipt: Receipt) -> DurableReceipt {
        let ack = DurableReceipt { sequence: sequence.to_string(), receipt, duplicate: false };
        self.receipts.insert(Self::key(&ack.receipt), ack.clone());
        ack
    }

    /// Admit exactly one authenticated active writer's atomic group, append+sync the acceptance
    /// record, then publish the already-admitted candidate and return a server-durable receipt.
    ///
    /// Missing dependencies remain client-owned pending work. An exact retry returns the ORIGINAL
    /// durable sequence, even after restart or different binary packing; it appends nothing.
    /// # Errors
    /// Rejects revoked/stale/foreign authority, malformed/forked/invalid groups, bounded history,
    /// uncertain storage or I/O failure. No acknowledgement is issued on an uncertain append.
    pub fn admit(&mut self, principal: &str, lease: &Lease, frame: &str) -> Result<Admission> {
        self.validate_lease(principal, lease)?;
        match self.prepare_writer_group(&lease.writer, frame)? {
            WriterGroupPreparation::Pending { writer, missing } => {
                Ok(Admission::Pending { writer, missing })
            }
            WriterGroupPreparation::Duplicate(receipt) => {
                let receipt = Receipt::from(receipt);
                let mut ack = self
                    .receipts
                    .get(&Self::key(&receipt))
                    .ok_or(Error::Contract("duplicate has no durable receipt"))?
                    .clone();
                if ack.receipt != receipt {
                    return Err(Error::Contract("duplicate durable receipt differs"));
                }
                ack.duplicate = true;
                Ok(Admission::Durable(ack))
            }
            WriterGroupPreparation::Prepared(prepared) => {
                // Prove that exact recovery remains inside the native journal budget before I/O.
                self.check_prepared_document_history(&prepared)?;
                let receipt = Receipt::from(prepared.receipt().clone());
                let sequence = self.log.append(Event::Commit {
                    principal: principal.into(),
                    writer: lease.writer.clone(),
                    frame: frame.into(),
                    receipt: receipt.clone(),
                })?;
                if let Err(error) = self.replica.commit_writer_group(*prepared) {
                    self.log.invalidate();
                    return Err(error.into());
                }
                Ok(Admission::Durable(self.remember(sequence, receipt)))
            }
        }
    }
    fn prepare_writer_group(&self, writer: &str, frame: &str) -> Result<WriterGroupPreparation> {
        Ok(if self.atomic_transport_v2 {
            self.replica.prepare_writer_group_v2(writer, frame)?
        } else {
            self.replica.prepare_writer_group(writer, frame)?
        })
    }
}
