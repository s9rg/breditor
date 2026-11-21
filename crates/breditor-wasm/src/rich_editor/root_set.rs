//! Multi-root history coordinator over separately owned rich editors.
//!
//! Each root stays an ordinary `BreditorRichEditor` (so every existing command,
//! read and checkpoint works per root). This owner holds root identity, order,
//! attributes, the active root and the ONE global Undo journal; hosts route
//! Undo/Redo to `undoTarget`/`redoTarget` and call `reconcile` after any root
//! dispatch. It never mutates a root and never sees DOM, storage or network.

use super::{BreditorRichEditor, error};
use crate::{BreditorError, BreditorStringResult};
use breditor_core::rich_content::root_set::{
    RichRootCheckpointPart, RichRootHistory, RichRootId, RichRootMeta, RichRootSelectionPolicy,
    RichRootSet, RichRootSetCheckpoint, RichRootSetError,
};
use serde::Deserialize;
use std::{collections::BTreeMap, sync::Arc};
use wasm_bindgen::prelude::wasm_bindgen;

/// One history owner across several editable roots.
#[wasm_bindgen]
pub struct BreditorRichRootSet {
    set: RichRootSet,
    // Attached owner identity per root: commands from another editor are refused.
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
    history: String,
    selection: String,
    checkpoint: String,
}

fn failure(value: &RichRootSetError) -> BreditorError {
    match value {
        RichRootSetError::InvalidRootId => error::rejected("breditor_rich.root_id"),
        RichRootSetError::InvalidMetadata => error::rejected("breditor_rich.root_metadata"),
        RichRootSetError::DuplicateRoot => error::rejected("breditor_rich.root_duplicate"),
        RichRootSetError::UnknownRoot => error::rejected("breditor_rich.root_unknown"),
        RichRootSetError::TooManyRoots => error::rejected("breditor_rich.root_limit"),
        RichRootSetError::HistoryNotEmpty => error::rejected("breditor_rich.root_history"),
        RichRootSetError::Incomplete => error::rejected("breditor_rich.root_set_incomplete"),
        RichRootSetError::HistoryMismatch => error::rejected("breditor_rich.root_history_mismatch"),
        RichRootSetError::CheckpointRejected | RichRootSetError::ContextMismatch => {
            error::rejected("breditor_rich.root_set_checkpoint")
        }
        RichRootSetError::Session(inner) => error::session(inner),
    }
}

fn root_id(value: &str) -> Result<RichRootId, BreditorError> {
    RichRootId::try_new(value).map_err(|value| failure(&value))
}

