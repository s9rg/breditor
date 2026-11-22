//! Explicit input-rule set selection (`markdown-v1`, `autolink-v1`, `typography-v1`) and the Enter autolink call.
use super::super::{BreditorRichEditor, BreditorRichObservation, error, selection::decimal};
use crate::{BreditorError, BreditorStringResult};
use breditor_core::rich_content::{
    RichInputRuleOutcome, RichInputRuleSet, RichLocalOutcome, RichSelectionKind,
    RichTypographyRequest,
};
use serde::Deserialize;
use wasm_bindgen::prelude::wasm_bindgen;

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
) -> Result<RichInputRuleSet, BreditorError> {
    let invalid = || error::rejected("breditor_rich.input_rule_request");
    if ids.is_empty()
        || ids.len() > 3
        || (1..ids.len()).any(|i| ids[..i].contains(&ids[i]))
        || typography.is_some() && !ids.contains(&RuleId::Typography)
    {
        return Err(invalid());
    }
    let config = typography
        .map(RichTypographyRequest::into_config)
        .transpose()
        .map_err(|_| invalid())?
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
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
fn outcome(result: Result<RichInputRuleOutcome, BreditorError>) -> BreditorStringResult {
    match result {
        Ok(value) => BreditorStringResult::from_value(value.as_str().into()),
        Err(e) => BreditorStringResult::from_error(e),
    }
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 requires the rule-set plain/natural calls and the Enter autolink call.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=inputRuleSetsVersion)]
    pub fn input_rule_sets_version(&self) -> String {
        "1".into()
    }
    /// String1 accepts `typography-v1` and its optional `typography` request in the rule-set calls.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=typographyInputRulesVersion)]
    pub fn typography_input_rules_version(&self) -> String {
        "1".into()
    }
    /// Plain caret input under an explicit rule set; refused retains literal input.
    #[must_use]
    #[wasm_bindgen(js_name=insertPlainTextWithInputRules)]
    pub fn insert_plain_text_with_input_rules(
        &mut self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorStringResult {
        outcome((|| {
            let value: Plain = self.decode_input_rule(observed, input)?;
            let rules = rule_set(&value.rules, value.typography)?;
            self.inner
                .insert_plain_text_with_input_rules(
                    &observed.inner,
                    &value.text,
                    &value.namespace,
                    rules,
                )
                .map_err(|e| error::session(&e))
        })())
    }
    /// Natural caret input under an explicit rule set; refused retains literal input.
    #[must_use]
    #[wasm_bindgen(js_name=insertTypingTextWithInputRules)]
    pub fn insert_typing_text_with_input_rules(
        &mut self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorStringResult {
        outcome((|| {
            let value: Typing = self.decode_input_rule(observed, input)?;
            let rules = rule_set(&value.rules, value.typography)?;
            self.inner
                .insert_typing_text_with_input_rules(
                    &observed.inner,
                    &value.text,
                    value.clock_ms,
                    &value.namespace,
                    rules,
                )
                .map_err(|e| error::session(&e))
        })())
    }
    /// Enter at a collapsed caret (the `insertParagraph` record), then `autolink-v1`.
    ///
    /// The split is its own history group. A link over the URL that now ends the
    /// left block is a second isolated group, so one Undo keeps the split.
    #[must_use]
    #[wasm_bindgen(js_name=insertParagraphWithAutolink)]
    pub fn insert_paragraph_with_autolink(
        &mut self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorStringResult {
        outcome((|| {
            self.inner.check_observation(&observed.inner).map_err(|e| error::session(&e))?;
            if self.inner.is_read_only() {
                return Err(error::rejected("breditor_rich.read_only"));
            }
            let end = match self
                .inner
                .state()
                .selection()
                .map(breditor_core::rich_content::RichSelection::kind)
            {
                Some(RichSelectionKind::TextRange { anchor, focus })
                    if anchor.block() == focus.block() && anchor.offset() == focus.offset() =>
                {
                    focus.clone()
                }
                _ => return Err(error::rejected("breditor_rich.input_rule_request")),
            };
            if input.len() > 64 * 1024 {
                return Err(error::rejected("breditor_rich.input_rule_request"));
            }
            let split = super::super::command::insert_paragraph::execute(
                &mut self.inner,
                &observed.inner,
                input,
            )?;
            if split != RichLocalOutcome::ContentCommitted {
                return Ok(RichInputRuleOutcome::Unchanged);
            }
            let snapshot = self.inner.snapshot();
            Ok(match self.inner.apply_paragraph_autolink_input_rule(&snapshot, &end) {
                Ok(RichLocalOutcome::ContentCommitted) => RichInputRuleOutcome::Applied,
                Ok(_) => RichInputRuleOutcome::Inserted,
                Err(_) => RichInputRuleOutcome::Refused,
            })
        })())
    }
}
