//! Real native document anchors, independent comment history and staged review admission.
use breditor_collaboration::rich_replica::{
    Command, ReviewAnchorLoss, ReviewAnchorResolution, ReviewAnchorTarget, RichReplica,
    SharedRichProfile,
    actions::{DeleteBlock, InsertText},
    selection::Selection,
};
use breditor_core::rich_content::review::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewImportOutcome, ReviewMessageId,
    ReviewOutcome, ReviewPrincipalId, ReviewSession, ReviewThreadId,
    actions::{
        CreateReviewThread, EditReviewMessage, ReanchorReviewThread, ReplyToReviewThread,
        ReviewAction,
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/review-comments","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/review-comments","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn policy(actor: &str, principal: &str) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access: ReviewAccess::Comment,
    })
}
fn anchor(a: &RichReplica) -> Result<String> {
    Ok(a.capture_review_anchor_guarded(
        &a.observe()?,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?)
}
fn create(a: &RichReplica, review: &mut ReviewSession, packet: String) -> Result<ReviewThreadId> {
    let outcome = dispatch(
        a,
        review,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: packet,
            body: "Review the diagram".into(),
        }),
    )?;
    let ReviewOutcome::Committed(id) = outcome else {
        return Err("creation must commit".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn dispatch(
    a: &RichReplica,
    review: &mut ReviewSession,
    action: ReviewAction,
) -> Result<ReviewOutcome> {
    let observed = review.observe();
    Ok(a.dispatch_review_guarded(&a.observe()?, review, &observed, action)?)
}
fn history(a: &RichReplica, review: &mut ReviewSession, redo: bool) -> Result<ReviewOutcome> {
    let observed = review.observe();
    Ok(if redo {
        a.redo_review_guarded(&a.observe()?, review, &observed)?
    } else {
        a.undo_review_guarded(&a.observe()?, review, &observed)?
    })
}
fn receive(
    a: &RichReplica,
    review: &mut ReviewSession,
    peer: &ReviewSession,
    actor: &str,
    principal: &str,
) -> Result<ReviewImportOutcome> {
    let observed = review.observe();
    Ok(a.receive_review_guarded(
        &a.observe()?,
        review,
        &observed,
        &policy(actor, principal)?,
        &peer.export_frame(0)?,
    )?)
}

#[test]
fn document_typing_and_comment_history_are_independent_and_exactly_recoverable() -> Result {
    let (profile, mut a, _) = peers()?;
    let mut review = a.create_review_session(policy("comments-a", "alice")?)?;
    let accepted = (a.checkpoint()?, a.document_json().to_owned(), a.update_frame()?);
    let thread = create(&a, &mut review, anchor(&a)?)?;
    assert_eq!((a.checkpoint()?, a.document_json().to_owned(), a.update_frame()?), accepted);
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "New ".into(),
    })])?;
    let saved = review.checkpoint_json()?;
    a.undo()?;
    assert_eq!(review.checkpoint_json()?, saved);
    assert_eq!(a.document_json(), accepted.1);
    let mut b = profile.restore("room", &a.checkpoint()?)?;
    let mut restored = b.restore_review_session(policy("comments-a", "alice")?, &saved)?;
    for redo in [false, true, false, true] {
        if redo {
            assert_eq!(history(&a, &mut review, true)?, history(&b, &mut restored, true)?);
            a.redo()?;
            b.redo()?;
        } else {
            assert_eq!(history(&a, &mut review, false)?, history(&b, &mut restored, false)?);
            a.undo()?;
            b.undo()?;
        }
        assert_eq!(review.checkpoint_json()?, restored.checkpoint_json()?);
        assert_eq!(a.checkpoint()?, b.checkpoint()?);
        assert_eq!(
            a.review_view_guarded(&a.observe()?, &review)?,
            b.review_view_guarded(&b.observe()?, &restored)?
        );
    }
    assert_eq!(review.view()?.threads[0].id, thread);
    Ok(())
}

#[test]
fn peer_replies_survive_creator_undo_and_deleted_targets_remain_readable_orphans() -> Result {
    let (_, mut a, b) = peers()?;
    let mut ar = a.create_review_session(policy("comments-a", "alice")?)?;
    let mut br = b.create_review_session(policy("comments-b", "bob")?)?;
    let thread = create(&a, &mut ar, anchor(&a)?)?;
    receive(&b, &mut br, &ar, "comments-a", "alice")?;
    dispatch(
        &b,
        &mut br,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Peer reply".into() }),
    )?;
    receive(&a, &mut ar, &br, "comments-b", "bob")?;
    history(&a, &mut ar, false)?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    let view = a.review_view_guarded(&a.observe()?, &ar)?;
    assert!(!view.threads[0].thread.hidden);
    assert_eq!(
        view.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Orphaned { reason: ReviewAnchorLoss::TargetDeleted }
    );
    assert_eq!(view.threads[0].thread.messages[1].versions[0].text.as_deref(), Some("Peer reply"));
    a.undo()?;
    assert!(matches!(
        a.review_view_guarded(&a.observe()?, &ar)?.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Resolved { .. }
    ));
    Ok(())
}

