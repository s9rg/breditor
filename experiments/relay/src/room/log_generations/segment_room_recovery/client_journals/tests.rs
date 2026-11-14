use super::{
    RelaySegmentClientJournal, RelaySegmentClientJournalPin,
    RelaySegmentDocumentJournalFamily as DocumentFamily, RelaySegmentJournalOwner as Owner,
    RelaySegmentReviewJournalFamily as ReviewFamily,
};
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentRoomBackupFiles, Role, RoomRecoveryPolicy,
    assets::AssetStore,
    room::log_generations::tests::{Files, send, setup_profile},
};
use breditor_collab_feasibility::rich_replica::actions::InsertText;
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId, ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{Command, ReviewAnchorTarget, RichReplica, SharedRichProfile},
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

struct Fixture {
    _files: Files,
    parent: PathBuf,
    backup: RelaySegmentRoomBackupFiles,
    author: RichReplica,
    lagged: RichReplica,
    ahead: ReviewSession,
    fork_document: RichReplica,
    fork_review: ReviewSession,
    writer: String,
    peer: String,
    actor: ReviewActorId,
}

impl Fixture {
    fn new() -> TestResult<Self> {
        let (files, mut room, profile) = setup_profile(3, true, true)?;
        let parent = files.room().parent().ok_or("fixture parent")?.to_owned();
        let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
        room.grant("owner", "alice", Some(Role::Editor))?;
        let registered = room.register("alice")?;
        let peer = room.register("owner")?.lease.writer;
        let writer = registered.lease.writer.clone();
        let des = room.enable_review("owner")?;
        assert!(!des.binding.is_empty());
        room.grant_review("owner", "alice", Some(crate::ReviewRole::Comment))?;
        let actor = ReviewActorId::try_new("alice.review")?;
        let reg = room.register_review("alice", actor.clone())?;
        let frame = room.catchup("alice")?;
        let join = |profile: &SharedRichProfile, writer: &str| {
            profile.join_frame("room".into(), writer.into(), &frame)
        };
        let mut author = join(&profile, &writer)?;
        let mut fork_document = join(&profile, &writer)?;
        let lagged = join(&profile, &peer)?;
        let policy = ReviewActorPolicy {
            actor: actor.clone(),
            principal: ReviewPrincipalId::try_new("alice")?,
            access: ReviewAccess::Comment,
        };
        let mut ahead = author.create_review_session(policy.clone())?;
        let mut fork_review = author.create_review_session(policy)?;
        edit(&mut author, "Accepted")?;
        edit(&mut fork_document, "Fork")?;
        send(&mut room, &author, &registered.lease, "0")?;
        post(&author, &mut ahead, "Accepted comment")?;
        post(&author, &mut fork_review, "Fork comment")?;
        room.admit_review("alice", &reg.lease, &ahead.export_frame(0)?)?;
        edit(&mut author, "Pending")?;
        post(&author, &mut ahead, "Pending comment")?;
        let identity = room.write_relay_segment_room_backup(
            "owner",
            &assets,
            &mut File::create_new(parent.join("native.archive"))?,
            &mut File::create_new(parent.join("native.checkpoint"))?,
            &mut File::create_new(parent.join("rasters.archive"))?,
        )?;
        let native = RelaySegmentBaseFile::open(
            File::open(parent.join("native.archive"))?,
            File::open(parent.join("native.checkpoint"))?,
            &identity.native,
        )?;
        let backup = RelaySegmentRoomBackupFiles::open(
            Arc::new(native),
            File::open(parent.join("rasters.archive"))?,
            &identity,
        )?;
        Ok(Self {
            _files: files,
            parent,
            backup,
            author,
            lagged,
            ahead,
            fork_document,
            fork_review,
            writer,
            peer,
            actor,
        })
    }

    fn documents(&self, document: &RichReplica) -> TestResult<Vec<RelaySegmentClientJournal>> {
        let mut inputs = Vec::new();
        for (name, native) in [("author", document), ("peer", &self.lagged)] {
            let path = self.parent.join(name);
            let owner = Owner::Document {
                writer: native.writer().into(),
                family: DocumentFamily::Original,
            };
            inputs.push(write_journal(&path, owner, &native.checkpoint()?)?);
        }
        Ok(inputs)
    }

    fn review(&self, native: &ReviewSession) -> TestResult<RelaySegmentClientJournal> {
        let owner = Owner::Review {
            actor: self.actor.as_str().into(),
            document_writer: self.writer.clone(),
            family: ReviewFamily::Original,
        };
        write_journal(&self.parent.join("review"), owner, &native.checkpoint_json()?)
    }
}

