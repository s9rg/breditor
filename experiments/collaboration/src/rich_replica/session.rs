//! Staged shared publication and same-writer selective history with exact journal replay.
use super::{Command, initialize, materialize, model};
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};
use loro::{
    ContainerID, ContainerType, ExportMode, LoroDoc, StyleConfig, ToJson, UndoManager,
    VersionVector,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const MAX_ENTRIES: usize = 1000;
const MAX_JOURNAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_UPDATE_BYTES: usize = 1024 * 1024;
const MAX_CAUSAL_VIEW_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Origin {
    Seed { document_json: String },
    Join { updates: Vec<u8> },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Entry {
    Local { commands: Vec<Command>, expected: Value },
    Remote { bytes: Vec<u8> },
    Undo { changed: bool, expected: Value },
    Redo { changed: bool, expected: Value },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    format: String,
    version: u32,
    document: String,
    writer: String,
    origin: Origin,
    entries: Vec<Entry>,
}

fn writer_id(value: &str) -> Result<u64, Error> {
    let id = value.parse::<u64>().map_err(|_| Error::Contract("shared writer"))?;
    if id == 0 || id == u64::MAX || id.to_string() != value {
        return Err(Error::Contract("canonical shared writer"));
    }
    Ok(id)
}
fn effects(doc: &LoroDoc, before: &VersionVector) -> Result<Value, Error> {
    Ok(serde_json::to_value(
        doc.export_json_updates_without_peer_compression(before, &doc.oplog_vv()),
    )?)
}
fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich replica schema admission")
}

/// An exclusive writer whose authoritative content is shared primitives, not a mutable AST.
///
/// The AST is a validated immutable view. This in-progress adapter is isolated
/// from shipping packages; relay authentication and writer leasing are external.
pub struct RichReplica {
    doc: LoroDoc,
    undo: UndoManager,
    codec: DocumentJsonCodecV2,
    journal: Journal,
    header: Value,
    document: RichDocument,
    canonical: String,
}

impl RichReplica {
    /// Seed a new shared document exactly once under the host's exclusive writer.
    ///
    /// # Errors
    /// Rejects wrong schema/IDs/budgets and failed decomposition without publication.
    pub fn new(
        codec: DocumentJsonCodecV2,
        document_json: &str,
        writer: String,
    ) -> Result<Self, Error> {
        let document = codec.decode(document_json).map_err(contract)?;
        let rich =
            RichDocument::try_admit(codec.schema(), document, codec.limits()).map_err(contract)?;
        let canonical = codec.encode(rich.document()).map_err(contract)?;
        let journal = Journal {
            format: "breditor/rich-replica-journal".into(),
            version: 1,
            document: rich.id().as_str().into(),
            writer,
            origin: Origin::Seed { document_json: canonical },
            entries: vec![],
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
        Self::from_journal(
            codec,
            Journal {
                format: "breditor/rich-replica-journal".into(),
                version: 1,
                document,
                writer,
                origin: Origin::Join { updates },
                entries: vec![],
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
        let bytes = super::update_frame::decode(&codec, &document, input)?;
        Self::join(codec, document, writer, bytes)
    }

    fn base(codec: DocumentJsonCodecV2, journal: Journal) -> Result<Self, Error> {
        crate::actions::validate_id(&journal.document)?;
        let doc = LoroDoc::new();
        doc.set_peer_id(writer_id(&journal.writer)?)?;
        doc.set_record_timestamp(false);
        doc.config_default_text_style(Some(StyleConfig::default()));
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
        let header = materialize::header(&doc)?;
        let value = materialize::envelope(&doc)?;
        let admitted = codec.decode(&value.to_string()).map_err(contract)?;
        let document =
            RichDocument::try_admit(codec.schema(), admitted, codec.limits()).map_err(contract)?;
        if document.id().as_str() != journal.document {
            return Err(Error::Contract("rich replica document binding"));
        }
        let canonical = codec.encode(document.document()).map_err(contract)?;
        let mut undo = UndoManager::new(&doc);
        undo.set_merge_interval(0);
        undo.set_max_undo_steps(MAX_ENTRIES);
        Ok(Self { doc, undo, codec, journal, header, document, canonical })
    }

    fn from_journal(codec: DocumentJsonCodecV2, journal: Journal) -> Result<Self, Error> {
        if journal.format != "breditor/rich-replica-journal" || journal.version != 1 {
            return Err(Error::Contract("rich replica journal version"));
        }
        if journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("rich journal entries"));
        }
        let mut candidate = Self::base(codec, journal.clone())?;
        for entry in &journal.entries {
            let before = candidate.doc.oplog_vv();
            let expected = match entry {
                Entry::Local { commands, expected } => {
                    candidate.execute(commands)?;
                    Some(expected)
                }
                Entry::Remote { bytes } => {
                    candidate.import(bytes)?;
                    None
                }
                Entry::Undo { changed, expected } => {
                    if candidate.undo.undo()? != *changed {
                        return Err(Error::ReplayMismatch);
                    }
                    Some(expected)
                }
                Entry::Redo { changed, expected } => {
                    if candidate.undo.redo()? != *changed {
                        return Err(Error::ReplayMismatch);
                    }
                    Some(expected)
                }
            };
            if let Some(expected) = expected
                && effects(&candidate.doc, &before)? != *expected
            {
                return Err(Error::ReplayMismatch);
            }
        }
        candidate.journal = journal;
        candidate.validate_adoption()?;
        Ok(candidate)
    }

    /// Publish one explicit group only after all shared effects and its AST validate.
    ///
    /// # Errors
    /// Invalid targets/values, limits or engine failures retain every published field.
    pub fn apply(&mut self, commands: Vec<Command>) -> Result<bool, Error> {
        let mut candidate = Self::from_journal(self.codec.clone(), self.journal.clone())?;
        let before = candidate.doc.oplog_vv();
        let history = (candidate.undo_count(), candidate.redo_count());
        candidate.execute(&commands)?;
        candidate.refresh_document()?;
        if before == candidate.doc.oplog_vv()
            || (self.canonical == candidate.canonical
                && history == (candidate.undo_count(), candidate.redo_count()))
        {
            return Ok(false);
        }
        let expected = effects(&candidate.doc, &before)?;
        candidate.journal.entries.push(Entry::Local { commands, expected });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(true)
    }

    fn execute(&mut self, commands: &[Command]) -> Result<(), Error> {
        if commands.is_empty() || commands.len() > 64 {
            return Err(Error::Limit("rich shared action steps"));
        }
        self.refresh_document()?;
        self.validate_targets(commands)?;
        self.undo.pause();
        for command in commands {
            command.prepare(&self.doc)?;
        }
        self.doc.commit();
        self.undo.resume();
        let stamp = Stamp::next(&self.doc)?;
        self.undo.group_start()?;
        for (ordinal, command) in commands.iter().enumerate() {
            command.apply(&self.doc, stamp, ordinal)?;
        }
        self.doc.commit();
        self.undo.group_end();
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
        let formats = RichFormatsJsonCodec::new(EditorContext::new(
            self.codec.schema().clone(),
            self.codec.limits().clone(),
        ));
        for command in commands {
            let block = match command {
                Command::InsertText(value) => &value.block,
                Command::DeleteText(value) => &value.block,
                Command::SetFormat(value) => &value.block,
                Command::SetImageAlt(value) => &value.block,
                Command::ReplaceImage(value) => &value.block,
                Command::ResizeImage(value) => &value.block,
                Command::ResizeColumn(value) => &value.block,
                Command::MoveBlock(value) => &value.block,
                Command::DeleteBlock(value) => &value.block,
                Command::MoveColumn(value) => &value.block,
                Command::DeleteColumn(value) => &value.block,
            };
            let block = BlockId::try_new(block).map_err(contract)?;
            let path = self
                .document
                .block_path(&block)
                .ok_or(Error::Contract("visible shared action target"))?;
            let node = self
                .document
                .document()
                .node_at(path)
                .map_err(contract)?
                .as_element()
                .ok_or(Error::Contract("shared element target"))?;
            let kind = node.kind().as_str();
            match command {
                Command::InsertText(_) | Command::DeleteText(_) | Command::SetFormat(_) => {
                    if kind != "breditor/paragraph" && kind != "breditor/heading" {
                        return Err(Error::Contract("shared text target kind"));
                    }
                }
                Command::SetImageAlt(_) | Command::ReplaceImage(_) | Command::ResizeImage(_) => {
                    if kind != "breditor/image" {
                        return Err(Error::Contract("shared image target kind"));
                    }
                }
                Command::ResizeColumn(_) | Command::MoveColumn(_) | Command::DeleteColumn(_) => {
                    if kind != "breditor/table" {
                        return Err(Error::Contract("shared table target kind"));
                    }
                }
                Command::MoveBlock(value) => {
                    if let Some(parent) = &value.parent {
                        let parent = BlockId::try_new(parent).map_err(contract)?;
                        if self.document.block_path(&parent).is_none() {
                            return Err(Error::Contract("visible shared move parent"));
                        }
                    }
                }
                Command::DeleteBlock(_) => {}
            }
            if let Command::SetFormat(value) = command {
                formats.decode(&json!([value.format]).to_string()).map_err(contract)?;
            }
            if let Command::ResizeColumn(value) = command {
                let raw: Value = serde_json::from_str(&self.canonical)?;
                if !find_column(&raw["root"], block.as_str(), &value.column) {
                    return Err(Error::Contract("visible shared column target"));
                }
            }
        }
        Ok(())
    }

    fn refresh_document(&mut self) -> Result<(), Error> {
        if materialize::header(&self.doc)? != self.header {
            return Err(Error::Contract("immutable shared document binding"));
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
        Ok(())
    }

    fn validate_adoption(&mut self) -> Result<(), Error> {
        if self.journal.entries.len() > MAX_ENTRIES {
            return Err(Error::Limit("rich journal entries"));
        }
        let root = self.doc.get_value();
        let root = root.as_map().ok_or(Error::Contract("rich shared root map"))?;
        for (name, value) in root.iter() {
            let kind = match name.as_str() {
                "nodes" => ContainerType::Tree,
                "binding" | "texts" | "columns" | "metadata" | "orders" | "sites" => {
                    ContainerType::Map
                }
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
            crate::actions::validate_id(&block)?;
            if block.starts_with(model::VIRTUAL_PREFIX) || !blocks.insert(block) {
                return Err(Error::Contract("historical shared block identity"));
            }
        }
        self.refresh_document()?;
        self.checkpoint()?;
        Ok(())
    }

    fn import(&mut self, bytes: &[u8]) -> Result<(), Error> {
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
        self.doc.import(bytes)?;
        Ok(())
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
        let mut candidate = Self::from_journal(self.codec.clone(), self.journal.clone())?;
        candidate.import(&bytes)?;
        candidate.journal.entries.push(Entry::Remote { bytes });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(())
    }
    fn history(&mut self, redo: bool) -> Result<bool, Error> {
        let mut candidate = Self::from_journal(self.codec.clone(), self.journal.clone())?;
        let before = candidate.doc.oplog_vv();
        let counts = (candidate.undo.undo_count(), candidate.undo.redo_count());
        let changed = if redo { candidate.undo.redo()? } else { candidate.undo.undo()? };
        if !changed && counts == (candidate.undo.undo_count(), candidate.undo.redo_count()) {
            return Ok(false);
        }
        let expected = effects(&candidate.doc, &before)?;
        candidate.journal.entries.push(if redo {
            Entry::Redo { changed, expected }
        } else {
            Entry::Undo { changed, expected }
        });
        candidate.validate_adoption()?;
        *self = candidate;
        Ok(changed)
    }
    /// Undo this writer's group against current remote content.
    /// # Errors
    /// Replay/engine/schema failure retains the original owner.
    pub fn undo(&mut self) -> Result<bool, Error> {
        self.history(false)
    }
    /// Redo the original contribution and priority, not a new competing edit.
    /// # Errors
    /// Replay/engine/schema failure retains the original owner.
    pub fn redo(&mut self) -> Result<bool, Error> {
        self.history(true)
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

fn find_column(node: &Value, block: &str, column: &str) -> bool {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return node
            .pointer("/properties/breditor~1columns")
            .and_then(Value::as_array)
            .is_some_and(|columns| {
                columns.iter().any(|value| value.get("id").and_then(Value::as_str) == Some(column))
            });
    }
    node.get("children")
        .and_then(Value::as_array)
        .is_some_and(|children| children.iter().any(|child| find_column(child, block, column)))
}
