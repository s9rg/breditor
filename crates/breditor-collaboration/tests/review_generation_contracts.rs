//! Actual document owners validate independent comment generations and every retained native anchor.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, DocumentReviewBatchPreparation as Preparation, ReviewAnchorTarget, RichReplica,
        SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::{
    DocumentId,
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewOutcome,
        ReviewPrincipalId, ReviewSession, ReviewThreadId,
        actions::{CreateReviewThread, ReplyToReviewThread, ReviewAction},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn policy(actor: &str, principal: &str) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access: ReviewAccess::Comment,
    })
}
fn setup(
    version: u32,
    standard: bool,
    scope: u8,
    natural: bool,
    segmented: bool,
) -> Result<(SharedRichProfile, RichReplica)> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/review-generations","version":1},"extensions":[]}).to_string();
    let p = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&config)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&config)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&config)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/review-generations","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut a = p.create(&input, "101".into())?;
    if scope == 1 {
        a.enable_general_ranges_guarded(&a.observe()?)?;
    }
    if scope == 2 {
        a.enable_document_selection_guarded(&a.observe()?)?;
    }
    if natural {
        a.enable_typing_history_guarded(&a.observe()?)?;
    }
    if segmented {
        a.enable_segmented_history_guarded(
            &a.observe()?,
            "document-root".into(),
            "document-one".into(),
        )?;
    }
    Ok((p, a))
}
fn checkpoint(a: &RichReplica, scope: u8, natural: bool, segmented: bool) -> Result<String> {
    Ok(if segmented {
        a.segmented_checkpoint()?
    } else {
        match (scope, natural) {
            (2, true) => a.document_typing_checkpoint()?,
            (2, false) => a.document_checkpoint()?,
            (1, true) => a.general_typing_checkpoint()?,
            (1, false) => a.general_checkpoint()?,
            (_, true) => a.typing_checkpoint()?,
            _ => a.checkpoint()?,
        }
    })
}
fn cold(
    p: &SharedRichProfile,
    a: &RichReplica,
    scope: u8,
    natural: bool,
    segmented: bool,
) -> Result<RichReplica> {
    let saved = checkpoint(a, scope, natural, segmented)?;
    Ok(if segmented {
        p.restore_segmented("room", &saved)?
    } else {
        match (scope, natural) {
            (2, true) => p.restore_document_typing("room", &saved)?,
            (2, false) => p.restore_document("room", &saved)?,
            (1, true) => p.restore_general_typing("room", &saved)?,
            (1, false) => p.restore_general("room", &saved)?,
            (_, true) => p.restore_typing("room", &saved)?,
            _ => p.restore("room", &saved)?,
        }
    })
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn create(
    a: &RichReplica,
    review: &mut ReviewSession,
    target: &ReviewAnchorTarget,
) -> Result<ReviewThreadId> {
    let packet = a
        .capture_review_anchor_guarded(&a.observe()?, target)
        .map_err(|error| format!("anchor {target:?}: {error}"))?;
    let observed = review.observe();
    let ReviewOutcome::Committed(event) = a.dispatch_review_guarded(
        &a.observe()?,
        review,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: packet,
            body: "Native bound 🙂".into(),
        }),
    )?
    else {
        return Err("missing birth".into());
    };
    Ok(ReviewThreadId::from_event(event))
}

