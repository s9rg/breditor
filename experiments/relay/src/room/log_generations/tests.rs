//! Recover real filesystem prefixes through the production Room and native shared engine.
use crate::{
    AtomicTransportProfile, Error, Role, Room, ServerLogGenerationOptions,
    log::generations::RotationPoint,
};
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Files(PathBuf);
impl Files {
    fn new() -> TestResult<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir()
            .join(format!("breditor-rotation-prefix-{}-{nonce}-{serial}", std::process::id()));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    fn room(&self) -> PathBuf {
        self.0.join("room")
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        // Only the exclusively created per-test directory, never live service data.
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn setup() -> TestResult<(Files, Room, SharedRichProfile)> {
    let files = Files::new()?;
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,
        "schema":{"name":"example/rotation-prefix","version":1},"extensions":[]})
    .to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/rotation-prefix","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"))?}).to_string();
    let room = Room::create_atomic_log_generations_v2(
        &files.room(),
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        &ServerLogGenerationOptions { root: "root".into(), active: "one".into() },
    )?;
    Ok((files, room, profile))
}
fn send(
    room: &mut Room,
    author: &RichReplica,
    lease: &crate::Lease,
    after: &str,
) -> TestResult<String> {
    let groups: Value =
        serde_json::from_str(&author.writer_groups_v2_guarded(&author.observe()?, after)?)?;
    for group in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit("alice", lease, group.as_str().ok_or("frame")?)?,
            crate::Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("through")?.into())
}
fn interrupted(point: RotationPoint) -> TestResult {
    let (files, mut room, profile) = setup()?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registered = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Retained ".into(),
    })])?;
    let mut through = send(&mut room, &author, &registered.lease, "0")?;
    let expected = room.catchup("owner")?;
    let before = room.log_generation_descriptor("owner")?;
    room.log.interrupt_rotation_for_test(point)?;
    assert!(room.rotate_log_generation("owner", "two").is_err(), "{point:?}");
    assert!(matches!(room.catchup("owner"), Err(Error::NeedsRecovery)), "{point:?}");
    drop(room);
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0, "{point:?}");
    assert_eq!(room.catchup("owner")?, expected, "{point:?}");
    let after = room.log_generation_descriptor("owner")?;
    assert_eq!(after.next_sequence, before.next_sequence, "{point:?}");
    assert_eq!(after.terminal_digest, before.terminal_digest, "{point:?}");
    let receipt = room.rotate_log_generation("owner", "two")?;
    assert_eq!(receipt.duplicate, point != RotationPoint::ContinuationReady, "{point:?}");
    assert_eq!(receipt.after_manifest, room.log_generation_descriptor("owner")?.manifest);
    assert!(!files.room().join(".rotation.json").exists());
    let lease = room.resume("alice", &registered.lease.writer, &registered.credential)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(&mut room, &author, &lease, &through)?;
        let observer = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), author.document_json(), "{point:?}");
    }
    room.rotate_log_generation("owner", "three")?;
    let selected = room.log_generation_descriptor("owner")?;
    drop(room);
    assert_eq!(
        Room::open_log_generations(&files.room())?.0.log_generation_descriptor("owner")?,
        selected
    );
    Ok(())
}
#[test]
fn every_durable_rotation_prefix_recovers_exact_native_history_and_future_undo() -> TestResult {
    for point in [
        RotationPoint::ContinuationReady,
        RotationPoint::IntentSynced,
        RotationPoint::ContinuationPublished,
        RotationPoint::ManifestSynced,
        RotationPoint::HeadSynced,
        RotationPoint::StageRetired,
        RotationPoint::IntentRetired,
        RotationPoint::MemoryUpdated,
    ] {
        interrupted(point)?;
    }
    Ok(())
}

