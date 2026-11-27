//! Multi-root history coordinator over separately owned rich editors.
//!
//! Each root stays an ordinary `BreditorRichEditor` (so every existing command,
//! read and checkpoint works per root). This owner holds root identity, order,
//! attributes, the active root and the ONE global Undo journal; hosts route
//! Undo/Redo to `undoTarget`/`redoTarget` (or `undoStructure`/`redoStructure`
//! when the step is a structure step) and call `reconcile` after any root
//! dispatch. It never mutates a root and never sees DOM, storage or network.
//! A root detached by an undoable step stays bound until `stateJson().detached`
//! no longer lists it; the host keeps that editor alive until then.

use super::{BreditorRichEditor, error};
use crate::{BreditorError, BreditorStringResult};
use breditor_core::rich_content::root_set::{
    RichRootCheckpointPart, RichRootHistory, RichRootId, RichRootJournalEntry, RichRootMeta,
    RichRootSelectionPolicy, RichRootSet, RichRootSetCheckpoint, RichRootSetError,
};
use serde::Deserialize;
use std::{collections::BTreeMap, sync::Arc};
use wasm_bindgen::prelude::wasm_bindgen;

/// One history owner across several editable roots.
#[wasm_bindgen]
pub struct BreditorRichRootSet {
    set: RichRootSet,
    // Bound owner identity per attached or retained detached root: commands from another editor are refused.
    owners: BTreeMap<RichRootId, Arc<()>>,
    pending: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MetaWire {
    id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    attributes: BTreeMap<String, String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PartWire {
    id: String,
    #[serde(default)]
    detached: bool,
    history: String,
    selection: String,
    checkpoint: String,
}

fn fail(value: RichRootSetError) -> BreditorError {
    match value {
        RichRootSetError::InvalidRootId => error::rejected("breditor_rich.root_id"),
        RichRootSetError::InvalidMetadata => error::rejected("breditor_rich.root_metadata"),
        RichRootSetError::DuplicateRoot => error::rejected("breditor_rich.root_duplicate"),
        RichRootSetError::UnknownRoot => error::rejected("breditor_rich.root_unknown"),
        RichRootSetError::TooManyRoots => error::rejected("breditor_rich.root_limit"),
        RichRootSetError::HistoryNotEmpty => error::rejected("breditor_rich.root_history"),
        RichRootSetError::Incomplete => error::rejected("breditor_rich.root_set_incomplete"),
        RichRootSetError::HistoryMismatch => error::rejected("breditor_rich.root_history_mismatch"),
        RichRootSetError::IndexOutOfRange => error::rejected("breditor_rich.root_index"),
        RichRootSetError::LastRoot => error::rejected("breditor_rich.root_last"),
        RichRootSetError::StaleRevision => error::rejected("breditor_rich.root_set_stale"),
        RichRootSetError::NoStructureStep => error::rejected("breditor_rich.root_structure_step"),
        RichRootSetError::CheckpointRejected | RichRootSetError::ContextMismatch => {
            error::rejected("breditor_rich.root_set_checkpoint")
        }
        RichRootSetError::Session(inner) => error::session(&inner),
    }
}

fn root_id(value: &str) -> Result<RichRootId, BreditorError> {
    RichRootId::try_new(value).map_err(fail)
}

fn string(result: Result<String, BreditorError>) -> BreditorStringResult {
    match result {
        Ok(value) => BreditorStringResult::from_value(value),
        Err(value) => BreditorStringResult::from_error(value),
    }
}

fn history_name(history: RichRootHistory) -> &'static str {
    match history {
        RichRootHistory::Explicit => "explicit",
        RichRootHistory::TypingV1 => "typing-v1",
    }
}

fn selection_name(selection: RichRootSelectionPolicy) -> &'static str {
    match selection {
        RichRootSelectionPolicy::Original => "original",
        RichRootSelectionPolicy::DocumentV1 => "document-v1",
    }
}

