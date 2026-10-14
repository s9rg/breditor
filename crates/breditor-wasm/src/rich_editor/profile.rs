//! Explicit V6 rich-profile bootstrap and fresh local-owner factories.

use super::{BreditorRichEditor, BreditorRichEditorResult, BreditorRichProfileResult, error};
use crate::{BreditorStringResult, profile::decode_rich_schema};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    rich_content::{RichDocument, RichLocalSession},
    schema::{CompiledSchema, DocumentLimits},
    session::HistoryCapacity,
    state::EditorContext,
};
use std::sync::Arc;
use wasm_bindgen::prelude::wasm_bindgen;

/// Immutable separately compiled rich grammar; bootstrap V6 never widens V1–V5 factories.
#[wasm_bindgen]
pub struct BreditorRichProfile {
    schema: Arc<CompiledSchema>,
}

impl BreditorRichProfile {
    pub(super) fn context(&self) -> EditorContext {
        EditorContext::new(self.schema.as_ref().clone(), DocumentLimits::default())
    }
}
#[wasm_bindgen]
impl BreditorRichProfile {
    /// Strictly compile typed schema/extensions with profile-bootstrap version 6.
    #[must_use]
    #[wasm_bindgen(js_name=fromBootstrapJson)]
    pub fn from_bootstrap_json(input: &str) -> BreditorRichProfileResult {
        match decode_rich_schema(input) {
            Ok(schema) => BreditorRichProfileResult::success(Self { schema: Arc::new(schema) }),
            Err(error) => BreditorRichProfileResult::failure(error),
        }
    }
    /// Read exact durable grammar binding without constructing an editor.
    #[must_use]
    #[wasm_bindgen(js_name=descriptorJson)]
    pub fn descriptor_json(&self) -> BreditorStringResult {
        BreditorStringResult::from_value(serde_json::json!({"kind":"rich","abiVersion":super::BREDITOR_RICH_ABI_VERSION,
            "schema":{"name":self.schema.id().name().as_str(),"version":self.schema.id().version().get()},"schemaFingerprint":self.schema.fingerprint().to_string()}).to_string())
    }
    /// Create one local rich owner from Document V2 and a canonical decimal capacity.
    #[must_use]
    #[wasm_bindgen(js_name=createEditor)]
    pub fn create_editor(
        &self,
        document_json: &str,
        history_capacity: &str,
    ) -> BreditorRichEditorResult {
        let context = self.context();
        let result = (|| {
            let capacity = capacity(history_capacity)?;
            let codec = DocumentJsonCodecV2::new(context.schema().clone())
                .with_limits(context.limits().clone());
            let document = codec
                .decode(document_json)
                .map_err(|_| error::rejected("breditor_rich.document_rejected"))?;
            let document = RichDocument::try_admit(context.schema(), document, context.limits())
                .map_err(|_| error::rejected("breditor_rich.document_rejected"))?;
            let owner = RichLocalSession::try_new(context, document, None, capacity)
                .map_err(|error| error::session(&error))?;
            Ok(BreditorRichEditor::new(owner))
        })();
        match result {
            Ok(editor) => BreditorRichEditorResult::success(editor),
            Err(error) => BreditorRichEditorResult::failure(error),
        }
    }
    /// Replay-admit retained local history and return a new exclusive owner with fresh tokens.
    #[must_use]
    #[wasm_bindgen(js_name=restoreEditor)]
    pub fn restore_editor(&self, checkpoint_json: &str) -> BreditorRichEditorResult {
        match RichSessionJsonCodec::new(self.context()).decode(checkpoint_json) {
            Ok(owner) => BreditorRichEditorResult::success(BreditorRichEditor::new(owner)),
            Err(_) => BreditorRichEditorResult::failure(error::rejected(
                "breditor_rich.checkpoint_rejected",
            )),
        }
    }
}
fn capacity(input: &str) -> Result<HistoryCapacity, crate::BreditorError> {
    if input.is_empty()
        || !input.bytes().all(|byte| byte.is_ascii_digit())
        || (input.len() > 1 && input.starts_with('0'))
    {
        return Err(error::rejected("breditor_rich.capacity_rejected"));
    }
    HistoryCapacity::try_new(
        input.parse::<u32>().map_err(|_| error::rejected("breditor_rich.capacity_rejected"))?,
    )
    .map_err(|_| error::rejected("breditor_rich.capacity_rejected"))
}
