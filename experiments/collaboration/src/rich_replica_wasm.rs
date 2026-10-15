//! Matching Wasm owner for shared rich-AST contracts, still isolated from shipping modules.
use crate::{
    Error,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
        selection::Selection,
    },
};
use breditor_core::{codec::DocumentJsonCodecV2, rich_content::GridMove};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
fn error(value: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&value.to_string())
}
fn codec() -> Result<DocumentJsonCodecV2, JsValue> {
    Ok(DocumentJsonCodecV2::new(crate::rich_ast_fixture::schema().map_err(error)?))
}

/// Opaque exact live-publication observation with independently owned frozen read values.
#[wasm_bindgen]
pub struct RichSharedObservation {
    inner: SharedObservation,
}
#[wasm_bindgen]
impl RichSharedObservation {
    /// Read the frozen shared view even after later publications or owner disposal.
    pub fn view_json(&self) -> String {
        self.inner.view_json().into()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Dispatch {
    commands: Vec<Command>,
    #[serde(default)]
    selection_update: SelectionUpdate,
    #[serde(default)]
    pending_formats_update: PendingFormatsUpdate,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ClipboardPaste {
    fragment: String,
    target: crate::rich_replica::PasteTarget,
    identities: Vec<crate::rich_clipboard_ids::AllocatedId>,
}

/// Exclusive shared writer whose exported content is an admitted Breditor rich AST.
#[wasm_bindgen]
pub struct RichReplicaProbe {
    inner: RichReplica,
}
impl RichReplicaProbe {
    pub(crate) fn from_replica(inner: RichReplica) -> Self {
        Self { inner }
    }
}
#[wasm_bindgen]
impl RichReplicaProbe {
    /// Read the matching ABI, private projection/history revisions and immutable schema binding.
    pub fn descriptor_json(&self) -> String {
        self.inner.descriptor_json()
    }
    /// Replace selected text with rich flow in one original-source-preserving Undo group.
    pub fn paste_flow_at_text_namespace(
        &mut self,
        observation: &RichSharedObservation,
        fragment: &str,
        right: &str,
        prefix: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        let mut ids = crate::rich_replica::ClipboardNamespace::try_new(prefix).map_err(error)?;
        self.inner
            .paste_flow_at_text_guarded(&observation.inner, fragment, right, &mut ids)
            .map_err(error)
    }
    /// Replace a native beforeinput target range with one exact text/selection history group.
    pub fn replace_plain_text(
        &mut self,
        observation: &RichSharedObservation,
        selection: &str,
        text: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if selection.len() > 64 * 1024 {
            return Err(error(Error::Limit("rich selection JSON bytes")));
        }
        let selection: Selection =
            serde_json::from_str(selection).map_err(|_| error(Error::Json))?;
        self.inner.replace_plain_text_guarded(&observation.inner, &selection, text).map_err(error)
    }
    /// Prepare IDs inside Rust from one fresh, permanently consumed host paste prefix.
    pub fn paste_clipboard_namespace(
        &mut self,
        observation: &RichSharedObservation,
        fragment: &str,
        target: &str,
        prefix: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if target.len() > 64 * 1024 {
            return Err(error(Error::Limit("clipboard target JSON bytes")));
        }
        let target = serde_json::from_str(target).map_err(|_| error(Error::Json))?;
        let mut ids = crate::rich_replica::ClipboardNamespace::try_new(prefix).map_err(error)?;
        self.inner
            .paste_clipboard_guarded(&observation.inner, fragment, target, &mut ids)
            .map_err(error)
    }
    /// Navigate admitted merged geometry; return explicit edges without inventing content.
    pub fn navigate_grid(
        &mut self,
        observation: &RichSharedObservation,
        movement: &str,
        extend: bool,
    ) -> Result<String, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        let movement = match movement {
            "next" => GridMove::Next,
            "previous" => GridMove::Previous,
            "left" => GridMove::Left,
            "right" => GridMove::Right,
            "up" => GridMove::Up,
            "down" => GridMove::Down,
            "rowStart" => GridMove::RowStart,
            "rowEnd" => GridMove::RowEnd,
            "tableStart" => GridMove::TableStart,
            "tableEnd" => GridMove::TableEnd,
            _ => return Err(error(Error::Contract("shared grid movement"))),
        };
        serde_json::to_string(
            &self
                .inner
                .navigate_grid_guarded(&observation.inner, movement, extend)
                .map_err(error)?,
        )
        .map_err(error)
    }
    /// Read selected rich/plain content without changing this observation or history.
    pub fn copy_clipboard(&self, observation: &RichSharedObservation) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.copy_clipboard_guarded(&observation.inner).map_err(error)?,
        )
        .map_err(error)
    }
    /// Paste semantic content with explicit target policy and durable host-allocated IDs.
    /// All supplied IDs remain consumed by the host on failure, including unused reservations.
    pub fn paste_clipboard(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if input.len() > 5 * 1024 * 1024 {
            return Err(error(Error::Limit("shared clipboard request bytes")));
        }
        let request: ClipboardPaste =
            serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        let mut ids = crate::rich_clipboard_ids::Ids::new(request.identities).map_err(error)?;
        self.inner
            .paste_clipboard_guarded(
                &observation.inner,
                &request.fragment,
                request.target,
                &mut ids,
            )
            .map_err(error)
    }
    /// Capture content, selection, typing state and history with an exact opaque guard.
    pub fn observe(&self) -> Result<RichSharedObservation, JsValue> {
        Ok(RichSharedObservation { inner: self.inner.observe().map_err(error)? })
    }
    /// Read the current shared view; its serialized revision alone never authorizes a mutation.
    pub fn view_json(&self) -> Result<String, JsValue> {
        self.inner.view_json().map_err(error)
    }
    /// Reject stale/foreign publication guards before decoding the complete action/UI envelope.
    pub fn dispatch(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("rich action JSON bytes")));
        }
        let request: Dispatch = serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner
            .apply_guarded(
                &observation.inner,
                request.commands,
                request.selection_update,
                request.pending_formats_update,
            )
            .map_err(error)
    }
    /// Set local directional text/node/grid selection without shared operations or content history.
    pub fn set_selection(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if input.len() > 64 * 1024 {
            return Err(error(Error::Limit("rich selection JSON bytes")));
        }
        let selection: Option<Selection> =
            serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner.set_selection_guarded(&observation.inner, selection.as_ref()).map_err(error)
    }
    /// Set complete admitted pending caret formats; null derives and an empty array types plain.
    pub fn set_pending_formats(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observation.inner).map_err(error)?;
        if input.len() > 64 * 1024 {
            return Err(error(Error::Limit("rich pending JSON bytes")));
        }
        self.inner.set_pending_formats_json(input).map_err(error)
    }
    /// Type with current pending/derived formats and publish the advanced caret atomically.
    pub fn insert_plain_text(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.insert_plain_text_guarded(&observation.inner, input).map_err(error)
    }
    /// Guard selective Undo against every content, UI and history publication.
    pub fn undo_observed(&mut self, observation: &RichSharedObservation) -> Result<bool, JsValue> {
        self.inner.undo_guarded(&observation.inner).map_err(error)
    }
    /// Guard selective Redo and restore the original action's post-selection.
    pub fn redo_observed(&mut self, observation: &RichSharedObservation) -> Result<bool, JsValue> {
        self.inner.redo_guarded(&observation.inner).map_err(error)
    }
    /// Seed a room once from a fingerprint-bound admitted Document V2.
    #[wasm_bindgen(constructor)]
    pub fn new(document: &str, writer: String) -> Result<Self, JsValue> {
        Ok(Self { inner: RichReplica::new(codec()?, document, writer).map_err(error)? })
    }
    /// Join existing causal state with a newly leased writer.
    pub fn join(document: String, writer: String, bytes: &[u8]) -> Result<Self, JsValue> {
        Ok(Self {
            inner: RichReplica::join(codec()?, document, writer, bytes.to_vec()).map_err(error)?,
        })
    }
    /// Resume the exact same writer after reacquiring its exclusive lease.
    pub fn restore(document: &str, journal: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: RichReplica::restore(codec()?, document, journal).map_err(error)? })
    }
    /// Apply one bounded closed shared action group through staged Rust adoption.
    pub fn apply(&mut self, input: &str) -> Result<bool, JsValue> {
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("rich action JSON bytes")));
        }
        let commands: Vec<Command> = serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner.apply(commands).map_err(error)
    }

    /// Exact canonical writer/counter strings for asynchronous content guards.
    pub fn causal_version(&self) -> String {
        self.inner.causal_version()
    }

    /// Reject old shared coordinates before parsing the action JSON.
    pub fn apply_at(&mut self, version: &str, input: &str) -> Result<bool, JsValue> {
        if version.len() > 64 * 1024 || version != self.inner.causal_version() {
            return Err(error(Error::Contract("stale shared causal version")));
        }
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("rich action JSON bytes")));
        }
        let commands: Vec<Command> = serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner.apply_at(version, commands).map_err(error)
    }
    /// Import changes supplied by an authorized host; no networking side effect.
    pub fn receive(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner.receive(bytes.to_vec()).map_err(error)
    }

    /// Join the original versioned room/schema/model envelope before engine admission.
    pub fn join_frame(document: String, writer: String, input: &str) -> Result<Self, JsValue> {
        Ok(Self {
            inner: RichReplica::join_frame(codec()?, document, writer, input).map_err(error)?,
        })
    }
    /// Export a versioned bound update; the host still authenticates transport/writers.
    pub fn update_frame(&self) -> Result<String, JsValue> {
        self.inner.update_frame().map_err(error)
    }
    /// Check all declared bindings before any staged engine import.
    pub fn receive_frame(&mut self, input: &str) -> Result<(), JsValue> {
        self.inner.receive_frame(input).map_err(error)
    }
    /// Undo only this writer's effect, including writer-owned placement/deletion.
    pub fn undo(&mut self) -> Result<bool, JsValue> {
        self.inner.undo().map_err(error)
    }
    /// Redo the original effect and causal priority.
    pub fn redo(&mut self) -> Result<bool, JsValue> {
        self.inner.redo().map_err(error)
    }
    /// Exact current Breditor Document V2, not probe values or CRDT JSON.
    pub fn document_json(&self) -> String {
        self.inner.document_json().into()
    }
    /// Opaque causal engine changes for the host transport.
    pub fn updates(&self) -> Result<Vec<u8>, JsValue> {
        self.inner.updates().map_err(error)
    }
    /// Same-writer journal with checked future undo/redo identities.
    pub fn checkpoint(&self) -> Result<String, JsValue> {
        self.inner.checkpoint().map_err(error)
    }
    /// Exact small bounded writer-local undo count.
    pub fn undo_count(&self) -> u32 {
        u32::try_from(self.inner.undo_count()).unwrap_or(u32::MAX)
    }
    /// Exact small bounded writer-local redo count.
    pub fn redo_count(&self) -> u32 {
        u32::try_from(self.inner.redo_count()).unwrap_or(u32::MAX)
    }
}
