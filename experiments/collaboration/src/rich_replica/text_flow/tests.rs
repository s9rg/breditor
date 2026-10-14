//! Deterministic low-level scenarios; these are not a browser/coordinator integration claim.
use super::*;
use crate::{anchor::Affinity, rich_replica::model};
use loro::{ExportMode, LoroDoc, UndoManager};
use serde_json::json;
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn seed() -> Result<LoroDoc, crate::Error> {
    let doc = LoroDoc::new();
    doc.set_peer_id(11)?;
    configure(&doc);
    model::text(&doc, "a")?.push_str("ab🙂cd")?;
    model::text(&doc, "b")?.push_str("EF")?;
    model::text(&doc, "c")?.push_str("GH")?;
    prepare_root(&doc, "a")?;
    prepare_root(&doc, "b")?;
    prepare_root(&doc, "c")?;
    doc.commit();
    Ok(doc)
}
fn fork(doc: &LoroDoc, writer: u64) -> Result<LoroDoc, crate::Error> {
    let peer = LoroDoc::new();
    peer.set_peer_id(writer)?;
    configure(&peer);
    peer.import(&doc.export(ExportMode::all_updates())?)?;
    Ok(peer)
}
fn sync(a: &LoroDoc, b: &LoroDoc) -> Result<(), crate::Error> {
    a.import(&b.export(ExportMode::all_updates())?)?;
    b.import(&a.export(ExportMode::all_updates())?)?;
    Ok(())
}
fn split(doc: &LoroDoc, left: &str, offset: u32, right: &str) -> Result<(), crate::Error> {
    let plan = PreparedSplit::prepare(doc, left, offset, right)?;
    doc.commit();
    plan.apply(doc)?;
    doc.commit();
    Ok(())
}
fn join(doc: &LoroDoc, left: &str, right: &str) -> Result<(), crate::Error> {
    PreparedJoin::prepare(doc, left, right)?.apply(doc)?;
    doc.commit();
    Ok(())
}
fn text(doc: &LoroDoc, block: &str) -> Result<String, crate::Error> {
    Ok(view(doc, block)?.text())
}

#[test]
fn split_routes_original_characters_formats_and_carets_without_copying() -> TestResult {
    let doc = seed()?;
    let mark = json!({"type":"breditor/strong","properties":{}});
    set_format(&doc, "a", 2, 2, mark.clone(), true)?;
    doc.commit();
    let before = FlowAnchor::capture(&doc, "a", 2, Affinity::Before)?;
    let after = FlowAnchor::capture(&doc, "a", 2, Affinity::After)?;
    let tail = FlowAnchor::capture(&doc, "a", 4, Affinity::After)?;
    let source = model::text(&doc, "a")?.to_string();
    split(&doc, "a", 2, "right")?;
    assert_eq!(text(&doc, "a")?, "ab");
    assert_eq!(text(&doc, "right")?, "🙂cd");
    assert_eq!(view(&doc, "right")?.chunks[0].formats, vec![mark]);
    assert_eq!(model::text(&doc, "a")?.to_string(), source);
    assert_eq!(model::text(&doc, "right")?.to_string(), "");
    assert_eq!(before.resolve(&doc)?, ("a".into(), 2));
    assert_eq!(after.resolve(&doc)?, ("right".into(), 0));
    assert_eq!(tail.resolve(&doc)?, ("right".into(), 2));
    Ok(())
}

#[test]
fn offline_tail_insertion_and_format_follow_split_in_both_delivery_orders() -> TestResult {
    for reverse in [false, true] {
        let a = seed()?;
        let b = fork(&a, 22)?;
        split(&a, "a", 2, "right")?;
        insert(&b, "a", 4, Affinity::After, "X")?;
        b.commit();
        set_format(&b, "a", 2, 3, json!({"type":"breditor/emphasis","properties":{}}), true)?;
        b.commit();
        if reverse {
            sync(&b, &a)?;
        } else {
            sync(&a, &b)?;
        }
        assert_eq!(text(&a, "a")?, "ab");
        assert_eq!(text(&a, "right")?, "🙂Xcd");
        assert_eq!(view(&a, "right")?, view(&b, "right")?);
        assert!(
            view(&a, "right")?
                .chunks
                .iter()
                .filter(|chunk| chunk.text.contains('X'))
                .all(|chunk| !chunk.formats.is_empty())
        );
    }
    Ok(())
}

