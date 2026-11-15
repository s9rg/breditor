//! Native review metadata contracts; actual backend cursor admission is tested by its owner adapter.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError,
            ReviewImportOutcome, ReviewMessageId, ReviewOutcome, ReviewPrincipalId, ReviewSession,
            ReviewThreadId, ReviewThreadState,
            actions::{
                CreateReviewThread, EditReviewMessage, ReplyToReviewThread, ReviewAction,
                SetReviewThreadState,
            },
        },
    },
    schema::SchemaFingerprint,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn binding() -> Result<ReviewBinding> {
    Ok(ReviewBinding::new(
        &DocumentId::try_new("room")?,
        format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
    ))
}
fn policy(actor: &str, principal: &str) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access: ReviewAccess::Comment,
    })
}
fn owner(actor: &str, principal: &str) -> Result<ReviewSession> {
    Ok(ReviewSession::new(binding()?, policy(actor, principal)?)?)
}
fn anchor() -> String {
    // Metadata-only binding fixture, deliberately not advertised as engine-valid cursors.
    json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string()
}
fn create(a: &mut ReviewSession) -> Result<ReviewThreadId> {
    let outcome = a.dispatch(
        &a.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor(),
            body: "Original 日本 🙂".into(),
        }),
    )?;
    let ReviewOutcome::Committed(event) = outcome else {
        return Err("creation no-op".into());
    };
    Ok(ReviewThreadId::from_event(event))
}
fn reply(a: &mut ReviewSession, thread: &ReviewThreadId, body: &str) -> Result {
    a.dispatch(
        &a.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread: thread.clone(), body: body.into() }),
    )?;
    Ok(())
}
fn edit(a: &mut ReviewSession, message: &ReviewMessageId, body: &str) -> Result<ReviewOutcome> {
    Ok(a.dispatch(
        &a.observe(),
        ReviewAction::EditMessage(EditReviewMessage {
            message: message.clone(),
            body: body.into(),
        }),
    )?)
}
fn receive(
    a: &mut ReviewSession,
    b: &ReviewSession,
    actor: &str,
    principal: &str,
) -> Result<ReviewImportOutcome> {
    Ok(a.receive_authorized(&a.observe(), &policy(actor, principal)?, &b.export_frame(0)?)?)
}

#[test]
fn independent_review_history_and_exact_recovery_retain_plain_unicode_messages() -> Result {
    let mut a = owner("101", "alice")?;
    let thread = create(&mut a)?;
    let message = ReviewMessageId::from_event(thread.event().clone());
    edit(&mut a, &message, "<script>literal, not markup</script> 🙂")?;
    a.dispatch(
        &a.observe(),
        ReviewAction::SetThreadState(SetReviewThreadState { thread, resolved: true }),
    )?;
    assert_eq!(a.view()?.threads[0].state, ReviewThreadState::Resolved);
    let exact = a.checkpoint_json()?;
    let mut restored = ReviewSession::restore_json(&binding()?, policy("101", "alice")?, &exact)?;
    assert_eq!(restored.checkpoint_json()?, exact);
    for redo in [false, false, false, true, true, true] {
        if redo {
            assert_eq!(a.redo(&a.observe())?, restored.redo(&restored.observe())?);
        } else {
            assert_eq!(a.undo(&a.observe())?, restored.undo(&restored.observe())?);
        }
        assert_eq!(a.view()?, restored.view()?);
        assert_eq!(a.checkpoint_json()?, restored.checkpoint_json()?);
    }
    assert_eq!(
        a.view()?.threads[0].messages[0].versions[0].text.as_deref(),
        Some("<script>literal, not markup</script> 🙂")
    );
    Ok(())
}

#[test]
fn undoing_the_creators_comment_does_not_delete_a_peers_reply() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    reply(&mut b, &thread, "Bob's independent reply")?;
    receive(&mut a, &b, "202", "bob")?;
    a.undo(&a.observe())?;
    receive(&mut b, &a, "101", "alice")?;
    let view = a.view()?;
    assert!(!view.threads[0].hidden);
    assert!(view.threads[0].messages[0].versions.is_empty());
    assert_eq!(
        view.threads[0].messages[1].versions[0].text.as_deref(),
        Some("Bob's independent reply")
    );
    assert_eq!(view.threads, b.view()?.threads);
    a.redo(&a.observe())?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads, b.view()?.threads);
    Ok(())
}

