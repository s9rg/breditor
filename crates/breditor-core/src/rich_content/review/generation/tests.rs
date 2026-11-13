//! Boundary laws use actual native events and the production admit/recovery paths.
use super::{
    super::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewBinding, ReviewError, ReviewEventId,
        ReviewPrincipalId, ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
        event::{self, Event, Payload},
        identity::Counter,
    },
    record::{MAX_ARCHIVE_BYTES, MAX_GENERATIONS, MAX_RETAINED_EVENTS, check_budget},
};
use crate::{rich_content::DocumentId, schema::SchemaFingerprint};
use std::collections::BTreeMap;
pub(super) type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

pub(super) fn binding() -> Result<ReviewBinding> {
    Ok(ReviewBinding::new(
        &DocumentId::try_new("room")?,
        format!("sha256:{}", "0".repeat(64)).parse::<SchemaFingerprint>()?,
    ))
}
pub(super) fn policy() -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new("101")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })
}

#[test]
fn separate_retained_limits_are_inclusive_and_do_not_widen_original_constants() {
    assert_eq!(event::MAX_EVENTS, 8192);
    assert_eq!(event::MAX_BYTES, 16 * 1024 * 1024);
    assert_eq!(MAX_GENERATIONS, 64);
    assert_eq!(MAX_RETAINED_EVENTS, 65_536);
    assert_eq!(MAX_ARCHIVE_BYTES, 64 * 1024 * 1024);
    assert!(check_budget(64, 65_536, false).is_ok());
    assert!(check_budget(65, 1, false).is_err());
    assert!(check_budget(2, 65_537, false).is_err());
}

#[test]
fn real_native_redo_crosses_the_old_event_ceiling_but_original_admission_still_refuses() -> Result {
    let mut owner = ReviewSession::new(binding()?, policy()?)?;
    let anchor = serde_json::json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    owner.dispatch(
        &owner.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Retained across the original ceiling".into(),
        }),
    )?;
    let target = owner.history[0].clone();
    // Construct one valid retained fixture efficiently, not 8,192 repeated full
    // checkpoint validations. Production restore/admit independently verifies it.
    for counter in 2..=u64::try_from(event::MAX_EVENTS)? {
        let previous = owner.events.last().ok_or("missing event")?;
        owner.events.push(Event {
            id: ReviewEventId::try_new(policy()?.actor, counter)?,
            principal: policy()?.principal,
            dependencies: BTreeMap::from([(policy()?.actor, Counter(counter - 1))]),
            previous_digest: event::digest(previous)?,
            payload: Payload::Visibility { target: target.clone(), visible: counter % 2 == 1 },
        });
    }
    owner.cursor = 0;
    let exact = owner.checkpoint_json()?;
    let mut original = ReviewSession::restore_json(&binding()?, policy()?, &exact)?;
    let guard = original.observe();
    assert!(matches!(original.redo(&guard), Err(ReviewError::Limit(_))));
    original.check(&guard)?;
    assert_eq!(original.checkpoint_json()?, exact);
    owner = ReviewSession::restore_json(&binding()?, policy()?, &exact)?;
    owner.enable_segmented_history_guarded(&owner.observe(), "root".into(), "one".into())?;
    owner.redo(&owner.observe())?;
    assert_eq!(owner.events.len(), event::MAX_EVENTS + 1);
    assert_eq!(owner.view()?.undo_depth, 1);
    owner.seal_history_generation_guarded(&owner.observe(), "two".into())?;
    let saved = owner.segmented_checkpoint_json()?;
    let mut cold = ReviewSession::restore_segmented_json(&binding()?, policy()?, &saved)?;
    assert_eq!(cold.segmented_checkpoint_json()?, saved);
    owner.undo(&owner.observe())?;
    cold.undo(&cold.observe())?;
    assert_eq!(cold.segmented_checkpoint_json()?, owner.segmented_checkpoint_json()?);
    assert_eq!(cold.local_writer_clock()?, owner.local_writer_clock()?);
    Ok(())
}

pub(super) fn birth_owner() -> Result<ReviewSession> {
    let mut owner = ReviewSession::new(binding()?, policy()?)?;
    let anchor = serde_json::json!({"format":"breditor/shared-review-anchor","formatVersion":1,"document":"room","schemaFingerprint":format!("sha256:{}", "0".repeat(64)),"anchors":{"kind":"document"}}).to_string();
    owner.dispatch(
        &owner.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Retained root".into(),
        }),
    )?;
    owner.enable_segmented_history_guarded(&owner.observe(), "root".into(), "one".into())?;
    Ok(owner)
}