fn write_journal(
    path: &Path,
    owner: Owner,
    journal: &str,
) -> TestResult<RelaySegmentClientJournal> {
    let pin = RelaySegmentClientJournalPin {
        owner,
        bytes: journal.len() as u64,
        sha256: Sha256::digest(journal.as_bytes()).into(),
    };
    fs::write(path, journal)?;
    Ok(RelaySegmentClientJournal::open(File::open(path)?, pin)?)
}

fn edit(replica: &mut RichReplica, text: &str) -> TestResult {
    assert!(replica.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?);
    Ok(())
}

fn post(replica: &RichReplica, review: &mut ReviewSession, body: &str) -> TestResult {
    let observed = replica.observe()?;
    let anchor = replica.capture_review_anchor_guarded(&observed, &ReviewAnchorTarget::Document)?;
    let review_observed = review.observe();
    replica.dispatch_review_guarded(
        &observed,
        review,
        &review_observed,
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor, body: body.into() }),
    )?;
    Ok(())
}

#[test]
fn verifies_both_original_lanes_and_refuses_a_damaged_cold_journal() -> TestResult {
    let f = Fixture::new()?;
    let path = f.parent.join("target");
    let mut originals = f.documents(&f.author)?;
    originals.push(f.review(&f.ahead)?);
    let target = f.backup.restore_with_client_journals(&path, "new", POLICY, &[], &originals)?;
    let accepted = target.components().0.catchup("owner")?;
    let participants = target
        .components()
        .0
        .capture_participant_inventory_at(
            "owner",
            f.backup.identity().native.predecessor.source.clone(),
        )?
        .metadata();
    let report = target.handover_client_journals(&participants)?.ok_or("coverage")?;
    assert!(report.missing_document_writers.is_empty());
    assert!(report.missing_review_actors.is_empty());
    let [author, peer, review] = report.journals.as_slice() else {
        return Err("expected three enrolled lanes".into());
    };
    assert_ne!(author.local_through, author.accepted_through);
    assert_eq!(peer.local_through, "0");
    assert_eq!((&*review.local_through, &*review.accepted_through), ("2", "1"));
    assert_eq!(target.components().0.catchup("owner")?, accepted);
    assert!(!accepted.contains("Pending comment"));
    drop(target);
    for name in ["author", "peer", "review"] {
        fs::remove_file(f.parent.join(name))?;
    }
    let target = f.backup.reopen(&path, POLICY)?;
    assert_eq!(
        target.read_client_journal(&author.pin)?.ok_or("document journal")?,
        f.author.checkpoint()?,
    );
    assert_eq!(
        target.read_client_journal(&review.pin)?.ok_or("review journal")?,
        f.ahead.checkpoint_json()?,
    );
    fs::OpenOptions::new()
        .append(true)
        .open(path.join("client-journals/journals.bin"))?
        .write_all(b"!")?;
    assert!(target.read_client_journal(&author.pin).is_err());
    drop(target);
    assert!(f.backup.reopen(&path, POLICY).is_err());
    Ok(())
}

#[test]
fn refuses_each_same_writer_accepted_prefix_fork() -> TestResult {
    let f = Fixture::new()?;
    for (fork, expected) in [
        (true, "client journal document prefix diverged"),
        (false, "client journal review prefix diverged"),
    ] {
        let doc = if fork { &f.fork_document } else { &f.author };
        let mut originals = f.documents(doc)?;
        originals.push(f.review(&f.fork_review)?);
        let target = f.backup.restore_with_client_journals(
            &f.parent.join(format!("fork-{fork}")),
            "new",
            POLICY,
            &[],
            &originals,
        )?;
        let participants = target
            .components()
            .0
            .capture_participant_inventory_at(
                "owner",
                f.backup.identity().native.predecessor.source.clone(),
            )?
            .metadata();
        assert!(matches!(
            target.handover_client_journals(&participants),
            Err(Error::Contract(reason)) if reason == expected
        ));
    }
    Ok(())
}

#[test]
fn missing_actor_document_stays_pending_and_duplicate_offers_are_refused() -> TestResult {
    let f = Fixture::new()?;
    let mut originals = f.documents(&f.author)?;
    originals.remove(0);
    originals.push(f.review(&f.ahead)?);
    let target = f.backup.restore_with_client_journals(
        &f.parent.join("incomplete"),
        "new",
        POLICY,
        &[],
        &originals,
    )?;
    let participants = target
        .components()
        .0
        .capture_participant_inventory_at(
            "owner",
            f.backup.identity().native.predecessor.source.clone(),
        )?
        .metadata();
    let report = target.handover_client_journals(&participants)?.ok_or("coverage")?;
    assert_eq!(report.missing_document_writers, std::slice::from_ref(&f.writer));
    assert_eq!(report.missing_review_actors, [f.actor.as_str()]);
    assert_eq!(report.journals[0].pin.owner.key(), (0, f.peer.as_str()));
    let duplicate = write_journal(
        &f.parent.join("duplicate"),
        originals[1].pin.owner.clone(),
        &f.ahead.checkpoint_json()?,
    )?;
    originals.push(duplicate);
    assert!(matches!(
        f.backup.restore_with_client_journals(
            &f.parent.join("duplicate-target"),
            "new",
            POLICY,
            &[],
            &originals
        ),
        Err(Error::Contract("duplicate or unsorted client journal owner"))
    ));
    Ok(())
}