fn snapshot(files: &Files) -> TestResult<std::collections::BTreeMap<String, Vec<u8>>> {
    let mut output = std::collections::BTreeMap::new();
    for entry in fs::read_dir(files.room())? {
        let entry = entry?;
        output.insert(
            entry.file_name().into_string().map_err(|_| "fixture filename")?,
            fs::read(entry.path())?,
        );
    }
    Ok(output)
}
fn torn_header(files: &Files) -> TestResult {
    let (raw, _, _) = crate::log::Log::open_generations(&files.room())?;
    raw.append_incomplete_header_for_test()?;
    Ok(())
}

#[test]
fn native_replay_failure_precedes_pending_rotation_completion_and_torn_tail_repair() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    // A real checksum-valid event with invalid native authority; no substitute decoder/engine.
    room.log.append(crate::log::Event::Grant {
        actor: "intruder".into(),
        principal: "reader".into(),
        role: None,
    })?;
    room.log.interrupt_rotation_for_test(RotationPoint::IntentSynced)?;
    assert!(room.rotate_log_generation("owner", "two").is_err());
    // The uncertain live owner must not expose a descriptor. Its saved physical head names the
    // same active inode, so append a torn header via the exact known initial generation name.
    drop(room);
    torn_header(&files)?;
    let before = snapshot(&files)?;
    for _ in 0..2 {
        assert!(matches!(Room::open_log_generations(&files.room()), Err(Error::Permission)));
        assert_eq!(snapshot(&files)?, before);
    }
    Ok(())
}

#[test]
fn forged_pending_rotation_does_not_trim_an_incomplete_tail_or_publish_a_head() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.log.interrupt_rotation_for_test(RotationPoint::IntentSynced)?;
    assert!(room.rotate_log_generation("owner", "two").is_err());
    drop(room);
    let marker = files.room().join(".rotation.json");
    let bytes = fs::read(&marker)?;
    let intent: Value = serde_json::from_slice(&bytes)?;
    let needle = format!("\"records\":{},", intent["sealed"]["records"]);
    let text = String::from_utf8(bytes)?;
    assert_eq!(text.matches(&needle).count(), 1);
    // Preserve the production field order: fail at the actual cut check, not JSON sorting.
    fs::write(marker, text.replacen(&needle, "\"records\":99,", 1))?;
    torn_header(&files)?;
    let before = snapshot(&files)?;
    assert!(Room::open_log_generations(&files.room()).is_err());
    assert_eq!(snapshot(&files)?, before);
    Ok(())
}

#[test]
fn occupied_empty_continuation_is_not_adopted_or_overwritten_by_cold_resume() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.log.interrupt_rotation_for_test(RotationPoint::IntentSynced)?;
    assert!(room.rotate_log_generation("owner", "two").is_err());
    drop(room);
    let marker: Value = serde_json::from_slice(&fs::read(files.room().join(".rotation.json"))?)?;
    let next = marker["next"].as_str().ok_or("next")?;
    let mut hash = Sha256::new();
    hash.update(b"breditor/relay-log-file/1\0");
    hash.update(next.as_bytes());
    let name = hash.finalize().iter().fold(String::new(), |mut result, byte| {
        use std::fmt::Write;
        write!(result, "{byte:02x}").expect("string write");
        result
    });
    let path = files.room().join(format!("g-{name}.wal"));
    let mut options = fs::OpenOptions::new();
    options.create_new(true).read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let occupied = options.open(&path)?;
    occupied.sync_all()?;
    drop(occupied);
    let before = snapshot(&files)?;
    for _ in 0..2 {
        assert!(Room::open_log_generations(&files.room()).is_err());
        assert_eq!(snapshot(&files)?, before);
    }
    // Remove only the explicit unrelated file created by this isolated fixture.
    fs::remove_file(path)?;
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert!(room.rotate_log_generation("owner", "two")?.duplicate);
    assert_eq!(room.log_generation_descriptor("owner")?.next_sequence, "2");
    Ok(())
}