fn anchor_threads(a: &RichReplica, review: &mut ReviewSession) -> Result<ReviewThreadId> {
    let first = create(
        a,
        review,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    for block in ["p", "caption"] {
        create(
            a,
            review,
            &ReviewAnchorTarget::Selection(Selection::TextRange {
                anchor: point(block, 0),
                focus: point(block, 4),
            }),
        )?;
    }
    Ok(first)
}

fn edit_document(a: &mut RichReplica, text: &str) -> Result {
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}

fn native_case(version: u32, standard: bool, scope: u8, natural: bool, segmented: bool) -> Result {
    let (p, mut a) = setup(version, standard, scope, natural, segmented)?;
    let mut review = a.create_review_session(policy("review-a", "alice")?)?;
    assert!(!review.has_segmented_history());
    let before = checkpoint(&a, scope, natural, segmented)?;
    let thread = anchor_threads(&a, &mut review)?;
    let root = review.checkpoint_json()?;
    let guard = review.observe();
    a.enable_review_segmented_history_guarded(
        &a.observe()?,
        &mut review,
        &guard,
        "review-root".into(),
        "review-one".into(),
    )?;
    assert_eq!(checkpoint(&a, scope, natural, segmented)?, before);
    assert_eq!(serde_json::from_str::<Value>(&review.segmented_checkpoint_json()?)?["root"], root);
    let guard = review.observe();
    a.dispatch_review_guarded(
        &a.observe()?,
        &mut review,
        &guard,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Retained future Redo".into() }),
    )?;
    let guard = review.observe();
    a.seal_review_history_generation_guarded(
        &a.observe()?,
        &mut review,
        &guard,
        "review-two".into(),
    )?;
    let guard = review.observe();
    a.undo_review_guarded(&a.observe()?, &mut review, &guard)?;
    let guard = review.observe();
    a.seal_review_history_generation_guarded(
        &a.observe()?,
        &mut review,
        &guard,
        "review-three".into(),
    )?;
    assert_eq!(checkpoint(&a, scope, natural, segmented)?, before);
    edit_document(&mut a, "Later document ")?;
    if segmented {
        a.seal_history_segment_guarded(&a.observe()?, "document-two".into())?;
    }
    let document = checkpoint(&a, scope, natural, segmented)?;
    let restored = cold(&p, &a, scope, natural, segmented)?;
    let mut recovered = restored.restore_segmented_review_session(
        policy("review-a", "alice")?,
        &review.segmented_checkpoint_json()?,
    )?;
    assert_eq!(
        a.review_view_guarded(&a.observe()?, &review)?,
        restored.review_view_guarded(&restored.observe()?, &recovered)?
    );
    for redo in [true, false, true] {
        let x = review.observe();
        let y = recovered.observe();
        if redo {
            a.redo_review_guarded(&a.observe()?, &mut review, &x)?;
            restored.redo_review_guarded(&restored.observe()?, &mut recovered, &y)?;
        } else {
            a.undo_review_guarded(&a.observe()?, &mut review, &x)?;
            restored.undo_review_guarded(&restored.observe()?, &mut recovered, &y)?;
        }
        assert_eq!(review.segmented_checkpoint_json()?, recovered.segmented_checkpoint_json()?);
        assert_eq!(checkpoint(&a, scope, natural, segmented)?, document);
        assert_eq!(checkpoint(&restored, scope, natural, segmented)?, document);
    }
    Ok(())
}

#[test]
fn independent_native_document_and_comment_families_recover_all_72_explicit_configurations()
-> Result {
    let mut cases = 0;
    for version in 1..=3 {
        for standard in [false, true] {
            for scope in 0..3 {
                for natural in [false, true] {
                    for segmented in [false, true] {
                        native_case(version, standard, scope, natural, segmented).map_err(|error| format!("review generations version={version} standard={standard} scope={scope} natural={natural} documentGenerations={segmented}: {error}"))?;
                        cases += 1;
                    }
                }
            }
        }
    }
    assert_eq!(cases, 72);
    Ok(())
}

#[test]
fn document_adapter_refuses_hash_valid_but_backend_invalid_undone_anchors() -> Result {
    let (profile, a) = setup(3, true, 0, false, false)?;
    let binding = ReviewBinding::new(&DocumentId::try_new("room")?, profile.schema().fingerprint());
    let mut metadata = ReviewSession::new(binding, policy("review-a", "alice")?)?;
    let packet = json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":profile.schema().fingerprint().to_string(),"anchors":{"kind":"document"}}).to_string();
    metadata.dispatch(
        &metadata.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: packet,
            body: "Invalid backend cursor".into(),
        }),
    )?;
    metadata.enable_segmented_history_guarded(&metadata.observe(), "root".into(), "one".into())?;
    metadata.undo(&metadata.observe())?;
    metadata.seal_history_generation_guarded(&metadata.observe(), "two".into())?;
    let exact = metadata.segmented_checkpoint_json()?;
    let root_binding =
        ReviewBinding::new(&DocumentId::try_new("room")?, profile.schema().fingerprint());
    assert!(
        ReviewSession::restore_segmented_json(&root_binding, policy("review-a", "alice")?, &exact)
            .is_ok()
    );
    assert!(a.restore_segmented_review_session(policy("review-a", "alice")?, &exact).is_err());
    Ok(())
}

#[test]
fn prepared_document_bound_receipts_retain_the_new_family_without_skipping_document_dependencies()
-> Result {
    let (profile, mut a) = setup(3, true, 0, false, false)?;
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let mut ar = a.create_review_session(policy("review-a", "alice")?)?;
    let mut br = b.create_review_session(policy("review-b", "bob")?)?;
    let guard = ar.observe();
    a.enable_review_segmented_history_guarded(
        &a.observe()?,
        &mut ar,
        &guard,
        "root".into(),
        "one".into(),
    )?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Before anchor ".into(),
    })])?;
    create(
        &b,
        &mut br,
        &ReviewAnchorTarget::Selection(Selection::TextRange {
            anchor: point("p", 0),
            focus: point("p", 3),
        }),
    )?;
    let frame = br.export_frame(0)?;
    let before = ar.segmented_checkpoint_json()?;
    assert!(matches!(
        a.prepare_review_batch_guarded(
            &a.observe()?,
            &ar,
            &ar.observe(),
            &policy("review-b", "bob")?,
            &frame
        )?,
        Preparation::PendingDocument(_)
    ));
    assert_eq!(ar.segmented_checkpoint_json()?, before);
    a.receive_frame(&b.update_frame()?)?;
    let Preparation::Prepared(prepared) = a.prepare_review_batch_guarded(
        &a.observe()?,
        &ar,
        &ar.observe(),
        &policy("review-b", "bob")?,
        &frame,
    )?
    else {
        return Err("missing native candidate".into());
    };
    assert!(prepared.checkpoint_json().is_err());
    let exact = prepared.segmented_checkpoint_json()?;
    let receipt = prepared.receipt().clone();
    a.commit_review_batch(&mut ar, *prepared)?;
    assert_eq!(ar.segmented_checkpoint_json()?, exact);
    assert_eq!(
        ar.retained_batch_receipt(&ar.observe(), &policy("review-b", "bob")?, &frame)?,
        receipt
    );
    Ok(())
}
