//! Metadata transport prepares without publication; the authenticated host owns durable receipt issuance.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBatchPreparation as Preparation,
            ReviewBinding, ReviewError, ReviewOutcome, ReviewPrincipalId, ReviewSession,
            ReviewThreadId,
            actions::{CreateReviewThread, ReplyToReviewThread, ReviewAction},
        },
    },
    schema::SchemaFingerprint,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn policy(actor: &str) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })
}
fn binding() -> Result<ReviewBinding> {
    Ok(ReviewBinding::new(
        &DocumentId::try_new("room")?,
        format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
    ))
}
fn owner(actor: &str) -> Result<ReviewSession> {
    Ok(ReviewSession::new(binding()?, policy(actor)?)?)
}
fn source() -> Result<ReviewSession> {
    let mut a = owner("101")?;
    let anchor=json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    a.dispatch(
        &a.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "First".into(),
        }),
    )?;
    Ok(a)
}
fn reply(a: &mut ReviewSession, text: &str) -> Result {
    let thread = a.view()?.threads[0].id.clone();
    a.dispatch(
        &a.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread, body: text.into() }),
    )?;
    Ok(())
}
#[test]
fn prepared_batch_is_pure_until_exact_commit_and_outer_json_does_not_change_receipts() -> Result {
    let a = source()?;
    let mut b = owner("202")?;
    let other = owner("303")?;
    let frame = a.export_frame(0)?;
    let observed = b.observe();
    let before = b.checkpoint_json()?;
    let Preparation::Prepared(p) =
        b.prepare_authorized_batch(&observed, &policy("101")?, &frame, |_| Ok(()))?
    else {
        return Err("expected prepared batch".into());
    };
    assert_eq!(b.checkpoint_json()?, before);
    b.check(&observed)?;
    assert_ne!(p.checkpoint_json()?, before);
    let formatted = serde_json::to_string_pretty(&serde_json::from_str::<Value>(&frame)?)?;
    let Preparation::Prepared(q) = other.prepare_authorized_batch(
        &other.observe(),
        &policy("101")?,
        &formatted,
        |_| Ok(()),
    )?
    else {
        return Err("expected pretty batch".into());
    };
    assert_eq!(p.receipt(), q.receipt());
    assert_eq!(p.receipt().from, "1");
    assert_eq!(p.receipt().through, "1");
    let expected = p.receipt().clone();
    assert_eq!(b.commit_prepared_batch(*p)?, expected);
    assert_eq!(b.view()?.threads, a.view()?.threads);
    assert!(b.check(&observed).is_err());
    let exact = b.checkpoint_json()?;
    let Preparation::Duplicate(receipt) =
        b.prepare_authorized_batch(&b.observe(), &policy("101")?, &formatted, |_| Ok(()))?
    else {
        return Err("expected duplicate".into());
    };
    assert_eq!(receipt, expected);
    assert_eq!(b.checkpoint_json()?, exact);
    Ok(())
}
#[test]
fn pending_batch_and_anchor_rejection_publish_neither_a_prefix_nor_a_new_observation() -> Result {
    let mut a = source()?;
    reply(&mut a, "Second")?;
    let b = owner("202")?;
    let observed = b.observe();
    let before = b.checkpoint_json()?;
    assert!(matches!(
        b.prepare_authorized_batch(&observed, &policy("101")?, &a.export_frame(1)?, |_| Ok(()))?,
        Preparation::Pending(_)
    ));
    assert!(
        b.prepare_authorized_batch(&observed, &policy("101")?, &a.export_frame(0)?, |_| Err(
            ReviewError::Contract("native anchor refusal")
        ))
        .is_err()
    );
    assert_eq!(b.checkpoint_json()?, before);
    b.check(&observed)?;
    Ok(())
}
#[test]
fn source_binding_contiguity_authority_and_owned_writer_fail_before_publication() -> Result {
    let mut a = source()?;
    let saved = a.checkpoint_json()?;
    let clone = ReviewSession::restore_json(&binding()?, policy("101")?, &saved)?;
    reply(&mut a, "Second")?;
    reply(&mut a, "Third")?;
    let b = owner("202")?;
    let before = b.checkpoint_json()?;
    let valid: Value = serde_json::from_str(&a.export_frame(0)?)?;
    for variant in 0..4 {
        let mut bad = valid.clone();
        let events = bad["events"].as_array_mut().ok_or("events")?;
        match variant {
            0 => {
                events.remove(1);
            }
            1 => events.reverse(),
            2 => events.push(events[0].clone()),
            _ => bad["binding"]["document"] = json!("other"),
        }
        assert!(
            b.prepare_authorized_batch(&b.observe(), &policy("101")?, &bad.to_string(), |_| Ok(()))
                .is_err()
        );
        assert_eq!(b.checkpoint_json()?, before);
    }
    let mut denied = policy("101")?;
    denied.access = ReviewAccess::ReadOnly;
    assert!(matches!(
        b.prepare_authorized_batch(&b.observe(), &denied, &a.export_frame(0)?, |_| Ok(())),
        Err(ReviewError::Permission)
    ));
    assert!(matches!(
        clone.prepare_authorized_batch(
            &clone.observe(),
            &policy("101")?,
            &a.export_frame(0)?,
            |_| Ok(())
        ),
        Err(ReviewError::WriterCollision)
    ));
    assert_eq!(clone.checkpoint_json()?, saved);
    Ok(())
}
#[test]
fn foreign_owners_and_intervening_policy_publications_cannot_commit_a_prepared_candidate() -> Result
{
    let a = source()?;
    let mut b = owner("202")?;
    let mut foreign = owner("202")?;
    let frame = a.export_frame(0)?;
    let Preparation::Prepared(p) =
        b.prepare_authorized_batch(&b.observe(), &policy("101")?, &frame, |_| Ok(()))?
    else {
        return Err("expected preparation".into());
    };
    let before = foreign.checkpoint_json()?;
    assert!(matches!(foreign.commit_prepared_batch(*p), Err(ReviewError::Stale)));
    assert_eq!(foreign.checkpoint_json()?, before);
    let Preparation::Prepared(p) =
        b.prepare_authorized_batch(&b.observe(), &policy("101")?, &frame, |_| Ok(()))?
    else {
        return Err("expected preparation".into());
    };
    b.set_access(&b.observe(), ReviewAccess::ReadOnly)?;
    let before = b.checkpoint_json()?;
    assert!(matches!(b.commit_prepared_batch(*p), Err(ReviewError::Stale)));
    assert_eq!(b.checkpoint_json()?, before);
    Ok(())
}
#[test]
fn historical_native_clocks_and_receipts_survive_newer_events_and_exact_recovery() -> Result {
    let mut a = source()?;
    let mut b = owner("202")?;
    let p = policy("101")?;
    let genesis = b.writer_clock(&p.actor, &p.principal)?;
    assert_eq!(genesis.through, "0");
    let Preparation::Prepared(first) =
        b.prepare_authorized_batch(&b.observe(), &p, &a.export_frame(0)?, |_| Ok(()))?
    else {
        return Err("first".into());
    };
    let original = first.receipt().clone();
    b.commit_prepared_batch(*first)?;
    let first_frame = a.export_frame(0)?;
    reply(&mut a, "Second")?;
    let Preparation::Prepared(next) =
        b.prepare_authorized_batch(&b.observe(), &p, &a.export_frame(0)?, |_| Ok(()))?
    else {
        return Err("next".into());
    };
    assert_eq!(next.receipt().from, "1");
    assert_eq!(next.receipt().through, "2");
    b.commit_prepared_batch(*next)?;
    assert_eq!(b.writer_clock_at(&p.actor, &p.principal, 1)?.prefix_digest, original.prefix_digest);
    assert_eq!(b.writer_clock_at(&p.actor, &p.principal, 0)?, genesis);
    assert!(b.writer_clock_at(&p.actor, &p.principal, 3).is_err());
    let exact = b.checkpoint_json()?;
    let restored = ReviewSession::restore_json(&binding()?, policy("202")?, &exact)?;
    let Preparation::Duplicate(retry) =
        restored.prepare_authorized_batch(&restored.observe(), &p, &first_frame, |_| Ok(()))?
    else {
        return Err("retry".into());
    };
    assert_eq!(retry, original);
    assert_eq!(
        restored.writer_clock(&p.actor, &p.principal)?,
        b.writer_clock(&p.actor, &p.principal)?
    );
    assert!(b.writer_clock(&p.actor, &ReviewPrincipalId::try_new("other")?).is_err());
    Ok(())
}
#[test]
fn empty_frames_do_not_author_history_or_fabricate_a_receipt() -> Result {
    let a = owner("101")?;
    let mut b = owner("202")?;
    let observed = b.observe();
    let before = b.checkpoint_json()?;
    assert!(matches!(
        b.prepare_authorized_batch(&observed, &policy("101")?, &a.export_frame(0)?, |_| Ok(()))?,
        Preparation::Empty
    ));
    b.check(&observed)?;
    assert_eq!(b.checkpoint_json()?, before);
    let ReviewOutcome::Committed(id)=b.dispatch(&observed,ReviewAction::CreateThread(CreateReviewThread{anchor_json:json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}}).to_string(),body:"Still exact".into()}))? else{return Err("commit".into());};
    assert_eq!(ReviewThreadId::from_event(id), b.view()?.threads[0].id);
    Ok(())
}
