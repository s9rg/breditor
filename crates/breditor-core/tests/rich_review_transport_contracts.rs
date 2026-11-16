//! Metadata transport prepares without publication; the authenticated host owns durable receipt issuance.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBatchPreparation as Preparation,
            ReviewBinding, ReviewError, ReviewImportOutcome, ReviewOutcome, ReviewPrincipalId,
            ReviewSession, ReviewThreadId,
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
    create_thread(&mut a, "First")?;
    Ok(a)
}
fn create_thread(a: &mut ReviewSession, body: &str) -> Result {
    let anchor=json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    a.dispatch(
        &a.observe(),
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor, body: body.into() }),
    )?;
    Ok(())
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
fn retained_receipts_are_pure_and_cannot_import_unknown_events_or_grant_durability() -> Result {
    let mut source = source()?;
    let peer = owner("202")?;
    let observed = source.observe();
    let before = source.checkpoint_json()?;
    let frame = source.export_frame(0)?;
    let mut read = policy("101")?;
    read.access = ReviewAccess::ReadOnly;
    let receipt = source.retained_batch_receipt(&observed, &read, &frame)?;
    assert_eq!(receipt.prefix_digest, source.local_writer_clock()?.prefix_digest);
    assert_eq!(receipt.through, "1");
    assert!(peer.retained_batch_receipt(&peer.observe(), &policy("101")?, &frame).is_err());
    assert!(source.retained_batch_receipt(&observed, &read, &source.export_frame(1)?).is_err());
    assert_eq!(source.checkpoint_json()?, before);
    source.check(&observed)?;
    reply(&mut source, "Newer")?;
    assert!(source.retained_batch_receipt(&observed, &read, &frame).is_err());
    assert_eq!(source.retained_batch_receipt(&source.observe(), &read, &frame)?, receipt);
    Ok(())
}
#[test]
fn captured_export_end_excludes_later_events_and_rejects_nonexistent_or_reversed_ranges() -> Result
{
    let mut source = source()?;
    let first = source.export_frame(0)?;
    reply(&mut source, "Later action")?;
    assert_eq!(source.export_frame_through(0, 1)?, first);
    let suffix: Value = serde_json::from_str(&source.export_frame_through(1, 2)?)?;
    assert_eq!(suffix["events"].as_array().ok_or("events")?.len(), 1);
    assert_eq!(suffix["events"][0]["id"]["counter"], "2");
    let empty: Value = serde_json::from_str(&source.export_frame_through(1, 1)?)?;
    assert!(empty["events"].as_array().ok_or("events")?.is_empty());
    assert!(source.export_frame_through(2, 1).is_err());
    assert!(source.export_frame_through(0, 3).is_err());
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

#[test]
fn maximum_batch_preserves_history_anchor_checks_for_live_and_retained_inputs() -> Result {
    let mut author = source()?;
    author.undo(&author.observe())?;
    author.redo(&author.observe())?;
    for index in 0..125 {
        reply(&mut author, &format!("Offline reply {index}"))?;
    }
    let frame = author.export_frame(0)?;
    let verified = policy("101")?;
    let mut received = owner("202")?;
    let before = received.checkpoint_json()?;
    let mut live_anchors = 0;
    let Preparation::Prepared(prepared) =
        received.prepare_authorized_batch(&received.observe(), &verified, &frame, |_| {
            live_anchors += 1;
            Ok(())
        })?
    else {
        return Err("expected complete frame".into());
    };
    assert_eq!(before, received.checkpoint_json()?);
    assert_eq!(live_anchors, 1);
    assert_eq!(prepared.receipt().through, "128");
    let receipt = received.commit_prepared_batch(*prepared)?;
    assert_eq!(receipt.prefix_digest, author.local_writer_clock()?.prefix_digest);
    assert_eq!(received.view()?.threads, author.view()?.threads);

    let mut branch = owner("202")?;
    let mut retained_anchors = 0;
    let prepared = branch.prepare_retained_branch_guarded(
        &branch.observe(),
        &received,
        &received.observe(),
        frame.len(),
        |_, _| Ok(verified.clone()),
        |_| {
            retained_anchors += 1;
            Ok(())
        },
    )?;
    assert_eq!(retained_anchors, 3);
    assert_eq!(branch.checkpoint_json()?, before);
    assert!(branch.commit_retained_branch_guarded(&branch.observe(), prepared)?);
    assert_eq!(received.checkpoint_json()?, branch.checkpoint_json()?);
    Ok(())
}

#[test]
fn nonclosed_frame_preserves_backend_anchor_failure_order_and_pending_dependencies() -> Result {
    let a = source()?;
    let mut b = owner("202")?;
    let a_frame = a.export_frame(0)?;
    b.receive_authorized(&b.observe(), &policy("101")?, &a_frame)?;
    create_thread(&mut b, "Depends on the original birth")?;
    let b_frame = b.export_frame(0)?;
    let mut c = owner("303")?;
    c.receive_authorized(&c.observe(), &policy("101")?, &a_frame)?;
    c.receive_authorized(&c.observe(), &policy("202")?, &b_frame)?;
    create_thread(&mut c, "References both actors in its frontier")?;
    let mut frame: Value = serde_json::from_str(&c.export_frame(0)?)?;
    assert!(
        frame["events"][0]["dependencies"]
            .as_object_mut()
            .ok_or("frontier")?
            .remove("101")
            .is_some()
    );
    let frame = frame.to_string();

    let mut receiver = owner("404")?;
    let verified = policy("303")?;
    assert!(matches!(
        receiver.receive_authorized_with_anchor_validation(
            &receiver.observe(), &verified, &frame, |_| panic!("pending frame called the backend")
        )?,
        ReviewImportOutcome::Pending(missing) if missing.len() == 1 && missing[0].actor().as_str() == "202"
    ));
    receiver.receive_authorized(&receiver.observe(), &policy("101")?, &a_frame)?;
    receiver.receive_authorized(&receiver.observe(), &policy("202")?, &b_frame)?;
    let observed = receiver.observe();
    let exact = receiver.checkpoint_json()?;
    let mut checks = 0;
    assert!(matches!(
        receiver.receive_authorized_with_anchor_validation(&observed, &verified, &frame, |_| {
            checks += 1;
            Err(ReviewError::Contract("backend anchor refusal"))
        }),
        Err(ReviewError::Contract("backend anchor refusal"))
    ));
    assert!(matches!(
        receiver.receive_authorized_with_anchor_validation(&observed, &verified, &frame, |_| {
            checks += 1;
            Ok(())
        }),
        Err(ReviewError::Contract("missing or cyclic review dependencies"))
    ));
    assert_eq!(checks, 2);
    receiver.check(&observed)?;
    assert_eq!(receiver.checkpoint_json()?, exact);
    Ok(())
}

#[test]
fn invalid_staged_visibility_refuses_before_publishing_any_batch_prefix() -> Result {
    let original = source()?;
    let original_frame: Value = serde_json::from_str(&original.export_frame(0)?)?;
    let mut author = owner("303")?;
    author.receive_authorized(&author.observe(), &policy("101")?, &original_frame.to_string())?;
    create_thread(&mut author, "Native action in the incoming frame")?;
    author.undo(&author.observe())?;
    author.redo(&author.observe())?;
    let mut frame: Value = serde_json::from_str(&author.export_frame(0)?)?;
    frame["events"][1]["payload"]["data"]["target"] = original_frame["events"][0]["id"].clone();
    let mut receiver = owner("404")?;
    receiver.receive_authorized(
        &receiver.observe(),
        &policy("101")?,
        &original_frame.to_string(),
    )?;
    let observed = receiver.observe();
    let exact = receiver.checkpoint_json()?;
    let mut checks = 0;
    assert!(matches!(
        receiver.receive_authorized_with_anchor_validation(
            &observed,
            &policy("303")?,
            &frame.to_string(),
            |_| {
                checks += 1;
                Ok(())
            }
        ),
        Err(ReviewError::Contract("review visibility target"))
    ));
    assert_eq!(checks, 1);
    receiver.check(&observed)?;
    assert_eq!(receiver.checkpoint_json()?, exact);
    Ok(())
}
