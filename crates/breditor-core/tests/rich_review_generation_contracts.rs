//! Real native comment generations, independent author history and unchanged wire receipts.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBatchPreparation, ReviewBinding,
            ReviewError, ReviewImportOutcome, ReviewMessageId, ReviewOutcome, ReviewPrincipalId,
            ReviewSession, ReviewThreadId,
            actions::{CreateReviewThread, EditReviewMessage, ReplyToReviewThread, ReviewAction},
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
fn policy(actor: &str, principal: &str, access: ReviewAccess) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access,
    })
}
fn owner(actor: &str, principal: &str) -> Result<ReviewSession> {
    Ok(ReviewSession::new(binding()?, policy(actor, principal, ReviewAccess::Comment)?)?)
}
fn anchor() -> String {
    json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string()
}
fn create(a: &mut ReviewSession) -> Result<ReviewThreadId> {
    let ReviewOutcome::Committed(id) = a.dispatch(
        &a.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor(),
            body: "Original 日本 🙂".into(),
        }),
    )?
    else {
        return Err("missing birth".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn edit(a: &mut ReviewSession, thread: &ReviewThreadId, text: &str) -> Result {
    a.dispatch(
        &a.observe(),
        ReviewAction::EditMessage(EditReviewMessage {
            message: ReviewMessageId::from_event(thread.event().clone()),
            body: text.into(),
        }),
    )?;
    Ok(())
}
fn enable(a: &mut ReviewSession) -> Result {
    a.enable_segmented_history_guarded(&a.observe(), "root".into(), "one".into())?;
    Ok(())
}
fn seal(a: &mut ReviewSession, id: &str) -> Result {
    a.seal_history_generation_guarded(&a.observe(), id.into())?;
    Ok(())
}
fn restore(
    a: &ReviewSession,
    actor: &str,
    principal: &str,
    access: ReviewAccess,
) -> Result<ReviewSession> {
    Ok(ReviewSession::restore_segmented_json(
        &binding()?,
        policy(actor, principal, access)?,
        &a.segmented_checkpoint_json()?,
    )?)
}
fn receive(
    a: &mut ReviewSession,
    b: &ReviewSession,
    actor: &str,
    principal: &str,
) -> Result<ReviewImportOutcome> {
    Ok(a.receive_authorized(
        &a.observe(),
        &policy(actor, principal, ReviewAccess::Comment)?,
        &b.export_frame(0)?,
    )?)
}

#[test]
fn exact_root_seals_and_future_undo_redo_survive_multiple_native_boundaries() -> Result {
    let mut a = owner("101", "alice")?;
    let thread = create(&mut a)?;
    let root = a.checkpoint_json()?;
    let clock = a.local_writer_clock()?;
    let observed = a.observe();
    enable(&mut a)?;
    assert!(matches!(a.check(&observed), Err(ReviewError::Stale)));
    assert_eq!(a.local_writer_clock()?, clock);
    assert!(a.checkpoint_json().is_err());
    assert_eq!(serde_json::from_str::<Value>(&a.segmented_checkpoint_json()?)?["root"], root);
    edit(&mut a, &thread, "One")?;
    seal(&mut a, "two")?;
    edit(&mut a, &thread, "Two")?;
    a.undo(&a.observe())?;
    seal(&mut a, "three")?;
    let exact = a.segmented_checkpoint_json()?;
    let mut cold = restore(&a, "101", "alice", ReviewAccess::Comment)?;
    assert_eq!(cold.segmented_checkpoint_json()?, exact);
    for redo in [true, false, false, false, true, true, true] {
        let x = if redo { a.redo(&a.observe())? } else { a.undo(&a.observe())? };
        let y = if redo { cold.redo(&cold.observe())? } else { cold.undo(&cold.observe())? };
        assert_eq!(x, y);
        assert_eq!(a.view()?, cold.view()?);
        assert_eq!(a.segmented_checkpoint_json()?, cold.segmented_checkpoint_json()?);
    }
    assert_eq!(a.anchor_packets().collect::<Vec<_>>(), cold.anchor_packets().collect::<Vec<_>>());
    Ok(())
}

#[test]
fn offline_original_peer_rejoins_after_seals_without_resetting_its_writer() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "alice")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    enable(&mut a)?;
    edit(&mut a, &thread, "Device A")?;
    seal(&mut a, "two")?;
    edit(&mut b, &thread, "Offline device B")?;
    let b_clock = b.local_writer_clock()?;
    receive(&mut a, &b, "202", "alice")?;
    receive(&mut b, &a, "101", "alice")?;
    assert_eq!(a.view()?.threads, b.view()?.threads);
    assert_eq!(a.view()?.threads[0].messages[0].versions.len(), 2);
    seal(&mut a, "three")?;
    let mut cold = restore(&a, "101", "alice", ReviewAccess::Comment)?;
    assert_eq!(cold.writer_clock(&b_clock.actor, &ReviewPrincipalId::try_new("alice")?)?, b_clock);
    for redo in [false, true, false] {
        if redo {
            a.redo(&a.observe())?;
            cold.redo(&cold.observe())?;
        } else {
            a.undo(&a.observe())?;
            cold.undo(&cold.observe())?;
        }
        assert_eq!(a.segmented_checkpoint_json()?, cold.segmented_checkpoint_json()?);
        assert!(
            a.view()?.threads[0].messages[0]
                .versions
                .iter()
                .any(|v| v.text.as_deref() == Some("Offline device B"))
        );
    }
    Ok(())
}

