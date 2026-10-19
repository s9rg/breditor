//! Editor-private applied-document staging with deeply independent native history rows.
use super::{Stack, UndoManager, UndoManagerInner, get_counter_end};
use crate::{LoroDoc, LoroError};
use loro_common::LoroResult;
use std::{collections::VecDeque, sync::Arc};

impl Stack {
    fn independent_fork(&self) -> Self {
        let stack = self
            .stack
            .iter()
            .map(|(items, remote)| {
                (items.clone(), Arc::new(crate::sync::Mutex::new(remote.lock().clone())))
            })
            .collect::<VecDeque<_>>();
        Self { stack, size: self.size }
    }
}
impl UndoManager {
    /// Fork an editor-private quiescent source's APPLIED document and native Undo/Redo stacks.
    /// The caller must serialize all access, including callbacks, across this operation.
    /// `source` must be this manager's actual document, attached with no uncommitted edits.
    /// Mutable stack rows, remote transforms and container remaps are independent; callbacks
    /// are deliberately absent and must be reconnected by the new editor owner.
    /// Rebuild from all published operations, not an arena snapshot: deleted text style
    /// provenance must remain available to future native Undo/Redo. Pending causal imports
    /// are NOT in the applied operation history: an editor retaining such
    /// inputs must re-admit them before publishing the candidate. This is staging, not a
    /// writer lease or permission to publish two concurrent branches of the same peer.
    pub fn fork_for_staging(&self, source: &LoroDoc) -> LoroResult<(LoroDoc, Self)> {
        if !Arc::ptr_eq(&self.doc.inner, &source.inner) {
            return Err(LoroError::Unknown(
                "native history fork requires its quiescent attached source".into(),
            ));
        }
        let lock = self.inner.lock();
        let original = lock
            .try_borrow_mut()
            .map_err(|_| LoroError::Unknown("native history fork is reentrant".into()))?;
        if original.processing_undo || original.paused {
            return Err(LoroError::Unknown(
                "native history fork cannot run during history work".into(),
            ));
        }
        if source.peer_id() != self.peer()
            || source.is_detached()
            || source.get_pending_txn_len() != 0
        {
            return Err(LoroError::Unknown(
                "native history fork requires its quiescent attached source".into(),
            ));
        }
        let copied = UndoManagerInner {
            next_counter: original.next_counter,
            undo_stack: original.undo_stack.independent_fork(),
            redo_stack: original.redo_stack.independent_fork(),
            processing_undo: false,
            paused: original.paused,
            last_undo_time: original.last_undo_time,
            merge_interval_in_ms: original.merge_interval_in_ms,
            max_stack_size: original.max_stack_size,
            exclude_origin_prefixes: original.exclude_origin_prefixes.clone(),
            last_popped_selection: original.last_popped_selection.clone(),
            on_push: None,
            on_pop: None,
            group: original.group.clone(),
            closed_group: original.closed_group.clone(),
            staging_groups: original.staging_groups,
        };
        let bytes = source.export(crate::encoding::ExportMode::all_updates())?;
        let doc = LoroDoc::new();
        doc.set_config(&source.config);
        // set_config/config_text_style copy named styles only. Retain the default too:
        // dynamic Breditor provenance keys depend on it during native Undo/Redo.
        *doc.config.text_style_config.write() = source.config.text_style_config.read().clone();
        *doc.config.deleted_root_containers.lock() =
            source.config.deleted_root_containers.lock().clone();
        doc.config.hide_empty_root_containers.store(
            source.config.hide_empty_root_containers.load(std::sync::atomic::Ordering::Relaxed),
            std::sync::atomic::Ordering::Relaxed,
        );
        doc.set_peer_id(self.peer())?;
        let imported = doc.import(&bytes)?;
        if imported.pending.is_some()
            || doc.state_vv() != source.state_vv()
            || doc.oplog_vv() != source.oplog_vv()
        {
            return Err(LoroError::Unknown("native history fork applied source differs".into()));
        }
        if source.auto_commit.load(std::sync::atomic::Ordering::Relaxed) {
            doc.start_auto_commit();
        }
        let manager = Self::new(&doc);
        *manager.inner.lock().borrow_mut() = copied;
        *manager.container_remap.lock() = self.container_remap.lock().clone();
        Ok((doc, manager))
    }

    /// Opt into retaining one exact closed-group witness for editor-private staging.
    /// Existing grouping behavior is unchanged; no operation, stack item or authority is created.
    pub fn enable_staging_group_tracking(&self) {
        self.inner.lock().borrow_mut().staging_groups = true;
    }