#[test]
fn a_comment_can_arrive_before_its_document_dependencies_without_attaching_to_a_guess() -> Result {
    let (_, mut a, mut b) = peers()?;
    let mut ar = a.create_review_session(policy("comments-a", "alice")?)?;
    let mut br = b.create_review_session(policy("comments-b", "bob")?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline ".into(),
    })])?;
    create(&b, &mut br, anchor(&b)?)?;
    let exact = a.checkpoint()?;
    assert_eq!(receive(&a, &mut ar, &br, "comments-b", "bob")?, ReviewImportOutcome::Applied);
    assert_eq!(a.checkpoint()?, exact);
    assert_eq!(
        a.review_view_guarded(&a.observe()?, &ar)?.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Pending
    );
    let metadata = ar.checkpoint_json()?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(ar.checkpoint_json()?, metadata);
    assert!(matches!(
        a.review_view_guarded(&a.observe()?, &ar)?.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Resolved { .. }
    ));
    Ok(())
}

#[test]
fn local_orphan_reanchors_and_stale_document_captures_do_not_publish_metadata() -> Result {
    let (_, mut a, _) = peers()?;
    let mut review = a.create_review_session(policy("comments-a", "alice")?)?;
    let packet = anchor(&a)?;
    let thread = create(&a, &mut review, packet.clone())?;
    let stale = a.observe()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "image-block".into() })])?;
    let exact = review.checkpoint_json()?;
    for action in [
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: packet.clone(),
            body: "Orphan".into(),
        }),
        ReviewAction::ReanchorThread(ReanchorReviewThread {
            thread: thread.clone(),
            anchor_json: packet,
        }),
    ] {
        assert!(dispatch(&a, &mut review, action).is_err());
        assert_eq!(review.checkpoint_json()?, exact);
    }
    let observed = review.observe();
    assert!(
        a.dispatch_review_guarded(
            &stale,
            &mut review,
            &observed,
            ReviewAction::Reply(ReplyToReviewThread {
                thread: thread.clone(),
                body: "Stale".into()
            })
        )
        .is_err()
    );
    let global = a.capture_review_anchor_guarded(&a.observe()?, &ReviewAnchorTarget::Document)?;
    dispatch(
        &a,
        &mut review,
        ReviewAction::ReanchorThread(ReanchorReviewThread { thread, anchor_json: global }),
    )?;
    assert_eq!(
        a.review_view_guarded(&a.observe()?, &review)?.threads[0].targets[0].resolution,
        ReviewAnchorResolution::Resolved { target: ReviewAnchorTarget::Document }
    );
    Ok(())
}

#[test]
fn engine_invalid_anchors_in_a_metadata_valid_batch_or_recovery_never_publish() -> Result {
    let (_, a, b) = peers()?;
    let mut ar = a.create_review_session(policy("comments-a", "alice")?)?;
    let mut br = b.create_review_session(policy("comments-b", "bob")?)?;
    // The generic metadata owner cannot interpret backend cursors. Its document adapter must.
    let mut packet: Value = serde_json::from_str(&anchor(&b)?)?;
    packet["engine"] = json!("not-this-engine");
    br.dispatch(
        &br.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: packet.to_string(),
            body: "Malformed target".into(),
        }),
    )?;
    let before = (a.checkpoint()?, ar.checkpoint_json()?);
    assert!(receive(&a, &mut ar, &br, "comments-b", "bob").is_err());
    assert_eq!((a.checkpoint()?, ar.checkpoint_json()?), before);
    assert!(
        b.restore_review_session(policy("comments-b", "bob")?, &br.checkpoint_json()?).is_err()
    );
    // Even a reply cannot smuggle an already invalid generic metadata owner into the adapter.
    let thread = br.view()?.threads[0].id.clone();
    assert!(
        dispatch(
            &b,
            &mut br,
            ReviewAction::Reply(ReplyToReviewThread { thread, body: "Rejected".into() })
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn document_read_only_does_not_grant_or_revoke_separate_comment_rights() -> Result {
    let (_, mut a, _) = peers()?;
    let mut review = a.create_review_session(policy("comments-a", "alice")?)?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let thread = create(&a, &mut review, anchor(&a)?)?;
    review.set_access(&review.observe(), ReviewAccess::ReadOnly)?;
    let exact = (a.checkpoint()?, review.checkpoint_json()?);
    assert!(
        dispatch(
            &a,
            &mut review,
            ReviewAction::EditMessage(EditReviewMessage {
                message: ReviewMessageId::from_event(thread.event().clone()),
                body: "Denied".into()
            })
        )
        .is_err()
    );
    assert_eq!((a.checkpoint()?, review.checkpoint_json()?), exact);
    Ok(())
}
