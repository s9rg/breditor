//! Additive restricted-editing capability: a live host policy, never document data.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use crate::{BreditorError, BreditorStringResult};
use breditor_core::rich_content::{BlockId, RichLocalSnapshot, RichRestrictedPolicy};
use serde::Deserialize;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyRecord {
    format: String,
    #[serde(rename = "formatVersion")]
    format_version: u8,
    editable: Vec<String>,
}

/// Decode `null` (clear) or `{"format":"breditor/rich-restricted-policy","formatVersion":1,"editable":[...]}`.
pub(crate) fn decode_policy(input: &str) -> Result<Option<RichRestrictedPolicy>, BreditorError> {
    if input.len() > 1024 * 1024 {
        return Err(error::rejected("breditor_rich.restricted_policy"));
    }
    let record: Option<PolicyRecord> = serde_json::from_str(input)
        .map_err(|_| error::rejected("breditor_rich.restricted_policy"))?;
    let Some(record) = record else { return Ok(None) };
    if record.format != "breditor/rich-restricted-policy" || record.format_version != 1 {
        return Err(error::rejected("breditor_rich.restricted_policy"));
    }
    let ids = record
        .editable
        .into_iter()
        .map(BlockId::try_new)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| error::rejected("breditor_rich.restricted_policy"))?;
    RichRestrictedPolicy::try_new(ids)
        .map(Some)
        .map_err(|_| error::rejected("breditor_rich.restricted_policy"))
}

/// View field present only under a policy, so default view bytes stay unchanged.
pub(super) fn view(snapshot: &RichLocalSnapshot) -> Option<Value> {
    let policy = snapshot.restricted_policy()?;
    let regions = policy.regions(snapshot.state().document());
    Some(json!({
        "editable": regions.iter().map(|region| region.block.as_str()).collect::<Vec<_>>(),
        "selectionEditable": snapshot.selection_is_editable(),
    }))
}

#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1: live block-region policy, region navigation and `restricted` view field.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name = restrictedEditingVersion)]
    pub fn restricted_editing_version(&self) -> String {
        "1".to_owned()
    }

    /// Install, replace or clear (`null`) the policy; returns `"true"` when it changed.
    #[must_use]
    #[wasm_bindgen(js_name = setRestrictedEditing)]
    pub fn set_restricted_editing(
        &mut self,
        observation: &BreditorRichObservation,
        policy_json: &str,
    ) -> BreditorStringResult {
        let run = |owner: &mut Self| -> Result<bool, BreditorError> {
            owner.inner.validate_observation(&observation.inner).map_err(|e| error::session(&e))?;
            let policy = decode_policy(policy_json)?;
            owner
                .inner
                .set_restricted_editing(&observation.inner, policy)
                .map_err(|e| error::session(&e))
        };
        match run(self) {
            Ok(changed) => BreditorStringResult::from_value(changed.to_string()),
            Err(value) => BreditorStringResult::from_error(value),
        }
    }

    /// Select the next/previous editable region; `unchanged` at either end (no wrap).
    #[must_use]
    #[wasm_bindgen(js_name = navigateRestrictedRegion)]
    pub fn navigate_restricted_region(
        &mut self,
        observation: &BreditorRichObservation,
        forward: bool,
    ) -> BreditorRichCommandResult {
        match self.inner.navigate_restricted_region(&observation.inner, forward) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(value) => BreditorRichCommandResult::failure(error::session(&value)),
        }
    }
}
