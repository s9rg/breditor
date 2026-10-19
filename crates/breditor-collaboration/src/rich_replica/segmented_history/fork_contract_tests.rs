//! Public native integration tests under the producer's existing locked dependency graph.
use loro::{ExportMode, LoroDoc, StyleConfig};
use loro_internal::UndoManager;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
type Result = std::result::Result<(), Box<dyn std::error::Error>>;

fn source() -> std::result::Result<LoroDoc, loro::LoroError> {
    let doc = LoroDoc::new();
    doc.set_peer_id(101)?;
    Ok(doc)
}
#[test]
fn native_history_fork_requires_its_actual_document_not_equal_versions() -> Result {
    let doc = source()?;
    let history = UndoManager::new(doc.inner());
    let other = doc.fork();
    other.set_peer_id(101)?;
    assert_eq!(doc.oplog_vv(), other.oplog_vv());
    assert!(other.fork_with_undo_for_staging(&history).is_err());
    assert_eq!(doc.oplog_vv(), other.oplog_vv());
    Ok(())
}
#[test]
fn native_history_fork_refuses_pending_and_paused_sources_without_committing() -> Result {
    let doc = source()?;
    let history = UndoManager::new(doc.inner());
    doc.get_text("p").insert(0, "A")?;
    let before = doc.get_pending_txn_len();
    assert!(before > 0);
    assert!(doc.fork_with_undo_for_staging(&history).is_err());
    assert_eq!(doc.get_pending_txn_len(), before);
    doc.commit();
    history.pause();
    let before = doc.oplog_vv();
    assert!(doc.fork_with_undo_for_staging(&history).is_err());
    assert_eq!(doc.oplog_vv(), before);
    history.resume();
    Ok(())
}
#[test]
fn native_fork_keeps_default_styles_and_exact_future_redo_operations() -> Result {
    let doc = source()?;
    doc.config_default_text_style(Some(StyleConfig::default()));
    let history = UndoManager::new(doc.inner());
    history.set_merge_interval(i64::MIN);
    history.group_start()?;
    let text = doc.get_text("p");
    text.insert(0, "X")?;
    text.mark(0..1, "private_origin:test", false)?;
    doc.commit();
    history.group_end();
    assert!(history.undo()?);
    let (fork, copy) = doc.fork_with_undo_for_staging(&history)?;
    assert!(
        fork.config()
            .text_style_config()
            .read()
            .get_style_flag(&"private_origin:test".into())
            .is_some()
    );
    let before = doc.oplog_vv();
    assert!(history.redo()?);
    assert!(copy.redo()?);
    assert_eq!(doc.oplog_vv(), fork.oplog_vv());
    assert_eq!(
        serde_json::to_value(
            doc.export_json_updates_without_peer_compression(&before, &doc.oplog_vv())
        )?,
        serde_json::to_value(
            fork.export_json_updates_without_peer_compression(&before, &fork.oplog_vv())
        )?
    );
    Ok(())
}
#[test]
fn native_remote_transform_rows_and_redo_are_independent_after_fork() -> Result {
    let doc = source()?;
    doc.get_text("p").insert(0, "ab")?;
    doc.commit();
    let history = UndoManager::new(doc.inner());
    history.set_merge_interval(i64::MIN);
    history.enable_staging_group_tracking();
    history.group_start()?;
    doc.get_text("p").insert(1, "L")?;
    doc.commit();
    history.group_end();
    let (fork, copy) = doc.fork_with_undo_for_staging(&history)?;
    let peer = doc.fork();
    peer.set_peer_id(202)?;
    peer.get_text("p").insert(0, "P")?;
    peer.commit();
    fork.import(&peer.export(ExportMode::all_updates())?)?;
    assert!(copy.reopen_last_group_for_staging().is_err());
    assert!(copy.undo()?);
    assert_eq!(fork.get_text("p").to_string(), "Pab");
    assert_eq!(doc.get_text("p").to_string(), "aLb");
    assert!(history.undo()?);
    assert_eq!(doc.get_text("p").to_string(), "ab");
    assert_eq!(fork.get_text("p").to_string(), "Pab");
    assert!(copy.redo()?);
    assert_eq!(doc.get_text("p").to_string(), "ab");
    Ok(())
}
#[test]
fn native_closed_group_reopens_only_under_explicit_tracking_and_exact_cut() -> Result {
    let doc = source()?;
    let history = UndoManager::new(doc.inner());
    history.set_merge_interval(i64::MIN);
    assert!(history.reopen_last_group_for_staging().is_err());
    history.enable_staging_group_tracking();
    history.group_start()?;
    doc.get_text("p").insert(0, "A")?;
    doc.commit();
    history.group_end();
    let (fork, copy) = doc.fork_with_undo_for_staging(&history)?;
    copy.reopen_last_group_for_staging()?;
    fork.get_text("p").insert(1, "B")?;
    fork.commit();
    copy.group_end();
    assert_eq!(copy.undo_count(), 1);
    assert!(copy.undo()?);
    assert_eq!(fork.get_text("p").to_string(), "");
    assert_eq!(doc.get_text("p").to_string(), "A");
    assert!(history.undo()?);
    assert_eq!(doc.get_text("p").to_string(), "");
    Ok(())
}
#[test]
fn native_reentrant_history_fork_refuses_before_reading_mutable_document_state() -> Result {
    let doc = source()?;
    let history = Arc::new(UndoManager::new(doc.inner()));
    let weak = Arc::downgrade(&history);
    let observed = Arc::new(AtomicUsize::new(0));
    let seen = Arc::clone(&observed);
    let callback_doc = doc.clone();
    history.set_on_push(Some(Box::new(move |_, _, _| {
        let owner = weak.upgrade().unwrap();
        assert!(callback_doc.fork_with_undo_for_staging(&owner).is_err());
        seen.fetch_add(1, Ordering::SeqCst);
        loro::UndoItemMeta::new()
    })));
    doc.get_text("p").insert(0, "A")?;
    doc.commit();
    history.set_on_push(None);
    assert_eq!(observed.load(Ordering::SeqCst), 1);
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo()?);
    assert_eq!(doc.get_text("p").to_string(), "");
    Ok(())
}