#[test]
fn offline_join_typing_retains_original_source_and_caret() -> TestResult {
    let a = seed()?;
    let b = fork(&a, 22)?;
    let caret = FlowAnchor::capture(&b, "b", 1, Affinity::After)?;
    join(&a, "a", "b")?;
    insert(&b, "b", 1, Affinity::After, "🙂")?;
    b.commit();
    sync(&a, &b)?;
    assert_eq!(text(&a, "a")?, "ab🙂cdE🙂F");
    assert_eq!(view(&a, "b")?.owner, "a");
    assert_eq!(caret.resolve(&a)?, ("a".into(), 9));
    assert_eq!(caret.source(), "b");
    assert_eq!(model::text(&a, "b")?.to_string(), "E🙂F");
    Ok(())
}

#[test]
fn split_and_reordered_join_never_assume_natural_source_order() -> TestResult {
    let doc = seed()?;
    split(&doc, "a", 4, "right")?;
    join(&doc, "right", "a")?;
    assert_eq!(text(&doc, "right")?, "cdab🙂");
    delete(&doc, "right", 1, 3)?;
    doc.commit();
    assert_eq!(text(&doc, "right")?, "c🙂");
    assert_eq!(model::text(&doc, "a")?.to_string(), "🙂c");
    Ok(())
}

#[test]
fn split_across_joined_roots_moves_following_subtrees_without_flattening() -> TestResult {
    let doc = seed()?;
    join(&doc, "a", "b")?;
    join(&doc, "a", "c")?;
    split(&doc, "a", 7, "right")?;
    assert_eq!(text(&doc, "a")?, "ab🙂cdE");
    assert_eq!(text(&doc, "right")?, "FGH");
    assert_eq!(view(&doc, "c")?.owner, "right");
    assert_eq!(view(&doc, "b")?.owner, "a");
    Ok(())
}

#[test]
fn deliberately_empty_left_and_right_can_type_without_leaking_to_other_paragraph() -> TestResult {
    for offset in [0, 6] {
        let doc = seed()?;
        split(&doc, "a", offset, "right")?;
        let left_before = text(&doc, "a")?;
        let right_before = text(&doc, "right")?;
        let left = FlowAnchor::capture(&doc, "a", 0, Affinity::Before)?;
        let right = FlowAnchor::capture(&doc, "right", 0, Affinity::After)?;
        insert(&doc, "a", 0, Affinity::Before, "L")?;
        doc.commit();
        insert(&doc, "right", 0, Affinity::After, "R")?;
        doc.commit();
        assert_eq!(text(&doc, "a")?, format!("L{left_before}"));
        assert_eq!(text(&doc, "right")?, format!("R{right_before}"));
        assert_eq!(left.resolve(&doc)?, ("a".into(), 0));
        assert_eq!(right.resolve(&doc)?, ("right".into(), 1));
    }
    Ok(())
}

#[test]
fn opposite_concurrent_joins_have_one_cycle_free_owner_without_losing_text() -> TestResult {
    let a = seed()?;
    let b = fork(&a, 22)?;
    join(&a, "a", "b")?;
    join(&b, "b", "a")?;
    sync(&a, &b)?;
    assert_eq!(view(&a, "a")?.owner, view(&a, "b")?.owner);
    let owner = view(&a, "a")?.owner;
    let text = text(&a, &owner)?;
    assert!(text == "ab🙂cdEF" || text == "EFab🙂cd");
    assert_eq!(view(&a, &owner)?, view(&b, &owner)?);
    Ok(())
}

#[test]
fn concurrent_chain_joins_keep_both_moves_and_deterministic_order() -> TestResult {
    let a = seed()?;
    let b = fork(&a, 22)?;
    join(&a, "a", "b")?;
    join(&b, "b", "c")?;
    sync(&a, &b)?;
    assert_eq!(text(&a, "a")?, "ab🙂cdEFGH");
    assert_eq!(view(&a, "c")?.owner, "a");
    Ok(())
}

