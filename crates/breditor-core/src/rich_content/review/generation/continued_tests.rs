//! Exact comment continuation, native actor counters, Undo/Redo and legacy refusal.
use super::{
    super::{ReviewAccess, ReviewError, ReviewSession},
    record::{CONTINUED_MAX_EVENTS, CONTINUED_MAX_GENERATIONS, MAX_GENERATIONS, check_budget},
    tests::{Result, binding, birth_owner, policy},
};
use serde_json::Value;

#[test]
fn continuation_seals_exact_v1_input_at_generation_capacity_and_keeps_future_history() -> Result {
    let mut owner = birth_owner()?;
    for index in 0..MAX_GENERATIONS - 2 {
        if index % 2 == 0 {
            owner.undo(&owner.observe())?;
        } else {
            owner.redo(&owner.observe())?;
        }
        owner.seal_history_generation_guarded(&owner.observe(), format!("v1-{index}"))?;
    }
    owner.undo(&owner.observe())?;
    let observed = owner.observe();
    let predecessor = owner.segmented_checkpoint_json()?;
    let before: Value = serde_json::from_str(&predecessor)?;
    let clock = owner.local_writer_clock()?;
    let view = owner.view()?;
    assert!(matches!(
        owner.seal_history_generation_guarded(&observed, "continued".into()),
        Err(ReviewError::Limit("review history generations"))
    ));
    owner.continue_history_guarded(&observed, "continued".into())?;
    assert!(owner.check(&observed).is_err());
    assert!(owner.segmented_checkpoint_json().is_err());
    assert_eq!(owner.local_writer_clock()?, clock);
    assert_eq!(owner.view()?, view);
    let saved = owner.continued_checkpoint_json()?;
    let encoded: Value = serde_json::from_str(&saved)?;
    assert_eq!(encoded["continuedAfter"], MAX_GENERATIONS - 1);
    assert_eq!(encoded["root"], before["root"]);
    let mut sealed = before["sealed"].as_array().ok_or("missing V1 seals")?.clone();
    sealed.push(before["active"].clone());
    assert_eq!(encoded["sealed"], Value::Array(sealed));
    assert!(ReviewSession::restore_segmented_json(&binding()?, policy()?, &saved).is_err());
    assert!(ReviewSession::restore_continued_json(&binding()?, policy()?, &predecessor).is_err());
    let mut cold = ReviewSession::restore_continued_json(&binding()?, policy()?, &saved)?;
    let v1 = ReviewSession::restore_segmented_json(&binding()?, policy()?, &predecessor)?;
    cold.verify_recovery_origin_guarded(&cold.observe(), &v1, &v1.observe())?;
    assert_eq!(cold.continued_checkpoint_json()?, saved);
    assert!(cold.continue_history_guarded(&cold.observe(), "duplicate".into()).is_err());
    for current in [&mut owner, &mut cold] {
        current.redo(&current.observe())?;
        current.seal_history_generation_guarded(&current.observe(), "after-redo".into())?;
        current.undo(&current.observe())?;
        current.redo(&current.observe())?;
    }
    assert_eq!(cold.continued_checkpoint_json()?, owner.continued_checkpoint_json()?);
    assert_eq!(cold.local_writer_clock()?, owner.local_writer_clock()?);
    assert!(check_budget(CONTINUED_MAX_GENERATIONS, CONTINUED_MAX_EVENTS, true).is_ok());
    assert!(check_budget(CONTINUED_MAX_GENERATIONS + 1, 1, true).is_err());
    assert!(check_budget(2, CONTINUED_MAX_EVENTS + 1, true).is_err());
    Ok(())
}

#[test]
fn read_only_continuation_keeps_permissions_and_the_exact_empty_v1_cut() -> Result {
    let mut owner = birth_owner()?;
    let predecessor = owner.segmented_checkpoint_json()?;
    let original = ReviewSession::restore_segmented_json(&binding()?, policy()?, &predecessor)?;
    assert!(owner.continue_read_only_history_guarded(&owner.observe(), "v2".into()).is_err());
    owner.set_access(&owner.observe(), ReviewAccess::ReadOnly)?;
    let guard = owner.observe();
    assert!(matches!(
        owner.continue_history_guarded(&guard, "v2".into()),
        Err(ReviewError::Permission)
    ));
    assert_eq!(owner.segmented_checkpoint_json()?, predecessor);
    owner.continue_read_only_history_guarded(&guard, "v2".into())?;
    let saved = owner.continued_checkpoint_json()?;
    assert!(matches!(owner.undo(&owner.observe()), Err(ReviewError::Permission)));
    let mut readonly = policy()?;
    readonly.access = ReviewAccess::ReadOnly;
    let cold = ReviewSession::restore_continued_json(&binding()?, readonly, &saved)?;
    cold.verify_recovery_origin_guarded(&cold.observe(), &original, &original.observe())?;
    let replaced = saved.replace("\"continuedAfter\":1", "\"continuedAfter\":0");
    assert_ne!(replaced, saved);
    assert!(ReviewSession::restore_continued_json(&binding()?, policy()?, &replaced).is_err());
    assert_eq!(cold.continued_checkpoint_json()?, saved);
    Ok(())
}
