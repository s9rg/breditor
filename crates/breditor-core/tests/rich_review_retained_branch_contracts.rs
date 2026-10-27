//! Real native authorized review union. No checkpoint field becomes a role grant.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    rich_content::{
        DocumentId,
        review::{
            ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError,
            ReviewImportOutcome, ReviewMessageId, ReviewOutcome, ReviewPrincipalId, ReviewSession,
            ReviewThreadId,
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
    json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}","0".repeat(64)),"anchors":{"kind":"document"}}).to_string()
}
fn create(core: &mut ReviewSession, body: &str) -> Result<ReviewThreadId> {
    let ReviewOutcome::Committed(id) = core.dispatch(
        &core.observe(),
        ReviewAction::CreateThread(CreateReviewThread { anchor_json: anchor(), body: body.into() }),
    )?
    else {
        return Err("expected original contribution".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn edit(core: &mut ReviewSession, thread: &ReviewThreadId, text: &str) -> Result {
    core.dispatch(
        &core.observe(),
        ReviewAction::EditMessage(EditReviewMessage {
            message: ReviewMessageId::from_event(thread.event().clone()),
            body: text.into(),
        }),
    )?;
    Ok(())
}
fn receive(
    core: &mut ReviewSession,
    peer: &ReviewSession,
    actor: &str,
    principal: &str,
    access: ReviewAccess,
) -> Result {
    assert!(matches!(
        core.receive_authorized(
            &core.observe(),
            &policy(actor, principal, access)?,
            &peer.export_frame(0)?
        )?,
        ReviewImportOutcome::Applied | ReviewImportOutcome::Unchanged
    ));
    Ok(())
}
fn save(core: &ReviewSession) -> Result<String> {
    Ok(core.checkpoint_json().or_else(|_| core.segmented_checkpoint_json())?)
}
fn restart(core: &ReviewSession) -> Result<ReviewSession> {
    let selected = policy("middle", "alice", ReviewAccess::Comment)?;
    Ok(if core.checkpoint_json().is_ok() {
        ReviewSession::restore_json(&binding()?, selected, &save(core)?)?
    } else {
        ReviewSession::restore_segmented_json(&binding()?, selected, &save(core)?)?
    })
}
fn source_with_peer(core: &ReviewSession) -> Result<ReviewSession> {
    let mut source = restart(core)?;
    let mut peer = owner("z", "bob")?;
    create(&mut peer, "Peer 日本 🙂")?;
    receive(&mut source, &peer, "z", "bob", ReviewAccess::Comment)?;
    Ok(source)
}
fn grant(actor: &ReviewActorId, principal: &ReviewPrincipalId) -> ReviewActorPolicy {
    ReviewActorPolicy {
        actor: actor.clone(),
        principal: principal.clone(),
        access: ReviewAccess::Comment,
    }
}
fn prepare(
    core: &ReviewSession,
    source: &ReviewSession,
) -> std::result::Result<breditor_core::rich_content::review::PreparedReviewBranch, ReviewError> {
    core.prepare_retained_branch_guarded(
        &core.observe(),
        source,
        &source.observe(),
        8 * 1024 * 1024,
        |id, principal| Ok(grant(id.actor(), principal)),
        |_| Ok(()),
    )
}
fn covered(core: &ReviewSession, source: &ReviewSession) -> std::result::Result<(), ReviewError> {
    core.verify_retained_branch_guarded(&core.observe(), source, &source.observe())
}

#[test]
fn independent_peer_union_preserves_local_redo_and_cold_native_history_across_generations() -> Result
{
    for kind in 0..4 {
        let mut current = owner("middle", "alice")?;
        let thread = create(&mut current, "Common")?;
        if kind == 1 || kind == 2 {
            current.enable_segmented_history_guarded(
                &current.observe(),
                "root".into(),
                "one".into(),
            )?;
        }
        let source = source_with_peer(&current)?;
        if kind == 3 {
            current.enable_segmented_history_guarded(
                &current.observe(),
                "root".into(),
                "one".into(),
            )?;
        }
        edit(&mut current, &thread, "Own offline Redo")?;
        current.undo(&current.observe())?;
        if kind == 2 {
            current.seal_history_generation_guarded(&current.observe(), "two".into())?;
        }
        let before = save(&current)?;
        let source_before = save(&source)?;
        let history = current.view()?;
        let old_guard = current.observe();
        assert!(covered(&current, &source).is_err());
        let bytes = current.retained_branch_input_bytes_guarded(
            &current.observe(),
            &source,
            &source.observe(),
        )?;
        assert!(bytes > 0);
        let prepared = prepare(&current, &source)?;
        assert_eq!(prepared.incoming_bytes(), bytes);
        assert!(prepared.changed());
        assert_eq!(save(&current)?, before);
        assert_eq!(save(&source)?, source_before);
        assert!(current.commit_retained_branch_guarded(&old_guard, prepared)?);
        assert!(current.check(&old_guard).is_err());
        assert_eq!(
            (current.view()?.undo_depth, current.view()?.redo_depth),
            (history.undo_depth, history.redo_depth)
        );
        covered(&current, &source)?;
        assert_eq!(save(&source)?, source_before);
        if kind > 0 {
            let old: Value = serde_json::from_str(&before)?;
            let next: Value = serde_json::from_str(&save(&current)?)?;
            assert_eq!(old["root"], next["root"]);
            assert_eq!(old["sealed"], next["sealed"]);
        }
        let exact = save(&current)?;
        let noop = prepare(&current, &source)?;
        assert!(!noop.changed());
        assert_eq!(noop.incoming_bytes(), 0);
        let observed = current.observe();
        assert!(!current.commit_retained_branch_guarded(&observed, noop)?);
        current.check(&observed)?;
        assert_eq!(save(&current)?, exact);
        let mut cold = restart(&current)?;
        assert_eq!(save(&cold)?, exact);
        assert!(matches!(cold.redo(&cold.observe())?, ReviewOutcome::Committed(_)));
        assert!(serde_json::to_string(&cold.view()?)?.contains("Own offline Redo"));
        assert!(serde_json::to_string(&cold.view()?)?.contains("Peer 日本 🙂"));
        cold.undo(&cold.observe())?;
        assert!(!serde_json::to_string(&cold.view()?)?.contains("Own offline Redo"));
        assert!(serde_json::to_string(&cold.view()?)?.contains("Peer 日本 🙂"));
    }
    Ok(())
}
#[test]
fn dependencies_not_actor_spelling_determine_foreign_event_admission_order() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let mut source = restart(&current)?;
    let mut z = owner("z", "bob")?;
    let mut a = owner("a", "carol")?;
    let thread = create(&mut z, "Z birth")?;
    receive(&mut a, &z, "z", "bob", ReviewAccess::Comment)?;
    a.dispatch(
        &a.observe(),
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "A dependent reply".into() }),
    )?;
    receive(&mut source, &z, "z", "bob", ReviewAccess::Comment)?;
    receive(&mut source, &a, "a", "carol", ReviewAccess::Comment)?;
    source = restart(&source)?;
    let mut calls = vec![];
    let prepared = current.prepare_retained_branch_guarded(
        &current.observe(),
        &source,
        &source.observe(),
        8 * 1024 * 1024,
        |id, principal| {
            calls.push(id.actor().as_str().to_owned());
            Ok(grant(id.actor(), principal))
        },
        |_| Ok(()),
    )?;
    assert_eq!(calls, ["z", "a"]);
    current.commit_retained_branch_guarded(&current.observe(), prepared)?;
    covered(&current, &source)?;
    assert!(serde_json::to_string(&current.view()?)?.contains("A dependent reply"));
    Ok(())
}
#[test]
fn historical_moderation_needs_the_explicit_original_event_grant() -> Result {
    let mut current = owner("middle", "alice")?;
    let thread = create(&mut current, "Alice original")?;
    let mut source = restart(&current)?;
    let mut moderator = owner("z", "bob")?;
    receive(&mut moderator, &current, "middle", "alice", ReviewAccess::Comment)?;
    moderator.set_access(&moderator.observe(), ReviewAccess::Moderate)?;
    edit(&mut moderator, &thread, "Bob moderated")?;
    receive(&mut source, &moderator, "z", "bob", ReviewAccess::Moderate)?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(matches!(prepare(&current, &source), Err(ReviewError::Permission)));
    assert_eq!(save(&current)?, before);
    let prepared = current.prepare_retained_branch_guarded(
        &current.observe(),
        &source,
        &source.observe(),
        8 * 1024 * 1024,
        |id, principal| {
            Ok(ReviewActorPolicy {
                actor: id.actor().clone(),
                principal: principal.clone(),
                access: ReviewAccess::Moderate,
            })
        },
        |_| Ok(()),
    )?;
    current.commit_retained_branch_guarded(&current.observe(), prepared)?;
    assert!(serde_json::to_string(&current.view()?)?.contains("Bob moderated"));
    assert_eq!(save(&source)?, source_before);
    Ok(())
}
#[test]
fn late_authorization_and_anchor_failures_leave_both_native_owners_unchanged() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let mut source = source_with_peer(&current)?;
    let mut peer = owner("a", "carol")?;
    create(&mut peer, "Another")?;
    receive(&mut source, &peer, "a", "carol", ReviewAccess::Comment)?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    let observed = current.observe();
    let mut calls = 0;
    assert!(
        current
            .prepare_retained_branch_guarded(
                &observed,
                &source,
                &source.observe(),
                8 * 1024 * 1024,
                |id, principal| {
                    calls += 1;
                    if calls == 2 {
                        return Err(ReviewError::Permission);
                    }
                    Ok(grant(id.actor(), principal))
                },
                |_| Ok(())
            )
            .is_err()
    );
    assert_eq!(calls, 2);
    assert_eq!(save(&current)?, before);
    current.check(&observed)?;
    assert!(
        current
            .prepare_retained_branch_guarded(
                &observed,
                &source,
                &source.observe(),
                8 * 1024 * 1024,
                |id, principal| Ok(grant(id.actor(), principal)),
                |_| Err(ReviewError::Contract("expected anchor refusal"))
            )
            .is_err()
    );
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    current.check(&observed)?;
    Ok(())
}
#[test]
fn byte_budget_precedes_staging_and_every_authorization_callback() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let source = source_with_peer(&current)?;
    let before = save(&current)?;
    let observed = current.observe();
    let mut calls = 0;
    assert!(matches!(
        current.prepare_retained_branch_guarded(
            &observed,
            &source,
            &source.observe(),
            1,
            |id, principal| {
                calls += 1;
                Ok(grant(id.actor(), principal))
            },
            |_| Ok(())
        ),
        Err(ReviewError::Limit("review retained branch input bytes"))
    ));
    assert_eq!(calls, 0);
    assert_eq!(save(&current)?, before);
    current.check(&observed)?;
    let bytes =
        current.retained_branch_input_bytes_guarded(&observed, &source, &source.observe())?;
    let prepared = current.prepare_retained_branch_guarded(
        &observed,
        &source,
        &source.observe(),
        bytes,
        |id, principal| Ok(grant(id.actor(), principal)),
        |_| Ok(()),
    )?;
    current.commit_retained_branch_guarded(&observed, prepared)?;
    covered(&current, &source)?;
    Ok(())
}
#[test]
fn atomic_composition_and_stale_or_foreign_candidates_cannot_partially_publish() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let source = source_with_peer(&current)?;
    let before = save(&current)?;
    let observed = current.observe();
    let prepared = prepare(&current, &source)?;
    assert!(
        current
            .commit_retained_branch_with(&observed, prepared, || Err::<(), ReviewError>(
                ReviewError::Contract("expected document failure")
            ))
            .is_err()
    );
    assert_eq!(save(&current)?, before);
    current.check(&observed)?;
    let mut foreign = restart(&current)?;
    let prepared = prepare(&current, &source)?;
    let mut calls = 0;
    assert!(
        foreign
            .commit_retained_branch_with(&foreign.observe(), prepared, || {
                calls += 1;
                Ok::<(), ReviewError>(())
            })
            .is_err()
    );
    assert_eq!(calls, 0);
    let prepared = prepare(&current, &source)?;
    current.set_access(&observed, ReviewAccess::ReadOnly)?;
    let after_policy = save(&current)?;
    assert!(
        current
            .commit_retained_branch_with(&current.observe(), prepared, || {
                calls += 1;
                Ok::<(), ReviewError>(())
            })
            .is_err()
    );
    assert_eq!(calls, 0);
    assert_eq!(save(&current)?, after_policy);
    let prepared = prepare(&current, &source)?;
    let (result, changed) =
        current.commit_retained_branch_with(&current.observe(), prepared, || {
            Ok::<_, ReviewError>("document committed")
        })?;
    assert_eq!(result, "document committed");
    assert!(changed);
    assert!(matches!(current.undo(&current.observe()), Err(ReviewError::Permission)));
    covered(&current, &source)?;
    Ok(())
}
#[test]
fn unknown_own_suffixes_and_forked_peer_events_are_not_reconstructed_from_saved_text() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let mut own = restart(&current)?;
    create(&mut own, "Unknown own history")?;
    let before = save(&current)?;
    assert!(matches!(prepare(&current, &own), Err(ReviewError::WriterCollision)));
    assert_eq!(save(&current)?, before);
    let mut source = restart(&current)?;
    let mut a = owner("z", "bob")?;
    let mut b = owner("z", "bob")?;
    create(&mut a, "A fork")?;
    create(&mut b, "B fork")?;
    receive(&mut current, &a, "z", "bob", ReviewAccess::Comment)?;
    receive(&mut source, &b, "z", "bob", ReviewAccess::Comment)?;
    let before = save(&current)?;
    assert!(matches!(prepare(&current, &source), Err(ReviewError::Fork)));
    assert_eq!(save(&current)?, before);
    Ok(())
}
#[test]
fn incomparable_immutable_generation_files_refuse_without_rewriting_either_branch() -> Result {
    let mut current = owner("middle", "alice")?;
    let thread = create(&mut current, "Common")?;
    current.enable_segmented_history_guarded(&current.observe(), "root".into(), "one".into())?;
    let mut source = source_with_peer(&current)?;
    edit(&mut current, &thread, "Own suffix")?;
    current.seal_history_generation_guarded(&current.observe(), "two".into())?;
    source.seal_history_generation_guarded(&source.observe(), "two".into())?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(prepare(&current, &source).is_err());
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    Ok(())
}
#[test]
fn wrong_principals_readonly_grants_and_unrelated_bindings_cannot_authorize_import() -> Result {
    let mut current = owner("middle", "alice")?;
    create(&mut current, "Common")?;
    let source = source_with_peer(&current)?;
    let before = save(&current)?;
    for role in [ReviewAccess::ReadOnly, ReviewAccess::Comment] {
        assert!(
            current
                .prepare_retained_branch_guarded(
                    &current.observe(),
                    &source,
                    &source.observe(),
                    8 * 1024 * 1024,
                    |id, principal| Ok(ReviewActorPolicy {
                        actor: id.actor().clone(),
                        principal: if role == ReviewAccess::Comment {
                            ReviewPrincipalId::try_new("impostor")?
                        } else {
                            principal.clone()
                        },
                        access: role
                    }),
                    |_| Ok(())
                )
                .is_err()
        );
        assert_eq!(save(&current)?, before);
    }
    let other = ReviewSession::new(
        ReviewBinding::new(
            &DocumentId::try_new("other-room")?,
            format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
        ),
        policy("middle", "alice", ReviewAccess::Comment)?,
    )?;
    assert!(prepare(&current, &other).is_err());
    assert_eq!(save(&current)?, before);
    Ok(())
}
