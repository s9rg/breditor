use breditor_core::engine::EditorEngineObservation;
use wasm_bindgen::prelude::wasm_bindgen;

/// Opaque, process-local observation required by every editor command.
///
/// Only the engine and command results produce usable instances; a raw
/// JavaScript `new BreditorObservation()` creates an inert zero handle. Visible
/// fields are diagnostics only; the hidden Rust value also contains exact
/// engine and history identities. Retaining an old live value is safe because
/// the core rejects it after state, history, or engine ownership changes.
#[wasm_bindgen]
pub struct BreditorObservation {
    pub(crate) inner: EditorEngineObservation,
}

impl BreditorObservation {
    pub(crate) const fn new(inner: EditorEngineObservation) -> Self {
        Self { inner }
    }

    pub(crate) const fn inner(&self) -> &EditorEngineObservation {
        &self.inner
    }
}

#[wasm_bindgen]
impl BreditorObservation {
    /// Returns the snapshot lineage as a portable string.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotLineage)]
    pub fn snapshot_lineage(&self) -> String {
        self.inner.snapshot().lineage().as_str().to_owned()
    }

    /// Returns the full-width snapshot revision as a decimal string.
    ///
    /// A string is used because Rust `u64` revisions can exceed JavaScript's
    /// exactly representable integer range.
    #[must_use]
    #[wasm_bindgen(getter, js_name = snapshotRevision)]
    pub fn snapshot_revision(&self) -> String {
        self.inner.snapshot().revision().get().to_string()
    }

    /// Returns the configured retained-history entry capacity.
    #[must_use]
    #[wasm_bindgen(getter, js_name = historyCapacity)]
    pub fn history_capacity(&self) -> u32 {
        self.inner.history_status().capacity().get()
    }

    /// Returns the number of currently undoable entries.
    #[must_use]
    #[wasm_bindgen(getter, js_name = undoDepth)]
    pub fn undo_depth(&self) -> u32 {
        self.inner.history_status().undo_depth()
    }

    /// Returns the number of currently redoable entries.
    #[must_use]
    #[wasm_bindgen(getter, js_name = redoDepth)]
    pub fn redo_depth(&self) -> u32 {
        self.inner.history_status().redo_depth()
    }

    /// Returns whether an undo entry was available in this observation.
    #[must_use]
    #[wasm_bindgen(getter, js_name = canUndo)]
    pub fn can_undo(&self) -> bool {
        self.inner.history_status().can_undo()
    }

    /// Returns whether a redo entry was available in this observation.
    #[must_use]
    #[wasm_bindgen(getter, js_name = canRedo)]
    pub fn can_redo(&self) -> bool {
        self.inner.history_status().can_redo()
    }
}
