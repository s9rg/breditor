//! Independent writer-owned language token; never replace the causal source text.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{CodeLanguage, RichDocument, actions::SetCodeLanguage as CoreSetCodeLanguage},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

/// Set or remove an inert bounded code-language token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetCodeLanguage {
    /// Stable existing code-block identity.
    pub block: String,
    /// Native bounded language token, or null to remove the optional property.
    pub language: Option<String>,
}
pub(super) fn language(value: Option<&str>) -> Result<Option<CodeLanguage>, Error> {
    value
        .map(CodeLanguage::try_new)
        .transpose()
        .map_err(|_| Error::Contract("shared code language token"))
}
pub(super) fn write(
    doc: &LoroDoc,
    block: &str,
    language: Option<&str>,
    stamp: Stamp,
) -> Result<(), Error> {
    let patch = language.map_or_else(
        || super::super::model::Patch {
            sets: BTreeMap::new(),
            removes: vec!["breditor/language".into()],
        },
        |value| super::super::model::Patch::set("breditor/language", json!(value)),
    );
    super::super::model::write_patch(doc, block, "code-language", &patch, stamp)
}
impl SetCodeLanguage {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::prepare_field(doc, &self.block, "code-language")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let language = language(self.language.as_deref())?;
        let action = CoreSetCodeLanguage::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            language.as_ref(),
        )
        .map_err(|_| Error::Contract("shared code language capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared code language admission"))?
        else {
            return Ok(());
        };
        write(doc, &self.block, self.language.as_deref(), stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
