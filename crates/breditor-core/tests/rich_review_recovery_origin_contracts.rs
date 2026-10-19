//! Actual native review origins, immutable events and replay-derived local history.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewImportOutcome,
            ReviewOutcome, ReviewPrincipalId, ReviewSession, ReviewThreadId,
            actions::{CreateReviewThread, ReplyToReviewThread, ReviewAction},
        },
    },
    schema::SchemaFingerprint,
};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn binding(room: &str) -> Result<ReviewBinding> {
    Ok(ReviewBinding::new(
        &DocumentId::try_new(room)?,
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
fn owner(actor: &str) -> Result<ReviewSession> {
    Ok(ReviewSession::new(binding("room")?, policy(actor, actor)?)?)
}
fn create(session: &mut ReviewSession, body: &str) -> Result<ReviewThreadId> {
    let anchor =
        json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room",
        "schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}})
        .to_string();
    let ReviewOutcome::Committed(id) = session.dispatch(
        &session.observe(),
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor, body: body.into() }),
    )?
    else {
        return Err("expected native creation".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn copy(session: &ReviewSession) -> Result<ReviewSession> {
    Ok(ReviewSession::restore_json(
        &binding("room")?,
        policy("101", "101")?,
        &session.checkpoint_json()?,
    )?)
}
fn check(current: &ReviewSession, origin: &ReviewSession) -> Result {
    current.verify_recovery_origin_guarded(&current.observe(), origin, &origin.observe())?;
    Ok(())
}

#[test]
fn review_origin_survives_future_undo_redo_and_is_a_pure_read_not_an_access_grant() -> Result {
    let mut current = owner("101")?;
    create(&mut current, "retained 🙂")?;
    current.undo(&current.observe())?;
    let origin = copy(&current)?;
    for redo in [true, false, true] {
        if redo {
            current.redo(&current.observe())?;
        } else {
            current.undo(&current.observe())?;
        }
        let before = current.checkpoint_json()?;
        let source = origin.checkpoint_json()?;
        check(&current, &origin)?;
        assert_eq!(current.checkpoint_json()?, before);
        assert_eq!(origin.checkpoint_json()?, source);
    }
    current.set_access(&current.observe(), ReviewAccess::ReadOnly)?;
    check(&current, &origin)?;
    assert!(current.undo(&current.observe()).is_err());
    Ok(())
}
#[test]
fn missing_peer_events_cannot_pass_as_same_actor_continuity() -> Result {
    let mut current = owner("101")?;
    let thread = create(&mut current, "origin")?;
    let missing_peer = copy(&current)?;
    let mut peer = owner("202")?;
    peer.receive_authorized(&peer.observe(), &policy("101", "101")?, &current.export_frame(0)?)?;
    peer.dispatch(
        &peer.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "peer retained".into() }),
    )?;
    assert_eq!(
        current.receive_authorized(
            &current.observe(),
            &policy("202", "202")?,
            &peer.export_frame(0)?
        )?,
        ReviewImportOutcome::Applied
    );
    let origin = copy(&current)?;
    check(&current, &origin)?;
    assert!(check(&missing_peer, &origin).is_err());
    Ok(())
}
#[test]
fn a_valid_same_actor_event_fork_and_an_older_owner_refuse() -> Result {
    let mut source = owner("101")?;
    let empty = copy(&source)?;
    create(&mut source, "original")?;
    let mut fork = owner("101")?;
    create(&mut fork, "fork")?;
    assert!(check(&fork, &source).is_err());
    assert!(check(&empty, &source).is_err());
    Ok(())
}
#[test]
fn both_native_observations_must_be_current_and_belong_to_the_actual_owner() -> Result {
    let mut current = owner("101")?;
    let origin = copy(&current)?;
    let stale = current.observe();
    create(&mut current, "later")?;
    assert!(current.verify_recovery_origin_guarded(&stale, &origin, &origin.observe()).is_err());
    assert!(
        current
            .verify_recovery_origin_guarded(&current.observe(), &origin, &current.observe())
            .is_err()
    );
    check(&current, &origin)?;
    Ok(())
}
#[test]
fn binding_actor_and_principal_mismatches_refuse_even_when_no_events_exist() -> Result {
    let current = owner("101")?;
    for other in [
        owner("202")?,
        ReviewSession::new(binding("other")?, policy("101", "101")?)?,
        ReviewSession::new(binding("room")?, policy("101", "another")?)?,
    ] {
        assert!(check(&current, &other).is_err());
    }
    Ok(())
}
