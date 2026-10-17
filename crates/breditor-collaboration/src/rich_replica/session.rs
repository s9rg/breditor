//! Staged shared publication and same-writer selective history with exact journal replay.
use super::{
    Command, PendingFormatsUpdate, SelectionUpdate, SharedObservation,
    history_metadata::{self, Channel, Recipe, UndoManager},
    initialize, materialize, model,
    ui_state::UiState,
};
use crate::{Error, register::Stamp};
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::RichDocument};
use loro::{ContainerID, ContainerType, ExportMode, LoroDoc, ToJson, VersionVector, sync::Mutex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

pub(super) const MAX_ENTRIES: usize = 1000;
pub(super) const JOURNAL_VERSION: u32 = 12;
pub(super) const MAX_JOURNAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_UPDATE_BYTES: usize = 1024 * 1024;
const MAX_CAUSAL_VIEW_BYTES: usize = 4 * 1024 * 1024;

#[cfg(test)]
#[path = "known_remote_tests.rs"]
mod known_remote_tests;
#[cfg(test)]
#[path = "session_projection_tests.rs"]
mod projection_tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Origin {
    Seed { document_json: String },
    Join { updates: Vec<u8> },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Entry {
    GeneralRangeV1 {
        action: super::actions::ReplaceGeneralTextRangeV1,
        selection_update: SelectionUpdate,
        pending_update: PendingFormatsUpdate,
        before_ui: UiState,
        after_ui: UiState,
        history_key: String,
        expected: Value,
    },
    Local {
        commands: Vec<Command>,
        selection_update: SelectionUpdate,
        pending_update: PendingFormatsUpdate,
        before_ui: UiState,
        after_ui: UiState,
        history_key: String,
        expected: Value,
    },
    Remote {
        bytes: Vec<u8>,
    },
    Undo {
        changed: bool,
        before_ui: UiState,
        after_ui: UiState,
        popped: Vec<String>,
        expected: Value,
    },
    Redo {
        changed: bool,
        before_ui: UiState,
        after_ui: UiState,
        popped: Vec<String>,
        expected: Value,
    },
}
impl Entry {
    pub(super) const fn authored(&self) -> bool {
        matches!(self, Self::Local { .. } | Self::GeneralRangeV1 { .. })
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Journal<Entries = Vec<Entry>> {
    pub(super) format: String,
    pub(super) version: u32,
    pub(super) document: String,
    writer: String,
    origin: Origin,
    pub(super) entries: Entries,
    pub(super) ui: UiState,
    pub(super) publication: String,
}

impl<Entries> Journal<Entries> {
    pub(super) fn map_entries(self, convert: impl FnOnce(Entries) -> Vec<Entry>) -> Journal {
        Journal {
            format: self.format,
            version: self.version,
            document: self.document,
            writer: self.writer,
            origin: self.origin,
            entries: convert(self.entries),
            ui: self.ui,
            publication: self.publication,
        }
    }
}

pub(super) fn writer_id(value: &str) -> Result<u64, Error> {
    let id = value.parse::<u64>().map_err(|_| Error::Contract("shared writer"))?;
    if id == 0 || id == u64::MAX || id.to_string() != value {
        return Err(Error::Contract("canonical shared writer"));
    }
    Ok(id)
}
pub(super) fn effects(doc: &LoroDoc, before: &VersionVector) -> Result<Value, Error> {
    Ok(serde_json::to_value(
        doc.export_json_updates_without_peer_compression(before, &doc.oplog_vv()),
    )?)
}
fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich replica schema admission")
}

fn publication(value: &str) -> Result<u64, Error> {
    let number = value.parse::<u64>().map_err(|_| Error::Contract("shared publication decimal"))?;
    if number.to_string() != value {
        return Err(Error::Contract("canonical shared publication decimal"));
    }
    Ok(number)
}

/// An exclusive writer whose authoritative content is shared primitives, not a mutable AST.
///
/// The AST is a validated immutable view. This in-progress adapter is isolated
/// from shipping packages; relay authentication and writer leasing are external.
pub struct RichReplica {
    pub(super) doc: LoroDoc,
    pub(super) undo: UndoManager,
    pub(super) codec: DocumentJsonCodecV2,
    pub(super) protocol: super::protocol::Protocol,
    pub(super) replay_contract: super::general_history::ReplayContract,
    pub(super) journal: Journal,
    header: Value,
    pub(super) document: RichDocument,
    pub(super) canonical: String,
    projection_cache: super::projection_cache::ProjectionCache,
    replay_projections: super::replay_projections::ReplayProjections,
    token: Arc<()>,
    pub(super) metadata: Arc<Mutex<Channel>>,
    pub(super) recipes: BTreeMap<String, Recipe>,
    pub(super) cursors: super::history_cursors::HistoryCursors,
    pub(super) history_keys: super::history_keys::HistoryKeys,
    pub(super) typing: Option<super::typing_history::TypingHistory>,
    pub(super) writer_windows: Vec<super::writer_transport::Window>,
    pub(super) read_only: bool,
    pub(super) read_only_revision: Option<String>,
}

impl RichReplica {
    /// Immutable document identity bound by seed, frame join or exact journal recovery.
    #[must_use]
    pub fn document_id(&self) -> &str {
        &self.journal.document
    }
    /// Exact exclusively owned causal writer; this identity is not account authorization.
    #[must_use]
    pub fn writer(&self) -> &str {
        &self.journal.writer
    }
    /// Seed a new shared document exactly once under the host's exclusive writer.
    ///
    /// # Errors
    /// Rejects wrong schema/IDs/budgets and failed decomposition without publication.
    pub fn new(
        codec: DocumentJsonCodecV2,
        document_json: &str,
        writer: String,
    ) -> Result<Self, Error> {
        super::protocol::Protocol::require_original(&codec)?;
        Self::new_bound(codec, document_json, writer)
    }

    pub(super) fn new_bound(
        codec: DocumentJsonCodecV2,
        document_json: &str,
        writer: String,
    ) -> Result<Self, Error> {
        let protocol = super::protocol::Protocol::from_codec(&codec)?;
        let document = codec.decode(document_json).map_err(contract)?;
        let rich =
            RichDocument::try_admit(codec.schema(), document, codec.limits()).map_err(contract)?;
        let canonical = codec.encode(rich.document()).map_err(contract)?;
        let journal = Journal {
            format: "breditor/rich-replica-journal".into(),
            version: protocol.journal(),
            document: rich.id().as_str().into(),
            writer,
            origin: Origin::Seed { document_json: canonical },
            entries: vec![],
            ui: UiState::default(),
            publication: "0".into(),
        };
        Self::from_journal(codec, journal)
    }

    /// Join accepted causal state with a new, separately leased writer identity.
    ///
    /// # Errors
    /// Rejects incomplete genesis, wrong room/schema, malformed updates or writer collision.
    pub fn join(
        codec: DocumentJsonCodecV2,
        document: String,
        writer: String,
        updates: Vec<u8>,
    ) -> Result<Self, Error> {
        super::protocol::Protocol::require_original(&codec)?;
        Self::join_bound(codec, document, writer, updates)
    }

    pub(super) fn join_bound(
        codec: DocumentJsonCodecV2,
        document: String,
        writer: String,
        updates: Vec<u8>,
    ) -> Result<Self, Error> {
        let protocol = super::protocol::Protocol::from_codec(&codec)?;
        Self::from_journal(
            codec,
            Journal {
                format: "breditor/rich-replica-journal".into(),
                version: protocol.journal(),
                document,
                writer,
                origin: Origin::Join { updates },
                entries: vec![],
                ui: UiState::default(),
                publication: "0".into(),
            },
        )
    }

    /// Join a version/engine/schema-bound update with a separately leased writer.
    /// # Errors
    /// Wrong room/model/schema and malformed/over-budget frames are rejected before import.
    pub fn join_frame(
        codec: DocumentJsonCodecV2,
        document: String,
        writer: String,
        input: &str,
    ) -> Result<Self, Error> {
        super::protocol::Protocol::require_original(&codec)?;
        let bytes = super::update_frame::decode(&codec, &document, input)?;
        Self::join(codec, document, writer, bytes)
    }

    fn base(codec: DocumentJsonCodecV2, journal: Journal) -> Result<Self, Error> {
        let protocol = super::protocol::Protocol::from_codec(&codec)?;
        crate::identity::validate_id(&journal.document)?;
        let doc = LoroDoc::new();
        doc.set_peer_id(writer_id(&journal.writer)?)?;
        doc.set_record_timestamp(false);
        super::text_flow::configure(&doc);
        model::tree(&doc);
        doc.get_map("texts");
        doc.get_map("columns");
        doc.get_map("binding");
        doc.get_map("metadata");
        doc.get_map("orders");
        doc.get_map("sites");
        match &journal.origin {
            Origin::Seed { document_json } => {
                let admitted = codec.decode(document_json).map_err(contract)?;
                let canonical = codec.encode(&admitted).map_err(contract)?;
                protocol.seed(&doc)?;
                initialize::seed(&doc, &serde_json::from_str(&canonical)?)?;
            }
            Origin::Join { updates } => {
                if updates.is_empty() || updates.len() > MAX_UPDATE_BYTES {
                    return Err(Error::Limit("rich genesis update bytes"));
                }
                let metadata = LoroDoc::decode_import_blob_meta(updates, true)?;
                if metadata.partial_end_vv.get(&doc.peer_id()).copied().unwrap_or(0) > 0 {
                    return Err(Error::WriterCollision);
                }
                doc.import(updates)?;
            }
        }
        protocol.require(&doc)?;
        super::layout_fields::validate(&doc)?;
        let header = materialize::header(&doc)?;
        let value = materialize::envelope(&doc)?;
        let admitted = codec.decode(&value.to_string()).map_err(contract)?;
        let document =
            RichDocument::try_admit(codec.schema(), admitted, codec.limits()).map_err(contract)?;
        if document.id().as_str() != journal.document {
            return Err(Error::Contract("rich replica document binding"));
        }
        let canonical = codec.encode(document.document()).map_err(contract)?;
        let undo = UndoManager::new(doc.inner());
        // Only semantic group_start/group_end boundaries own history. Zero is
        // not "disabled" in the pinned engine: a backwards wall-clock delta
        // still satisfies delta < 0 and merges two separate authored groups.
        // The minimum signed interval disables that time branch, while the
        // independent explicit-group branch still merges a multi-command edit.
        undo.set_merge_interval(i64::MIN);
        undo.set_max_undo_steps(MAX_ENTRIES);
        let metadata = history_metadata::connect(&undo);
        let mut owner = Self {
            doc,
            undo,
            codec,
            protocol,
            replay_contract: super::general_history::ReplayContract::Original,
            journal,
            header,
            document,
            canonical,
            projection_cache: super::projection_cache::ProjectionCache::default(),
            replay_projections: super::replay_projections::ReplayProjections::default(),
            token: Arc::new(()),
            metadata,
            recipes: BTreeMap::new(),
            cursors: super::history_cursors::HistoryCursors::default(),
            history_keys: super::history_keys::HistoryKeys::default(),
            typing: None,
            writer_windows: Vec::new(),
            read_only: false,
            read_only_revision: None,
        };
        owner.note_writer_window(&VersionVector::default(), true)?;
        Ok(owner)
    }

    fn from_journal(codec: DocumentJsonCodecV2, journal: Journal) -> Result<Self, Error> {
        Self::from_journal_parts(codec, journal, None, false)
    }
    pub(super) fn from_journal_parts(
        codec: DocumentJsonCodecV2,
        journal: Journal,
        joins: Option<Vec<u32>>,
        leave_open: bool,
    ) -> Result<Self, Error> {
        Self::from_journal_parts_cached(codec, journal, joins, leave_open, None)
    }
    fn from_journal_parts_cached(
        codec: DocumentJsonCodecV2,
        journal: Journal,
        joins: Option<Vec<u32>>,
        leave_open: bool,
        replay_projections: Option<super::replay_projections::ReplayProjections>,
    ) -> Result<Self, Error> {
        Self::from_journal_contract_cached(
            codec,
            journal,
            joins,
            leave_open,
            super::general_history::ReplayContract::Original,
            replay_projections,
        )
    }
    pub(super) fn from_journal_contract_parts(
        codec: DocumentJsonCodecV2,
        journal: Journal,
        joins: Option<Vec<u32>>,
        leave_open: bool,
        contract: super::general_history::ReplayContract,
    ) -> Result<Self, Error> {
        Self::from_journal_contract_cached(codec, journal, joins, leave_open, contract, None)
    }
    fn from_journal_contract_cached(
        codec: DocumentJsonCodecV2,
        journal: Journal,
        joins: Option<Vec<u32>>,
        leave_open: bool,
        contract: super::general_history::ReplayContract,
        replay_projections: Option<super::replay_projections::ReplayProjections>,
    ) -> Result<Self, Error> {
        let protocol = super::protocol::Protocol::from_codec(&codec)?;
        let (format, version) = contract.journal(protocol, joins.is_some());
        if journal.format != format || journal.version != version {
            return Err(Error::Contract("rich replica journal version"));
        }
        if journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("rich journal entries"));
        }
        super::document_checkpoint::validate_journal_scope(&journal, contract)?;
        if contract == super::general_history::ReplayContract::Original
            && journal.entries.iter().any(|entry| matches!(entry, Entry::GeneralRangeV1 { .. }))
        {
            return Err(Error::Contract("general records require explicit history family"));
        }
        publication(&journal.publication)?;
        let mut base = journal.clone();
        base.ui = UiState::default();
        let mut candidate = Self::base(codec, base)?;
        candidate.replay_contract = contract;
        if let Some(replay_projections) = replay_projections {
            candidate.replay_projections = replay_projections;
        }
        candidate.typing =
            joins.map(|joins| super::typing_history::TypingHistory { joins, continuation: None });
        if let Some(history) = &candidate.typing {
            history.validate(&journal)?;
        }
        for (index, entry) in journal.entries.iter().enumerate() {
            let joining = |at: usize| {
                candidate.typing.as_ref().is_some_and(|history| {
                    u32::try_from(at).is_ok_and(|at| history.joins.binary_search(&at).is_ok())
                })
            };
            let join = joining(index);
            let keep_open =
                joining(index + 1) || (leave_open && index + 1 == journal.entries.len());
            if keep_open && !entry.authored() {
                return Err(Error::ReplayMismatch);
            }
            candidate.replay(entry, join, keep_open)?;
        }
        candidate.journal = journal;
        candidate.replay_projections.finish_replay();
        candidate.validate_adoption()?;
        Ok(candidate)
    }

    /// Publish one explicit group only after all shared effects and its AST validate.
    ///
    /// # Errors
    /// Invalid targets/values, limits or engine failures retain every published field.
    pub fn apply(&mut self, commands: Vec<Command>) -> Result<bool, Error> {
        self.apply_with_state(commands, SelectionUpdate::Map, PendingFormatsUpdate::Map)
    }

    /// Publish content plus admitted post-action selection/typing state as one atomic group.
    /// # Errors
    /// Any command, selection, format, history or checkpoint failure retains the original owner.
    pub fn apply_with_state(
        &mut self,
        commands: Vec<Command>,
        selection_update: SelectionUpdate,
        pending_update: PendingFormatsUpdate,
    ) -> Result<bool, Error> {
        self.apply_with_state_inner(commands, selection_update, pending_update, None, None)
    }
    pub(super) fn apply_with_state_inner(
        &mut self,
        commands: Vec<Command>,
        selection_update: SelectionUpdate,
        pending_update: PendingFormatsUpdate,
        typing: Option<super::typing_history::Request>,
        expected: Option<&breditor_core::rich_content::RichDocument>,
    ) -> Result<bool, Error> {
        self.require_writable()?;
        let join = typing.as_ref().is_some_and(|request| request.join);
        let mut candidate = self.staged_for_typing(join)?;
        let before = candidate.doc.oplog_vv();
        let before_ui = candidate.journal.ui.clone();
        let history = (candidate.undo_count(), candidate.redo_count());
        let history_key =
            candidate.execute(&commands, &selection_update, &pending_update, join, false)?;
        candidate.refresh_document()?;
        if expected.is_some_and(|expected| candidate.document.document() != expected.document()) {
            return Err(Error::Contract("selection formatting lowering differs from core"));
        }
        if self.canonical == candidate.canonical
            && before_ui == candidate.journal.ui
            && history == (candidate.undo_count(), candidate.redo_count())
        {
            return Ok(false);
        }
        let expected = effects(&candidate.doc, &before)?;
        let after_ui = candidate.journal.ui.clone();
        candidate.journal.entries.push(Entry::Local {
            commands,
            selection_update,
            pending_update,
            before_ui,
            after_ui,
            history_key,
            expected,
        });
        if join {
            let index = u32::try_from(candidate.journal.entries.len() - 1)
                .map_err(|_| Error::Limit("shared typing entry index"))?;
            candidate.typing.as_mut().ok_or(Error::ReplayMismatch)?.joins.push(index);
        }
        if let Some(request) = typing {
            candidate.typing_after(request)?;
        }
        self.adopt(candidate)?;
        Ok(true)
    }

    fn execute(
        &mut self,
        commands: &[Command],
        selection: &SelectionUpdate,
        pending: &PendingFormatsUpdate,
        join: bool,
        keep_open: bool,
    ) -> Result<String, Error> {
        if commands.is_empty() || commands.len() > 64 {
            return Err(Error::Limit("rich shared action steps"));
        }
        self.refresh_document()?;
        let before_ui = self.journal.ui.clone();
        let before_selection = self.selection_for_mapping()?;
        self.validate_targets(commands)?;
        // Semantic priority is captured at the admitted request basis. Immutable
        // preparation (including initial characters) must not make a longer
        // concurrently-created caption outrank another writer's equal-basis edit.
        let stamp = Stamp::next(&self.doc)?;
        let group_key = if join {
            // These three preparations only validate when the permanent root
            // already exists. Do not pause an open group or fork every replayed
            // keystroke. Verify that no preparation operation was authored.
            let before = self.doc.oplog_vv();
            for command in commands {
                let block = match command {
                    Command::InsertText(value) => &value.block,
                    Command::DeleteText(value) => &value.block,
                    Command::SetFormat(value) => &value.block,
                    _ => return Err(Error::Contract("shared typing join action")),
                };
                if !super::text_flow::prepared(&self.doc, block) {
                    return Err(Error::Contract("shared typing join preparation"));
                }
                command.prepare(&self.doc, &self.codec, &self.document)?;
            }
            self.doc.commit();
            if self.doc.oplog_vv() != before {
                return Err(Error::Contract("shared typing join preparation"));
            }
            Some(self.history_keys.undo.last().ok_or(Error::ReplayMismatch)?.key.clone())
        } else {
            self.undo.pause();
            for command in commands {
                command.prepare(&self.doc, &self.codec, &self.document)?;
            }
            self.doc.commit();
            self.undo.resume();
            None
        };
        self.refresh_document()?;
        let history_key = stamp.key();
        let meta = self.journal.ui.engine_meta(&self.doc, &history_key)?;
        let mut marker = loro::UndoItemMeta::new();
        marker.set_value(history_key.clone().into());
        self.metadata.lock().push = marker;
        let frontier = self.doc.state_frontiers();
        let undo_count = self.undo_count();
        if !join {
            self.undo.group_start()?;
        }
        for (ordinal, command) in commands.iter().enumerate() {
            let command_stamp = if ordinal == 0 { stamp } else { Stamp::next(&self.doc)? };
            command.apply(&self.doc, &self.codec, &self.document, command_stamp, ordinal)?;
            self.doc.commit();
            self.refresh_document()?;
        }
        if !keep_open {
            self.undo.group_end();
        }
        let authored = self.doc.state_frontiers() != frontier;
        if self.undo_count() != undo_count {
            if join {
                return Err(Error::ReplayMismatch);
            }
            self.cursors.authored(
                history_key.clone(),
                frontier,
                self.doc.state_frontiers(),
                meta,
            )?;
            self.history_keys.authored(history_key.clone());
        } else if join && authored {
            let key = group_key.as_deref().ok_or(Error::ReplayMismatch)?;
            self.cursors.extend(key, self.doc.state_frontiers())?;
            self.history_keys.extend(key)?;
        }
        if authored {
            self.journal.ui.normalize(&self.doc, &self.document, before_selection.as_ref())?;
        }
        self.journal.ui.after(&self.codec, &self.doc, &self.document, selection, pending)?;
        self.recipes.insert(
            history_key.clone(),
            Recipe { before: before_ui, after: self.journal.ui.clone() },
        );
        if let Some(key) = group_key {
            self.recipes.get_mut(&key).ok_or(Error::ReplayMismatch)?.after =
                self.journal.ui.clone();
        }
        Ok(history_key)
    }

    fn replay(&mut self, entry: &Entry, join: bool, keep_open: bool) -> Result<(), Error> {
        let before = self.doc.oplog_vv();
        let applied_before = self.doc.state_vv();
        let expected = match entry {
            Entry::GeneralRangeV1 {
                action,
                selection_update,
                pending_update,
                before_ui,
                after_ui,
                history_key,
                expected,
            } => {
                self.journal.ui.clone_from(before_ui);
                self.validate_ui()?;
                if join
                    || self.execute_general_range(
                        action,
                        selection_update,
                        pending_update,
                        keep_open,
                    )? != *history_key
                    || self.journal.ui != *after_ui
                {
                    return Err(Error::ReplayMismatch);
                }
                Some(expected)
            }
            Entry::Local {
                commands,
                selection_update,
                pending_update,
                before_ui,
                after_ui,
                history_key,
                expected,
            } => {
                self.journal.ui.clone_from(before_ui);
                self.validate_ui()?;
                if self.execute(commands, selection_update, pending_update, join, keep_open)?
                    != *history_key
                    || self.journal.ui != *after_ui
                {
                    return Err(Error::ReplayMismatch);
                }
                Some(expected)
            }
            Entry::Remote { bytes } => {
                let previous = self.selection_for_mapping()?;
                self.import(bytes)?;
                self.refresh_document()?;
                self.journal.ui.normalize(&self.doc, &self.document, previous.as_ref())?;
                None
            }
            Entry::Undo { changed, before_ui, after_ui, popped, expected }
            | Entry::Redo { changed, before_ui, after_ui, popped, expected } => {
                self.journal.ui.clone_from(before_ui);
                self.validate_ui()?;
                let result = self.perform_history(matches!(entry, Entry::Redo { .. }))?;
                if result != (*changed, popped.clone()) || self.journal.ui != *after_ui {
                    return Err(Error::ReplayMismatch);
                }
                Some(expected)
            }
        };
        if let Some(expected) = expected
            && effects(&self.doc, &before)? != *expected
        {
            // Explicit native debug aid; effects can include document content.
            // Never compiled into browser or native release builds.
            #[cfg(all(debug_assertions, not(target_arch = "wasm32")))]
            if std::env::var_os("BREDITOR_REPLAY_TRACE").is_some() {
                eprintln!(
                    "REPLAY EXPECTED: {expected}\nREPLAY ACTUAL: {}",
                    effects(&self.doc, &before)?
                );
            }
            return Err(Error::ReplayMismatch);
        }
        self.note_writer_window(&applied_before, false)?;
        Ok(())
    }

    pub(super) fn staged(&self) -> Result<Self, Error> {
        self.staged_for_typing(false)
    }
    fn staged_for_typing(&self, leave_open: bool) -> Result<Self, Error> {
        let mut candidate = Self::from_journal_contract_cached(
            self.codec.clone(),
            self.journal.clone(),
            self.typing.as_ref().map(|history| history.joins.clone()),
            leave_open,
            self.replay_contract,
            Some(self.replay_projections.fork_for_replay()),
        )?;
        candidate.read_only = self.read_only;
        candidate.read_only_revision.clone_from(&self.read_only_revision);
        Ok(candidate)
    }

    pub(super) fn adopt(&mut self, mut candidate: Self) -> Result<(), Error> {
        candidate.note_writer_window(&self.doc.state_vv(), false)?;
        candidate.journal.publication = publication(&self.journal.publication)?
            .checked_add(1)
            .ok_or(Error::Limit("shared publication revision"))?
            .to_string();
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(())
    }

    /// Capture an independently disposable exact live publication, including local UI/history.
    /// # Errors
    /// Read admission or JSON encoding failure does not mutate causal state.
    pub fn observe(&self) -> Result<SharedObservation, Error> {
        Ok(SharedObservation { token: Arc::clone(&self.token), view: self.view_json()? })
    }
    /// Capture the explicitly selected document-view family under the same exact native guard.
    /// # Errors
    /// Wrong scope family or read/admission failure leaves the owner untouched.
    pub fn observe_document(&self) -> Result<SharedObservation, Error> {
        Ok(SharedObservation { token: Arc::clone(&self.token), view: self.document_view_json()? })
    }

    /// Reject stale/foreign observations before payload admission; observations grant no transport authority.
    /// # Errors
    /// A prior publication, another owner or a restored owner has a different token.
    pub fn check(&self, observation: &SharedObservation) -> Result<(), Error> {
        if !Arc::ptr_eq(&self.token, &observation.token) {
            return Err(Error::Contract("stale or foreign shared observation"));
        }
        Ok(())
    }

    /// Guard content, post-selection and pending formats against the complete observed publication.
    /// # Errors
    /// Old/foreign tokens reject before command, selection or format admission.
    pub fn apply_guarded(
        &mut self,
        observation: &SharedObservation,
        commands: Vec<Command>,
        selection: SelectionUpdate,
        pending: PendingFormatsUpdate,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.apply_with_state(commands, selection, pending)
    }

    /// Resolve current directional text/node/grid values without activating any shared container.
    /// # Errors
    /// Rejects missing causal history or malformed anchors rather than guessing coordinates.
    pub fn selection(&self) -> Result<Option<super::selection::Selection>, Error> {
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("use explicit document selection family"));
        }
        self.selection_for_mapping()
    }
    pub(super) fn selection_for_mapping(
        &self,
    ) -> Result<Option<super::selection::Selection>, Error> {
        self.journal.ui.candidate(&self.doc, &self.document)
    }

    fn validate_ui(&self) -> Result<(), Error> {
        let mut normalized = self.journal.ui.clone();
        let selection = self.selection_for_mapping()?;
        normalized.normalize(&self.doc, &self.document, selection.as_ref())?;
        normalized.outcome = self.journal.ui.outcome;
        if normalized != self.journal.ui {
            return Err(Error::Contract("noncanonical shared UI checkpoint"));
        }
        if let Some(formats) = &self.journal.ui.pending
            && super::ui_state::canonical_formats(&self.codec, formats)? != *formats
        {
            return Err(Error::Contract("canonical shared pending formats"));
        }
        Ok(())
    }

    /// Canonical causal version for asynchronous shared-content preparation.
    ///
    /// Writer identities and counters are exact decimal strings. This does not
    /// freeze a future local selection/history observation.
    #[must_use]
    pub fn causal_version(&self) -> String {
        Value::Object(
            self.doc
                .oplog_vv()
                .iter()
                .map(|(writer, counter)| (writer.to_string(), Value::String(counter.to_string())))
                .collect(),
        )
        .to_string()
    }

    /// Reject stale shared coordinates before target/value admission or mutation.
    ///
    /// # Errors
    /// An old/noncanonical version, invalid action or failed adoption preserves state.
    pub fn apply_at(&mut self, version: &str, commands: Vec<Command>) -> Result<bool, Error> {
        if version.len() > 64 * 1024 || version != self.causal_version() {
            return Err(Error::Contract("stale shared causal version"));
        }
        self.apply(commands)
    }

    fn validate_targets(&self, commands: &[Command]) -> Result<(), Error> {
        super::target_validation::validate(self, commands)
    }

    pub(super) fn refresh_document(&mut self) -> Result<(), Error> {
        self.protocol.require(&self.doc)?;
        super::layout_fields::validate(&self.doc)?;
        if materialize::header(&self.doc)? != self.header {
            return Err(Error::Contract("immutable shared document binding"));
        }
        if self.projection_cache.is_current(&self.doc, &self.token) {
            return Ok(());
        }
        if let Some(cached) = self.replay_projections.find(&self.doc) {
            // The immutable AST retains its schema/limit proof. Re-admission also
            // checks the active codec before the cached directory is exposed.
            let document = RichDocument::try_admit(
                self.codec.schema(),
                cached.document.document().clone(),
                self.codec.limits(),
            )
            .map_err(contract)?;
            if document.id().as_str() != self.journal.document {
                return Err(Error::Contract("rich replica document binding"));
            }
            self.canonical = self.codec.encode(document.document()).map_err(contract)?;
            self.document = document;
            self.projection_cache.record(&self.doc, &self.token);
            self.replay_projections.record(&self.doc, &self.document, &self.canonical);
            return Ok(());
        }
        let value = materialize::envelope(&self.doc)?;
        let admitted = self.codec.decode(&value.to_string()).map_err(contract)?;
        let document = RichDocument::try_admit(self.codec.schema(), admitted, self.codec.limits())
            .map_err(contract)?;
        if document.id().as_str() != self.journal.document {
            return Err(Error::Contract("rich replica document binding"));
        }
        self.canonical = self.codec.encode(document.document()).map_err(contract)?;
        self.document = document;
        self.projection_cache.record(&self.doc, &self.token);
        self.replay_projections.record(&self.doc, &self.document, &self.canonical);
        Ok(())
    }

    fn validate_adoption(&mut self) -> Result<(), Error> {
        self.protocol.require(&self.doc)?;
        let (format, version) = self.replay_contract.journal(self.protocol, self.typing.is_some());
        if self.journal.format != format || self.journal.version != version {
            return Err(Error::Contract("shared replay family binding"));
        }
        if self.journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("rich journal entries"));
        }
        super::document_checkpoint::validate_journal_scope(&self.journal, self.replay_contract)?;
        let root = self.doc.get_value();
        let root = root.as_map().ok_or(Error::Contract("rich shared root map"))?;
        for (name, value) in root.iter() {
            let kind = match name.as_str() {
                "nodes" => ContainerType::Tree,
                "binding"
                | "texts"
                | "columns"
                | "metadata"
                | "orders"
                | "sites"
                | "text-flow-definitions"
                | "text-flow-orders"
                | "text-flow-effects"
                | "text-flow-sites"
                | "text-flow-cuts"
                | "annotation-ownership" => ContainerType::Map,
                _ => return Err(Error::Contract("rich shared root name")),
            };
            if value.as_container() != Some(&ContainerID::new_root(name, kind)) {
                return Err(Error::Contract("rich shared root type"));
            }
        }
        if self.doc.get_deep_value().to_json_value().to_string().len() > MAX_CAUSAL_VIEW_BYTES {
            return Err(Error::Limit("rich causal view bytes"));
        }
        let tree = model::tree(&self.doc);
        let mut blocks = BTreeSet::new();
        for node in tree.get_nodes(false) {
            let block = model::string(&tree.get_meta(node.id)?, "block")?;
            crate::identity::validate_id(&block)?;
            if block.starts_with(model::VIRTUAL_PREFIX) || !blocks.insert(block) {
                return Err(Error::Contract("historical shared block identity"));
            }
        }
        let metadata = self.doc.get_map("metadata").get_deep_value().to_json_value();
        for (block, value) in
            metadata.as_object().ok_or(Error::Contract("shared metadata directory"))?
        {
            if block.starts_with(model::VIRTUAL_PREFIX) && value.get("origin-site").is_some() {
                super::list_structure::validate_retained(&self.doc, block)?;
            }
        }
        self.refresh_document()?;
        self.validate_ui()?;
        self.history_keys.validate(self.undo.undo_count(), self.undo.redo_count())?;
        if let Some(history) = &self.typing {
            history.validate(&self.journal)?;
            if self.document_selection_enabled() {
                self.document_typing_checkpoint()?;
            } else if self.general_ranges_enabled() {
                self.general_typing_checkpoint()?;
            } else {
                self.typing_checkpoint()?;
            }
        } else if self.document_selection_enabled() {
            self.document_checkpoint()?;
        } else if self.general_ranges_enabled() {
            self.general_checkpoint()?;
        } else {
            self.checkpoint()?;
        }
        Ok(())
    }

    fn import(&mut self, bytes: &[u8]) -> Result<loro::ImportStatus, Error> {
        if bytes.is_empty() || bytes.len() > MAX_UPDATE_BYTES {
            return Err(Error::Limit("rich update bytes"));
        }
        let metadata = LoroDoc::decode_import_blob_meta(bytes, true)?;
        let writer = writer_id(&self.journal.writer)?;
        if metadata.partial_end_vv.get(&writer).copied().unwrap_or(0)
            > self.doc.oplog_vv().get(&writer).copied().unwrap_or(0)
        {
            return Err(Error::WriterCollision);
        }
        let before = self.doc.state_frontiers();
        let status = self.doc.import(bytes)?;
        let diff: loro_internal::undo::DiffBatch =
            self.doc.diff(&before, &self.doc.state_frontiers())?.into();
        self.cursors.imported(&diff)?;
        Ok(status)
    }
    /// Import authorized engine changes atomically; pending causal dependencies are retained.
    ///
    /// # Errors
    /// Rejects malformed, foreign-binding or over-budget state without partial adoption.
    pub fn receive(&mut self, bytes: Vec<u8>) -> Result<(), Error> {
        if self
            .journal
            .entries
            .iter()
            .any(|entry| matches!(entry,Entry::Remote{bytes:prior}if *prior==bytes))
        {
            return Ok(());
        }
        let mut candidate = self.staged()?;
        let previous = candidate.selection_for_mapping()?;
        let before = candidate.doc.oplog_vv();
        let applied_before = candidate.doc.state_vv();
        let status = candidate.import(&bytes)?;
        let Some(bytes) = candidate.semantic_remote_record_v1(
            &before,
            &applied_before,
            status.pending.is_some(),
            bytes,
        )?
        else {
            return Ok(());
        };
        candidate.refresh_document()?;
        candidate.journal.ui.normalize(&candidate.doc, &candidate.document, previous.as_ref())?;
        candidate.journal.entries.push(Entry::Remote { bytes });
        self.adopt(candidate)?;
        Ok(())
    }
    fn history(&mut self, redo: bool) -> Result<bool, Error> {
        self.require_writable()?;
        let mut candidate = self.staged()?;
        let before = candidate.doc.oplog_vv();
        let before_ui = candidate.journal.ui.clone();
        let counts = (candidate.undo.undo_count(), candidate.undo.redo_count());
        let (changed, popped) = candidate.perform_history(redo)?;
        if !changed && counts == (candidate.undo.undo_count(), candidate.undo.redo_count()) {
            return Ok(false);
        }
        let expected = effects(&candidate.doc, &before)?;
        let after_ui = candidate.journal.ui.clone();
        candidate.journal.entries.push(if redo {
            Entry::Redo { changed, before_ui, after_ui, popped, expected }
        } else {
            Entry::Undo { changed, before_ui, after_ui, popped, expected }
        });
        self.adopt(candidate)?;
        Ok(changed)
    }

    fn perform_history(&mut self, redo: bool) -> Result<(bool, Vec<String>), Error> {
        let previous = self.selection_for_mapping()?;
        let opposites = self
            .recipes
            .iter()
            .map(|(id, recipe)| {
                let target = if redo { &recipe.before } else { &recipe.after };
                Ok((id.clone(), target.engine_meta(&self.doc, id)?))
            })
            .collect::<Result<BTreeMap<_, _>, Error>>()?;
        self.metadata.lock().popped.clear();
        let frontier = self.doc.state_frontiers();
        let changed = if redo { self.undo.redo()? } else { self.undo.undo()? };
        self.refresh_document()?;
        let metas = std::mem::take(&mut self.metadata.lock().popped);
        let popped = metas
            .iter()
            .map(|meta| {
                meta.value.as_string().map(|id| id.as_str().to_owned()).ok_or(Error::ReplayMismatch)
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.history_keys.popped(redo, &popped, changed)?;
        let mut repaired = None;
        for id in &popped {
            repaired = Some(self.cursors.pop(&self.doc, redo, id)?);
        }
        if let Some(id) = popped.last() {
            if changed {
                let opposite = opposites.get(id).ok_or(Error::ReplayMismatch)?.clone();
                self.cursors.opposite(
                    redo,
                    id.clone(),
                    frontier,
                    self.doc.state_frontiers(),
                    opposite,
                )?;
            }
            let recipe = self.recipes.get_mut(id).ok_or(Error::ReplayMismatch)?;
            let state = if redo { &mut recipe.after } else { &mut recipe.before };
            let (meta, diff) = repaired.ok_or(Error::ReplayMismatch)?;
            state.apply_engine_cursors(&self.doc, &meta, &diff)?;
            self.journal.ui = state.clone();
            self.journal.ui.normalize(&self.doc, &self.document, previous.as_ref())?;
        }
        Ok((changed, popped))
    }
    /// Undo this writer's group against current remote content.
    /// # Errors
    /// Replay/engine/schema failure retains the original owner.
    pub fn undo(&mut self) -> Result<bool, Error> {
        self.history(false)
    }

    /// Undo against the complete exact live publication, not just a shared content version.
    /// # Errors
    /// A stale/foreign token or history/admission failure preserves the original owner.
    pub fn undo_guarded(&mut self, observation: &SharedObservation) -> Result<bool, Error> {
        self.check(observation)?;
        self.undo()
    }
    /// Redo the original contribution and priority, not a new competing edit.
    /// # Errors
    /// Replay/engine/schema failure retains the original owner.
    pub fn redo(&mut self) -> Result<bool, Error> {
        self.history(true)
    }

    /// Redo against the complete exact live publication, including local selection/typing state.
    /// # Errors
    /// A stale/foreign token or history/admission failure preserves the original owner.
    pub fn redo_guarded(&mut self, observation: &SharedObservation) -> Result<bool, Error> {
        self.check(observation)?;
        self.redo()
    }
    /// Export opaque causal updates for an authorized host transport.
    /// # Errors
    /// Propagates engine encoding failure.
    pub fn updates(&self) -> Result<Vec<u8>, Error> {
        Ok(self.doc.export(ExportMode::all_updates())?)
    }

    /// Export the original bound update envelope; this alone grants no authorization.
    /// # Errors
    /// Engine or independent frame budgets can reject serialization.
    pub fn update_frame(&self) -> Result<String, Error> {
        super::update_frame::encode(&self.codec, &self.journal.document, self.updates()?)
    }

    /// Admit protocol/room/schema before importing authenticated host traffic.
    /// # Errors
    /// Mismatched bindings, invalid changes or failed staged admission preserve state.
    pub fn receive_frame(&mut self, input: &str) -> Result<(), Error> {
        let bytes = super::update_frame::decode(&self.codec, &self.journal.document, input)?;
        self.receive(bytes)
    }
    /// Save same-writer selective history; this is not a portable credential/backup import.
    /// # Errors
    /// Rejects the independent journal byte budget.
    pub fn checkpoint(&self) -> Result<String, Error> {
        if self.general_ranges_enabled() {
            return Err(Error::Contract("use explicit general shared checkpoint"));
        }
        if self.typing.is_some() {
            return Err(Error::Contract("use explicit shared typing checkpoint"));
        }
        self.encode_explicit_journal()
    }
    pub(super) fn encode_explicit_journal(&self) -> Result<String, Error> {
        let value = serde_json::to_string(&self.journal)?;
        if value.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("rich journal bytes"));
        }
        Ok(value)
    }
    /// Replay a journal only after the host reacquires this exact writer's exclusive lease.
    /// # Errors
    /// Rejects incompatible bindings, altered effects, wrong document or budgets.
    pub fn restore(codec: DocumentJsonCodecV2, document: &str, bytes: &str) -> Result<Self, Error> {
        super::protocol::Protocol::require_original(&codec)?;
        Self::restore_bound(codec, document, bytes)
    }

    pub(super) fn restore_bound(
        codec: DocumentJsonCodecV2,
        document: &str,
        bytes: &str,
    ) -> Result<Self, Error> {
        if bytes.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("rich journal bytes"));
        }
        let journal: Journal = serde_json::from_str(bytes)?;
        if journal.document != document {
            return Err(Error::Contract("rich journal room binding"));
        }
        Self::from_journal(codec, journal)
    }
    /// The current canonical fingerprint-bearing Breditor AST export.
    #[must_use]
    pub fn document_json(&self) -> &str {
        &self.canonical
    }
    /// Immutable rich AST and its typed stable-ID directory.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Causal projection semantics selected by the immutable compiled profile.
    #[must_use]
    pub const fn model_version(&self) -> u32 {
        self.protocol.model()
    }
    /// Original journal binding for this causal model; opt-in families declare their own versions.
    #[must_use]
    pub const fn journal_version(&self) -> u32 {
        self.protocol.journal()
    }
    /// Writer-local undo depth; remote work never adds a step.
    #[must_use]
    pub fn undo_count(&self) -> usize {
        self.undo.undo_count()
    }
    /// Writer-local redo depth, including after same-writer restart.
    #[must_use]
    pub fn redo_count(&self) -> usize {
        self.undo.redo_count()
    }
}
