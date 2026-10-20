//! Observer sealing must never turn read-only state into document-writing authority.
use super::super::{ReviewedHistoryIdentity, RichReplica, SharedRichProfile};
use super::tests::{Result, cold, enable, equal, insert, setup};
use serde_json::json;

fn joined(
    version: u32,
    standard: bool,
    scope: u8,
    mask: u8,
) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let (profile, author) = setup(version, standard, scope, mask)?;
    let mut observer = profile.join_frame("room".into(), "202".into(), &author.update_frame()?)?;
    if scope == 1 {
        observer.enable_general_ranges_guarded(&observer.observe()?)?;
    }
    if scope == 2 {
        observer.enable_document_selection_guarded(&observer.observe()?)?;
    }
    if mask & 1 != 0 {
        observer.enable_typing_history_guarded(&observer.observe()?)?;
    }
    if mask & 2 != 0 {
        observer.enable_reviewed_history_guarded(
            &observer.observe()?,
            serde_json::from_value::<ReviewedHistoryIdentity>(json!({
                "binding":"a".repeat(64),"principal":"alice","effectWriter":"900"
            }))?,
        )?;
    }
    if mask & 4 != 0 {
        observer.enable_search_history_guarded(&observer.observe()?)?;
    }
    Ok((profile, author, observer))
}

#[test]
fn observer_seals_received_history_and_cold_replays_all_original_policies() -> Result {
    for version in 1..=3 {
        for standard in [false, true] {
            for scope in 0..=2 {
                for mask in 0..8 {
                    let (profile, mut author, mut observer) =
                        joined(version, standard, scope, mask)?;
                    enable(&mut observer)?;
                    observer.set_read_only_guarded(&observer.observe()?, true)?;
                    insert(&mut author, "remote ")?;
                    observer.receive_frame(&author.update_frame()?)?;
                    let oracle = observer.staged()?;
                    let before = observer.segmented_checkpoint()?;
                    assert!(
                        observer
                            .seal_history_segment_guarded(&observer.observe()?, "gen-2".into())
                            .is_err()
                    );
                    assert_eq!(before, observer.segmented_checkpoint()?);
                    observer.seal_observer_history_segment_guarded(
                        &observer.observe()?,
                        "gen-2".into(),
                    )?;
                    assert!(observer.is_read_only());
                    assert_eq!(observer.writer_clock_v2("202")?.through, "0");
                    equal(&oracle, &observer)?;
                    let mut restored = cold(&profile, &observer)?;
                    // Permission remains a live host responsibility, not a portable archive grant.
                    assert!(!restored.is_read_only());
                    restored.set_read_only_guarded(&restored.observe()?, true)?;
                    insert(&mut author, "later ")?;
                    restored.receive_frame(&author.update_frame()?)?;
                    restored.seal_observer_history_segment_guarded(
                        &restored.observe()?,
                        "gen-3".into(),
                    )?;
                    cold(&profile, &restored)?;
                    assert!(restored.is_read_only());
                    assert_eq!(restored.writer_clock_v2("202")?.through, "0");
                }
            }
        }
    }
    Ok(())
}

#[test]
fn observer_sealing_refuses_writable_and_previously_authored_owners_atomically() -> Result {
    let (_, mut author, mut observer) = joined(3, true, 2, 7)?;
    enable(&mut observer)?;
    insert(&mut author, "remote ")?;
    observer.receive_frame(&author.update_frame()?)?;
    let before = observer.segmented_checkpoint()?;
    assert!(
        observer
            .seal_observer_history_segment_guarded(&observer.observe()?, "gen-2".into())
            .is_err()
    );
    assert!(!observer.is_read_only());
    assert_eq!(before, observer.segmented_checkpoint()?);
    insert(&mut observer, "local ")?;
    assert!(observer.undo()?);
    observer.set_read_only_guarded(&observer.observe()?, true)?;
    let before = observer.segmented_checkpoint()?;
    assert_ne!(observer.writer_clock_v2("202")?.through, "0");
    assert!(
        observer
            .seal_observer_history_segment_guarded(&observer.observe()?, "gen-2".into())
            .is_err()
    );
    assert!(observer.is_read_only());
    assert_eq!(before, observer.segmented_checkpoint()?);
    Ok(())
}

#[test]
fn observer_sealing_preserves_stale_foreign_empty_and_generation_guards() -> Result {
    let (_, mut author, mut observer) = joined(3, true, 2, 7)?;
    observer.set_read_only_guarded(&observer.observe()?, true)?;
    assert!(
        observer
            .seal_observer_history_segment_guarded(&observer.observe()?, "gen-2".into())
            .is_err()
    );
    observer.set_read_only_guarded(&observer.observe()?, false)?;
    enable(&mut observer)?;
    let stale = observer.observe()?;
    observer.set_read_only_guarded(&stale, true)?;
    let before = observer.segmented_checkpoint()?;
    assert!(
        observer
            .seal_observer_history_segment_guarded(&observer.observe()?, "gen-2".into())
            .is_err()
    );
    assert_eq!(before, observer.segmented_checkpoint()?);
    insert(&mut author, "remote ")?;
    observer.receive_frame(&author.update_frame()?)?;
    let before = observer.segmented_checkpoint()?;
    for (guard, generation) in [
        (stale, "gen-2"),
        (author.observe()?, "gen-2"),
        (observer.observe()?, "gen-0"),
        (observer.observe()?, "gen-1"),
        (observer.observe()?, ""),
    ] {
        assert!(observer.seal_observer_history_segment_guarded(&guard, generation.into()).is_err());
        assert!(observer.is_read_only());
        assert_eq!(before, observer.segmented_checkpoint()?);
    }
    observer.seal_observer_history_segment_guarded(&observer.observe()?, "gen-2".into())?;
    insert(&mut author, "again ")?;
    observer.receive_frame(&author.update_frame()?)?;
    let before = observer.segmented_checkpoint()?;
    assert!(
        observer
            .seal_observer_history_segment_guarded(&observer.observe()?, "gen-1".into())
            .is_err()
    );
    assert_eq!(before, observer.segmented_checkpoint()?);
    Ok(())
}