fn string(result: Result<String, BreditorError>) -> BreditorStringResult {
    match result {
        Ok(value) => BreditorStringResult::from_value(value),
        Err(value) => BreditorStringResult::from_error(value),
    }
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
    fn owner(&self, id: &RichRootId, editor: &BreditorRichEditor) -> Result<(), BreditorError> {
        match self.owners.get(id) {
            Some(owner) if Arc::ptr_eq(owner, &editor.search_owner) => Ok(()),
            Some(_) => Err(error::rejected("breditor_rich.root_owner")),
            None => Err(failure(&RichRootSetError::UnknownRoot)),
        }
    }
    /// Add `{id,label?,attributes?}` backed by a fresh (empty-history) editor at `index` (default last).
    #[must_use]
    #[wasm_bindgen(js_name=addRoot)]
    pub fn add_root(
        &mut self,
        meta_json: &str,
        editor: &BreditorRichEditor,
        index: Option<u32>,
    ) -> BreditorStringResult {
        string((|| {
            if self.pending {
                return Err(failure(&RichRootSetError::Incomplete));
            }
            let wire: MetaWire = serde_json::from_str(meta_json)
                .map_err(|_| error::rejected("breditor_rich.root_metadata"))?;
            let meta = RichRootMeta::try_new(root_id(&wire.id)?, wire.label, wire.attributes)
                .map_err(|value| failure(&value))?;
            if self.owners.values().any(|owner| Arc::ptr_eq(owner, &editor.search_owner)) {
                return Err(error::rejected("breditor_rich.root_owner"));
            }
            let id = meta.id().clone();
            self.set
                .add_root(meta, &editor.inner, index.map(|index| index as usize))
                .map_err(|value| failure(&value))?;
            self.owners.insert(id, editor.search_owner.clone());
            Ok(self.state())
        })())
    }
    /// Detach a root (not an Undo unit); its editor stays usable by the host.
    #[must_use]
    #[wasm_bindgen(js_name=removeRoot)]
    pub fn remove_root(&mut self, id: &str) -> BreditorStringResult {
        string((|| {
            let id = root_id(id)?;
            self.set.remove_root(&id).map_err(|value| failure(&value))?;
            self.owners.remove(&id);
            Ok(self.state())
        })())
    }
    /// Replace a root's host attributes (not an Undo unit).
    #[must_use]
    #[wasm_bindgen(js_name=setAttributes)]
    pub fn set_attributes(&mut self, id: &str, attributes_json: &str) -> BreditorStringResult {
        string((|| {
            let attributes: BTreeMap<String, String> = serde_json::from_str(attributes_json)
                .map_err(|_| error::rejected("breditor_rich.root_metadata"))?;
            self.set.set_attributes(&root_id(id)?, attributes).map_err(|value| failure(&value))?;
            Ok(self.state())
        })())
    }
    /// Make a root active (focus moved to its surface).
    #[must_use]
    pub fn focus(&mut self, id: &str) -> BreditorStringResult {
        string((|| {
            self.set.focus(&root_id(id)?).map_err(|value| failure(&value))?;
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
            self.set.reconcile(&id, &editor.inner).map_err(|value| failure(&value))?;
            Ok((self.set.revision() != before).to_string())
        })())
    }
    /// Read-only set state: roots, active root, global depths and Undo/Redo targets.
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
        let name = |id: Option<&RichRootId>| id.map(|id| id.as_str().to_owned());
        serde_json::json!({"format":"breditor/rich-root-set-state","formatVersion":1,
            "revision":self.set.revision().to_string(),"complete":!self.pending,"roots":roots,
            "active":name(self.set.active()),"undoDepth":self.set.undo_depth(),
            "redoDepth":self.set.redo_depth(),"undoTarget":name(self.set.undo_target()),
            "redoTarget":name(self.set.redo_target())})
        .to_string()
    }
    /// Envelope from `[{id,history,selection,checkpoint}]` per-root checkpoints in root order.
    #[must_use]
    #[wasm_bindgen(js_name=checkpointJson)]
    pub fn checkpoint_json(&self, parts_json: &str) -> BreditorStringResult {
        string((|| {
            if self.pending {
                return Err(failure(&RichRootSetError::Incomplete));
            }
            let wire: Vec<PartWire> = serde_json::from_str(parts_json)
                .map_err(|_| error::rejected("breditor_rich.root_set_checkpoint"))?;
            let parts = wire
                .into_iter()
                .map(|part| {
                    Ok(RichRootCheckpointPart {
                        id: root_id(&part.id)?,
                        history: match part.history.as_str() {
                            "explicit" => RichRootHistory::Explicit,
                            "typing-v1" => RichRootHistory::TypingV1,
                            _ => return Err(error::rejected("breditor_rich.root_set_checkpoint")),
                        },
                        selection: match part.selection.as_str() {
                            "original" => RichRootSelectionPolicy::Original,
                            "document-v1" => RichRootSelectionPolicy::DocumentV1,
                            _ => return Err(error::rejected("breditor_rich.root_set_checkpoint")),
                        },
                        checkpoint: part.checkpoint,
                    })
                })
                .collect::<Result<Vec<_>, BreditorError>>()?;
            self.set.encode_checkpoint(&parts).map_err(|value| failure(&value))
        })())
    }
    /// Load an untrusted envelope into this empty set; returns the per-root parts to restore.
    /// The set stays incomplete until every root editor is attached with `attach`.
    #[must_use]
    pub fn restore(&mut self, input: &str) -> BreditorStringResult {
        string((|| {
            if self.set.roots().next().is_some() || self.pending {
                return Err(error::rejected("breditor_rich.root_set_checkpoint"));
            }
            let RichRootSetCheckpoint { set, parts } =
                RichRootSetCheckpoint::decode(input).map_err(|value| failure(&value))?;
            let parts: Vec<_> = parts
                .iter()
                .map(|part| {
                    serde_json::json!({"id":part.id.as_str(),
                        "history":match part.history {RichRootHistory::Explicit=>"explicit",RichRootHistory::TypingV1=>"typing-v1"},
                        "selection":match part.selection {RichRootSelectionPolicy::Original=>"original",RichRootSelectionPolicy::DocumentV1=>"document-v1"},
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
            self.set.attach(&id, &editor.inner).map_err(|value| failure(&value))?;
            self.owners.insert(id, editor.search_owner.clone());
            self.pending = !self.set.is_complete();
            Ok(self.state())
        })())
    }
}
