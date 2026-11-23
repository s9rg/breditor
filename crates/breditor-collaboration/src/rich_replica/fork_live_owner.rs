//! Exact live native snapshot/history staging, never a cache substitute for cold semantic replay.
use super::super::{projection_cache::ProjectionCache, replay_projections::ReplayProjections};
use super::{RichReplica, history_metadata};
use crate::Error;
use std::sync::Arc;

impl RichReplica {
    pub(in crate::rich_replica) fn fork_live_owner(&self, leave_open: bool) -> Result<Self, Error> {
        self.fork_owner_through(leave_open, self.journal.entries.len())
    }

    pub(in crate::rich_replica) fn fork_owner_through(
        &self,
        leave_open: bool,
        admitted_entries: usize,
    ) -> Result<Self, Error> {
        let (doc, undo) = self.doc.fork_with_undo_for_staging(&self.undo)?;
        // The native snapshot covers applied operations only. Re-admit EVERY retained input,
        // including unresolved causal imports, before a candidate can publish anything.
        for bytes in self.journal.retained_updates_through(admitted_entries) {
            doc.import(bytes)?;
        }
        if doc.state_vv() != self.doc.state_vv() || doc.oplog_vv() != self.doc.oplog_vv() {
            return Err(Error::Contract("segmented staging changed retained causal state"));
        }
        let metadata = history_metadata::connect(&undo);
        *metadata.lock() = self.metadata.lock().clone();
        if leave_open {
            undo.reopen_last_group_for_staging()?;
        } else {
            undo.group_end();
        }
        let mut typing = self.typing.clone();
        if let Some(history) = &mut typing {
            history.continuation = None;
        }
        let mut candidate = Self {
            doc,
            undo,
            undo_limit: self.undo_limit,
            codec: self.codec.clone(),
            protocol: self.protocol,
            replay_contract: self.replay_contract,
            search_contract: self.search_contract,
            search_owner: Arc::clone(&self.search_owner),
            segmented: self.segmented.clone(),
            journal: self.journal.clone(),
            header: self.header.clone(),
            document: self.document.clone(),
            canonical: self.canonical.clone(),
            projection_cache: ProjectionCache::default(),
            replay_projections: ReplayProjections::default(),
            token: Arc::new(()),
            metadata,
            recipes: self.recipes.clone(),
            cursors: self.cursors.fork()?,
            history_keys: self.history_keys.clone(),
            typing,
            reviewed_contract: self.reviewed_contract,
            reviewed_history: self
                .reviewed_history
                .as_ref()
                .map(super::super::reviewed_history::ReviewedHistory::fork)
                .transpose()?,
            writer_windows: self.writer_windows.clone(),
            read_only: self.read_only,
            read_only_revision: self.read_only_revision.clone(),
            restricted: self.restricted.clone(),
        };
        // Fresh materialization/schema/UI/history/size admission still runs. Cold restore uses
        // the separate complete native replay path, providing an independent regression oracle.
        candidate.validate_adoption()?;
        if candidate.document_json() != self.document_json() {
            return Err(Error::Contract("segmented native staging projection differs"));
        }
        Ok(candidate)
    }
}