fn draft(text: &str) -> breditor_collab_feasibility::rich_replica::DocumentSuggestionDraft {
    use breditor_collab_feasibility::rich_replica::{
        DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
    };
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
            block: "p".into(),
            offset: 0,
            text: text.into(),
        })]),
    }
}

#[test]
fn revision_prepare_and_commit_keep_native_adjacency_across_automatic_physical_rotation()
-> TestResult {
    use crate::{
        DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, SuggestionDecision,
        SuggestionDecisionRequest, SuggestionRevisionAdmission, SuggestionRevisionRequest,
        SuggestionRole,
    };
    use breditor_collab_feasibility::review::ReviewPrincipalId;
    let (files, mut room, profile) = setup()?;
    let suggestions = room.enable_document_suggestions("owner")?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    room.grant_document_suggestions("owner", "bob", Some(SuggestionRole::Review))?;
    let source = profile.join_frame("room".into(), "903".into(), &room.catchup("alice")?)?;
    let packet = source.capture_document_suggestion_guarded(
        &source.observe()?,
        "Original intent",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        draft("Old intent "),
    )?;
    let DocumentSuggestionAdmission::Durable(publication) =
        room.publish_document_suggestion("alice", &packet)?
    else {
        return Err("native publication".into());
    };
    let revisions = room.enable_document_suggestion_revisions("owner")?;
    let replacement = source.capture_document_suggestion_revision_guarded(
        &source.observe()?,
        &packet,
        "Replacement intent",
        "1",
        draft("New revision "),
    )?;
    let request = SuggestionRevisionRequest {
        binding: revisions.binding,
        previous_suggestion_id: publication.publication.suggestion.id,
        revision_packet: replacement,
    };
    let first: u64 = room.log_generation_descriptor("owner")?.next_sequence.parse()?;
    for index in first..4096 {
        room.grant(
            "owner",
            "reader",
            Some(if index % 2 == 0 { Role::Reader } else { Role::Editor }),
        )?;
    }
    let accepted = room.catchup("owner")?;
    let SuggestionRevisionAdmission::Durable(revised) =
        room.revise_document_suggestion("alice", &request)?
    else {
        return Err("native revision".into());
    };
    assert!(!revised.duplicate);
    assert_eq!(revised.revision.previous_decision.sequence, "4096");
    assert_eq!(revised.revision.publication.sequence, "4097");
    assert_eq!(room.log_generation_descriptor("owner")?.sealed, 1);
    assert_eq!(room.log_generation_descriptor("owner")?.next_sequence, "4098");
    assert_eq!(room.catchup("owner")?, accepted);
    let retained = revised.revision;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(
        room.document_suggestion_revision("alice", &retained.revision.id)?
            .ok_or("retained revision")?,
        retained
    );
    let selected = room.log_generation_descriptor("owner")?;
    let SuggestionRevisionAdmission::Durable(retry) =
        room.revise_document_suggestion("alice", &request)?
    else {
        return Err("duplicate native revision".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.revision, retained);
    assert_eq!(room.log_generation_descriptor("owner")?, selected);
    let choice = SuggestionDecisionRequest {
        binding: suggestions.binding,
        suggestion_id: retained.revision.suggestion.id,
        decision: SuggestionDecision::Accept,
    };
    assert!(matches!(
        room.decide_document_suggestion("bob", &choice)?,
        DocumentSuggestionDecisionAdmission::Durable(_)
    ));
    let observer = profile.join_frame("room".into(), "904".into(), &room.catchup("owner")?)?;
    assert!(observer.document_json().contains("New revision "));
    assert!(!observer.document_json().contains("Old intent "));
    let accepted = room.catchup("owner")?;
    drop(room);
    let (mut room, _) = Room::open_log_generations(&files.room())?;
    assert_eq!(room.catchup("owner")?, accepted);
    let DocumentSuggestionDecisionAdmission::Durable(retry) =
        room.decide_document_suggestion("bob", &choice)?
    else {
        return Err("durable decision retry".into());
    };
    assert!(retry.duplicate);
    Ok(())
}