fn step_name(entry: Option<&RichRootJournalEntry>) -> Option<&'static str> {
    entry.map(|entry| match entry {
        RichRootJournalEntry::Unit(_) => "root",
        RichRootJournalEntry::Structure(step) => step.kind(),
    })
}

impl Default for BreditorRichRootSet {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl BreditorRichRootSet {
    /// An empty set with no roots.
    #[must_use]
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { set: RichRootSet::new(), owners: BTreeMap::new(), pending: false }
    }
    /// Additive capability marker.
    #[must_use]
    #[wasm_bindgen(js_name=rootSetVersion)]
    pub fn root_set_version(&self) -> String {
        "1".to_owned()
    }
    /// Additive capability marker for undoable add/remove/move/attribute steps and checkpoint v2.
    #[must_use]
    #[wasm_bindgen(js_name=rootHistoryVersion)]
    pub fn root_history_version(&self) -> String {
        "1".to_owned()
    }
    fn owner(&self, id: &RichRootId, editor: &BreditorRichEditor) -> Result<(), BreditorError> {
        match self.owners.get(id) {
            Some(owner) if Arc::ptr_eq(owner, &editor.search_owner) => Ok(()),
            Some(_) => Err(error::rejected("breditor_rich.root_owner")),
            None => Err(fail(RichRootSetError::UnknownRoot)),
        }
    }
    fn live(&self) -> Result<(), BreditorError> {
        if self.pending { Err(fail(RichRootSetError::Incomplete)) } else { Ok(()) }
    }
    /// Refuse a request prepared from another publication (`revision` from `stateJson`).
    fn fresh(&self, revision: Option<String>) -> Result<(), BreditorError> {
        self.live()?;
        let Some(revision) = revision else { return Ok(()) };
        let revision =
            revision.parse::<u64>().map_err(|_| fail(RichRootSetError::StaleRevision))?;
        self.set.check_revision(revision).map_err(fail)
    }
    /// Drop owner bindings of roots the set released.
    fn sweep(&mut self) {
        let set = &self.set;
        self.owners.retain(|id, _| set.retains(id));
    }
    fn meta(
        &self,
        meta_json: &str,
        editor: &BreditorRichEditor,
    ) -> Result<RichRootMeta, BreditorError> {
        let wire: MetaWire = serde_json::from_str(meta_json)
            .map_err(|_| error::rejected("breditor_rich.root_metadata"))?;
        let meta =
            RichRootMeta::try_new(root_id(&wire.id)?, wire.label, wire.attributes).map_err(fail)?;
        if self.owners.values().any(|owner| Arc::ptr_eq(owner, &editor.search_owner)) {
            return Err(error::rejected("breditor_rich.root_owner"));
        }
        Ok(meta)
    }
    /// Add `{id,label?,attributes?}` backed by a fresh (empty-history) editor at `index`
    /// (default last), outside history. Undoable add/remove/move steps already in history leave it.
    #[must_use]
    #[wasm_bindgen(js_name=addRoot)]
    pub fn add_root(
        &mut self,
        meta_json: &str,
        editor: &BreditorRichEditor,
        index: Option<u32>,
    ) -> BreditorStringResult {
        string((|| {
            self.live()?;
            let meta = self.meta(meta_json, editor)?;
            let id = meta.id().clone();
            self.set
                .add_root(meta, &editor.inner, index.map(|index| index as usize))
                .map_err(fail)?;
            self.sweep();
            self.owners.insert(id, editor.search_owner.clone());
            Ok(self.state())
        })())
    }
    /// Add a root as one global Undo step (it becomes active). Undo detaches it; keep its editor.
    #[must_use]
    #[wasm_bindgen(js_name=addRootUndoable)]
    pub fn add_root_undoable(
        &mut self,
        meta_json: &str,
        editor: &BreditorRichEditor,
        index: Option<u32>,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            let meta = self.meta(meta_json, editor)?;
            let id = meta.id().clone();
            self.set
                .add_root_undoable(meta, &editor.inner, index.map(|index| index as usize))
                .map_err(fail)?;
            self.sweep();
            self.owners.insert(id, editor.search_owner.clone());
            Ok(self.state())
        })())
    }
    /// Detach a root outside history; its editor is no longer bound and the host may dispose it.
    #[must_use]
    #[wasm_bindgen(js_name=removeRoot)]
    pub fn remove_root(&mut self, id: &str) -> BreditorStringResult {
        string((|| {
            self.live()?;
            let id = root_id(id)?;
            self.set.remove_root(&id).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Detach a root as one global Undo step; its editor stays bound (keep it) for Undo.
    #[must_use]
    #[wasm_bindgen(js_name=removeRootUndoable)]
    pub fn remove_root_undoable(
        &mut self,
        id: &str,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.remove_root_undoable(&root_id(id)?).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Move a root to set-order position `index` as one global Undo step.
    #[must_use]
    #[wasm_bindgen(js_name=moveRoot)]
    pub fn move_root(
        &mut self,
        id: &str,
        index: u32,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.move_root(&root_id(id)?, index as usize).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Replace a root's host attributes as one global Undo step (no step when unchanged).
    #[must_use]
    #[wasm_bindgen(js_name=setAttributes)]
    pub fn set_attributes(
        &mut self,
        id: &str,
        attributes_json: &str,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            let attributes: BTreeMap<String, String> = serde_json::from_str(attributes_json)
                .map_err(|_| error::rejected("breditor_rich.root_metadata"))?;
            self.set.set_attributes(&root_id(id)?, attributes).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Set one root attribute as one global Undo step.
    #[must_use]
    #[wasm_bindgen(js_name=setAttribute)]
    pub fn set_attribute(
        &mut self,
        id: &str,
        key: &str,
        value: &str,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.set_attribute(&root_id(id)?, key, value).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Remove one root attribute as one global Undo step.
    #[must_use]
    #[wasm_bindgen(js_name=removeAttribute)]
    pub fn remove_attribute(
        &mut self,
        id: &str,
        key: &str,
        revision: Option<String>,
    ) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.remove_attribute(&root_id(id)?, key).map_err(fail)?;
            self.sweep();
            Ok(self.state())
        })())
    }
    /// Undo the newest global step when `undoStep` names a structure step.
    #[must_use]
    #[wasm_bindgen(js_name=undoStructure)]
    pub fn undo_structure(&mut self, revision: Option<String>) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.undo_structure().map_err(fail)?;
            Ok(self.state())
        })())
    }
    /// Redo the next global step when `redoStep` names a structure step.
    #[must_use]
    #[wasm_bindgen(js_name=redoStructure)]
    pub fn redo_structure(&mut self, revision: Option<String>) -> BreditorStringResult {
        string((|| {
            self.fresh(revision)?;
            self.set.redo_structure().map_err(fail)?;
            Ok(self.state())
        })())
    }
    /// Make a root active (focus moved to its surface).
    #[must_use]
    pub fn focus(&mut self, id: &str) -> BreditorStringResult {
        string((|| {
            self.set.focus(&root_id(id)?).map_err(fail)?;
            Ok(self.state())
        })())
    }
    /// Record a root editor's history events in the global order; call after every root dispatch.
    #[must_use]
    pub fn reconcile(&mut self, id: &str, editor: &BreditorRichEditor) -> BreditorStringResult {
        string((|| {
            let id = root_id(id)?;
            self.owner(&id, editor)?;
            let before = self.set.revision();
            self.set.reconcile(&id, &editor.inner).map_err(fail)?;
            self.sweep();
            Ok((self.set.revision() != before).to_string())
        })())
    }
    /// Read-only set state: roots, retained detached roots, active root, global depths and
    /// the next Undo/Redo step (`root` or a structure kind) with the root it belongs to.
    #[must_use]
    #[wasm_bindgen(js_name=stateJson)]
    pub fn state_json(&self) -> String {
        self.state()
    }
    fn state(&self) -> String {
        let roots: Vec<_> = self
            .set
            .roots()
            .map(|meta| {
                serde_json::json!({"id":meta.id().as_str(),"label":meta.label(),"attributes":meta.attributes()})
            })
            .collect();
        let detached: Vec<_> = self.set.detached().map(|meta| meta.id().as_str()).collect();
        let name = |id: Option<&RichRootId>| id.map(|id| id.as_str().to_owned());
        serde_json::json!({"format":"breditor/rich-root-set-state","formatVersion":1,
            "revision":self.set.revision().to_string(),"complete":!self.pending,"roots":roots,
            "detached":detached,"active":name(self.set.active()),"undoDepth":self.set.undo_depth(),
            "redoDepth":self.set.redo_depth(),"undoTarget":name(self.set.undo_target()),
            "redoTarget":name(self.set.redo_target()),"undoStep":step_name(self.set.undo_step()),
            "redoStep":step_name(self.set.redo_step())})
        .to_string()
    }
    /// Envelope from `[{id,detached?,history,selection,checkpoint}]` per-root checkpoints:
    /// attached roots in set order, then `stateJson().detached` roots in that order.
    #[must_use]
    #[wasm_bindgen(js_name=checkpointJson)]
    pub fn checkpoint_json(&self, parts_json: &str) -> BreditorStringResult {
        string((|| {
            self.live()?;
            let rejected = || error::rejected("breditor_rich.root_set_checkpoint");
            let wire: Vec<PartWire> = serde_json::from_str(parts_json).map_err(|_| rejected())?;
            let parts = wire
                .into_iter()
                .map(|part| {
                    Ok(RichRootCheckpointPart {
                        id: root_id(&part.id)?,
                        detached: part.detached,
                        history: match part.history.as_str() {
                            "explicit" => RichRootHistory::Explicit,
                            "typing-v1" => RichRootHistory::TypingV1,
                            _ => return Err(rejected()),
                        },
                        selection: match part.selection.as_str() {
                            "original" => RichRootSelectionPolicy::Original,
                            "document-v1" => RichRootSelectionPolicy::DocumentV1,
                            _ => return Err(rejected()),
                        },
                        checkpoint: part.checkpoint,
                    })
                })
                .collect::<Result<Vec<_>, BreditorError>>()?;
            self.set.encode_checkpoint(&parts).map_err(fail)
        })())
    }
    /// Load an untrusted version 1 or 2 envelope into this empty set; returns the per-root
    /// parts to restore (detached ones flagged). The set stays incomplete until every
    /// root editor, detached ones included, is attached with `attach`.
    #[must_use]
    pub fn restore(&mut self, input: &str) -> BreditorStringResult {
        string((|| {
            if self.set.roots().next().is_some() || self.pending {
                return Err(error::rejected("breditor_rich.root_set_checkpoint"));
            }
            let RichRootSetCheckpoint { set, parts } =
                RichRootSetCheckpoint::decode(input).map_err(fail)?;
            let parts: Vec<_> = parts
                .iter()
                .map(|part| {
                    serde_json::json!({"id":part.id.as_str(),"detached":part.detached,
                        "history":history_name(part.history),"selection":selection_name(part.selection),
                        "checkpoint":part.checkpoint})
                })
                .collect();
            self.pending = !parts.is_empty();
            self.set = set;
            Ok(serde_json::Value::Array(parts).to_string())
        })())
    }
    /// Verify a restored root editor against the decoded journal and bind it to its root.
    #[must_use]
    pub fn attach(&mut self, id: &str, editor: &BreditorRichEditor) -> BreditorStringResult {
        string((|| {
            let id = root_id(id)?;
            if self.owners.values().any(|owner| Arc::ptr_eq(owner, &editor.search_owner)) {
                return Err(error::rejected("breditor_rich.root_owner"));
            }
            self.set.attach(&id, &editor.inner).map_err(fail)?;
            self.owners.insert(id, editor.search_owner.clone());
            self.pending = !self.set.is_complete();
            Ok(self.state())
        })())
    }
}
