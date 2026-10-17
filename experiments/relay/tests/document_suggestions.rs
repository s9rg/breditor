//! Native reference-host proposals and final decisions share one authenticated durable order.
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        RichReplica, SharedObservation, SharedRichProfile,
        actions::{
            InsertColumn, InsertRow, InsertText, ListStyle, MergeCells, RangeTextRun,
            ReplaceDocumentPlainTextV1, ReplaceGeneralTextRangeV1, ReplaceTextRange, ResizeImage,
            SetFormat, SetHeading, SetImageAlt, WrapList,
        },
        selection::TextPoint,
    },
};
use breditor_collab_relay::{
    Admission, AtomicTransportProfile, DocumentSuggestionAdmission,
    DocumentSuggestionDecisionAdmission, DurableDocumentSuggestion, DurableSuggestionDecision,
    Error, Registration, Role, Room, SuggestionDecision, SuggestionDecisionRequest, SuggestionRole,
    SuggestionUpdate,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Files {
    dir: PathBuf,
    path: PathBuf,
}
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "breditor-suggestion-ledger-{}-{now}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir)?;
        Ok(Self { path: dir.join("room.log"), dir })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_dir(&self.dir);
    }
}
fn start(files: &Files, atomic: bool) -> Result<(SharedRichProfile, Room)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-ledger","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/suggestion-ledger","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let room = if atomic {
        Room::create_atomic_transport_v2(
            &files.path,
            &configuration,
            &document,
            "owner",
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        )?
    } else {
        Room::create_standard_layout_v3(&files.path, &configuration, &document, "owner")?
    };
    Ok((profile, room))
}
fn observer(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(if owner.document_selection_enabled() {
        owner.observe_document()?
    } else {
        owner.observe()?
    })
}
fn proposal(
    owner: &RichReplica,
    principal: &str,
    title: &str,
    commands: Vec<Command>,
) -> Result<String> {
    Ok(owner.capture_document_suggestion_guarded(
        &observer(owner)?,
        title,
        ReviewPrincipalId::try_new(principal)?,
        "1792200000000",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(commands),
        },
    )?)
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn publish(room: &mut Room, principal: &str, packet: &str) -> Result<DurableDocumentSuggestion> {
    let DocumentSuggestionAdmission::Durable(value) =
        room.publish_document_suggestion(principal, packet)?
    else {
        return Err("expected durable proposal".into());
    };
    Ok(value)
}
fn request(
    room: &Room,
    id: &str,
    decision: SuggestionDecision,
) -> Result<SuggestionDecisionRequest> {
    Ok(SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: id.into(),
        decision,
    })
}
fn decide(
    room: &mut Room,
    principal: &str,
    request: &SuggestionDecisionRequest,
) -> Result<DurableSuggestionDecision> {
    let DocumentSuggestionDecisionAdmission::Durable(value) =
        room.decide_document_suggestion(principal, request)?
    else {
        return Err("expected durable decision".into());
    };
    Ok(*value)
}
fn author(
    profile: &SharedRichProfile,
    room: &mut Room,
    principal: &str,
) -> Result<(Registration, RichReplica)> {
    room.grant("owner", principal, Some(Role::Editor))?;
    room.grant_document_suggestions("owner", principal, Some(SuggestionRole::Propose))?;
    let registration = room.register(principal)?;
    let owner = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup(principal)?,
    )?;
    Ok((registration, owner))
}
fn flush(
    room: &mut Room,
    principal: &str,
    registration: &Registration,
    owner: &RichReplica,
    after: &str,
) -> Result<String> {
    let batch: Value =
        serde_json::from_str(&owner.writer_groups_v2_guarded(&observer(owner)?, after)?)?;
    for frame in batch["groups"].as_array().ok_or("writer groups")? {
        assert!(matches!(
            room.admit(principal, &registration.lease, frame.as_str().ok_or("group")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(batch["through"].as_str().ok_or("through")?.into())
}
fn text(owner: &RichReplica, block: &str) -> Result<String> {
    fn find<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
        if node["properties"]["breditor/block-id"] == block {
            Some(node)
        } else {
            node["children"].as_array()?.iter().find_map(|child| find(child, block))
        }
    }
    let raw: Value = serde_json::from_str(owner.document_json())?;
    Ok(find(&raw["root"], block).ok_or("text block")?["children"]
        .as_array()
        .ok_or("text children")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
#[test]
fn activation_is_explicit_transport_bound_and_independent_of_document_and_comment_roles() -> Result
{
    for atomic in [false, true] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, atomic)?;
        room.grant("owner", "alice", Some(Role::Reader))?;
        let mut source =
            profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
        source.set_read_only_guarded(&source.observe()?, true)?;
        let packet = proposal(&source, "alice", "Reader proposal", vec![insert("p", "Review ")])?;
        let exact = fs::read(&files.path)?;
        assert!(room.publish_document_suggestion("alice", &packet).is_err());
        assert!(matches!(room.enable_document_suggestions("alice"), Err(Error::Permission)));
        assert_eq!(fs::read(&files.path)?, exact);
        if !atomic {
            assert!(room.enable_document_suggestions("owner").is_err());
            assert_eq!(fs::read(&files.path)?, exact);
            continue;
        }
        let descriptor = room.enable_document_suggestions("owner")?;
        let enabled = fs::read(&files.path)?;
        assert_eq!(room.enable_document_suggestions("owner")?, descriptor);
        assert_eq!(fs::read(&files.path)?, enabled);
        assert!(!room.suggestion_permissions("alice")?.can_propose);
        assert!(matches!(
            room.publish_document_suggestion("alice", &packet),
            Err(Error::Permission)
        ));
        room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Propose))?;
        let before = room.catchup("alice")?;
        let published = publish(&mut room, "alice", &packet)?;
        assert_eq!(room.catchup("alice")?, before);
        assert!(!room.suggestion_permissions("alice")?.can_accept);
        assert!(!room.suggestion_permissions("alice")?.can_reject);
        let choice =
            request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
        assert!(matches!(
            room.decide_document_suggestion("alice", &choice),
            Err(Error::Permission)
        ));
        assert!(matches!(
            room.publish_document_suggestion("owner", &packet),
            Err(Error::Permission)
        ));
        room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
        assert!(room.suggestion_permissions("alice")?.can_reject);
        assert!(!room.suggestion_permissions("alice")?.can_accept);
        assert!(matches!(
            room.decide_document_suggestion("alice", &choice),
            Err(Error::Permission)
        ));
        let other = publish(
            &mut room,
            "alice",
            &proposal(&source, "alice", "Reader rejects", vec![insert("p", "No ")])?,
        )?;
        let reject = request(&room, &other.publication.suggestion.id, SuggestionDecision::Reject)?;
        decide(&mut room, "alice", &reject)?;
        assert_eq!(room.catchup("alice")?, before);
        room.grant("owner", "alice", Some(Role::Editor))?;
        assert!(room.suggestion_permissions("alice")?.can_accept);
        assert_eq!(decide(&mut room, "alice", &choice)?.decision.principal, "alice");
        room.grant("owner", "alice", None)?;
        assert!(
            room.document_suggestion_packet("alice", &published.publication.suggestion.id).is_err()
        );
        assert!(room.document_suggestions_page("alice", None).is_err());
    }
    Ok(())
}
#[test]
fn accept_publishes_once_with_one_native_effect_and_opposing_retries_return_the_original_decision()
-> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (_, mut source) = author(&profile, &mut room, "alice")?;
    let exact = source.checkpoint()?;
    let packet = proposal(&source, "alice", "One insertion", vec![insert("p", "Accepted ")])?;
    let published = publish(&mut room, "alice", &packet)?;
    let publication_log = fs::read(&files.path)?;
    let repacked = serde_json::to_string_pretty(&serde_json::from_str::<Value>(&packet)?)?;
    let duplicate = publish(&mut room, "alice", &repacked)?;
    assert!(duplicate.duplicate);
    assert_eq!(published.publication, duplicate.publication);
    assert_eq!(fs::read(&files.path)?, publication_log);
    assert_eq!(source.checkpoint()?, exact);
    let choice = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let accepted = decide(&mut room, "owner", &choice)?;
    assert!(!accepted.duplicate);
    assert_eq!(accepted.decision.decision, SuggestionDecision::Accept);
    assert_eq!(
        accepted.decision.effect.as_ref().ok_or("effect")?.writer_group.writer,
        accepted.descriptor.effect_writer
    );
    let accepted_log = fs::read(&files.path)?;
    let opposite = request(&room, &choice.suggestion_id, SuggestionDecision::Reject)?;
    for retry in [&choice, &opposite] {
        let known = decide(&mut room, "owner", retry)?;
        assert!(known.duplicate);
        assert_eq!(known.decision, accepted.decision);
        assert_eq!(fs::read(&files.path)?, accepted_log);
    }
    source.receive_frame(&room.catchup("alice")?)?;
    assert_eq!(text(&source, "p")?, "Accepted a🙂b");
    assert_eq!(
        source.undo_count(),
        0,
        "Importing a foreign host effect is not accepting-user Undo adoption"
    );
    let frame = room.catchup("alice")?;
    drop(room);
    let (mut room, recovery) = Room::open(&files.path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.catchup("alice")?, frame);
    assert_eq!(decide(&mut room, "owner", &opposite)?.decision, accepted.decision);
    assert_eq!(
        room.document_suggestion_packet("alice", &choice.suggestion_id)?.as_deref(),
        Some(packet.as_str())
    );
    assert_eq!(room.document_suggestions_page("alice", None)?.updates.len(), 2);
    Ok(())
}
#[test]
fn reject_is_final_without_document_mutation_and_conflicting_accept_remains_pending() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    let packet = proposal(&source, "alice", "Reject this", vec![insert("p", "Rejected ")])?;
    let published = publish(&mut room, "alice", &packet)?;
    let before = room.catchup("alice")?;
    let reject = request(&room, &published.publication.suggestion.id, SuggestionDecision::Reject)?;
    let rejected = decide(&mut room, "owner", &reject)?;
    assert_eq!(room.catchup("alice")?, before);
    assert!(rejected.decision.effect.is_none());
    let accept = request(&room, &reject.suggestion_id, SuggestionDecision::Accept)?;
    assert_eq!(decide(&mut room, "owner", &accept)?.decision, rejected.decision);
    let packet = proposal(&source, "alice", "Later conflict", vec![insert("p", "Proposed ")])?;
    let published = publish(&mut room, "alice", &packet)?;
    source.apply(vec![insert("p", "Changed ")])?;
    flush(&mut room, "alice", &registration, &source, "0")?;
    let accept = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let exact = fs::read(&files.path)?;
    let frame = room.catchup("alice")?;
    assert!(
        matches!(room.decide_document_suggestion("owner", &accept)?, DocumentSuggestionDecisionAdmission::Conflict {targets} if !targets.is_empty())
    );
    assert_eq!(fs::read(&files.path)?, exact);
    assert_eq!(room.catchup("alice")?, frame);
    assert!(
        room.document_suggestion("alice", &accept.suggestion_id)?
            .ok_or("proposal")?
            .decision
            .is_none()
    );
    let reject = request(&room, &accept.suggestion_id, SuggestionDecision::Reject)?;
    decide(&mut room, "owner", &reject)?;
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(
        room.document_suggestion("alice", &reject.suggestion_id)?
            .ok_or("proposal")?
            .decision
            .ok_or("decision")?
            .decision,
        SuggestionDecision::Reject
    );
    Ok(())
}
#[test]
fn offline_source_waits_for_accepted_groups_and_final_effect_retains_later_offline_text() -> Result
{
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    source.apply(vec![insert("p", "Initial offline ")])?;
    let packet = proposal(
        &source,
        "alice",
        "Offline proposal",
        vec![Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Accepted description".into(),
            decorative: false,
        })],
    )?;
    let before = fs::read(&files.path)?;
    assert!(
        matches!(room.publish_document_suggestion("alice", &packet)?, DocumentSuggestionAdmission::Pending {missing} if missing.len() == 1)
    );
    assert_eq!(fs::read(&files.path)?, before);
    let after = flush(&mut room, "alice", &registration, &source, "0")?;
    let published = publish(&mut room, "alice", &packet)?;
    source.apply(vec![insert("p", "More offline ")])?;
    let choice = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    decide(&mut room, "owner", &choice)?;
    source.receive_frame(&room.catchup("alice")?)?;
    flush(&mut room, "alice", &registration, &source, &after)?;
    source.receive_frame(&room.catchup("alice")?)?;
    assert_eq!(text(&source, "p")?, "More offline Initial offline a🙂b");
    assert!(source.document_json().contains("Accepted description"));
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    let recovered = profile.join_frame("room".into(), "901".into(), &room.catchup("alice")?)?;
    assert_eq!(source.document_json(), recovered.document_json());
    Ok(())
}
#[test]
fn frozen_updates_do_not_leak_a_decision_after_their_terminal_cut() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (_, source) = author(&profile, &mut room, "alice")?;
    let mut ids = vec![];
    for n in 0..65 {
        ids.push(
            publish(
                &mut room,
                "alice",
                &proposal(&source, "alice", &format!("Proposal {n}"), vec![insert("p", "Text ")])?,
            )?
            .publication
            .suggestion
            .id,
        );
    }
    let first = room.document_suggestions_page("alice", None)?;
    assert_eq!(first.updates.len(), 64);
    assert!(first.more);
    let choice = request(&room, &ids[64], SuggestionDecision::Reject)?;
    decide(&mut room, "owner", &choice)?;
    let last = room.document_suggestions_page("alice", Some(&first.cursor))?;
    assert_eq!(last.updates.len(), 1);
    assert!(!last.more);
    assert!(matches!(&last.updates[0], SuggestionUpdate::Published(_)));
    assert_eq!(first.cursor.through, last.cursor.through);
    let refreshed = room.document_suggestions_page("alice", None)?;
    let tail = room.document_suggestions_page("alice", Some(&refreshed.cursor))?;
    assert!(matches!(tail.updates.last(), Some(SuggestionUpdate::Decided(_))));
    let mut wrong = first.cursor.clone();
    wrong.binding.push('x');
    assert!(room.document_suggestions_page("alice", Some(&wrong)).is_err());
    let mut wrong = first.cursor.clone();
    wrong.after = "01".into();
    assert!(room.document_suggestions_page("alice", Some(&wrong)).is_err());
    let mut wrong = choice.clone();
    wrong.binding.push('x');
    let exact = fs::read(&files.path)?;
    assert!(room.decide_document_suggestion("owner", &wrong).is_err());
    assert_eq!(fs::read(&files.path)?, exact);
    Ok(())
}
#[test]
fn racing_reviewers_observe_one_finalization_and_at_most_one_inserted_effect() -> Result {
    use std::sync::{Arc, Barrier, Mutex};
    for opposing in [false, true] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, true)?;
        room.enable_document_suggestions("owner")?;
        let (_, mut source) = author(&profile, &mut room, "alice")?;
        let published = publish(
            &mut room,
            "alice",
            &proposal(&source, "alice", "Racing decisions", vec![insert("p", "Once ")])?,
        )?;
        let mut leases = vec![];
        for principal in ["bob", "charlie"] {
            room.grant("owner", principal, Some(Role::Editor))?;
            room.grant_document_suggestions("owner", principal, Some(SuggestionRole::Review))?;
            leases.push(room.register(principal)?.lease);
        }
        let choices = [
            request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?,
            request(
                &room,
                &published.publication.suggestion.id,
                if opposing { SuggestionDecision::Reject } else { SuggestionDecision::Accept },
            )?,
        ];
        let shared = Arc::new(Mutex::new(room));
        let barrier = Arc::new(Barrier::new(2));
        let mut handles = vec![];
        for ((principal, choice), lease) in ["bob", "charlie"].into_iter().zip(choices).zip(leases)
        {
            let shared = Arc::clone(&shared);
            let barrier = Arc::clone(&barrier);
            handles.push(std::thread::spawn(
                move || -> std::result::Result<DurableSuggestionDecision, String> {
                    barrier.wait();
                    let mut room = shared.lock().map_err(|error| error.to_string())?;
                    let outcome = if choice.decision == SuggestionDecision::Accept {
                        room.accept_document_suggestion_owned(principal, &lease, &choice)
                    } else {
                        room.decide_document_suggestion(principal, &choice)
                    };
                    let DocumentSuggestionDecisionAdmission::Durable(receipt) =
                        outcome.map_err(|error| error.to_string())?
                    else {
                        return Err("expected final decision".into());
                    };
                    Ok(*receipt)
                },
            ));
        }
        let mut receipts = vec![];
        for handle in handles {
            receipts.push(handle.join().map_err(|_| "reviewer thread panicked")??);
        }
        assert_eq!(receipts[0].decision, receipts[1].decision);
        assert_eq!(receipts.iter().filter(|receipt| !receipt.duplicate).count(), 1);
        if receipts[0].decision.decision == SuggestionDecision::Accept {
            assert_eq!(
                receipts[0].decision.accepting_writer.as_deref(),
                Some(if receipts[0].decision.principal == "bob" { "3" } else { "4" })
            );
        }
        let room = Arc::try_unwrap(shared)
            .map_err(|_| "room still shared")?
            .into_inner()
            .map_err(|error| error.to_string())?;
        source.receive_frame(&room.catchup("alice")?)?;
        assert_eq!(
            text(&source, "p")?,
            if receipts[0].decision.decision == SuggestionDecision::Accept {
                "Once a🙂b"
            } else {
                "a🙂b"
            }
        );
        assert_eq!(room.document_suggestions_page("alice", None)?.updates.len(), 2);
        drop(room);
        let (room, _) = Room::open(&files.path)?;
        assert_eq!(
            room.document_suggestion("alice", &published.publication.suggestion.id)?
                .ok_or("proposal")?
                .decision
                .as_ref(),
            Some(&receipts[0].decision)
        );
    }
    Ok(())
}
fn save(owner: &RichReplica, scope: u8, natural: bool) -> Result<String> {
    Ok(match (scope, natural) {
        (0, false) => owner.checkpoint()?,
        (0, true) => owner.typing_checkpoint()?,
        (1, false) => owner.general_checkpoint()?,
        (1, true) => owner.general_typing_checkpoint()?,
        (2, false) => owner.document_checkpoint()?,
        (2, true) => owner.document_typing_checkpoint()?,
        _ => return Err("test policy".into()),
    })
}
fn restore(
    profile: &SharedRichProfile,
    saved: &str,
    scope: u8,
    natural: bool,
) -> Result<RichReplica> {
    Ok(match (scope, natural) {
        (0, false) => profile.restore("room", saved)?,
        (0, true) => profile.restore_typing("room", saved)?,
        (1, false) => profile.restore_general("room", saved)?,
        (1, true) => profile.restore_general_typing("room", saved)?,
        (2, false) => profile.restore_document("room", saved)?,
        (2, true) => profile.restore_document_typing("room", saved)?,
        _ => return Err("test policy".into()),
    })
}
fn rich_commands() -> Vec<Command> {
    vec![
        Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) }),
        Command::SetFormat(SetFormat {
            block: "p".into(),
            offset: 0,
            length: 1,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        }),
        Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "proposed-list".into(),
            items: vec!["proposed-item".into()],
            style: ListStyle::Bullet,
        }),
        Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "proposed-row-block".into(),
            row: "proposed-row".into(),
            before: None,
        }),
        Command::InsertColumn(InsertColumn {
            block: "table-block".into(),
            column: "proposed-column".into(),
            width: 150,
            before: None,
        }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([320, 180]) }),
    ]
}
#[test]
fn rich_effects_versions_and_exact_future_client_history_survive_all_six_source_policies() -> Result
{
    use breditor_collab_feasibility::rich_replica::DocumentSuggestionPreparation;
    use breditor_collab_relay::DocumentVersionAdmission;
    for scope in 0..=2 {
        for natural in [false, true] {
            let files = Files::new()?;
            let (profile, mut room) = start(&files, true)?;
            room.enable_document_suggestions("owner")?;
            room.enable_document_versions("owner")?;
            let (_, mut source) = author(&profile, &mut room, "alice")?;
            match scope {
                0 => {}
                1 => {
                    source.enable_general_ranges_guarded(&source.observe()?)?;
                }
                2 => {
                    source.enable_document_selection_guarded(&source.observe()?)?;
                }
                _ => unreachable!(),
            }
            if natural {
                source.enable_typing_history_guarded(&observer(&source)?)?;
            }
            let packet = proposal(&source, "alice", "Rich proposal", rich_commands())?;
            let DocumentSuggestionPreparation::Ready(preview) =
                source.prepare_document_suggestion_guarded(&observer(&source)?, &packet)?
            else {
                return Err("expected native preview".into());
            };
            let expected = preview.document_json().to_owned();
            let published = publish(&mut room, "alice", &packet)?;
            let choice =
                request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
            let accepted = decide(&mut room, "owner", &choice)?;
            source.receive_frame(&room.catchup("alice")?)?;
            assert_eq!(source.document_json(), expected);
            assert_eq!(source.undo_count(), 0);
            let packet = source.capture_document_version_guarded(
                &observer(&source)?,
                "Accepted rich document",
                ReviewPrincipalId::try_new("alice")?,
                "1792200000001",
            )?;
            let DocumentVersionAdmission::Durable(version) =
                room.publish_document_version("alice", &packet)?
            else {
                return Err("version should recognize the accepted host source cut".into());
            };
            let mut recovered = restore(&profile, &save(&source, scope, natural)?, scope, natural)?;
            for owner in [&mut source, &mut recovered] {
                owner.apply(vec![insert("caption", "Later own ")])?;
            }
            for redo in [false, true, false, true] {
                if redo {
                    source.redo()?;
                    recovered.redo()?;
                } else {
                    source.undo()?;
                    recovered.undo()?;
                }
                assert_eq!(save(&source, scope, natural)?, save(&recovered, scope, natural)?);
                assert_eq!(source.update_frame()?, recovered.update_frame()?);
            }
            drop(room);
            let (room, _) = Room::open(&files.path)?;
            assert_eq!(
                room.document_suggestion("alice", &choice.suggestion_id)?
                    .ok_or("proposal")?
                    .decision,
                Some(accepted.decision)
            );
            assert_eq!(
                room.document_version_packet("alice", &version.entry.version.id)?.as_deref(),
                Some(packet.as_str())
            );
            let server =
                profile.join_frame("room".into(), "901".into(), &room.catchup("alice")?)?;
            assert_eq!(server.document_json(), expected);
        }
    }
    Ok(())
}
#[test]
fn general_ranges_and_whole_document_effects_have_durable_native_decisions() -> Result {
    use breditor_collab_feasibility::anchor::Affinity;
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (_, mut source) = author(&profile, &mut room, "alice")?;
    for document in [false, true] {
        let draft = if document {
            DocumentSuggestionDraft {
                scope: DocumentSuggestionScope::Document,
                edit: DocumentSuggestionEdit::Commands(vec![Command::ReplaceDocumentPlainTextV1(
                    ReplaceDocumentPlainTextV1 {
                        paragraph: "proposed-document".into(),
                        text: "Whole replacement".into(),
                    },
                )]),
            }
        } else {
            DocumentSuggestionDraft {
                scope: DocumentSuggestionScope::Commands,
                edit: DocumentSuggestionEdit::GeneralText(ReplaceGeneralTextRangeV1 {
                    range: ReplaceTextRange {
                        anchor: TextPoint {
                            block: "p".into(),
                            offset: 1,
                            affinity: Affinity::After,
                        },
                        focus: TextPoint {
                            block: "caption".into(),
                            offset: 1,
                            affinity: Affinity::After,
                        },
                        runs: vec![RangeTextRun { text: "Replacement".into(), formats: vec![] }],
                    },
                    empty: vec![],
                }),
            }
        };
        let packet = source.capture_document_suggestion_guarded(
            &observer(&source)?,
            "Explicit rich scope",
            ReviewPrincipalId::try_new("alice")?,
            "0",
            draft,
        )?;
        let published = publish(&mut room, "alice", &packet)?;
        let choice =
            request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
        decide(&mut room, "owner", &choice)?;
        source.receive_frame(&room.catchup("alice")?)?;
        if document {
            assert_eq!(text(&source, "proposed-document")?, "Whole replacement");
        } else {
            assert_eq!(text(&source, "p")?, "aReplacement");
            assert_eq!(text(&source, "caption")?, "y🙂");
        }
    }
    let exact = room.catchup("alice")?;
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(room.catchup("alice")?, exact);
    assert_eq!(room.document_suggestions_page("alice", None)?.updates.len(), 4);
    Ok(())
}
fn anchored_comment(
    room: &mut Room,
    source: &RichReplica,
) -> Result<(
    breditor_collab_feasibility::review::ReviewSession,
    breditor_collab_relay::ReviewLease,
    String,
)> {
    use breditor_collab_feasibility::{
        anchor::Affinity,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome,
            actions::{CreateReviewThread, ReviewAction},
        },
        rich_replica::{ReviewAnchorTarget, selection::Selection},
    };
    room.grant_review("owner", "alice", Some(breditor_collab_relay::ReviewRole::Comment))?;
    let actor = ReviewActorId::try_new("alice.comments")?;
    let registration = room.register_review("alice", actor.clone())?;
    let mut review = source.create_review_session(ReviewActorPolicy {
        actor,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let anchor = source.capture_review_anchor_guarded(
        &observer(source)?,
        &ReviewAnchorTarget::Selection(Selection::TextRange {
            anchor: TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After },
            focus: TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After },
        }),
    )?;
    let observed = review.observe();
    assert!(matches!(
        source.dispatch_review_guarded(
            &observer(source)?,
            &mut review,
            &observed,
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json: anchor.clone(),
                body: "Anchored discussion".into()
            })
        )?,
        ReviewOutcome::Committed(_)
    ));
    assert!(matches!(
        room.admit_review("alice", &registration.lease, &review.export_frame(0)?)?,
        breditor_collab_relay::ReviewAdmission::Durable(_)
    ));
    Ok((review, registration.lease, anchor))
}
fn read_comments(
    room: &Room,
    source: &RichReplica,
) -> Result<breditor_collab_feasibility::review::ReviewSession> {
    use breditor_collab_feasibility::review::{ReviewAccess, ReviewActorId, ReviewActorPolicy};
    let mut review = source.create_review_session(ReviewActorPolicy {
        actor: ReviewActorId::try_new("reader.verify")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::ReadOnly,
    })?;
    let page = room.review_catchup("alice", None)?;
    assert!(!page.more);
    for batch in page.batches {
        let observation = review.observe();
        source.receive_review_guarded(
            &observer(source)?,
            &mut review,
            &observation,
            &batch.source.policy(),
            &batch.frame,
        )?;
    }
    Ok(review)
}
fn round_trip_comment_history(
    source: &RichReplica,
    review: &mut breditor_collab_feasibility::review::ReviewSession,
) -> Result {
    use breditor_collab_feasibility::review::ReviewOutcome;
    let accepted = source.document_json().to_owned();
    let observed = review.observe();
    assert!(matches!(
        source.undo_review_guarded(&observer(source)?, review, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    let observed = review.observe();
    assert!(matches!(
        source.redo_review_guarded(&observer(source)?, review, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    assert_eq!(source.document_json(), accepted);
    Ok(())
}
#[test]
fn comments_suggestions_version_restore_and_independent_history_work_together_after_restart()
-> Result {
    use breditor_collab_feasibility::rich_replica::ReviewAnchorResolution;
    use breditor_collab_relay::{DocumentVersionAdmission, ReviewAdmission};
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_review("owner")?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_versions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    let (mut review, lease, anchor) = anchored_comment(&mut room, &source)?;
    let packet = proposal(
        &source,
        "alice",
        "Heading suggestion",
        vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) })],
    )?;
    let published = publish(&mut room, "alice", &packet)?;
    let choice = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let accepted = decide(&mut room, "owner", &choice)?;
    source.receive_frame(&room.catchup("alice")?)?;
    assert!(matches!(
        source.resolve_review_anchor(&anchor)?,
        ReviewAnchorResolution::Resolved { .. }
    ));
    round_trip_comment_history(&source, &mut review)?;
    assert_eq!(source.undo_count(), 0);
    assert!(matches!(
        room.admit_review("alice", &lease, &review.export_frame(0)?)?,
        ReviewAdmission::Durable(_)
    ));
    let version_packet = source.capture_document_version_guarded(
        &observer(&source)?,
        "Accepted heading",
        ReviewPrincipalId::try_new("alice")?,
        "1",
    )?;
    let DocumentVersionAdmission::Durable(version) =
        room.publish_document_version("alice", &version_packet)?
    else {
        return Err("expected durable named version".into());
    };
    source.apply(vec![insert("caption", "Later ")])?;
    let mut through = flush(&mut room, "alice", &registration, &source, "0")?;
    let plan = source.prepare_document_version_restore_guarded(
        &observer(&source)?,
        &version_packet,
        "accepted-restore",
    )?;
    source.apply_document_version_restore(&plan)?;
    through = flush(&mut room, "alice", &registration, &source, &through)?;
    assert!(matches!(
        source.resolve_review_anchor(&anchor)?,
        ReviewAnchorResolution::Orphaned { .. }
    ));
    assert_eq!(
        review.view()?.threads.len(),
        1,
        "Restoring a document version does not remove current discussions"
    );
    source.undo()?;
    flush(&mut room, "alice", &registration, &source, &through)?;
    assert!(matches!(
        source.resolve_review_anchor(&anchor)?,
        ReviewAnchorResolution::Resolved { .. }
    ));
    assert_eq!(text(&source, "caption")?, "Later xy🙂");
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(
        room.document_suggestion("alice", &choice.suggestion_id)?.ok_or("proposal")?.decision,
        Some(accepted.decision)
    );
    assert_eq!(
        room.document_version_packet("alice", &version.entry.version.id)?.as_deref(),
        Some(version_packet.as_str())
    );
    let recovered = profile.join_frame("room".into(), "901".into(), &room.catchup("alice")?)?;
    assert_eq!(recovered.document_json(), source.document_json());
    let review = read_comments(&room, &recovered)?;
    let resolved = recovered.review_view_guarded(&observer(&recovered)?, &review)?;
    assert_eq!(resolved.threads.len(), 1);
    assert!(matches!(
        resolved.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Resolved { .. }
    ));
    assert_eq!(
        resolved.threads[0].thread.messages[0].versions[0].text.as_deref(),
        Some("Anchored discussion")
    );
    Ok(())
}
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuggestionData {
    format: String,
    format_version: u32,
    title: String,
    author: ReviewPrincipalId,
    created_at_ms: String,
    source_anchor_json: String,
    draft: DocumentSuggestionDraft,
}
fn rehash_suggestion(packet: &Value) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let data: SuggestionData = serde_json::from_value(packet["data"].clone())?;
    let mut id = String::from("sha256:");
    for byte in Sha256::new()
        .chain_update(b"breditor/document-suggestion/1\0")
        .chain_update(serde_json::to_vec(&data)?)
        .finalize()
    {
        write!(id, "{byte:02x}")?;
    }
    Ok(json!({"id": id, "data": data}).to_string())
}
#[test]
fn valid_native_source_inside_an_atomic_group_and_unregistered_authors_cannot_publish() -> Result {
    use breditor_collab_feasibility::rich_replica::DocumentSuggestionSource;
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    source.apply(vec![insert("p", "One "), insert("caption", "Two ")])?;
    let through = flush(&mut room, "alice", &registration, &source, "0")?;
    let packet = proposal(
        &source,
        "alice",
        "Historical source",
        vec![Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Proposed alt".into(),
            decorative: false,
        })],
    )?;
    let original: Value = serde_json::from_str(&packet)?;
    let anchor: Value =
        serde_json::from_str(original["data"]["sourceAnchorJson"].as_str().ok_or("anchor")?)?;
    let before = fs::read(&files.path)?;
    let mut refused = 0;
    for counter in 1..through.parse::<u32>()? {
        let mut cut = anchor.clone();
        let clock = cut["clocks"]
            .as_array_mut()
            .ok_or("clocks")?
            .iter_mut()
            .find(|clock| clock["writer"] == source.writer())
            .ok_or("source clock")?;
        clock["counter"] = counter.to_string().into();
        let mut value = original.clone();
        value["data"]["sourceAnchorJson"] = cut.to_string().into();
        let candidate = rehash_suggestion(&value)?;
        if matches!(
            source.verify_document_suggestion_source(&candidate),
            Ok(DocumentSuggestionSource::Verified { .. })
        ) {
            assert!(matches!(
                room.publish_document_suggestion("alice", &candidate),
                Err(Error::Contract("version source cuts an unaccepted semantic group"))
            ));
            refused += 1;
        }
    }
    assert!(
        refused > 0,
        "At least one native-valid historical cut must still require a complete accepted semantic group"
    );
    let mut unknown = anchor;
    let clock = unknown["clocks"]
        .as_array_mut()
        .ok_or("clocks")?
        .iter_mut()
        .find(|clock| clock["writer"] == source.writer())
        .ok_or("clock")?;
    clock["writer"] = "999".into();
    let mut value = original;
    value["data"]["sourceAnchorJson"] = unknown.to_string().into();
    assert!(matches!(
        room.publish_document_suggestion("alice", &rehash_suggestion(&value)?),
        Err(Error::Contract("version source has no registered document author"))
    ));
    assert_eq!(fs::read(&files.path)?, before);
    assert!(room.document_suggestions_page("alice", None)?.updates.is_empty());
    Ok(())
}
#[test]
fn server_authored_merge_clocks_remain_exact_decimal_strings_through_version_and_recovery() -> Result
{
    fn second_cell(node: &Value) -> Option<String> {
        if node["type"] == "breditor/table-cell" && node["properties"]["breditor/column-id"] == "c2"
        {
            return node["properties"]["breditor/block-id"].as_str().map(String::from);
        }
        node["children"].as_array()?.iter().find_map(second_cell)
    }
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_versions("owner")?;
    let (registration, mut source) = author(&profile, &mut room, "alice")?;
    source.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "c2".into(),
        width: 150,
        before: None,
    })])?;
    flush(&mut room, "alice", &registration, &source, "0")?;
    let tree: Value = serde_json::from_str(source.document_json())?;
    let focus = second_cell(&tree["root"]).ok_or("second cell")?;
    let packet = proposal(
        &source,
        "alice",
        "Merge cells",
        vec![Command::MergeCells(MergeCells {
            block: "table-block".into(),
            merge: "proposed-merge".into(),
            anchor: "cell".into(),
            focus,
        })],
    )?;
    let published = publish(&mut room, "alice", &packet)?;
    let choice = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let accepted = decide(&mut room, "owner", &choice)?;
    source.receive_frame(&room.catchup("alice")?)?;
    let view: Value = serde_json::from_str(&source.view_json()?)?;
    assert_eq!(view["tables"][0]["cells"][0]["columnSpan"], 2);
    let tree: Value = serde_json::from_str(source.document_json())?;
    let merge = &tree["root"]["children"][0]["properties"]["breditor/merges"][0];
    assert_eq!(merge["writer"].as_str(), Some(accepted.descriptor.effect_writer.as_str()));
    assert!(merge["lamport"].is_string() && merge["counter"].is_string());
    let version = source.capture_document_version_guarded(
        &observer(&source)?,
        "Accepted merge",
        ReviewPrincipalId::try_new("alice")?,
        "2",
    )?;
    assert!(matches!(
        room.publish_document_version("alice", &version)?,
        breditor_collab_relay::DocumentVersionAdmission::Durable(_)
    ));
    let frame = room.catchup("alice")?;
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(room.catchup("alice")?, frame);
    Ok(())
}
#[test]
fn owned_accept_binds_one_exact_device_without_counter_reservation_or_same_account_takeover()
-> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, true)?;
    room.enable_document_suggestions("owner")?;
    let (first, source) = author(&profile, &mut room, "alice")?;
    room.grant_document_suggestions("owner", "alice", Some(SuggestionRole::Review))?;
    let second = room.register("alice")?;
    let published = publish(
        &mut room,
        "alice",
        &proposal(&source, "alice", "Accept on the second device", vec![insert("p", "Once ")])?,
    )?;
    let choice = request(&room, &published.publication.suggestion.id, SuggestionDecision::Accept)?;
    let exact = fs::read(&files.path)?;
    assert!(matches!(
        room.accept_document_suggestion_owned("owner", &second.lease, &choice),
        Err(Error::Lease)
    ));
    let mut wrong = second.lease.clone();
    wrong.token = "0".repeat(64);
    assert!(matches!(
        room.accept_document_suggestion_owned("alice", &wrong, &choice),
        Err(Error::Lease)
    ));
    assert_eq!(fs::read(&files.path)?, exact);
    let DocumentSuggestionDecisionAdmission::Durable(accepted) =
        room.accept_document_suggestion_owned("alice", &second.lease, &choice)?
    else {
        return Err("expected owned acceptance".into());
    };
    assert_eq!(accepted.decision.accepting_writer.as_deref(), Some(second.lease.writer.as_str()));
    for writer in [&first.lease.writer, &second.lease.writer] {
        assert_eq!(
            room.writer_clock("alice", writer)?["through"],
            "0",
            "Only the host effect stream advances"
        );
    }
    let complete = fs::read(&files.path)?;
    let DocumentSuggestionDecisionAdmission::Durable(other_device) =
        room.accept_document_suggestion_owned("alice", &first.lease, &choice)?
    else {
        return Err("expected known result".into());
    };
    assert!(other_device.duplicate);
    assert_eq!(other_device.decision, accepted.decision);
    assert_eq!(fs::read(&files.path)?, complete);
    room.grant("owner", "alice", Some(Role::Reader))?;
    assert!(matches!(
        room.accept_document_suggestion_owned("alice", &second.lease, &choice),
        Err(Error::Permission)
    ));
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(
        room.document_suggestion("alice", &choice.suggestion_id)?.ok_or("proposal")?.decision,
        Some(accepted.decision)
    );
    let bytes = fs::read(&files.path)?;
    for secret in [&first.credential, &first.lease.token, &second.credential, &second.lease.token] {
        assert!(!bytes.windows(secret.len()).any(|window| window == secret.as_bytes()));
    }
    Ok(())
}