#[test]
fn readonly_recovery_retains_redo_and_observer_seals_do_not_author_events() -> Result {
    let mut a = owner("101", "alice")?;
    create(&mut a)?;
    enable(&mut a)?;
    a.undo(&a.observe())?;
    seal(&mut a, "two")?;
    let mut cold = restore(&a, "101", "alice", ReviewAccess::ReadOnly)?;
    let exact = cold.segmented_checkpoint_json()?;
    assert_eq!(cold.view()?.redo_depth, 1);
    assert!(matches!(cold.redo(&cold.observe()), Err(ReviewError::Permission)));
    assert!(cold.seal_history_generation_guarded(&cold.observe(), "three".into()).is_err());
    assert_eq!(cold.segmented_checkpoint_json()?, exact);
    let mut observer = owner("999", "reader")?;
    observer.set_access(&observer.observe(), ReviewAccess::ReadOnly)?;
    observer.enable_observer_segmented_history_guarded(
        &observer.observe(),
        "observer-root".into(),
        "observer-one".into(),
    )?;
    receive(&mut observer, &a, "101", "alice")?;
    let clock = observer.local_writer_clock()?;
    let view = observer.view()?;
    observer
        .seal_observer_history_generation_guarded(&observer.observe(), "observer-two".into())?;
    assert_eq!(observer.local_writer_clock()?, clock);
    assert_eq!(clock.through, "0");
    assert_eq!(observer.view()?, view);
    assert!(matches!(
        observer.dispatch(
            &observer.observe(),
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json: anchor(),
                body: "Denied".into()
            })
        ),
        Err(ReviewError::Permission)
    ));
    assert_eq!(
        restore(&observer, "999", "reader", ReviewAccess::ReadOnly)?.segmented_checkpoint_json()?,
        observer.segmented_checkpoint_json()?
    );
    Ok(())
}

