//! Ordered command ownership journal, staged adoption and selective history.
//!
//! Every candidate is reconstructed with its original writer before mutation.
//! This intentionally favors provable failure isolation over throughput during
//! feasibility. It is not an approved production persistence/compaction design.

use crate::{
    Error,
    actions::{Command, validate_id},
    anchor::{Affinity, TextAnchor, TextRange},
};
use loro::{
    ContainerID, ContainerType, ExportMode, LoroDoc, StyleConfig, ToJson, UndoItemMeta,
    UndoManager, VersionVector, sync::Mutex,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const JOURNAL_VERSION: u32 = 1;
const MAX_ENTRIES: usize = 1000;
const MAX_JOURNAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_UPDATE_BYTES: usize = 1024 * 1024;
const MAX_VIEW_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    version: u32,
    document: String,
    writer: String,
    entries: Vec<Entry>,
    selection: Option<TextRange>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Entry {
    Local {
        commands: Vec<Command>,
        before_selection: Option<TextRange>,
        expected: serde_json::Value,
    },
    Remote {
        bytes: Vec<u8>,
    },
    Undo {
        changed: bool,
        before_selection: Option<TextRange>,
        after_selection: Option<TextRange>,
        expected: serde_json::Value,
    },
    Redo {
        changed: bool,
        before_selection: Option<TextRange>,
        after_selection: Option<TextRange>,
        expected: serde_json::Value,
    },
}

#[derive(Default)]
struct HistoryMetadata {
    push: UndoItemMeta,
    popped: Vec<UndoItemMeta>,
}

/// A serialized probe state with one exclusively owned writer and local history.
///
/// Remote author authentication remains the reference server's responsibility.
/// Writer-collision checks here are causal ownership checks, not authentication.
pub struct Session {
    doc: LoroDoc,
    undo: UndoManager,
    journal: Journal,
    metadata: Arc<Mutex<HistoryMetadata>>,
    snapshot: serde_json::Value,
}

fn writer_id(value: &str) -> Result<u64, Error> {
    let writer = value.parse::<u64>().map_err(|_| Error::Contract("writer ID"))?;
    if writer == 0 || writer == u64::MAX || writer.to_string() != value {
        return Err(Error::Contract("canonical nonzero writer ID"));
    }
    Ok(writer)
}

fn effects(doc: &LoroDoc, before: &VersionVector) -> Result<serde_json::Value, Error> {
    Ok(serde_json::to_value(
        doc.export_json_updates_without_peer_compression(before, &doc.oplog_vv()),
    )?)
}

impl Session {
    /// Create the probe. The host must allocate and exclusively lease the writer.
    ///
    /// # Errors
    /// Rejects invalid identities or initialization rejected by the engine.
    pub fn new(document: String, writer: String) -> Result<Self, Error> {
        validate_id(&document)?;
        let doc = LoroDoc::new();
        doc.set_peer_id(writer_id(&writer)?)?;
        doc.set_record_timestamp(false);
        doc.config_default_text_style(Some(StyleConfig::default()));
        doc.get_text("body");
        doc.get_map("cells");
        doc.get_map("columns");
        doc.get_map("images");
        let mut snapshot = doc.get_deep_value().to_json_value();
        crate::text_projection::decorate(&doc, &mut snapshot)?;
        let mut undo = UndoManager::new(&doc);
        undo.set_merge_interval(0);
        undo.set_max_undo_steps(MAX_ENTRIES);
        let metadata = Arc::new(Mutex::new(HistoryMetadata::default()));
        let push = Arc::clone(&metadata);
        let pop = Arc::clone(&metadata);
        undo.set_on_push(Some(Box::new(move |_, _, _| push.lock().push.clone())));
        undo.set_on_pop(Some(Box::new(move |_, _, meta| pop.lock().popped.push(meta))));
        Ok(Self {
            doc,
            undo,
            journal: Journal {
                version: JOURNAL_VERSION,
                document,
                writer,
                entries: vec![],
                selection: None,
            },
            metadata,
            snapshot,
        })
    }

    /// Atomically author one logical action with ordered steps and one undo entry.
    ///
    /// # Errors
    /// Any invalid step, replay mismatch or exceeded budget preserves the complete
    /// published document, causal state, journal and history owner.
    pub fn apply(&mut self, commands: Vec<Command>) -> Result<(), Error> {
        let mut candidate = Self::from_journal(self.journal.clone())?;
        let before = candidate.doc.oplog_vv();
        let before_selection = candidate.journal.selection.clone();
        candidate.execute(&commands)?;
        if candidate.doc.oplog_vv() == before {
            return Ok(());
        }
        let expected = effects(&candidate.doc, &before)?;
        candidate.journal.entries.push(Entry::Local { commands, before_selection, expected });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(())
    }

    fn execute(&mut self, commands: &[Command]) -> Result<(), Error> {
        if commands.is_empty() || commands.len() > 64 {
            return Err(Error::Limit("logical action steps"));
        }
        self.undo.pause();
        for command in commands {
            command.prepare(&self.doc)?;
        }
        self.doc.commit();
        self.undo.resume();
        self.prepare_history_metadata()?;
        let stamp = crate::register::Stamp::next(&self.doc)?;
        self.undo.group_start()?;
        for command in commands {
            command.apply(&self.doc, stamp)?;
        }
        self.doc.commit();
        self.undo.group_end();
        Ok(())
    }

    /// Stage an opaque engine update from an already-authorized transport.
    ///
    /// # Errors
    /// Rejects malformed/oversized data, this writer's new remote counters, and
    /// unsupported probe root containers before publishing any imported effects.
    pub fn receive(&mut self, bytes: Vec<u8>) -> Result<(), Error> {
        if bytes.is_empty() || bytes.len() > MAX_UPDATE_BYTES {
            return Err(Error::Limit("update bytes"));
        }
        if self
            .journal
            .entries
            .iter()
            .any(|entry| matches!(entry, Entry::Remote { bytes: recorded } if recorded == &bytes))
        {
            return Ok(());
        }
        let mut candidate = Self::from_journal(self.journal.clone())?;
        candidate.import(&bytes)?;
        // Keep causally pending imports even when the visible version is unchanged.
        candidate.journal.entries.push(Entry::Remote { bytes });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(())
    }

    fn import(&mut self, bytes: &[u8]) -> Result<(), Error> {
        let metadata = LoroDoc::decode_import_blob_meta(bytes, true)?;
        let writer = writer_id(&self.journal.writer)?;
        let known = self.doc.oplog_vv().get(&writer).copied().unwrap_or(0);
        if metadata.partial_end_vv.get(&writer).copied().unwrap_or(0) > known {
            return Err(Error::WriterCollision);
        }
        self.doc.import(bytes)?;
        Ok(())
    }

    /// Undo only this writer's last action, preserving imported changes.
    ///
    /// # Errors
    /// Replay, engine or budget failure does not replace the live session.
    pub fn undo(&mut self) -> Result<bool, Error> {
        self.history(false)
    }

    /// Redo this writer's selective effect against the current shared content.
    ///
    /// # Errors
    /// Replay, engine or budget failure does not replace the live session.
    pub fn redo(&mut self) -> Result<bool, Error> {
        self.history(true)
    }

    fn history(&mut self, redo: bool) -> Result<bool, Error> {
        let mut candidate = Self::from_journal(self.journal.clone())?;
        let before = candidate.doc.oplog_vv();
        let before_selection = candidate.journal.selection.clone();
        let counts = (candidate.undo_count(), candidate.redo_count());
        let changed = candidate.perform_history(redo)?;
        if !changed && counts == (candidate.undo_count(), candidate.redo_count()) {
            return Ok(false);
        }
        let expected = effects(&candidate.doc, &before)?;
        let after_selection = candidate.journal.selection.clone();
        candidate.journal.entries.push(if redo {
            Entry::Redo { changed, before_selection, after_selection, expected }
        } else {
            Entry::Undo { changed, before_selection, after_selection, expected }
        });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(changed)
    }

    fn prepare_history_metadata(&self) -> Result<(), Error> {
        // Store Breditor anchors as stable IDs, not the dependency's transient
        // absolute cursor positions. Their own affinity/deletion rules are tested.
        self.selection_offsets()?;
        let mut meta = UndoItemMeta::new();
        meta.set_value(serde_json::to_string(&self.journal.selection)?.into());
        let mut channel = self.metadata.lock();
        channel.push = meta;
        channel.popped.clear();
        Ok(())
    }

    fn perform_history(&mut self, redo: bool) -> Result<bool, Error> {
        self.prepare_history_metadata()?;
        let changed = if redo { self.undo.redo()? } else { self.undo.undo()? };
        if let Some(meta) = self.metadata.lock().popped.pop() {
            let encoded = meta.value.as_string().ok_or(Error::ReplayMismatch)?;
            self.journal.selection = serde_json::from_str(encoded.as_str())?;
        }
        self.selection_offsets()?;
        Ok(changed)
    }

    /// Export engine changes for probe exchange; this is not a transport envelope.
    ///
    /// # Errors
    /// Propagates engine export failures.
    pub fn updates(&self) -> Result<Vec<u8>, Error> {
        Ok(self.doc.export(ExportMode::all_updates())?)
    }

    /// Serialize resumable same-writer history, without authentication credentials.
    ///
    /// # Errors
    /// Rejects exceeded serialization budgets.
    pub fn checkpoint(&self) -> Result<String, Error> {
        let bytes = serde_json::to_string(&self.journal)?;
        if bytes.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("journal bytes"));
        }
        Ok(bytes)
    }

    /// Resume a writer after the host has reacquired its exclusive lease.
    ///
    /// This is not portable backup import or permission to clone an active writer.
    ///
    /// # Errors
    /// Rejects incompatible versions, limits, malformed commands and mismatched
    /// reconstructed operation identities. No existing session is modified.
    pub fn restore(bytes: &str) -> Result<Self, Error> {
        if bytes.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("journal bytes"));
        }
        let journal: Journal = serde_json::from_str(bytes)?;
        if journal.version != JOURNAL_VERSION {
            return Err(Error::Contract("journal version"));
        }
        if journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("journal entries"));
        }
        let mut result = Self::from_journal(journal)?;
        result.validate_adoption()?;
        Ok(result)
    }

    fn from_journal(journal: Journal) -> Result<Self, Error> {
        let mut result = Self::new(journal.document.clone(), journal.writer.clone())?;
        for entry in &journal.entries {
            let before = result.doc.oplog_vv();
            let expected = match entry {
                Entry::Local { commands, before_selection, expected } => {
                    result.journal.selection.clone_from(before_selection);
                    result.execute(commands)?;
                    Some(expected)
                }
                Entry::Remote { bytes } => {
                    if bytes.is_empty() || bytes.len() > MAX_UPDATE_BYTES {
                        return Err(Error::Limit("update bytes"));
                    }
                    result.import(bytes)?;
                    None
                }
                Entry::Undo { expected, changed, before_selection, after_selection } => {
                    result.journal.selection.clone_from(before_selection);
                    if result.perform_history(false)? != *changed
                        || result.journal.selection != *after_selection
                    {
                        return Err(Error::ReplayMismatch);
                    }
                    Some(expected)
                }
                Entry::Redo { expected, changed, before_selection, after_selection } => {
                    result.journal.selection.clone_from(before_selection);
                    if result.perform_history(true)? != *changed
                        || result.journal.selection != *after_selection
                    {
                        return Err(Error::ReplayMismatch);
                    }
                    Some(expected)
                }
            };
            if let Some(expected) = expected
                && effects(&result.doc, &before)? != *expected
            {
                return Err(Error::ReplayMismatch);
            }
        }
        result.journal = journal;
        Ok(result)
    }

    fn validate_adoption(&mut self) -> Result<(), Error> {
        if self.journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("journal entries"));
        }
        // Reject unexpected root containers. This limited probe is not yet the
        // rich schema validator and must not be exposed as a public relay.
        let root = self.doc.get_value();
        let root = root.as_map().ok_or(Error::Contract("root map"))?;
        for (name, value) in root.iter() {
            let expected = match name.as_str() {
                "body" => ContainerType::Text,
                "cells" | "columns" | "images" => ContainerType::Map,
                _ => return Err(Error::Contract("probe root container")),
            };
            if value.as_container() != Some(&ContainerID::new_root(name, expected)) {
                return Err(Error::Contract("probe root type"));
            }
        }
        let raw = self.doc.get_deep_value().to_json_value();
        if raw.to_string().len() > MAX_VIEW_BYTES {
            return Err(Error::Limit("replicated view bytes"));
        }
        let mut view = crate::register::materialize(&self.doc, &raw)?;
        crate::text_projection::decorate(&self.doc, &mut view)?;
        if view.to_string().len() > MAX_VIEW_BYTES {
            return Err(Error::Limit("formatted view bytes"));
        }
        crate::validation::validate_view(&view)?;
        self.selection_offsets()?;
        self.checkpoint()?;
        self.snapshot = view;
        Ok(())
    }

    /// Materialized probe values; not a shipping rich AST or trusted HTML recipe.
    #[must_use]
    pub fn view(&self) -> serde_json::Value {
        self.snapshot.clone()
    }

    /// Causal version vector as exact integer strings/values inside JSON.
    #[must_use]
    pub fn version(&self) -> serde_json::Value {
        serde_json::Value::Object(
            self.doc
                .oplog_vv()
                .iter()
                .map(|(writer, counter)| (writer.to_string(), serde_json::Value::from(*counter)))
                .collect(),
        )
    }

    /// Number of writer-local undo actions.
    #[must_use]
    pub fn undo_count(&self) -> usize {
        self.undo.undo_count()
    }

    /// Number of writer-local redo actions.
    #[must_use]
    pub fn redo_count(&self) -> usize {
        self.undo.redo_count()
    }

    /// Capture a stable anchor from already-existing body text.
    ///
    /// # Errors
    /// Invalid offsets fail. Cell anchor lookup is deferred until identity
    /// materialization avoids creating containers during a read.
    pub fn body_anchor(&self, offset: u32, affinity: Affinity) -> Result<TextAnchor, Error> {
        TextAnchor::capture(&self.doc.get_text("body"), offset, affinity)
    }

    /// Resolve a stored body anchor against current shared text.
    ///
    /// # Errors
    /// Missing/deleted history and foreign containers are rejected explicitly.
    pub fn resolve_body_anchor(&self, anchor: &TextAnchor) -> Result<u32, Error> {
        anchor.resolve(&self.doc, &self.doc.get_text("body"))
    }

    /// Read root text without exporting or granting access to a mutable engine.
    #[must_use]
    pub fn body(&self) -> String {
        self.doc.get_text("body").to_string()
    }

    /// Change only the local directional selection; not a shared content edit.
    ///
    /// # Errors
    /// Both endpoints must be scalar-aligned offsets in the current body.
    pub fn set_body_selection(&mut self, anchor: u32, focus: u32) -> Result<(), Error> {
        let range = TextRange {
            anchor: self.body_anchor(anchor, Affinity::After)?,
            focus: self.body_anchor(focus, Affinity::After)?,
        };
        self.journal.selection = Some(range);
        Ok(())
    }

    /// Resolve local body selection without changing shared content/history.
    ///
    /// # Errors
    /// Rejects malformed or unavailable anchors rather than guessing DOM offsets.
    pub fn selection_offsets(&self) -> Result<Option<(u32, u32)>, Error> {
        self.journal
            .selection
            .as_ref()
            .map(|range| {
                Ok((
                    self.resolve_body_anchor(&range.anchor)?,
                    self.resolve_body_anchor(&range.focus)?,
                ))
            })
            .transpose()
    }
}
