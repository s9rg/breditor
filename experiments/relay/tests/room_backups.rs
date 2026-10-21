//! Public host API: accepted comments, versions, revision/decision order and retry receipts survive.
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::InsertText,
    },
};
use breditor_collab_relay::{
    AtomicTransportProfile, DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission,
    DocumentVersionAdmission, ReviewAdmission, ReviewRole, Role, Room, RoomBackup,
    RoomRecoveryPolicy, SuggestionDecision, SuggestionDecisionRequest, SuggestionRevisionAdmission,
    SuggestionRevisionRequest, SuggestionRole,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Directory(PathBuf);
impl Directory {
    fn try_reserve(path: PathBuf) -> std::io::Result<Self> {
        // Cleanup custody exists only AFTER this exact new directory was acquired.
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    fn reserve_at(nonce: u128) -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        for _ in 0..1024 {
            let serial = NEXT.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "breditor-public-room-backup-{}-{nonce}-{serial}",
                std::process::id()
            ));
            match Self::try_reserve(path) {
                Ok(directory) => return Ok(directory),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
        Err("temporary fixture reservation budget".into())
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        for name in ["source.log", "restored.log"] {
            let _ = fs::remove_file(self.0.join(name));
        }
        let _ = fs::remove_dir(&self.0);
    }
}
fn setup() -> Result<(Directory, SharedRichProfile, Room)> {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let directory = Directory::reserve_at(nonce)?;
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,
        "schema":{"name":"example/public-room-backup","version":1},"extensions":[]})
    .to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/public-room-backup","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree})
    .to_string();
    let mut room = Room::create_atomic_transport_v2(
        &directory.0.join("source.log"),
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    room.enable_review("owner")?;
    room.enable_document_versions("owner")?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
    Ok((directory, profile, room))
}
fn draft(text: &str) -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: text.into(),
        })]),
    }
}
fn state(room: &Room, profile: &SharedRichProfile) -> Result<Value> {
    let observer = profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?;
    Ok(json!({"document":observer.document_json(),
        "review":room.review_catchup("alice", None)?,
        "versions":room.document_versions_page("alice", None)?,
        "suggestions":room.document_suggestions_page("alice", None)?,
        "revisions":room.document_suggestion_revisions_page("alice", None)?}))
}
fn propose(
    room: &mut Room,
    client: &RichReplica,
) -> Result<(SuggestionRevisionRequest, SuggestionDecisionRequest)> {
    let previous = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Original proposal",
        ReviewPrincipalId::try_new("alice")?,
        "1",
        draft("First "),
    )?;
    assert!(matches!(
        room.publish_document_suggestion("alice", &previous)?,
        DocumentSuggestionAdmission::Durable(_)
    ));
    let packet = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &previous,
        "Revised proposal",
        "2",
        draft("Revised 🙂 "),
    )?;
    let child = client.document_suggestion_revision_packet(&previous, &packet)?;
    let revision = SuggestionRevisionRequest {
        binding: room.document_suggestion_revisions_descriptor("alice")?.binding,
        previous_suggestion_id: client.read_document_suggestion(&previous)?.id,
        revision_packet: packet,
    };
    assert!(matches!(
        room.revise_document_suggestion("alice", &revision)?,
        SuggestionRevisionAdmission::Durable(_)
    ));
    let decision = SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: client.read_document_suggestion(&child)?.id,
        decision: SuggestionDecision::Accept,
    };
    assert!(matches!(
        room.decide_document_suggestion("owner", &decision)?,
        DocumentSuggestionDecisionAdmission::Durable(_)
    ));
    Ok((revision, decision))
}