#[test]
fn stale_empty_reused_and_foreign_generation_calls_refuse_without_publication() -> Result {
    let mut a = owner("101", "alice")?;
    let stale = a.observe();
    create(&mut a)?;
    let original = a.checkpoint_json()?;
    assert!(matches!(
        a.enable_segmented_history_guarded(&stale, "root".into(), "one".into()),
        Err(ReviewError::Stale)
    ));
    assert!(
        a.enable_segmented_history_guarded(&a.observe(), "same".into(), "same".into()).is_err()
    );
    assert_eq!(a.checkpoint_json()?, original);
    enable(&mut a)?;
    let exact = a.segmented_checkpoint_json()?;
    let observed = a.observe();
    for id in ["root", "one", "new", "bad id", ""] {
        assert!(a.seal_history_generation_guarded(&observed, id.into()).is_err());
        assert_eq!(a.segmented_checkpoint_json()?, exact);
        a.check(&observed)?;
    }
    assert!(
        a.enable_segmented_history_guarded(&observed, "new-root".into(), "new-active".into())
            .is_err()
    );
    assert!(
        ReviewSession::restore_json(
            &binding()?,
            policy("101", "alice", ReviewAccess::Comment)?,
            &exact
        )
        .is_err()
    );
    assert!(
        ReviewSession::restore_segmented_json(
            &binding()?,
            policy("202", "alice", ReviewAccess::Comment)?,
            &exact
        )
        .is_err()
    );
    assert!(
        ReviewSession::restore_segmented_json(
            &binding()?,
            policy("101", "bob", ReviewAccess::Comment)?,
            &exact
        )
        .is_err()
    );
    assert!(
        ReviewSession::restore_segmented_json(
            &binding()?,
            policy("101", "alice", ReviewAccess::Comment)?,
            &original
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn receipt_preparation_stays_native_and_cannot_relabel_a_candidate_family() -> Result {
    let mut a = owner("101", "alice")?;
    create(&mut a)?;
    let mut b = owner("202", "bob")?;
    enable(&mut b)?;
    let before = b.segmented_checkpoint_json()?;
    let source = b.observe();
    let ReviewBatchPreparation::Prepared(prepared) = b.prepare_authorized_batch(
        &source,
        &policy("101", "alice", ReviewAccess::Comment)?,
        &a.export_frame(0)?,
        |_| Ok(()),
    )?
    else {
        return Err("missing native candidate".into());
    };
    let receipt = prepared.receipt().clone();
    assert!(prepared.checkpoint_json().is_err());
    let candidate = prepared.segmented_checkpoint_json()?;
    assert_eq!(b.segmented_checkpoint_json()?, before);
    b.commit_prepared_batch(*prepared)?;
    assert_eq!(b.segmented_checkpoint_json()?, candidate);
    assert_eq!(
        b.retained_batch_receipt(
            &b.observe(),
            &policy("101", "alice", ReviewAccess::Comment)?,
            &a.export_frame(0)?
        )?,
        receipt
    );
    seal(&mut b, "two")?;
    let cold = restore(&b, "202", "bob", ReviewAccess::Comment)?;
    assert_eq!(
        cold.retained_batch_receipt(
            &cold.observe(),
            &policy("101", "alice", ReviewAccess::Comment)?,
            &a.export_frame(0)?
        )?,
        receipt
    );
    Ok(())
}

#[test]
fn native_origin_checks_require_the_original_root_and_immutable_file_chain() -> Result {
    let mut a = owner("101", "alice")?;
    let thread = create(&mut a)?;
    let root = a.checkpoint_json()?;
    let old = ReviewSession::restore_json(
        &binding()?,
        policy("101", "alice", ReviewAccess::Comment)?,
        &root,
    )?;
    enable(&mut a)?;
    edit(&mut a, &thread, "One")?;
    let origin = restore(&a, "101", "alice", ReviewAccess::Comment)?;
    seal(&mut a, "two")?;
    edit(&mut a, &thread, "Two")?;
    a.verify_recovery_origin_guarded(&a.observe(), &old, &old.observe())?;
    a.verify_recovery_origin_guarded(&a.observe(), &origin, &origin.observe())?;
    assert!(
        old.verify_recovery_origin_guarded(&old.observe(), &origin, &origin.observe()).is_err()
    );
    let mut other = ReviewSession::restore_json(
        &binding()?,
        policy("101", "alice", ReviewAccess::Comment)?,
        &root,
    )?;
    other.enable_segmented_history_guarded(
        &other.observe(),
        "different-root".into(),
        "one".into(),
    )?;
    assert!(a.verify_recovery_origin_guarded(&a.observe(), &other, &other.observe()).is_err());
    let exact = a.segmented_checkpoint_json()?;
    a.verify_recovery_origin_guarded(&a.observe(), &origin, &origin.observe())?;
    assert_eq!(a.segmented_checkpoint_json()?, exact);
    Ok(())
}

#[test]
fn creator_undo_keeps_a_peers_reply_after_native_generation_recovery() -> Result {
    let mut a = owner("101", "alice")?;
    let mut b = owner("202", "bob")?;
    let thread = create(&mut a)?;
    receive(&mut b, &a, "101", "alice")?;
    enable(&mut a)?;
    b.dispatch(
        &b.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Peer survives".into() }),
    )?;
    receive(&mut a, &b, "202", "bob")?;
    seal(&mut a, "two")?;
    a.undo(&a.observe())?;
    let mut cold = restore(&a, "101", "alice", ReviewAccess::Comment)?;
    assert!(!cold.view()?.threads[0].hidden);
    assert_eq!(
        cold.view()?.threads[0].messages[1].versions[0].text.as_deref(),
        Some("Peer survives")
    );
    a.redo(&a.observe())?;
    cold.redo(&cold.observe())?;
    assert_eq!(a.segmented_checkpoint_json()?, cold.segmented_checkpoint_json()?);
    Ok(())
}