fn append_fixture_visibility(owner: &mut ReviewSession, counter: u64) -> Result {
    let previous_digest = event::digest(owner.events.last().ok_or("missing event")?)?;
    owner.events.push(Event {
        id: ReviewEventId::try_new(owner.policy.actor.clone(), counter)?,
        principal: owner.policy.principal.clone(),
        dependencies: BTreeMap::from([(owner.policy.actor.clone(), Counter(counter - 1))]),
        previous_digest,
        payload: Payload::Visibility {
            target: owner.history[0].clone(),
            visible: counter % 2 == 1,
        },
    });
    owner.cursor = usize::from(counter % 2 == 1);
    Ok(())
}

#[test]
fn full_native_retained_capacity_cold_restores_and_refuses_one_more_without_eviction() -> Result {
    let mut owner = birth_owner()?;
    let mut seals = 0;
    for counter in 2..=u64::try_from(MAX_RETAINED_EVENTS)? {
        append_fixture_visibility(&mut owner, counter)?;
        let start = owner.generations.as_ref().ok_or("missing generations")?.active_start;
        if owner.events.len() - start == event::MAX_EVENTS {
            if seals == 0 {
                let guard = owner.observe();
                let exact = owner.segmented_checkpoint_json()?;
                assert!(matches!(
                    owner.undo(&guard),
                    Err(ReviewError::Limit("review generation events"))
                ));
                owner.check(&guard)?;
                assert_eq!(owner.segmented_checkpoint_json()?, exact);
            }
            seals += 1;
            owner.seal_history_generation_guarded(&owner.observe(), format!("next-{seals}"))?;
        }
    }
    owner.admit()?;
    let exact = owner.segmented_checkpoint_json()?;
    let guard = owner.observe();
    assert!(matches!(owner.redo(&guard), Err(ReviewError::Limit("events"))));
    owner.check(&guard)?;
    assert_eq!(owner.segmented_checkpoint_json()?, exact);
    let cold = ReviewSession::restore_segmented_json(&binding()?, policy()?, &exact)?;
    assert_eq!(cold.events.len(), MAX_RETAINED_EVENTS);
    assert_eq!(cold.segmented_checkpoint_json()?, exact);
    assert_eq!(cold.local_writer_clock()?, owner.local_writer_clock()?);
    assert_eq!(cold.view()?, owner.view()?);
    owner.continue_history_guarded(&guard, "after-event-ceiling".into())?;
    owner.redo(&owner.observe())?;
    assert_eq!(owner.events.len(), MAX_RETAINED_EVENTS + 1);
    owner.verify_recovery_origin_guarded(&owner.observe(), &cold, &cold.observe())?;
    let continued = owner.continued_checkpoint_json()?;
    let restored = ReviewSession::restore_continued_json(&binding()?, policy()?, &continued)?;
    assert_eq!(restored.local_writer_clock()?, owner.local_writer_clock()?);
    assert_eq!(restored.continued_checkpoint_json()?, continued);
    Ok(())
}

#[test]
fn actual_generation_count_exhaustion_retains_the_last_nonempty_active_suffix() -> Result {
    let mut owner = birth_owner()?;
    for index in 0..MAX_GENERATIONS - 2 {
        if index % 2 == 0 {
            owner.undo(&owner.observe())?;
        } else {
            owner.redo(&owner.observe())?;
        }
        owner.seal_history_generation_guarded(&owner.observe(), format!("generation-{index}"))?;
    }
    owner.undo(&owner.observe())?;
    let guard = owner.observe();
    let exact = owner.segmented_checkpoint_json()?;
    assert!(matches!(
        owner.seal_history_generation_guarded(&guard, "too-many".into()),
        Err(ReviewError::Limit("review history generations"))
    ));
    owner.check(&guard)?;
    assert_eq!(owner.segmented_checkpoint_json()?, exact);
    assert_eq!(
        ReviewSession::restore_segmented_json(&binding()?, policy()?, &exact)?
            .segmented_checkpoint_json()?,
        exact
    );
    Ok(())
}
