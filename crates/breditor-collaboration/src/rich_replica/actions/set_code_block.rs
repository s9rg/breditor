//! Explicit code conversion with owned style loss, kind and independent language fields.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        RichDocument,
        actions::{CodeFormatPolicy as CorePolicy, SetCodeBlock as CoreSetCodeBlock},
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Explicit formatting-loss policy, never inferred from a browser command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodeFormatPolicy {
    /// Reject a visibly formatted source without publishing any field.
    RejectFormatted,
    /// Author reversible disables for observed formats while retaining foreign contributions.
    RemoveFormats,
}
/// Convert stable prose/code to code, retaining exact Unicode and causal characters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetCodeBlock {
    /// Stable paragraph, heading or code identity.
    pub block: String,
    /// Optional inert native language token.
    pub language: Option<String>,
    /// Deliberate choice when the source contains inline formats.
    pub format_policy: CodeFormatPolicy,
}
impl SetCodeBlock {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::activate_text(doc, &self.block)?;
        super::super::text_flow::prepare_root(doc, &self.block)?;
        super::prepare_field(doc, &self.block, "text-kind")?;
        super::prepare_field(doc, &self.block, "code-language")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let language = super::set_code_language::language(self.language.as_deref())?;
        let action = CoreSetCodeBlock::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            language.as_ref(),
            match self.format_policy {
                CodeFormatPolicy::RejectFormatted => CorePolicy::RejectFormatted,
                CodeFormatPolicy::RemoveFormats => CorePolicy::RemoveFormats,
            },
        )
        .map_err(|_| Error::Contract("shared code conversion capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared code conversion admission"))?
        else {
            return Ok(());
        };
        if self.format_policy == CodeFormatPolicy::RemoveFormats {
            super::super::structural_text::remove_observed_formats(doc, &self.block, stamp)?;
        }
        super::super::model::write_patch(
            doc,
            &self.block,
            "text-kind",
            &super::super::model::Patch {
                sets: [("$type".into(), json!("breditor/code-block"))].into(),
                removes: vec!["breditor/level".into()],
            },
            stamp,
        )?;
        super::set_code_language::write(doc, &self.block, self.language.as_deref(), stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
