//! Former authors keep actual identities, both history branches and current read-only rights.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError,
            ReviewImportOutcome, ReviewOutcome, ReviewPrincipalId, ReviewSession, ReviewThreadId,
            actions::{CreateReviewThread, ReplyToReviewThread, ReviewAction},
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
fn policy(actor: &str, access: ReviewAccess) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access,
    })
}
fn owner(actor: &str) -> Result<ReviewSession> {
    Ok(ReviewSession::new(binding()?, policy(actor, ReviewAccess::Comment)?)?)
}
fn birth(a: &mut ReviewSession) -> Result<ReviewThreadId> {
    let anchor=json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    let ReviewOutcome::Committed(id) = a.dispatch(
        &a.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Original 🙂".into(),
        }),
    )?
    else {
        return Err("missing birth".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn reply(a: &mut ReviewSession, thread: &ReviewThreadId, body: &str) -> Result {
    a.dispatch(
        &a.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread: thread.clone(), body: body.into() }),
    )?;
    Ok(())
}
fn peer(a: &ReviewSession) -> Result<ReviewSession> {
    let mut b = owner("202")?;
    assert_eq!(
        b.receive_authorized(
            &b.observe(),
            &policy("101", ReviewAccess::Comment)?,
            &a.export_frame(0)?
        )?,
        ReviewImportOutcome::Applied
    );
    Ok(b)
}

#[test]
fn former_read_only_author_archives_peer_inputs_without_reset_or_a_temporary_grant() -> Result {
    let mut a = owner("101")?;
    let thread = birth(&mut a)?;
    reply(&mut a, &thread, "Saved Redo")?;
    a.undo(&a.observe())?;
    let mut b = peer(&a)?;
    a.set_access(&a.observe(), ReviewAccess::ReadOnly)?;
    let original = a.checkpoint_json()?;
    let clock = a.local_writer_clock()?;
    let view = a.view()?;
    assert!(a.enable_segmented_history_guarded(&a.observe(), "root".into(), "one".into()).is_err());
    assert!(
        a.enable_observer_segmented_history_guarded(&a.observe(), "root".into(), "one".into())
            .is_err()
    );
    a.enable_read_only_segmented_history_guarded(&a.observe(), "root".into(), "one".into())?;
    assert_eq!(a.view()?, view);
    assert_eq!(a.local_writer_clock()?, clock);
    reply(&mut b, &thread, "Peer remains")?;
    assert_eq!(
        a.receive_authorized(
            &a.observe(),
            &policy("202", ReviewAccess::Comment)?,
            &b.export_frame(0)?
        )?,
        ReviewImportOutcome::Applied
    );
    let before = a.segmented_checkpoint_json()?;
    let view = a.view()?;
    assert!(a.seal_observer_history_generation_guarded(&a.observe(), "two".into()).is_err());
    let stale = a.observe();
    a.seal_read_only_history_generation_guarded(&stale, "two".into())?;
    assert!(a.check(&stale).is_err());
    assert_eq!(a.local_writer_clock()?, clock);
    assert_eq!(a.view()?, view);
    let saved = a.segmented_checkpoint_json()?;
    let value: Value = serde_json::from_str(&saved)?;
    assert_eq!(value["root"], original);
    assert_eq!(value["sealed"][0], serde_json::from_str::<Value>(&before)?["active"]);
    let mut cold = ReviewSession::restore_segmented_json(
        &binding()?,
        policy("101", ReviewAccess::ReadOnly)?,
        &saved,
    )?;
    assert_eq!(cold.segmented_checkpoint_json()?, saved);
    let guard = cold.observe();
    assert!(matches!(cold.redo(&guard), Err(ReviewError::Permission)));
    cold.check(&guard)?;
    assert_eq!(cold.segmented_checkpoint_json()?, saved);
    // A separate explicit host grant, never a hidden step inside archival.
    a.set_access(&a.observe(), ReviewAccess::Comment)?;
    cold.set_access(&cold.observe(), ReviewAccess::Comment)?;
    for redo in [true, false, true] {
        if redo {
            a.redo(&a.observe())?;
            cold.redo(&cold.observe())?;
        } else {
            a.undo(&a.observe())?;
            cold.undo(&cold.observe())?;
        }
        assert_eq!(a.segmented_checkpoint_json()?, cold.segmented_checkpoint_json()?);
        assert!(
            a.view()?.threads[0]
                .messages
                .iter()
                .any(|m| m.versions.iter().any(|v| v.text.as_deref() == Some("Peer remains")))
        );
    }
    Ok(())
}

#[test]
fn read_only_archival_refuses_wrong_policy_guards_family_and_generation_without_publication()
-> Result {
    let mut a = owner("101")?;
    let thread = birth(&mut a)?;
    let initial = a.checkpoint_json()?;
    for access in [ReviewAccess::Comment, ReviewAccess::Moderate] {
        a.set_access(&a.observe(), access)?;
        assert!(matches!(
            a.enable_read_only_segmented_history_guarded(&a.observe(), "root".into(), "one".into()),
            Err(ReviewError::Permission)
        ));
        assert_eq!(a.checkpoint_json()?, initial);
    }
    let stale = a.observe();
    a.set_access(&a.observe(), ReviewAccess::ReadOnly)?;
    assert!(
        a.enable_read_only_segmented_history_guarded(&stale, "root".into(), "one".into()).is_err()
    );
    assert!(a.seal_read_only_history_generation_guarded(&a.observe(), "two".into()).is_err());
    assert_eq!(a.checkpoint_json()?, initial);
    a.enable_read_only_segmented_history_guarded(&a.observe(), "root".into(), "one".into())?;
    let mut b = peer(&a)?;
    let empty = a.segmented_checkpoint_json()?;
    assert!(a.seal_read_only_history_generation_guarded(&a.observe(), "two".into()).is_err());
    assert_eq!(a.segmented_checkpoint_json()?, empty);
    let stale = a.observe();
    reply(&mut b, &thread, "Received")?;
    a.receive_authorized(
        &a.observe(),
        &policy("202", ReviewAccess::Comment)?,
        &b.export_frame(0)?,
    )?;
    let exact = a.segmented_checkpoint_json()?;
    for (guard, id) in [
        (stale, "two"),
        (b.observe(), "two"),
        (a.observe(), "root"),
        (a.observe(), "one"),
        (a.observe(), ""),
        (a.observe(), "bad id"),
    ] {
        assert!(a.seal_read_only_history_generation_guarded(&guard, id.into()).is_err());
        assert_eq!(a.segmented_checkpoint_json()?, exact);
    }
    a.seal_read_only_history_generation_guarded(&a.observe(), "two".into())?;
    Ok(())
}
