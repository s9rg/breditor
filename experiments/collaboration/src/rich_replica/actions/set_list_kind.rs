//! Paired writer-owned list presentation; undo retracts only this writer's kind/start choice.
use super::ListStyle;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{RichDocument, actions::SetListKind as CoreSetKind},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Change bullet/numbered style without rebuilding items, bodies or causal text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetListKind {
    /// Visible list wrapper identity.
    pub container: String,
    /// Complete kind and numbered start, admitted together.
    pub style: ListStyle,
}
impl SetListKind {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::prepare_field(doc, &self.container, "list-kind")
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreSetKind::capture(
            document,
            &super::super::paragraphs::id(&self.container)?,
            self.style.core()?,
        )
        .map_err(|_| Error::Contract("shared list kind capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list kind admission"))?
        else {
            return Ok(());
        };
        super::super::list_structure::publish(doc, codec, document, edit.document(), stamp)
    }
}
