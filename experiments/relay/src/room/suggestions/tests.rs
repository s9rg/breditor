//! Decision/effect replay and uncertain-storage audits through the real private room log.
use super::decide::DecisionPreparation;
use super::*;
use crate::{
    AtomicTransportProfile, Role, ServerLogGenerationOptions,
    log::{Event, Log},
};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        SharedRichProfile, actions::InsertText,
    },
};
use serde_json::{Value, json};
use std::{fs, io::Write, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
#[path = "revisions/replay_tests.rs"]
mod revision_replay_tests;
struct Files {
    directory: PathBuf,
    path: PathBuf,
}
impl Files {
    fn new() -> TestResult<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "breditor-suggestion-replay-{}-{now}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&directory)?;
        Ok(Self { path: directory.join("room.log"), directory })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}
fn start(files: &Files) -> TestResult<(Room, SuggestionDecisionRequest)> {
    start_with_storage(files, None)
}
fn start_with_storage(
    files: &Files,
    generations: Option<&ServerLogGenerationOptions>,
) -> TestResult<(Room, SuggestionDecisionRequest)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-replay","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/suggestion-replay","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let transport = AtomicTransportProfile::LayoutV3 { standard_inline_v1: true };
    let mut room = if let Some(options) = generations {
        Room::create_atomic_log_generations_v2(
            &files.path,
            &configuration,
            &document,
            "owner",
            transport,
            options,
        )?
    } else {
        Room::create_atomic_transport_v2(
            &files.path,
            &configuration,
            &document,
            "owner",
            transport,
        )?
    };
    let descriptor = room.enable_document_suggestions("owner")?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    room.grant_document_suggestions("owner", "bob", Some(SuggestionRole::Review))?;
    let source = profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
    let packet = source.capture_document_suggestion_guarded(
        &source.observe()?,
        "Pending native insertion",
        ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "Accepted ".into(),
            })]),
        },
    )?;
    let DocumentSuggestionAdmission::Durable(published) =
        room.publish_document_suggestion("alice", &packet)?
    else {
        return Err("expected publication".into());
    };
    Ok((
        room,
        SuggestionDecisionRequest {
            binding: descriptor.binding,
            suggestion_id: published.publication.suggestion.id,
            decision: SuggestionDecision::Accept,
        },
    ))
}
#[test]
fn preparation_and_real_write_failure_publish_neither_decision_nor_effect() -> TestResult {
    let files = Files::new()?;
    let (mut room, request) = start(&files)?;
    let exact_log = fs::read(&files.path)?;
    let frame = room.catchup("alice")?;
    let DecisionPreparation::New(Some(prepared)) =
        room.prepare_suggestion_decision("bob", &request, None)?
    else {
        return Err("expected staged effect".into());
    };
    assert_ne!(prepared.owner.document_json(), room.replica.document_json());
    assert_eq!(room.replica.writer_clock_v2(EFFECT_WRITER)?.through, "0");
    assert_eq!(room.suggestions_state()?.effect_owner.writer_clock_v2(EFFECT_WRITER)?.through, "0");
    drop(prepared);
    assert_eq!(room.catchup("alice")?, frame);
    assert_eq!(fs::read(&files.path)?, exact_log);
    room.log.use_read_only_handle_for_test(&files.path)?;
    assert!(matches!(room.decide_document_suggestion("bob", &request), Err(Error::Io(_))));
    assert_eq!(room.replica.update_frame()?, frame);
    assert!(
        room.suggestions.as_ref().ok_or("state")?.proposals[&request.suggestion_id]
            .decision
            .is_none()
    );
    assert!(matches!(room.catchup("alice"), Err(Error::NeedsRecovery)));
    assert!(matches!(room.decide_document_suggestion("bob", &request), Err(Error::NeedsRecovery)));
    assert_eq!(fs::read(&files.path)?, exact_log);
    drop(room);
    let (mut room, _) = Room::open(&files.path)?;
    let DocumentSuggestionDecisionAdmission::Durable(receipt) =
        room.decide_document_suggestion("bob", &request)?
    else {
        return Err("expected recovered acceptance".into());
    };
    assert!(!receipt.duplicate);
    Ok(())
}
#[test]
fn crash_after_fsync_before_publication_recovers_both_and_returns_original_receipt() -> TestResult {
    let files = Files::new()?;
    let (mut room, request) = start(&files)?;
    let before = room.catchup("alice")?;
    let DecisionPreparation::New(Some(prepared)) =
        room.prepare_suggestion_decision("bob", &request, None)?
    else {
        return Err("expected effect".into());
    };
    let effect = prepared.effect.clone();
    let sequence = room.log.append(Event::DecideDocumentSuggestionV1 {
        principal: "bob".into(),
        request: request.clone(),
        effect: Some(effect.clone()),
        frame: Some(prepared.frame.clone()),
    })?;
    // Deliberately stop before publishing either the receiver, effect author or decision map.
    assert_eq!(room.catchup("alice")?, before);
    drop(prepared);
    drop(room);
    let (mut room, report) = Room::open(&files.path)?;
    assert_eq!(report.truncated_bytes, 0);
    assert_ne!(room.catchup("alice")?, before);
    let DocumentSuggestionDecisionAdmission::Durable(receipt) =
        room.decide_document_suggestion("bob", &request)?
    else {
        return Err("expected durable retry".into());
    };
    assert!(receipt.duplicate);
    assert_eq!(receipt.decision.sequence, sequence.to_string());
    assert_eq!(receipt.decision.effect, Some(effect));
    Ok(())
}
#[test]
fn incomplete_decision_append_recovers_pending_and_retries_the_same_native_effect() -> TestResult {
    for header_only in [false, true] {
        let files = Files::new()?;
        let (mut room, request) = start(&files)?;
        let prefix_len = fs::metadata(&files.path)?.len();
        let before = room.catchup("alice")?;
        let DecisionPreparation::New(Some(prepared)) =
            room.prepare_suggestion_decision("bob", &request, None)?
        else {
            return Err("expected effect".into());
        };
        let effect = prepared.effect.clone();
        let sequence = room.log.append(Event::DecideDocumentSuggestionV1 {
            principal: "bob".into(),
            request: request.clone(),
            effect: Some(effect.clone()),
            frame: Some(prepared.frame.clone()),
        })?;
        drop(prepared);
        drop(room);
        let length = fs::metadata(&files.path)?.len();
        let cut = if header_only { prefix_len + 4 } else { length - 2 };
        let file = fs::OpenOptions::new().write(true).open(&files.path)?;
        file.set_len(cut)?;
        file.sync_all()?;
        drop(file);
        let (mut room, report) = Room::open(&files.path)?;
        assert_eq!(report.truncated_bytes, cut - prefix_len);
        assert_eq!(fs::metadata(&files.path)?.len(), prefix_len);
        assert_eq!(room.catchup("alice")?, before);
        assert!(
            room.document_suggestion("alice", &request.suggestion_id)?
                .ok_or("proposal")?
                .decision
                .is_none()
        );
        let DocumentSuggestionDecisionAdmission::Durable(receipt) =
            room.decide_document_suggestion("bob", &request)?
        else {
            return Err("expected retry acceptance".into());
        };
        assert!(!receipt.duplicate);
        assert_eq!(receipt.decision.sequence, sequence.to_string());
        assert_eq!(receipt.decision.effect, Some(effect));
    }
    Ok(())
}
#[test]
fn checksum_valid_forged_permissions_effects_and_duplicate_decisions_never_repair_torn_tail()
-> TestResult {
    for variant in 0..8 {
        let files = Files::new()?;
        let (mut room, request) = start(&files)?;
        room.decide_document_suggestion("bob", &request)?;
        drop(room);
        let (source, mut records, _) = Log::open(&files.path)?;
        drop(source);
        let forged_path = files.directory.join("forged.log");
        let mut log = Log::create(&forged_path, records.remove(0).event)?;
        for record in records {
            let mut event = record.event;
            match &mut event {
                Event::EnableDocumentSuggestionsV1 { effect_writer, .. } if variant == 0 => {
                    *effect_writer = "1".into();
                }
                Event::GrantDocumentSuggestionsV1 { principal, role, .. }
                    if principal == "bob" && variant == 1 =>
                {
                    *role = Some(SuggestionRole::Propose);
                }
                Event::PublishDocumentSuggestionV1 { principal, .. } if variant == 2 => {
                    *principal = "bob".into();
                }
                Event::DecideDocumentSuggestionV1 { effect, .. } if variant == 3 => {
                    effect.as_mut().ok_or("effect")?.semantic_from.push('0');
                }
                Event::DecideDocumentSuggestionV1 { effect, .. } if variant == 4 => {
                    effect.as_mut().ok_or("effect")?.writer_group.group_digest =
                        format!("sha256:{}", "0".repeat(64));
                }
                Event::DecideDocumentSuggestionV1 { request, .. } if variant == 5 => {
                    request.decision = SuggestionDecision::Reject;
                }
                Event::DecideDocumentSuggestionV1 { principal, request, effect, frame }
                    if variant == 6 =>
                {
                    log.append(Event::DecideDocumentSuggestionV1 {
                        principal: principal.clone(),
                        request: request.clone(),
                        effect: effect.clone(),
                        frame: frame.clone(),
                    })?;
                }
                Event::DecideDocumentSuggestionV1 { frame, .. } if variant == 7 => *frame = None,
                _ => {}
            }
            log.append(event)?;
        }
        drop(log);
        let mut tail = fs::OpenOptions::new().append(true).open(&forged_path)?;
        tail.write_all(&[0, 1, 2])?;
        tail.sync_all()?;
        drop(tail);
        let bytes = fs::read(&forged_path)?;
        assert!(Room::open(&forged_path).is_err(), "forged variant {variant}");
        assert_eq!(
            fs::read(&forged_path)?,
            bytes,
            "No complete invalid record can be hidden by truncating its incomplete tail"
        );
        fs::remove_file(forged_path)?;
    }
    Ok(())
}
#[test]
fn optional_author_budget_leaves_room_for_genesis_and_the_host_effect_clock() -> TestResult {
    let files = Files::new()?;
    let (mut room, _) = start(&files)?;
    let exact = fs::read(&files.path)?;
    // Exercise the resource predicate without 1022 fsyncs or pretending this is a scale test.
    for id in 2..=1023 {
        room.writers.insert(
            id.to_string(),
            super::super::Writer {
                principal: "owner".into(),
                resume_hash: [0; 32],
                observer: false,
            },
        );
    }
    room.check_suggestion_author_budget(0)?;
    assert!(matches!(
        room.register("owner"),
        Err(Error::Contract("suggestion source author clock budget"))
    ));
    assert_eq!(fs::read(&files.path)?, exact);
    room.writers.insert(
        "1024".into(),
        super::super::Writer { principal: "owner".into(), resume_hash: [0; 32], observer: true },
    );
    room.check_suggestion_author_budget(0)?;
    room.writers.get_mut("1024").ok_or("observer")?.observer = false;
    assert!(room.check_suggestion_author_budget(0).is_err());
    room.writers.clear();
    assert_eq!(room.register("owner")?.lease.writer, "2");
    drop(room);
    Room::open(&files.path)?;
    Ok(())
}
#[test]
fn owned_accept_replay_rejects_wrong_stream_account_choice_and_observer_promotion() -> TestResult {
    for variant in 0..4 {
        let files = Files::new()?;
        let (mut room, request) = start(&files)?;
        let author = room.register("bob")?;
        room.accept_document_suggestion_owned("bob", &author.lease, &request)?;
        drop(room);
        let (source, mut records, _) = Log::open(&files.path)?;
        drop(source);
        let path = files.directory.join("owned-forged.log");
        let mut log = Log::create(&path, records.remove(0).event)?;
        for record in records {
            let mut event = record.event;
            if variant == 3
                && let Event::Register { principal, writer, resume_hash } = event
            {
                log.append(Event::RegisterObserverV1 { principal, writer, resume_hash })?;
                continue;
            }
            if let Event::DecideOwnedDocumentSuggestionV1 {
                principal,
                accepting_writer,
                request,
                ..
            } = &mut event
            {
                match variant {
                    0 => *accepting_writer = "999".into(),
                    1 => *principal = "owner".into(),
                    2 => request.decision = SuggestionDecision::Reject,
                    _ => {}
                }
            }
            log.append(event)?;
        }
        drop(log);
        let mut file = fs::OpenOptions::new().append(true).open(&path)?;
        file.write_all(&[0, 1, 2])?;
        file.sync_all()?;
        drop(file);
        let before = fs::read(&path)?;
        assert!(Room::open(&path).is_err());
        assert_eq!(fs::read(&path)?, before);
        fs::remove_file(&path)?;
    }
    Ok(())
}