#[test]
fn split_selective_undo_keeps_remote_typing_and_reactivates_original_routing() -> TestResult {
    let a = seed()?;
    let mut undo = UndoManager::new(&a);
    undo.set_merge_interval(0);
    undo.pause();
    let plan = PreparedSplit::prepare(&a, "a", 2, "right")?;
    a.commit();
    undo.resume();
    plan.apply(&a)?;
    a.commit();
    let b = fork(&a, 22)?;
    insert(&b, "right", 2, Affinity::After, "X")?;
    b.commit();
    a.import(&b.export(ExportMode::all_updates())?)?;
    assert_eq!(text(&a, "right")?, "🙂Xcd");
    undo.undo()?;
    assert_eq!(text(&a, "a")?, "ab🙂cd");
    // Remote insertion owns the observed right fragment. Undoing the cut must
    // not retract that insertion's ownership or erase its characters.
    assert_eq!(text(&a, "right")?, "X");
    undo.redo()?;
    assert_eq!(text(&a, "a")?, "ab");
    assert_eq!(text(&a, "right")?, "🙂Xcd");
    Ok(())
}

#[test]
fn invalid_half_scalar_and_stale_plans_do_not_write() -> TestResult {
    let doc = seed()?;
    let before = doc.export(ExportMode::all_updates())?;
    assert!(PreparedSplit::prepare(&doc, "a", 3, "right").is_err());
    assert!(delete(&doc, "a", 1, 2).is_err());
    assert!(delete(&doc, "a", 3, 0).is_err());
    assert!(insert(&doc, "a", 3, Affinity::After, "bad").is_err());
    assert_eq!(doc.export(ExportMode::all_updates())?, before);
    let plan = PreparedJoin::prepare(&doc, "a", "b")?;
    insert(&doc, "a", 0, Affinity::After, "Q")?;
    doc.commit();
    let before = doc.export(ExportMode::all_updates())?;
    assert!(plan.apply(&doc).is_err());
    assert_eq!(doc.export(ExportMode::all_updates())?, before);
    Ok(())
}

#[test]
fn reload_preserves_fragment_sources_and_anchor_contract() -> TestResult {
    let doc = seed()?;
    split(&doc, "a", 4, "right")?;
    join(&doc, "right", "b")?;
    let anchor = FlowAnchor::capture(&doc, "right", 3, Affinity::Before)?;
    let restored = fork(&doc, 33)?;
    let anchor: FlowAnchor = serde_json::from_str(&serde_json::to_string(&anchor)?)?;
    assert_eq!(view(&doc, "right")?, view(&restored, "right")?);
    assert_eq!(anchor.resolve(&doc)?, anchor.resolve(&restored)?);
    Ok(())
}

#[test]
fn causal_end_cut_moves_only_unobserved_after_carets_and_undo_retracts_it() -> TestResult {
    let doc = seed()?;
    let before = FlowAnchor::capture(&doc, "a", 6, Affinity::Before)?;
    let after = FlowAnchor::capture(&doc, "a", 6, Affinity::After)?;
    let mut undo = UndoManager::new(&doc);
    undo.set_merge_interval(0);
    undo.pause();
    let split = PreparedSplit::prepare(&doc, "a", 6, "right")?;
    doc.commit();
    undo.resume();
    split.apply(&doc)?;
    doc.commit();
    let clicked = FlowAnchor::capture(&doc, "a", 6, Affinity::After)?;
    assert_eq!(before.resolve(&doc)?, ("a".into(), 6));
    assert_eq!(after.resolve(&doc)?, ("right".into(), 0));
    assert_eq!(clicked.resolve(&doc)?, ("a".into(), 6));
    undo.undo()?;
    assert_eq!(after.resolve(&doc)?, ("a".into(), 6));
    undo.redo()?;
    assert_eq!(after.resolve(&doc)?, ("right".into(), 0));
    assert_eq!(clicked.resolve(&doc)?, ("a".into(), 6));
    Ok(())
}