#[test]
fn paired_backup_cursor_cannot_skip_work_absent_from_its_native_journals() -> TestResult {
    use serde_json::json;
    let f = Fixture::new()?;
    let untouched = f.backup.restore(&f.parent.join("read-accepted-cut"), "seen", POLICY)?;
    let (room, _) = untouched.components();
    let participants = room
        .capture_participant_inventory_at(
            "owner",
            f.backup.identity().native.predecessor.source.clone(),
        )?
        .metadata();
    let review = participants.review.as_ref().ok_or("review registration")?;
    let sequence = room.recovery_review_acceptance_sequence(&f.actor, 1)?.to_string();
    let cursor = json!({"binding": review.binding, "after": sequence});
    let plain = f.author.create_review_session(ReviewActorPolicy {
        actor: f.actor.clone(),
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::ReadOnly,
    })?;
    let owner = Owner::PairedSession { writer: f.writer.clone(), actor: f.actor.as_str().into() };
    for (variant, checkpoint) in
        [("complete", f.ahead.checkpoint_json()?), ("skips", plain.checkpoint_json()?)]
    {
        let record = json!({
            "format": "breditor/shared-review-relay-checkpoint-record",
            "formatVersion": 1, "history": "explicit", "rangeEditing": "original",
            "selectionEditing": "original", "richLanguage": 3,
            "reviewActor": f.actor, "principal": "alice",
            "documentCheckpointJson": f.author.checkpoint()?,
            "reviewCheckpointJson": checkpoint, "versions": [],
            "relay": {"endpoint": "wss://relay.example.test/ws", "principal": "alice",
                "room": "room", "actor": f.actor, "binding": review.binding,
                "documentWriter": f.writer, "writerTransport": "atomic-v2"},
            "progress": {"cursor": cursor, "accepted": null, "sequence": null},
        });
        let archive = paired_backup_json(&f.writer, &record)?;
        let selected =
            write_journal(&f.parent.join(format!("{variant}.paired")), owner.clone(), &archive)?;
        let pin = selected.pin.clone();
        let peer = write_journal(
            &f.parent.join(format!("{variant}.peer")),
            Owner::Document { writer: f.peer.clone(), family: DocumentFamily::Original },
            &f.lagged.checkpoint()?,
        )?;
        let path = f.parent.join(variant);
        let target =
            f.backup.restore_with_client_journals(&path, "new", POLICY, &[], &[selected, peer])?;
        let state = target.handover_client_journals(&participants);
        if variant == "complete" {
            let coverage = state?.ok_or("paired journal coverage")?;
            assert!(coverage.missing_review_actors.is_empty());
            let review_head =
                coverage.journals[0].paired_review.as_ref().ok_or("paired review head")?;
            assert_eq!((&*review_head.local_through, &*review_head.accepted_through), ("2", "1"));
            drop(target);
            fs::remove_file(f.parent.join(format!("{variant}.paired")))?;
            let reopened = f.backup.reopen(&path, POLICY)?;
            assert_eq!(reopened.read_client_journal(&pin)?.as_deref(), Some(archive.as_str()));
        } else {
            assert!(
                state.is_err(),
                "saved cursor must prove the exact prefixes in its own journal"
            );
        }
    }
    Ok(())
}

fn paired_backup_json(writer: &str, record: &serde_json::Value) -> TestResult<String> {
    let record_json = serde_json::to_string(&record.to_string())?;
    let body = format!(
        concat!(
            r#"{{"format":"breditor/shared-paired-session-backup","formatVersion":1,"#,
            r#""identity":{{"room":"room","writer":"{writer}","richLanguage":3,"history":"explicit","#,
            r#""rangeEditing":"original","selectionEditing":"original","searchHistory":null}},"#,
            r#""recordJson":{record_json}}}"#,
        ),
        writer = writer,
        record_json = record_json
    );
    let hash = crate::assets::asset_id(body.as_bytes());
    Ok(format!(r#"{}, "sha256":"{}"}}"#, &body[..body.len() - 1], &hash[7..]))
}