#[test]
fn offline_message_edits_keep_both_versions_and_author_local_undo() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "alice")?;
    let thread = create(&mut a)?;
    let message = ReviewMessageId::from_event(thread.event().clone());
    receive(&mut b, &a, "101", "alice")?;
    edit(&mut a, &message, "Device A")?;
    edit(&mut b, &message, "Device B")?;
    receive(&mut a, &b, "202", "alice")?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads, b.view()?.threads);
    assert_eq!(a.view()?.threads[0].messages[0].versions.len(), 2);
    a.undo(&a.observe())?;
    assert_eq!(a.view()?.threads[0].messages[0].versions[0].text.as_deref(), Some("Device B"));
    a.redo(&a.observe())?;
    assert_eq!(a.view()?.threads[0].messages[0].versions.len(), 2);
    edit(&mut a, &message, "Explicit combined resolution")?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads, b.view()?.threads);
    assert_eq!(a.view()?.threads[0].messages[0].versions.len(), 1);
    Ok(())
}

#[test]
fn concurrent_resolve_and_reopen_remain_explicitly_conflicted_until_a_new_decision() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    for index in 0..3 {
        let resolved = index != 2;
        let owner = if index == 0 { &mut a } else { &mut b };
        owner.dispatch(
            &owner.observe(),
            ReviewAction::SetThreadState(SetReviewThreadState { thread: thread.clone(), resolved }),
        )?;
    }
    receive(&mut a, &b, "202", "bob")?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads[0].state, ReviewThreadState::Conflicted);
    assert_eq!(a.view()?.threads, b.view()?.threads);
    a.dispatch(
        &a.observe(),
        ReviewAction::SetThreadState(SetReviewThreadState { thread, resolved: true }),
    )?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads[0].state, ReviewThreadState::Resolved);
    assert_eq!(a.view()?.threads, b.view()?.threads);
    Ok(())
}

#[test]
fn pending_batches_are_atomic_and_duplicate_echoes_preserve_the_observation() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    reply(&mut a, &thread, "Later")?;
    let exact = b.checkpoint_json()?;
    let observed = b.observe();
    assert!(matches!(
        b.receive_authorized(&observed, &policy("101", "alice")?, &a.export_frame(1)?)?,
        ReviewImportOutcome::Pending(_)
    ));
    assert_eq!(b.checkpoint_json()?, exact);
    assert_eq!(
        b.receive_authorized(&observed, &policy("101", "alice")?, &a.export_frame(0)?)?,
        ReviewImportOutcome::Applied
    );
    let observed = b.observe();
    let exact = b.checkpoint_json()?;
    assert_eq!(
        b.receive_authorized(&observed, &policy("101", "alice")?, &a.export_frame(0)?)?,
        ReviewImportOutcome::Unchanged
    );
    assert_eq!(b.checkpoint_json()?, exact);
    b.dispatch(
        &observed,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Still current".into() }),
    )?;
    Ok(())
}

#[test]
fn source_authority_is_external_and_unauthorized_message_edits_are_atomic() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    let message = ReviewMessageId::from_event(thread.event().clone());
    let exact = b.checkpoint_json()?;
    assert!(edit(&mut b, &message, "Impersonation").is_err());
    assert_eq!(b.checkpoint_json()?, exact);
    b.set_access(&b.observe(), ReviewAccess::ReadOnly)?;
    assert!(reply(&mut b, &thread, "Denied").is_err());
    reply(&mut a, &thread, "Allowed remote content")?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads, b.view()?.threads);
    let mut forged: Value = serde_json::from_str(&a.export_frame(0)?)?;
    forged["events"][0]["principal"] = json!("mallory");
    let exact = b.checkpoint_json()?;
    assert!(matches!(
        b.receive_authorized(&b.observe(), &policy("101", "alice")?, &forged.to_string()),
        Err(ReviewError::Permission)
    ));
    assert_eq!(b.checkpoint_json()?, exact);
    Ok(())
}

#[test]
fn a_changed_known_event_or_a_forked_previous_digest_cannot_extend_the_stream() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    let mut forged: Value = serde_json::from_str(&a.export_frame(0)?)?;
    forged["events"][0]["payload"]["data"]["data"]["body"] = json!("Changed immutable birth");
    let exact = b.checkpoint_json()?;
    assert!(
        b.receive_authorized(&b.observe(), &policy("101", "alice")?, &forged.to_string()).is_err()
    );
    reply(&mut a, &thread, "Second")?;
    let mut forged: Value = serde_json::from_str(&a.export_frame(1)?)?;
    forged["events"][0]["previousDigest"] = json!(format!("sha256:{}", "1".repeat(64)));
    assert!(matches!(
        b.receive_authorized(&b.observe(), &policy("101", "alice")?, &forged.to_string()),
        Err(ReviewError::Fork)
    ));
    assert_eq!(b.checkpoint_json()?, exact);
    Ok(())
}