#[test]
fn observed_left_end_stays_left_while_unobserved_original_end_follows_right_typing() -> TestResult {
    for cut in [2, 6] {
        let doc = seed()?;
        let original_end = FlowAnchor::capture(&doc, "a", 6, Affinity::After)?;
        split(&doc, "a", cut, "right")?;
        let clicked_left_end = FlowAnchor::capture(&doc, "a", cut, Affinity::After)?;
        assert_eq!(clicked_left_end.resolve(&doc)?, ("a".into(), cut));
        assert_eq!(original_end.resolve(&doc)?, ("right".into(), 6 - cut));
        insert(&doc, "right", 0, Affinity::After, "R")?;
        doc.commit();
        assert_eq!(clicked_left_end.resolve(&doc)?, ("a".into(), cut));
        assert_eq!(original_end.resolve(&doc)?, ("right".into(), 7 - cut));
        insert(&doc, "a", cut, Affinity::After, "L")?;
        doc.commit();
        assert_eq!(clicked_left_end.resolve(&doc)?, ("a".into(), cut + 1));
        assert_eq!(original_end.resolve(&doc)?, ("right".into(), 7 - cut));
    }
    Ok(())
}

#[test]
fn concurrent_cuts_converge_and_carets_keep_their_original_characters() -> TestResult {
    for reverse in [false, true] {
        let a = seed()?;
        let b = fork(&a, 22)?;
        let emoji = FlowAnchor::capture(&a, "a", 2, Affinity::After)?;
        let suffix = FlowAnchor::capture(&a, "a", 4, Affinity::After)?;
        split(&a, "a", 2, "right-a")?;
        split(&b, "a", 4, "right-b")?;
        if reverse {
            sync(&b, &a)?;
        } else {
            sync(&a, &b)?;
        }
        for block in ["a", "right-a", "right-b"] {
            assert_eq!(view(&a, block)?, view(&b, block)?);
        }
        assert_eq!(text(&a, "a")?, "ab");
        assert_eq!(text(&a, "right-a")?, "🙂");
        assert_eq!(text(&a, "right-b")?, "cd");
        assert_eq!(emoji.resolve(&a)?, ("right-a".into(), 0));
        assert_eq!(suffix.resolve(&a)?, ("right-b".into(), 0));
        assert_eq!(model::text(&a, "a")?.to_string(), "ab🙂cd");
    }
    Ok(())
}

#[test]
fn observed_seam_typing_is_explicit_for_both_affinities() -> TestResult {
    let doc = seed()?;
    split(&doc, "a", 2, "right")?;
    insert(&doc, "a", 2, Affinity::Before, "L")?;
    doc.commit();
    insert(&doc, "right", 0, Affinity::After, "R")?;
    doc.commit();
    assert_eq!(text(&doc, "a")?, "abL");
    assert_eq!(text(&doc, "right")?, "R🙂cd");
    let remote = fork(&doc, 22)?;
    insert(&remote, "right", 0, Affinity::Before, "P")?;
    remote.commit();
    insert(&doc, "a", 3, Affinity::After, "Q")?;
    doc.commit();
    sync(&doc, &remote)?;
    assert_eq!(text(&doc, "a")?, "abLQ");
    assert_eq!(text(&doc, "right")?, "PR🙂cd");
    Ok(())
}

#[test]
fn format_and_delete_cross_distinct_sources_in_one_native_history_group() -> TestResult {
    let doc = seed()?;
    join(&doc, "a", "b")?;
    let mut undo = UndoManager::new(&doc);
    undo.set_merge_interval(0);
    undo.group_start()?;
    set_format(&doc, "a", 4, 3, json!({"type":"breditor/strong","properties":{}}), true)?;
    doc.commit();
    delete(&doc, "a", 5, 2)?;
    doc.commit();
    undo.group_end();
    assert_eq!(text(&doc, "a")?, "ab🙂cF");
    assert!(
        view(&doc, "a")?.chunks.iter().any(|chunk| chunk.text == "c" && !chunk.formats.is_empty())
    );
    undo.undo()?;
    assert_eq!(text(&doc, "a")?, "ab🙂cdEF");
    assert!(view(&doc, "a")?.chunks.iter().all(|chunk| chunk.formats.is_empty()));
    undo.redo()?;
    assert_eq!(text(&doc, "a")?, "ab🙂cF");
    Ok(())
}

