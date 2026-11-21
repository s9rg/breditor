//! Explicit shared rule-set selection (`markdown-v1`, `autolink-v1`, `typography-v1`) and the Enter autolink call.
use super::super::{Dispatch, RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use breditor_core::rich_content::{RichInputRuleOutcome, RichInputRuleSet, RichTypographyRequest};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
enum RuleId {
    #[serde(rename = "markdown-v1")]
    Markdown,
    #[serde(rename = "autolink-v1")]
    Autolink,
    #[serde(rename = "typography-v1")]
    Typography,
}
/// A nonempty duplicate-free set; an unknown identity rejects the whole request.
fn rule_set(
    ids: &[RuleId],
    typography: Option<RichTypographyRequest>,
) -> Result<RichInputRuleSet, Error> {
    if ids.is_empty()
        || ids.len() > 3
        || (1..ids.len()).any(|i| ids[..i].contains(&ids[i]))
        || typography.is_some() && !ids.contains(&RuleId::Typography)
    {
        return Err(Error::Contract("shared input rule request"));
    }
    let config = typography
        .map(RichTypographyRequest::into_config)
        .transpose()
        .map_err(|_| Error::Contract("shared typography request"))?
        .unwrap_or_default();
    Ok(ids.iter().fold(RichInputRuleSet::NONE, |set, id| {
        set.union(match id {
            RuleId::Markdown => RichInputRuleSet::MARKDOWN_V1,
            RuleId::Autolink => RichInputRuleSet::AUTOLINK_V1,
            RuleId::Typography => RichInputRuleSet::typography_with(config),
        })
    }))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Plain {
    text: String,
    namespace: String,
    rules: Vec<RuleId>,
    #[serde(default)]
    typography: Option<RichTypographyRequest>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Typing {
    text: String,
    namespace: String,
    rules: Vec<RuleId>,
    #[serde(default)]
    typography: Option<RichTypographyRequest>,
    #[serde(deserialize_with = "super::super::typing::clock")]
    clock_ms: u64,
}
fn outcome(value: RichInputRuleOutcome) -> String {
    value.as_str().into()
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 requires the rule-set plain/natural calls and the Enter autolink call.
    #[allow(clippy::unused_self)]
    pub fn input_rule_sets_version(&self) -> String {
        "1".into()
    }
    /// String1 accepts `typography-v1` and its optional `typography` request in the rule-set calls.
    #[allow(clippy::unused_self)]
    pub fn typography_input_rules_version(&self) -> String {
        "1".into()
    }
    /// Plain caret input under an explicit rule set; refused retains literal input.
    pub fn insert_plain_text_with_input_rules(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let value: Plain = self.decode_input_rule(observed, input).map_err(error)?;
        let rules = rule_set(&value.rules, value.typography).map_err(error)?;
        self.inner
            .insert_plain_text_with_input_rules_guarded(
                &observed.inner,
                &value.text,
                &value.namespace,
                rules,
            )
            .map(outcome)
            .map_err(error)
    }
    /// Natural caret input under an explicit rule set; refused retains literal input.
    pub fn insert_typing_text_with_input_rules(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let value: Typing = self.decode_input_rule(observed, input).map_err(error)?;
        let rules = rule_set(&value.rules, value.typography).map_err(error)?;
        self.inner
            .insert_typing_text_with_input_rules_guarded(
                &observed.inner,
                &value.text,
                value.clock_ms,
                &value.namespace,
                rules,
            )
            .map(outcome)
            .map_err(error)
    }
    /// One caret split dispatch envelope, then `autolink-v1` on its retained left block.
    pub fn split_with_autolink(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let request: Dispatch = self.decode_input_rule(observed, input).map_err(error)?;
        self.inner
            .split_with_autolink_guarded(
                &observed.inner,
                request.commands,
                request.selection_update,
                request.pending_formats_update,
            )
            .map(outcome)
            .map_err(error)
    }
}