#[test]
fn exact_recovery_replays_history_and_reapplies_live_permissions() -> Result {
    let mut a = owner("101", "alice")?;
    let thread = create(&mut a)?;
    reply(&mut a, &thread, "Second")?;
    a.undo(&a.observe())?;
    let exact = a.checkpoint_json()?;
    let mut read_only = policy("101", "alice")?;
    read_only.access = ReviewAccess::ReadOnly;
    let mut restored = ReviewSession::restore_json(&binding()?, read_only, &exact)?;
    assert_eq!(restored.checkpoint_json()?, exact);
    assert!(matches!(restored.redo(&restored.observe()), Err(ReviewError::Permission)));
    for field in ["cursor", "history"] {
        let mut malformed: Value = serde_json::from_str(&exact)?;
        malformed[field] = if field == "cursor" { json!(0) } else { json!([]) };
        assert!(
            ReviewSession::restore_json(
                &binding()?,
                policy("101", "alice")?,
                &malformed.to_string()
            )
            .is_err()
        );
    }
    assert!(ReviewSession::restore_json(&binding()?, policy("202", "alice")?, &exact).is_err());
    Ok(())
}

#[test]
fn noops_preserve_redo_and_local_branching_does_not_drop_retained_peer_data() -> Result {
    let mut a = owner("101", "alice")?;
    let thread = create(&mut a)?;
    let message = ReviewMessageId::from_event(thread.event().clone());
    edit(&mut a, &message, "Temporary")?;
    a.undo(&a.observe())?;
    let exact = a.checkpoint_json()?;
    let observed = a.observe();
    assert_eq!(edit(&mut a, &message, "Original 日本 🙂")?, ReviewOutcome::Unchanged);
    assert_eq!(a.checkpoint_json()?, exact);
    assert_eq!(a.view()?.redo_depth, 1);
    a.dispatch(
        &observed,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "New branch".into() }),
    )?;
    assert_eq!(a.view()?.redo_depth, 0);
    assert_eq!(a.redo(&a.observe())?, ReviewOutcome::Unchanged);
    assert!(
        a.dispatch(
            &observed,
            ReviewAction::EditMessage(EditReviewMessage { message, body: "Stale".into() })
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn input_binding_and_message_budgets_never_publish_a_partial_review_action() -> Result {
    let mut a = owner("101", "alice")?;
    let exact = a.checkpoint_json()?;
    for body in [String::new(), " ".into(), "x".repeat(16 * 1024 + 1)] {
        assert!(
            a.dispatch(
                &a.observe(),
                ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor(), body })
            )
            .is_err()
        );
        assert_eq!(a.checkpoint_json()?, exact);
    }
    let mut wrong: Value = serde_json::from_str(&anchor())?;
    wrong["document"] = json!("other-room");
    assert!(
        a.dispatch(
            &a.observe(),
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json: wrong.to_string(),
                body: "No cross-room anchor".into()
            })
        )
        .is_err()
    );
    assert!(a.export_frame(1).is_err());
    assert_eq!(a.checkpoint_json()?, exact);
    Ok(())
}

#[test]
fn single_thread_transcript_matches_all_native_pages_and_the_isolated_projection() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    let unrelated = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    reply(&mut b, &unrelated, "Unrelated discussion")?;
    for index in 0..22 {
        reply(&mut b, &thread, &format!("Original attributed reply {index}"))?;
    }
    b.undo(&b.observe())?;
    b.redo(&b.observe())?;
    receive(&mut a, &b, "202", "bob")?;
    let current = a.observe();
    let checkpoint = a.checkpoint_json()?;

    let mut actual = Vec::new();
    let view = a.visit_thread_history(&current, &thread, |entry| {
        actual.push(serde_json::to_value(entry)?);
        Ok(())
    })?;
    let expected = a
        .view()?
        .threads
        .into_iter()
        .find(|item| item.id == thread)
        .ok_or("missing projected thread")?;
    assert_eq!(view, expected);

    let first = a.read_thread_history(&current, &thread, 0)?;
    assert_eq!(first.next_offset, Some(16));
    let second = a.read_thread_history(&current, &thread, 16)?;
    assert_eq!(second.next_offset, None);
    let paged: std::result::Result<Vec<_>, _> =
        first.events.into_iter().chain(second.events).map(serde_json::to_value).collect();
    assert_eq!(actual, paged?);
    assert_eq!(actual.len(), 25);
    assert_eq!(serde_json::to_value(a.read_thread_birth(&current, &thread)?)?, actual[0]);
    assert_eq!(actual[23]["payload"]["data"]["visible"], false);
    assert_eq!(actual[24]["payload"]["data"]["visible"], true);

    let refusal = a.visit_thread_history(&current, &thread, |_| {
        Err(ReviewError::Contract("visitor refused staged bytes"))
    });
    assert!(matches!(refusal, Err(ReviewError::Contract("visitor refused staged bytes"))));
    assert_eq!(a.checkpoint_json()?, checkpoint);
    assert!(a.visit_thread_history(&b.observe(), &thread, |_| Ok(())).is_err());
    assert!(a.read_thread_birth(&b.observe(), &thread).is_err());
    Ok(())
}
