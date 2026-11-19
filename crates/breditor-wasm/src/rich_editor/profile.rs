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

#[wasm_bindgen]
impl BreditorRichProfile {
    /// Compile explicit bootstrap V9 into the unreleased candidate rich V4 without inline
    /// additions. V4 extends V3; its fingerprint changes until the candidate is complete.
    #[must_use]
    #[wasm_bindgen(js_name=fromBootstrapJsonV4)]
    pub fn from_bootstrap_json_v4(input: &str) -> BreditorRichProfileResult {
        Self::candidate_v4(input, false)
    }
    /// Compile explicit bootstrap V9 candidate V4 with the bounded standard inline V1 preset.
    #[must_use]
    #[wasm_bindgen(js_name=fromStandardBootstrapJsonV4)]
    pub fn from_standard_bootstrap_json_v4(input: &str) -> BreditorRichProfileResult {
        Self::candidate_v4(input, true)
    }
    /// Compile explicit bootstrap V8 into bounded layout V3 without inline additions.
    #[must_use]
    #[wasm_bindgen(js_name=fromLayoutBootstrapJsonV3)]
    pub fn from_layout_bootstrap_json_v3(input: &str) -> BreditorRichProfileResult {
        Self::layout(input, false)
    }
    /// Compile explicit V8 layout with the original bounded standard inline V1 preset.
    #[must_use]
    #[wasm_bindgen(js_name=fromStandardLayoutBootstrapJsonV3)]
    pub fn from_standard_layout_bootstrap_json_v3(input: &str) -> BreditorRichProfileResult {
        Self::layout(input, true)
    }
    /// Compile explicit bootstrap V7 into rich-language V2, without standard inline additions.
    /// V6 and all existing factories keep their original grammar and fingerprints.
    #[must_use]
    #[wasm_bindgen(js_name=fromStructuralBootstrapJsonV2)]
    pub fn from_structural_bootstrap_json_v2(input: &str) -> BreditorRichProfileResult {
        Self::structural(input, false)
    }
    /// Compile bootstrap V7 into structural V2 with the bounded standard inline V1 preset.
    #[must_use]
    #[wasm_bindgen(js_name=fromStandardStructuralBootstrapJsonV2)]
    pub fn from_standard_structural_bootstrap_json_v2(input: &str) -> BreditorRichProfileResult {
        Self::structural(input, true)
    }
}
impl BreditorRichProfile {
    pub(super) fn context(&self) -> EditorContext {
        EditorContext::new(self.schema.as_ref().clone(), DocumentLimits::default())
    }
}
#[wasm_bindgen]
impl BreditorRichProfile {
    /// Explicitly compose standard inline V1 with bounded V6 application declarations.
    /// Existing fromBootstrapJson and all stored document/history meanings are unchanged.
    #[must_use]
    #[wasm_bindgen(js_name=fromStandardBootstrapJsonV1)]
    pub fn from_standard_bootstrap_json_v1(input: &str) -> BreditorRichProfileResult {
        match crate::profile::decode_standard_rich_schema_v1(input) {
            Ok(schema) => BreditorRichProfileResult::success(Self { schema: Arc::new(schema) }),
            Err(error) => BreditorRichProfileResult::failure(error),
        }
    }
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
        let mut value = serde_json::json!({"kind":"rich","abiVersion":super::BREDITOR_RICH_ABI_VERSION,
            "schema":{"name":self.schema.id().name().as_str(),"version":self.schema.id().version().get()},"schemaFingerprint":self.schema.fingerprint().to_string()});
        if matches!(self.schema.rich_content_revision(), Some(2..=4)) {
            value["richLanguageVersion"] = serde_json::json!(self.schema.rich_content_revision());
            value["taskStructureVersion"] = serde_json::json!(1);
        }
        if self.schema.supports_rich_block_layout() {
            value["blockLayoutVersion"] = serde_json::json!(1);
        }
        if self.schema.supports_rich_list_numbering() {
            value["listNumberingVersion"] = serde_json::json!(1);
        }
        if self.schema.supports_rich_text_language() {
            value["textLanguageVersion"] = serde_json::json!(1);
        }
        BreditorStringResult::from_value(value.to_string())
    }
    /// Read complete typed inline declarations without exposing the schema proof.
    #[must_use]
    #[wasm_bindgen(js_name=inlineCatalogJson)]
    pub fn inline_catalog_json(&self) -> BreditorStringResult {
        BreditorStringResult::from_value(breditor_core::codec::encode_inline_format_catalog(
            &self.schema,
        ))
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
impl BreditorRichProfile {
    fn candidate_v4(input: &str, standard: bool) -> BreditorRichProfileResult {
        match crate::profile::decode_rich_schema_v4(input, standard) {
            Ok(schema) => BreditorRichProfileResult::success(Self { schema: Arc::new(schema) }),
            Err(error) => BreditorRichProfileResult::failure(error),
        }
    }
    fn layout(input: &str, standard: bool) -> BreditorRichProfileResult {
        match crate::profile::decode_layout_rich_schema_v3(input, standard) {
            Ok(schema) => BreditorRichProfileResult::success(Self { schema: Arc::new(schema) }),
            Err(error) => BreditorRichProfileResult::failure(error),
        }
    }
    fn structural(input: &str, standard: bool) -> BreditorRichProfileResult {
        match crate::profile::decode_structural_rich_schema_v2(input, standard) {
            Ok(schema) => BreditorRichProfileResult::success(Self { schema: Arc::new(schema) }),
            Err(error) => BreditorRichProfileResult::failure(error),
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
