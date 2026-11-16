//! The budget must agree with canonical storage, including JSON escaping and continuation.
use super::{
    super::{
        ReviewError, ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    checkpoint_budget::{check_size, quoted_bytes},
    encode_segment::encode_active,
    tests::{Result, binding, policy},
};

fn add_thread(owner: &mut ReviewSession, cut: &str) -> Result {
    let anchor = serde_json::json!({
        "format": "breditor/shared-review-anchor",
        "formatVersion": 1,
        "document": "room",
        "schemaFingerprint": format!("sha256:{}", "0".repeat(64)),
        "anchors": {"kind": "document"},
    });
    owner.dispatch(
        &owner.observe(),
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor.to_string(),
            body: format!("{cut}: 日本語 🙂 \"quote\" and slash \\ and\na tab\t."),
        }),
    )?;
    Ok(())
}

fn check_exact_budget(owner: &ReviewSession, canonical: &str) -> Result {
    let state = owner.generations.as_ref().ok_or("missing review generations")?;
    let active = encode_active(owner)?;
    owner.check_generation_checkpoint_budget(state)?;
    check_size(state, &active, canonical.len())?;
    assert!(matches!(
        check_size(state, &active, canonical.len() - 1),
        Err(ReviewError::Limit("review history archive bytes"))
    ));
    Ok(())
}

#[test]
fn counts_actual_encoded_bytes_before_and_after_seals_continuation_and_restore() -> Result {
    for text in ["", "\"\\\r\n\t\u{0000}\u{001f}", "日本語 🙂"] {
        assert_eq!(quoted_bytes(text)?, serde_json::to_string(text)?.len());
    }

    let mut owner = ReviewSession::new(binding()?, policy()?)?;
    add_thread(&mut owner, "root")?;
    owner.enable_segmented_history_guarded(&owner.observe(), "root".into(), "first".into())?;
    for index in 0..3 {
        add_thread(&mut owner, "sealed")?;
        let canonical = owner.segmented_checkpoint_json()?;
        check_exact_budget(&owner, &canonical)?;
        let cold = ReviewSession::restore_segmented_json(&binding()?, policy()?, &canonical)?;
        check_exact_budget(&cold, &canonical)?;
        owner.seal_history_generation_guarded(&owner.observe(), format!("segment-{index}"))?;
    }

    owner.continue_history_guarded(&owner.observe(), "continued".into())?;
    add_thread(&mut owner, "active")?;
    owner.undo(&owner.observe())?;
    let canonical = owner.continued_checkpoint_json()?;
    check_exact_budget(&owner, &canonical)?;
    let mut cold = ReviewSession::restore_continued_json(&binding()?, policy()?, &canonical)?;
    check_exact_budget(&cold, &canonical)?;
    owner.redo(&owner.observe())?;
    cold.redo(&cold.observe())?;
    let canonical = owner.continued_checkpoint_json()?;
    assert_eq!(cold.continued_checkpoint_json()?, canonical);
    check_exact_budget(&cold, &canonical)
}