#[test]
fn public_archive_preserves_all_durable_lanes_and_never_reexecutes_a_final_accept() -> Result {
    let (directory, profile, mut source) = setup()?;
    let writer = source.register("alice")?;
    let client =
        profile.join_frame("room".into(), writer.lease.writer, &source.catchup("alice")?)?;
    let review_writer =
        source.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
    let mut review = client.create_review_session(ReviewActorPolicy {
        actor: review_writer.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let observation = review.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut review,
        &observation,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: client
                .capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?,
            body: "Retained server comment 🙂".into(),
        }),
    )?;
    let frame = review.export_frame(0)?;
    assert!(matches!(
        source.admit_review("alice", &review_writer.lease, &frame)?,
        ReviewAdmission::Durable(_)
    ));
    let version = client.capture_document_version_guarded(
        &client.observe()?,
        "Before review",
        ReviewPrincipalId::try_new("alice")?,
        "1",
    )?;
    let DocumentVersionAdmission::Durable(version_receipt) =
        source.publish_document_version("alice", &version)?
    else {
        return Err("version".into());
    };
    let (revision, decision) = propose(&mut source, &client)?;
    let before = state(&source, &profile)?;
    let backup = RoomBackup::from_bytes(&source.export_backup()?.to_bytes())?;
    let identity = source.backup_identity()?;
    let original = fs::read(directory.0.join("source.log"))?;
    for secret in [&writer.credential, &review_writer.credential, &review_writer.lease.token] {
        assert!(!original.windows(secret.len()).any(|bytes| bytes == secret.as_bytes()));
    }
    drop(source);
    let mut restored = Room::restore_backup(
        &directory.0.join("restored.log"),
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(fs::read(directory.0.join("restored.log"))?, original);
    assert_eq!(state(&restored, &profile)?, before);
    assert_eq!(
        restored.document_version_packet("alice", &version_receipt.entry.version.id)?,
        Some(version.clone())
    );
    assert!(restored.validate_review_lease("alice", &review_writer.lease).is_err());
    let lease =
        restored.resume_review("alice", &review_writer.lease.actor, &review_writer.credential)?;
    let ReviewAdmission::Durable(review_retry) = restored.admit_review("alice", &lease, &frame)?
    else {
        return Err("review retry".into());
    };
    assert!(review_retry.duplicate);
    let DocumentVersionAdmission::Durable(version_retry) =
        restored.publish_document_version("alice", &version)?
    else {
        return Err("version retry".into());
    };
    assert!(version_retry.duplicate);
    assert_eq!(version_retry.entry, version_receipt.entry);
    let SuggestionRevisionAdmission::Durable(revision_retry) =
        restored.revise_document_suggestion("alice", &revision)?
    else {
        return Err("revision retry".into());
    };
    assert!(revision_retry.duplicate);
    let DocumentSuggestionDecisionAdmission::Durable(decision_retry) =
        restored.decide_document_suggestion("owner", &decision)?
    else {
        return Err("decision retry".into());
    };
    assert!(decision_retry.duplicate);
    assert_eq!(state(&restored, &profile)?, before);
    assert_eq!(fs::read(directory.0.join("restored.log"))?, original);
    drop(restored);
    let (reopened, recovery) = Room::open(&directory.0.join("restored.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(state(&reopened, &profile)?, before);
    Ok(())
}

fn native_cuts(room: &Room) -> Result<(String, String)> {
    use breditor_collab_relay::ServerNativeHistoryLane;
    Ok((
        room.native_history_checkpoint("owner", ServerNativeHistoryLane::Document)?,
        room.native_history_checkpoint("owner", ServerNativeHistoryLane::Review)?,
    ))
}

#[test]
fn same_clock_reservation_cannot_delete_a_competing_fixtures_owned_files() -> Result {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let first = Directory::reserve_at(nonce)?;
    let original = b"Owned by the first successfully reserved fixture";
    fs::write(first.0.join("source.log"), original)?;
    let second = Directory::reserve_at(nonce);
    assert_eq!(
        fs::read(first.0.join("source.log")).ok().as_deref(),
        Some(original.as_slice()),
        "a failed reservation must never delete another fixture's files"
    );
    let second = second?;
    assert_ne!(first.0, second.0);
    Ok(())
}

#[test]
fn parallel_same_clock_reservations_and_occupied_targets_preserve_actual_fixture_custody() -> Result
{
    use std::{
        collections::BTreeSet,
        sync::{Arc, Barrier},
        thread,
    };
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let original = Directory::reserve_at(nonce)?;
    fs::write(original.0.join("source.log"), b"Original owner's exact data")?;
    assert!(Directory::try_reserve(original.0.clone()).is_err());
    assert_eq!(fs::read(original.0.join("source.log"))?, b"Original owner's exact data");
    let barrier = Arc::new(Barrier::new(4));
    let reserved = thread::scope(|scope| {
        let mut workers = Vec::new();
        for _ in 0..4 {
            let ready = Arc::clone(&barrier);
            workers.push(scope.spawn(move || {
                ready.wait();
                Directory::reserve_at(nonce).expect("independent exclusive fixture")
            }));
        }
        workers
            .into_iter()
            .map(|worker| worker.join().expect("reservation worker"))
            .collect::<Vec<_>>()
    });
    assert_eq!(
        reserved.iter().map(|directory| directory.0.clone()).collect::<BTreeSet<_>>().len(),
        4
    );
    for (index, directory) in reserved.iter().enumerate() {
        fs::write(directory.0.join("source.log"), index.to_string())?;
    }
    drop(original);
    for (index, directory) in reserved.iter().enumerate() {
        assert_eq!(fs::read(directory.0.join("source.log"))?, index.to_string().as_bytes());
    }
    Ok(())
}

#[test]
fn public_native_history_boundaries_recover_review_versions_revisions_and_exactly_once_accept()
-> Result {
    use breditor_collab_relay::{ServerNativeHistoryFamily, ServerNativeHistoryLane};
    let (directory, profile, mut source) = setup()?;
    assert_eq!(
        source.native_history_descriptor("alice")?.document,
        ServerNativeHistoryFamily::Original
    );
    let first = source.enable_document_history_generations("owner", "root".into(), "one".into())?;
    let comments =
        source.enable_review_history_generations("owner", "root".into(), "one".into())?;
    let writer = source.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
    let client = profile.join_frame("room".into(), "900".into(), &source.catchup("alice")?)?;
    let mut review = client.create_review_session(ReviewActorPolicy {
        actor: writer.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let observed = review.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut review,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: client
                .capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?,
            body: "Generation-retained comment".into(),
        }),
    )?;
    assert!(matches!(
        source.admit_review("alice", &writer.lease, &review.export_frame(0)?)?,
        ReviewAdmission::Durable(_)
    ));
    let version = client.capture_document_version_guarded(
        &client.observe()?,
        "Original native version",
        ReviewPrincipalId::try_new("alice")?,
        "0",
    )?;
    let DocumentVersionAdmission::Durable(published) =
        source.publish_document_version("alice", &version)?
    else {
        return Err("version publication".into());
    };
    let (_, decision) = propose(&mut source, &client)?;
    let document = source.seal_document_history_generation("owner", "two".into())?;
    let review = source.seal_review_history_generation("owner", "two".into())?;
    assert_eq!(document.lane, ServerNativeHistoryLane::Document);
    assert_eq!(review.lane, ServerNativeHistoryLane::Review);
    let cut = native_cuts(&source)?;
    let before = state(&source, &profile)?;
    let backup = RoomBackup::from_bytes(&source.export_backup()?.to_bytes())?;
    let identity = source.backup_identity()?;
    let bytes = fs::read(directory.0.join("source.log"))?;
    drop(source);
    let mut restored = Room::restore_backup(
        &directory.0.join("restored.log"),
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(state(&restored, &profile)?, before);
    assert_eq!(native_cuts(&restored)?, cut);
    assert_eq!(
        restored.document_version_packet("alice", &published.entry.version.id)?,
        Some(version)
    );
    let mut retried =
        restored.enable_document_history_generations("owner", "root".into(), "one".into())?;
    assert!(retried.duplicate);
    retried.duplicate = false;
    assert_eq!(retried, first);
    let mut retried =
        restored.enable_review_history_generations("owner", "root".into(), "one".into())?;
    assert!(retried.duplicate);
    retried.duplicate = false;
    assert_eq!(retried, comments);
    let mut retried = restored.seal_document_history_generation("owner", "two".into())?;
    assert!(retried.duplicate);
    retried.duplicate = false;
    assert_eq!(retried, document);
    let mut retried = restored.seal_review_history_generation("owner", "two".into())?;
    assert!(retried.duplicate);
    retried.duplicate = false;
    assert_eq!(retried, review);
    let DocumentSuggestionDecisionAdmission::Durable(retried) =
        restored.decide_document_suggestion("owner", &decision)?
    else {
        return Err("decision retry".into());
    };
    assert!(retried.duplicate);
    assert_eq!(state(&restored, &profile)?, before);
    assert_eq!(native_cuts(&restored)?, cut);
    assert_eq!(fs::read(directory.0.join("restored.log"))?, bytes);
    Ok(())
}
