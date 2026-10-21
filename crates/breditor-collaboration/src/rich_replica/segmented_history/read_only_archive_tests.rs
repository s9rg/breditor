//! Passive archive boundaries preserve real former-author history and current policy.
use super::super::initial_read_only::InitialReadOnly;
use super::tests::{Result, cold, equal, insert, setup};

#[test]
fn all_144_native_policies_archive_nonzero_authors_without_a_temporary_unlock() -> Result {
    let mut cases = 0;
    for version in 1..=3 {
        for standard in [false, true] {
            for scope in 0..3 {
                for mask in 0..8 {
                    let (profile, mut a) = setup(version, standard, scope, mask)?;
                    let mut peer =
                        profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
                    insert(&mut a, "First ")?;
                    insert(&mut a, "Saved Redo ")?;
                    a.undo()?;
                    peer.receive_frame(&a.update_frame()?)?;
                    a.set_read_only_guarded(&a.observe()?, true)?;
                    let clock = a.writer_clock_v2("101")?;
                    assert_ne!(clock.through, "0");
                    let before = a.staged()?;
                    assert!(
                        a.enable_segmented_history_guarded(
                            &a.observe()?,
                            "root".into(),
                            "one".into()
                        )
                        .is_err()
                    );
                    a.enable_read_only_segmented_history_guarded(
                        &a.observe()?,
                        "root".into(),
                        "one".into(),
                    )?;
                    equal(&a, &before)?;
                    assert!(a.is_read_only());
                    insert(&mut peer, "Peer remains ")?;
                    a.receive_frame(&peer.update_frame()?)?;
                    let before = a.staged()?;
                    let original = a.segmented_checkpoint()?;
                    assert!(
                        a.seal_observer_history_segment_guarded(&a.observe()?, "two".into())
                            .is_err()
                    );
                    let stale = a.observe()?;
                    a.seal_read_only_history_segment_guarded(&stale, "two".into())?;
                    assert!(a.check(&stale).is_err());
                    assert!(a.is_read_only());
                    assert_eq!(a.writer_clock_v2("101")?, clock);
                    equal(&a, &before)?;
                    let files: serde_json::Value =
                        serde_json::from_str(&a.segmented_checkpoint()?)?;
                    let prior: serde_json::Value = serde_json::from_str(&original)?;
                    assert_eq!(files["rootCheckpoint"], prior["rootCheckpoint"]);
                    assert_eq!(files["sealed"][0], prior["active"]);
                    let mut restored = cold(&profile, &a)?;
                    // Same unpublished one-shot boundary used by normal application Wasm.
                    InitialReadOnly::new().initialize(&mut restored, true)?;
                    let exact = restored.segmented_checkpoint()?;
                    assert!(restored.redo_guarded(&restored.observe()?).is_err());
                    assert_eq!(restored.segmented_checkpoint()?, exact);
                    assert!(restored.is_read_only());
                    a.set_read_only_guarded(&a.observe()?, false)?;
                    restored.set_read_only_guarded(&restored.observe()?, false)?;
                    for redo in [true, false, true] {
                        let x = if redo { a.redo()? } else { a.undo()? };
                        let y = if redo { restored.redo()? } else { restored.undo()? };
                        assert_eq!(x, y);
                        assert_eq!(a.segmented_checkpoint()?, restored.segmented_checkpoint()?);
                        assert!(a.document_json().contains("Peer remains"));
                    }
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 144);
    Ok(())
}

#[test]
fn passive_archive_boundaries_preserve_original_policy_and_generation_refusals() -> Result {
    let (_, mut a) = setup(3, true, 2, 7)?;
    let before = a.search_checkpoint()?;
    assert!(
        a.enable_read_only_segmented_history_guarded(&a.observe()?, "root".into(), "one".into())
            .is_err()
    );
    assert_eq!(a.search_checkpoint()?, before);
    let stale = a.observe()?;
    a.set_read_only_guarded(&stale, true)?;
    assert!(
        a.enable_read_only_segmented_history_guarded(&stale, "root".into(), "one".into()).is_err()
    );
    let before = a.search_checkpoint()?;
    for (root, active) in [("same", "same"), ("", "one")] {
        assert!(
            a.enable_read_only_segmented_history_guarded(&a.observe()?, root.into(), active.into())
                .is_err()
        );
        assert_eq!(a.search_checkpoint()?, before);
    }
    a.enable_read_only_segmented_history_guarded(&a.observe()?, "root".into(), "one".into())?;
    let exact = a.segmented_checkpoint()?;
    assert!(a.seal_read_only_history_segment_guarded(&a.observe()?, "two".into()).is_err());
    assert_eq!(a.segmented_checkpoint()?, exact);
    assert!(a.is_read_only());
    Ok(())
}