#[test]
fn empty_source_split_has_real_causal_cut_history_without_a_fake_character() -> TestResult {
    let doc = seed()?;
    model::text(&doc, "empty")?;
    prepare_root(&doc, "empty")?;
    doc.commit();
    let before = FlowAnchor::capture(&doc, "empty", 0, Affinity::Before)?;
    let after = FlowAnchor::capture(&doc, "empty", 0, Affinity::After)?;
    split(&doc, "empty", 0, "empty-right")?;
    assert_eq!(before.resolve(&doc)?, ("empty".into(), 0));
    assert_eq!(after.resolve(&doc)?, ("empty-right".into(), 0));
    assert_eq!(model::text(&doc, "empty")?.to_string(), "");
    insert(&doc, "empty-right", 0, Affinity::After, "🙂")?;
    doc.commit();
    assert_eq!(text(&doc, "empty")?, "");
    assert_eq!(text(&doc, "empty-right")?, "🙂");
    Ok(())
}

#[test]
fn every_scalar_cut_rejoins_without_recreating_text_or_moving_caret_identity() -> TestResult {
    for offset in [0, 1, 2, 4, 5, 6] {
        let doc = seed()?;
        let anchor = FlowAnchor::capture(&doc, "a", offset, Affinity::After)?;
        split(&doc, "a", offset, "right")?;
        join(&doc, "a", "right")?;
        assert_eq!(text(&doc, "a")?, "ab🙂cd");
        assert_eq!(model::text(&doc, "a")?.to_string(), "ab🙂cd");
        assert_eq!(model::text(&doc, "right")?.to_string(), "");
        assert_eq!(anchor.resolve(&doc)?, ("a".into(), offset));
    }
    Ok(())
}

#[test]
fn deleting_every_character_retains_a_resolvable_empty_fragment_caret() -> TestResult {
    let doc = seed()?;
    let caret = FlowAnchor::capture(&doc, "a", 2, Affinity::After)?;
    delete(&doc, "a", 0, 6)?;
    doc.commit();
    assert_eq!(caret.resolve(&doc)?, ("a".into(), 0));
    insert(&doc, "a", 0, Affinity::After, "New🙂")?;
    doc.commit();
    assert_eq!(text(&doc, "a")?, "New🙂");
    Ok(())
}

#[test]
fn concurrent_canonical_root_activation_is_idempotent_and_reads_are_pure() -> TestResult {
    let seed = LoroDoc::new();
    seed.set_peer_id(11)?;
    configure(&seed);
    model::text(&seed, "a")?.push_str("A")?;
    seed.commit();
    let peer = fork(&seed, 22)?;
    prepare_root(&seed, "a")?;
    seed.commit();
    prepare_root(&peer, "a")?;
    peer.commit();
    sync(&seed, &peer)?;
    assert_eq!(text(&seed, "a")?, "A");
    insert(&seed, "a", 0, Affinity::Before, "P")?;
    seed.commit();
    assert_eq!(text(&seed, "a")?, "PA");
    let before = seed.export(ExportMode::all_updates())?;
    let anchor = FlowAnchor::capture(&seed, "a", 1, Affinity::After)?;
    anchor.resolve(&seed)?;
    view(&seed, "a")?;
    assert_eq!(seed.export(ExportMode::all_updates())?, before);
    Ok(())
}

#[test]
fn native_wasm_fixture_scenarios_are_closed_and_generate_complete_restored_views() -> TestResult {
    for scenario in fixture::SCENARIOS {
        let value: serde_json::Value = serde_json::from_str(&fixture::exercise(scenario)?)?;
        assert_eq!(value["views"], value["restored"]);
        assert_eq!(value["scenario"], scenario);
    }
    assert!(fixture::exercise("not-a-scenario").is_err());
    Ok(())
}
