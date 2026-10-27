//! Actual paired Rust owners; neither saved history nor equal counters are authority.
use breditor_collaboration::{
    Error,
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewError, ReviewPrincipalId,
        ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, RetainedNativeBranchOutcome, RetainedNativeBranchSource, ReviewAnchorTarget,
        RichReplica, SharedRichProfile, actions::InsertText,
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Pair {
    document: RichReplica,
    review: ReviewSession,
    document_segmented: bool,
    review_segmented: bool,
}
fn policy(actor: &str, principal: &str, access: ReviewAccess) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access,
    })
}
fn insert(core: &mut RichReplica, text: &str) -> Result {
    core.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
fn comment(pair: &mut Pair, text: &str) -> Result {
    let observed = pair.document.observe()?;
    let anchor =
        pair.document.capture_review_anchor_guarded(&observed, &ReviewAnchorTarget::Document)?;
    let review_observed = pair.review.observe();
    pair.document.dispatch_review_guarded(
        &observed,
        &mut pair.review,
        &review_observed,
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor, body: text.into() }),
    )?;
    Ok(())
}
fn setup(
    version: u32,
    standard: bool,
    document_segmented: bool,
    review_segmented: bool,
) -> Result<(SharedRichProfile, Pair)> {
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/paired-native-union","version":1},"extensions":[]}).to_string();
    let profile = match (version, standard) {
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
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/paired-native-union","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut document = profile.create(&input, "101".into())?;
    insert(&mut document, "Common local ")?;
    if document_segmented {
        document.enable_segmented_history_guarded(
            &document.observe()?,
            "document-root".into(),
            "document-one".into(),
        )?;
    }
    let review =
        document.create_review_session(policy("middle", "alice", ReviewAccess::Comment)?)?;
    let mut pair = Pair { document, review, document_segmented, review_segmented };
    comment(&mut pair, "Common comment")?;
    if review_segmented {
        pair.review.enable_segmented_history_guarded(
            &pair.review.observe(),
            "review-root".into(),
            "review-one".into(),
        )?;
    }
    Ok((profile, pair))
}
fn save(pair: &Pair) -> Result<(String, String)> {
    Ok((
        if pair.document_segmented {
            pair.document.segmented_checkpoint()?
        } else {
            pair.document.checkpoint()?
        },
        if pair.review_segmented {
            pair.review.segmented_checkpoint_json()?
        } else {
            pair.review.checkpoint_json()?
        },
    ))
}
fn restart(profile: &SharedRichProfile, pair: &Pair) -> Result<Pair> {
    let (document, review) = save(pair)?;
    let document = if pair.document_segmented {
        profile.restore_segmented("room", &document)?
    } else {
        profile.restore("room", &document)?
    };
    let policy = policy("middle", "alice", ReviewAccess::Comment)?;
    let review = if pair.review_segmented {
        document.restore_segmented_review_session(policy, &review)?
    } else {
        document.restore_review_session(policy, &review)?
    };
    Ok(Pair {
        document,
        review,
        document_segmented: pair.document_segmented,
        review_segmented: pair.review_segmented,
    })
}
fn source_with_peer(profile: &SharedRichProfile, current: &Pair) -> Result<Pair> {
    let mut source = restart(profile, current)?;
    let mut document =
        profile.join_frame("room".into(), "202".into(), &current.document.update_frame()?)?;
    insert(&mut document, "Peer document ")?;
    let review = document.create_review_session(policy("z", "bob", ReviewAccess::Comment)?)?;
    let mut peer = Pair { document, review, document_segmented: false, review_segmented: false };
    comment(&mut peer, "Peer discussion 日本 🙂")?;
    source.document.receive_frame(&peer.document.update_frame()?)?;
    let review_observed = source.review.observe();
    source.document.receive_review_guarded(
        &source.document.observe()?,
        &mut source.review,
        &review_observed,
        &policy("z", "bob", ReviewAccess::Comment)?,
        &peer.review.export_frame(0)?,
    )?;
    Ok(source)
}
fn merge(
    target: &mut Pair,
    source: &Pair,
    maximum: usize,
    allow: bool,
) -> std::result::Result<RetainedNativeBranchOutcome, Error> {
    let observed = target.document.observe()?;
    let review_observed = target.review.observe();
    let source_document_observed = source.document.observe()?;
    let source_review_observed = source.review.observe();
    target.document.reconcile_retained_native_branch_guarded(
        &observed,
        &mut target.review,
        &review_observed,
        RetainedNativeBranchSource {
            document: &source.document,
            document_observed: &source_document_observed,
            review: &source.review,
            review_observed: &source_review_observed,
        },
        maximum,
        |id, principal| {
            if allow {
                Ok(ReviewActorPolicy {
                    actor: id.actor().clone(),
                    principal: principal.clone(),
                    access: ReviewAccess::Comment,
                })
            } else {
                Err(ReviewError::Permission)
            }
        },
    )
}
fn covered(target: &Pair, source: &Pair) -> Result {
    target.document.verify_retained_native_union_guarded(
        &target.document.observe()?,
        &target.review,
        &target.review.observe(),
        RetainedNativeBranchSource {
            document: &source.document,
            document_observed: &source.document.observe()?,
            review: &source.review,
            review_observed: &source.review.observe(),
        },
    )?;
    Ok(())
}

#[test]
fn paired_union_keeps_both_cold_redo_stacks_in_all_six_profiles_and_four_history_pairs() -> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for document_segmented in [false, true] {
                for review_segmented in [false, true] {
                    let (profile, mut current) =
                        setup(version, standard, document_segmented, review_segmented)?;
                    let source = source_with_peer(&profile, &current)?;
                    insert(&mut current.document, "Offline document Redo ")?;
                    current.document.undo()?;
                    comment(&mut current, "Offline comment Redo")?;
                    current.review.undo(&current.review.observe())?;
                    let history = current.review.view()?;
                    let before = save(&current)?;
                    let source_before = save(&source)?;
                    let origin = restart(&profile, &current)?;
                    let result = merge(&mut current, &source, 8 * 1024 * 1024, true)?;
                    assert!(result.document_changed && result.review_changed);
                    covered(&current, &source)?;
                    covered(&current, &origin)?;
                    assert_eq!(save(&source)?, source_before);
                    assert_eq!(
                        (current.review.view()?.undo_depth, current.review.view()?.redo_depth),
                        (history.undo_depth, history.redo_depth)
                    );
                    if document_segmented || review_segmented {
                        let next = save(&current)?;
                        for (index, segmented) in
                            [document_segmented, review_segmented].into_iter().enumerate()
                        {
                            if segmented {
                                let a: Value = serde_json::from_str(if index == 0 {
                                    &before.0
                                } else {
                                    &before.1
                                })?;
                                let b: Value = serde_json::from_str(if index == 0 {
                                    &next.0
                                } else {
                                    &next.1
                                })?;
                                assert_eq!(a["root"], b["root"]);
                                assert_eq!(a["sealed"], b["sealed"]);
                            }
                        }
                    }
                    let exact = save(&current)?;
                    assert_eq!(
                        merge(&mut current, &source, 8 * 1024 * 1024, true)?,
                        RetainedNativeBranchOutcome {
                            document_changed: false,
                            review_changed: false
                        }
                    );
                    assert_eq!(save(&current)?, exact);
                    let mut cold = restart(&profile, &current)?;
                    cold.document.redo()?;
                    cold.review.redo(&cold.review.observe())?;
                    assert!(cold.document.document_json().contains("Offline document Redo"));
                    assert!(cold.document.document_json().contains("Peer document"));
                    assert!(cold.review.view()?.threads.iter().any(|thread| !thread.hidden
                        && thread.messages.iter().any(|message| {
                            message
                                .versions
                                .iter()
                                .any(|value| value.text.as_deref() == Some("Offline comment Redo"))
                        })));
                    assert!(
                        serde_json::to_string(&cold.review.view()?)?.contains("Peer discussion")
                    );
                    cold.document.undo()?;
                    cold.review.undo(&cold.review.observe())?;
                    assert!(cold.document.document_json().contains("Peer document"));
                    assert!(
                        serde_json::to_string(&cold.review.view()?)?.contains("Peer discussion")
                    );
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 24);
    Ok(())
}
#[test]
fn a_late_comment_permission_failure_cannot_publish_the_already_valid_document_candidate() -> Result
{
    let (profile, mut current) = setup(3, true, false, false)?;
    let source = source_with_peer(&profile, &current)?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    let document_guard = current.document.observe()?;
    let review_guard = current.review.observe();
    assert!(merge(&mut current, &source, 8 * 1024 * 1024, false).is_err());
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    current.document.check(&document_guard)?;
    current.review.check(&review_guard)?;
    assert!(merge(&mut current, &source, 8 * 1024 * 1024, true)?.review_changed);
    Ok(())
}
#[test]
fn one_incoming_ceiling_includes_document_and_comment_obligations_before_any_publication() -> Result
{
    let (profile, mut current) = setup(3, true, true, true)?;
    let source = source_with_peer(&profile, &current)?;
    let bytes = current.document.retained_native_branch_input_bytes_guarded(
        &current.document.observe()?,
        &current.review,
        &current.review.observe(),
        RetainedNativeBranchSource {
            document: &source.document,
            document_observed: &source.document.observe()?,
            review: &source.review,
            review_observed: &source.review.observe(),
        },
    )?;
    assert!(bytes.document > 0 && bytes.review > 0);
    assert_eq!(bytes.total, bytes.document + bytes.review);
    let before = save(&current)?;
    assert!(merge(&mut current, &source, bytes.document, true).is_err());
    assert_eq!(save(&current)?, before);
    assert!(merge(&mut current, &source, bytes.total, true)?.review_changed);
    Ok(())
}
#[test]
fn current_readonly_policies_and_independent_stale_review_guards_are_preserved() -> Result {
    let (profile, mut current) = setup(3, true, false, true)?;
    let source = source_with_peer(&profile, &current)?;
    let stale = current.review.observe();
    current.review.set_access(&stale, ReviewAccess::ReadOnly)?;
    current.document.set_read_only_guarded(&current.document.observe()?, true)?;
    let before = save(&current)?;
    let observed = current.document.observe()?;
    assert!(
        current
            .document
            .reconcile_retained_native_branch_guarded(
                &observed,
                &mut current.review,
                &stale,
                RetainedNativeBranchSource {
                    document: &source.document,
                    document_observed: &source.document.observe()?,
                    review: &source.review,
                    review_observed: &source.review.observe()
                },
                8 * 1024 * 1024,
                |id, principal| Ok(ReviewActorPolicy {
                    actor: id.actor().clone(),
                    principal: principal.clone(),
                    access: ReviewAccess::Comment
                })
            )
            .is_err()
    );
    assert_eq!(save(&current)?, before);
    assert!(merge(&mut current, &source, 8 * 1024 * 1024, true)?.review_changed);
    assert!(current.document.undo().is_err());
    assert!(matches!(current.review.undo(&current.review.observe()), Err(ReviewError::Permission)));
    covered(&current, &source)?;
    Ok(())
}
