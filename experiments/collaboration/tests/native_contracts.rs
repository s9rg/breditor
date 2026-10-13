//! Executable checks of released Rust APIs, not assumptions from JS bindings.

use loro::{ExportMode, LoroDoc, UndoManager};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn replica(peer: u64) -> Result<LoroDoc, loro::LoroError> {
    let doc = LoroDoc::new();
    doc.set_peer_id(peer)?;
    Ok(doc)
}

fn exchange(left: &LoroDoc, right: &LoroDoc) -> TestResult {
    let left_updates = left.export(ExportMode::all_updates())?;
    let right_updates = right.export(ExportMode::all_updates())?;
    left.import(&right_updates)?;
    right.import(&left_updates)?;
    assert_eq!(left.get_deep_value(), right.get_deep_value());
    assert_eq!(left.oplog_vv(), right.oplog_vv());
    Ok(())
}

#[test]
fn concurrent_text_preserves_both_authors_and_duplicate_delivery_is_idempotent() -> TestResult {
    let a = replica(1)?;
    let b = replica(2)?;
    a.get_text("text").insert(0, "alpha")?;
    b.get_text("text").insert(0, "beta")?;
    a.commit();
    b.commit();
    exchange(&a, &b)?;
    let text = a.get_text("text").to_string();
    assert!(text.contains("alpha") && text.contains("beta"));
    let before = b.get_deep_value();
    b.import(&a.export(ExportMode::all_updates())?)?;
    assert_eq!(b.get_deep_value(), before);
    Ok(())
}

#[test]
fn local_undo_retains_a_concurrent_remote_insert() -> TestResult {
    let a = replica(11)?;
    let b = replica(12)?;
    let mut undo = UndoManager::new(&a);
    undo.set_merge_interval(0);
    a.get_text("text").insert(0, "local")?;
    b.get_text("text").insert(0, "remote")?;
    a.commit();
    b.commit();
    exchange(&a, &b)?;
    assert!(undo.undo()?);
    assert_eq!(a.get_text("text").to_string(), "remote");
    exchange(&a, &b)?;
    assert!(undo.redo()?);
    exchange(&a, &b)?;
    let text = a.get_text("text").to_string();
    assert!(text.contains("local") && text.contains("remote"));
    Ok(())
}

#[test]
fn imported_local_batch_can_reconstruct_an_explicit_undo_checkpoint() -> TestResult {
    let original = replica(21)?;
    let mut undo = UndoManager::new(&original);
    undo.set_merge_interval(0);
    original.get_text("text").insert(0, "restart")?;
    original.commit();
    let bytes = original.export(ExportMode::all_updates())?;

    let recovered = replica(21)?;
    let mut recovered_undo = UndoManager::new(&recovered);
    recovered_undo.set_merge_interval(0);
    recovered.import(&bytes)?;
    recovered_undo.record_new_checkpoint()?;
    assert_eq!(recovered.get_deep_value(), original.get_deep_value());
    assert!(recovered_undo.can_undo());
    assert!(recovered_undo.undo()?);
    assert!(undo.undo()?);
    assert_eq!(recovered.get_deep_value(), original.get_deep_value());
    assert_eq!(recovered.oplog_vv(), original.oplog_vv());
    assert!(recovered_undo.redo()?);
    assert!(undo.redo()?);
    assert_eq!(recovered.get_deep_value(), original.get_deep_value());
    assert_eq!(recovered.oplog_vv(), original.oplog_vv());
    Ok(())
}

#[test]
fn concurrent_creation_of_the_same_cell_body_keeps_both_texts() -> TestResult {
    let a = replica(31)?;
    let b = replica(32)?;
    let a_cell = a.get_map("cells").ensure_mergeable_map("table1:row1:column1")?;
    let b_cell = b.get_map("cells").ensure_mergeable_map("table1:row1:column1")?;
    a_cell.ensure_mergeable_text("body")?.insert(0, "first")?;
    b_cell.ensure_mergeable_text("body")?.insert(0, "second")?;
    a.commit();
    b.commit();
    exchange(&a, &b)?;
    let merged = a_cell.ensure_mergeable_text("body")?.to_string();
    assert!(merged.contains("first") && merged.contains("second"));
    assert_eq!(merged, b_cell.ensure_mergeable_text("body")?.to_string());
    let before = a.get_deep_value();
    exchange(&b, &a)?;
    assert_eq!(a.get_deep_value(), before);
    Ok(())
}

#[test]
fn a_moved_block_keeps_its_identity_and_concurrent_text() -> TestResult {
    let a = replica(41)?;
    let tree = a.get_tree("blocks");
    let parent = tree.create(None)?;
    let child = tree.create(None)?;
    tree.get_meta(child)?.ensure_mergeable_text("body")?.insert(0, "original")?;
    a.commit();
    let b = replica(42)?;
    b.import(&a.export(ExportMode::all_updates())?)?;
    tree.mov(child, parent)?;
    b.get_tree("blocks").get_meta(child)?.ensure_mergeable_text("body")?.insert(8, " edit")?;
    a.commit();
    b.commit();
    exchange(&a, &b)?;
    assert_eq!(tree.children(parent), Some(vec![child]));
    assert_eq!(b.get_tree("blocks").children(parent), Some(vec![child]));
    assert_eq!(tree.get_meta(child)?.ensure_mergeable_text("body")?.to_string(), "original edit");
    Ok(())
}

#[test]
fn grouped_table_and_image_metadata_undo_preserves_remote_metadata() -> TestResult {
    let a = replica(51)?;
    let b = replica(52)?;
    let mut undo = UndoManager::new(&a);
    undo.set_merge_interval(0);
    undo.group_start()?;
    a.get_map("column").insert("width", 240)?;
    a.commit();
    a.get_map("image").insert("asset", "asset-one")?;
    a.commit();
    undo.group_end();
    b.get_map("image").insert("alt", "remote description")?;
    b.commit();
    exchange(&a, &b)?;
    assert_eq!(undo.undo_count(), 1);
    assert!(undo.undo()?);
    assert!(a.get_map("column").get("width").is_none());
    assert!(a.get_map("image").get("asset").is_none());
    assert!(a.get_map("image").get("alt").is_some());
    exchange(&a, &b)?;
    assert!(undo.redo()?);
    exchange(&a, &b)?;
    assert!(a.get_map("column").get("width").is_some());
    assert!(a.get_map("image").get("asset").is_some());
    assert!(a.get_map("image").get("alt").is_some());
    Ok(())
}
