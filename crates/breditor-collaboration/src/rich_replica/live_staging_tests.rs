//! Exact ordinary live staging, independent cold replay, source isolation and deterministic work.
//! Replay counting is thread-local and test-only, never compiled into application Wasm.
use super::*;
use crate::anchor::Affinity;
use crate::rich_replica::{SharedRichProfile, actions::InsertText, selection::TextPoint};
use serde_json::json;
use std::cell::Cell;

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
thread_local! {static REPLAYS: Cell<usize> = const { Cell::new(0) };}
pub(super) fn note_replay() {
    REPLAYS.with(|count| count.set(count.get().saturating_add(1)));
}
fn replay_count() -> usize {
    REPLAYS.with(Cell::get)
}
fn owner(version: u32, standard: bool) -> Result<RichReplica> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/live-staging","version":1},"extensions":[]})
    .to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("unsupported test grammar".into()),
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/live-staging","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string();
    Ok(profile.create(&document, "101".into())?)
}
fn insert(offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset, text: text.into() })
}
fn saved(owner: &RichReplica) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        owner.typing_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}

#[test]
fn ordinary_non_reopening_staging_does_not_replay_and_has_exact_cold_future() -> Result {
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for natural in [false, true] {
                let mut live = owner(version, standard)?;
                if natural {
                    live.enable_typing_history_guarded(&live.observe()?)?;
                }
                live.apply(vec![insert(1, "A")])?;
                live.apply(vec![insert(2, "B")])?;
                assert!(live.undo()?);
                let before = saved(&live)?;
                let observation = live.observe()?;
                let frame = live.update_frame()?;
                let count = replay_count();
                let mut staged = live.staged()?;
                assert_eq!(
                    replay_count(),
                    count,
                    "ordinary live staging must not replay its journal"
                );
                assert_eq!(saved(&staged)?, before);
                assert_eq!(staged.update_frame()?, frame);
                assert_eq!(staged.doc.state_vv(), live.doc.state_vv());
                assert_eq!(staged.doc.oplog_vv(), live.doc.oplog_vv());
                assert!(!staged.replay_projections.has_source());
                // Cold admission remains the separate semantic replay oracle, not a live fork.
                let count = replay_count();
                let mut cold = RichReplica::from_journal_parts(
                    live.codec.clone(),
                    live.journal.clone(),
                    live.typing.as_ref().map(|history| history.joins.clone()),
                    false,
                )?;
                assert!(replay_count() > count);
                assert_eq!(saved(&cold)?, before);
                for redo in [true, false, true, false] {
                    assert_eq!(
                        if redo { staged.redo()? } else { staged.undo()? },
                        if redo { cold.redo()? } else { cold.undo()? }
                    );
                    assert_eq!(saved(&staged)?, saved(&cold)?);
                    assert_eq!(staged.view_json()?, cold.view_json()?);
                    assert_eq!(saved(&live)?, before);
                    live.check(&observation)?;
                }
                staged.apply(vec![insert(1, "independent")])?;
                cold.apply(vec![insert(1, "independent")])?;
                assert_eq!(saved(&staged)?, saved(&cold)?);
                assert_eq!(saved(&live)?, before);
                live.check(&observation)?;
            }
        }
    }
    Ok(())
}

#[test]
fn original_natural_group_reopening_keeps_its_explicit_semantic_replay_path() -> Result {
    let mut live = owner(3, true)?;
    live.enable_typing_history_guarded(&live.observe()?)?;
    let point = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
    live.set_selection(Some(&super::super::selection::Selection::TextRange {
        anchor: point.clone(),
        focus: point,
    }))?;
    live.insert_typing_text_guarded(&live.observe()?, "A", 1)?;
    let before = saved(&live)?;
    let count = replay_count();
    let staged = live.staged_for_typing(true)?;
    assert!(replay_count() > count, "an original untracked group must retain its replay path");
    assert_eq!(saved(&staged)?, before);
    assert_eq!(saved(&live)?, before);
    drop(staged);
    // The actual live owner retains its continuation; inspecting a private stage cannot end it.
    live.insert_typing_text_guarded(&live.observe()?, "B", 2)?;
    assert_eq!(live.undo_count(), 1);
    let mut cold = RichReplica::from_journal_parts(
        live.codec.clone(),
        live.journal.clone(),
        live.typing.as_ref().map(|history| history.joins.clone()),
        false,
    )?;
    for redo in [false, true] {
        assert_eq!(
            if redo { live.redo()? } else { live.undo()? },
            if redo { cold.redo()? } else { cold.undo()? }
        );
        assert_eq!(saved(&live)?, saved(&cold)?);
    }
    Ok(())
}

#[test]
fn readonly_and_failed_candidates_keep_the_original_owner_and_observation() -> Result {
    let mut live = owner(3, true)?;
    live.apply(vec![insert(1, "A")])?;
    let before = saved(&live)?;
    let observation = live.observe()?;
    assert!(live.apply(vec![insert(u32::MAX, "invalid")]).is_err());
    assert_eq!(saved(&live)?, before);
    live.check(&observation)?;
    live.set_read_only_guarded(&live.observe()?, true)?;
    let before = saved(&live)?;
    let observation = live.observe()?;
    let mut staged = live.staged()?;
    assert!(staged.apply(vec![insert(1, "refused")]).is_err());
    assert_eq!(saved(&staged)?, before);
    assert_eq!(saved(&live)?, before);
    live.check(&observation)?;
    Ok(())
}
