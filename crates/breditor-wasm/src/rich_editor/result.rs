//! Owned rich factory/command results; no serialization disguises a publication outcome.

use super::{BreditorRichEditor, BreditorRichObservation, BreditorRichProfile};
use crate::BreditorError;
use breditor_core::rich_content::RichLocalOutcome;
use wasm_bindgen::prelude::wasm_bindgen;

/// One-shot ownership transfer of a compiled rich profile or redacted failure.
#[wasm_bindgen]
pub struct BreditorRichProfileResult {
    profile: Option<BreditorRichProfile>,
    error: Option<BreditorError>,
    succeeded: bool,
}
impl BreditorRichProfileResult {
    pub(super) const fn success(profile: BreditorRichProfile) -> Self {
        Self { profile: Some(profile), error: None, succeeded: true }
    }
    pub(super) const fn failure(error: BreditorError) -> Self {
        Self { profile: None, error: Some(error), succeeded: false }
    }
}
#[wasm_bindgen]
impl BreditorRichProfileResult {
    /// Returns `profile`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> String {
        if self.profile.is_some() {
            "profile"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }
    /// Transfer the immutable compiled profile exactly once.
    #[wasm_bindgen(js_name=takeProfile)]
    pub fn take_profile(&mut self) -> Option<BreditorRichProfile> {
        self.profile.take()
    }
    /// Independently owned redacted error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}

/// One-shot ownership transfer of a local rich editor or redacted factory failure.
#[wasm_bindgen]
pub struct BreditorRichEditorResult {
    editor: Option<BreditorRichEditor>,
    error: Option<BreditorError>,
    succeeded: bool,
}
impl BreditorRichEditorResult {
    pub(super) const fn success(editor: BreditorRichEditor) -> Self {
        Self { editor: Some(editor), error: None, succeeded: true }
    }
    pub(super) const fn failure(error: BreditorError) -> Self {
        Self { editor: None, error: Some(error), succeeded: false }
    }
}
#[wasm_bindgen]
impl BreditorRichEditorResult {
    /// Returns `editor`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> String {
        if self.editor.is_some() {
            "editor"
        } else if self.succeeded {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }
    /// Transfer one exclusive rich owner exactly once.
    #[wasm_bindgen(js_name=takeEditor)]
    pub fn take_editor(&mut self) -> Option<BreditorRichEditor> {
        self.editor.take()
    }
    /// Independently owned redacted factory error.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}

/// Result of guarded rich publication, with a separately owned next observation.
#[wasm_bindgen]
pub struct BreditorRichCommandResult {
    outcome: Option<RichLocalOutcome>,
    observation: Option<BreditorRichObservation>,
    error: Option<BreditorError>,
}
impl BreditorRichCommandResult {
    pub(super) const fn success(
        outcome: RichLocalOutcome,
        observation: BreditorRichObservation,
    ) -> Self {
        Self { outcome: Some(outcome), observation: Some(observation), error: None }
    }
    pub(super) const fn failure(error: BreditorError) -> Self {
        Self { outcome: None, observation: None, error: Some(error) }
    }
}
#[wasm_bindgen]
impl BreditorRichCommandResult {
    /// Returns `content`, `selection`, `typing`, `undo`, `redo`, `unchanged`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> String {
        match self.outcome {
            Some(RichLocalOutcome::ContentCommitted) => "content",
            Some(RichLocalOutcome::SelectionOnly) => "selection",
            Some(RichLocalOutcome::TypingStateOnly) => "typing",
            Some(RichLocalOutcome::UndoApplied) => "undo",
            Some(RichLocalOutcome::RedoApplied) => "redo",
            Some(RichLocalOutcome::Unchanged) => "unchanged",
            None => "error",
        }
        .to_owned()
    }
    /// Transfer the exact next publication observation once; errors supply no observation.
    #[wasm_bindgen(js_name=takeObservation)]
    pub fn take_observation(&mut self) -> Option<BreditorRichObservation> {
        self.observation.take()
    }
    /// Independently owned payload-redacting command error.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