    /// Reopen only this manager's exact most recently closed group for serialized staging.
    /// No operation or new history item is created. A changed applied cut, counter end,
    /// top stack span, paused/reentrant state or missing closed-group witness rejects.
    /// This is not a request to merge arbitrary history or bypass host typing boundaries.
    pub fn reopen_last_group_for_staging(&self) -> LoroResult<()> {
        let lock = self.inner.lock();
        let mut inner = lock
            .try_borrow_mut()
            .map_err(|_| LoroError::Unknown("native group reopening is reentrant".into()))?;
        if !inner.staging_groups
            || inner.processing_undo
            || inner.paused
            || self.doc.get_pending_txn_len() != 0
        {
            return Err(LoroError::Unknown(
                "native group reopening requires quiescent history".into(),
            ));
        }
        if inner.group.is_some() {
            return Ok(());
        }
        let closed = inner
            .closed_group
            .as_ref()
            .ok_or_else(|| LoroError::Unknown("native closed group is missing".into()))?;
        let top = inner.undo_stack.stack.iter().rev().find_map(|(items, _)| items.back());
        if closed.through != get_counter_end(&self.doc, self.peer())
            || closed.at != self.doc.state_frontiers()
            || top.is_none_or(|item| {
                item.span.start != closed.group.start_counter || item.span.end != closed.through
            })
        {
            return Err(LoroError::Unknown(
                "native closed group no longer matches the current cut".into(),
            ));
        }
        inner.group = Some(closed.group.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn equal_versions_do_not_bind_a_different_document() -> LoroResult<()> {
        let source = LoroDoc::new_auto_commit();
        source.set_peer_id(101)?;
        let history = UndoManager::new(&source);
        let other = source.fork();
        other.set_peer_id(101)?;
        assert_eq!(source.state_vv(), other.state_vv());
        assert!(history.fork_for_staging(&other).is_err());
        Ok(())
    }
    #[test]
    fn pending_local_edits_refuse_without_committing_the_source() -> LoroResult<()> {
        let source = LoroDoc::new_auto_commit();
        source.set_peer_id(101)?;
        let history = UndoManager::new(&source);
        source.get_text("p").insert(0, "A")?;
        assert!(source.get_pending_txn_len() > 0);
        let before = source.get_pending_txn_len();
        assert!(history.fork_for_staging(&source).is_err());
        assert_eq!(source.get_pending_txn_len(), before);
        Ok(())
    }
    #[test]
    fn applied_fork_keeps_redo_and_mutable_rows_independent() -> LoroResult<()> {
        let source = LoroDoc::new_auto_commit();
        source.set_peer_id(101)?;
        source.config_default_text_style(Some(
            crate::container::richtext::config::StyleConfig::default(),
        ));
        let history = UndoManager::new(&source);
        history.set_merge_interval(i64::MIN);
        history.group_start()?;
        source.get_text("p").insert(0, "A")?;
        source.commit_then_renew();
        history.group_end();
        history.group_start()?;
        source.get_text("p").insert(1, "B")?;
        source.commit_then_renew();
        history.group_end();
        assert!(history.undo()?);
        let (doc, fork) = history.fork_for_staging(&source)?;
        assert!(
            doc.config
                .text_style_config
                .read()
                .get_style_flag(&"private_origin:test".into())
                .is_some()
        );
        assert_eq!(fork.undo_count(), history.undo_count());
        assert_eq!(fork.redo_count(), history.redo_count());
        {
            let a = history.inner.lock();
            let b = fork.inner.lock();
            let a = a.borrow();
            let b = b.borrow();
            assert!(!Arc::ptr_eq(
                &a.undo_stack.stack.back().unwrap().1,
                &b.undo_stack.stack.back().unwrap().1
            ));
            assert!(!Arc::ptr_eq(
                &a.redo_stack.stack.back().unwrap().1,
                &b.redo_stack.stack.back().unwrap().1
            ));
        }
        assert!(fork.redo()?);
        assert_eq!(doc.get_text("p").to_string(), "AB");
        assert_eq!(source.get_text("p").to_string(), "A");
        assert!(history.undo()?);
        assert_eq!(source.get_text("p").to_string(), "");
        assert_eq!(doc.get_text("p").to_string(), "AB");
        assert!(history.redo()?);
        assert_eq!(source.get_text("p").to_string(), "A");
        Ok(())
    }
}
