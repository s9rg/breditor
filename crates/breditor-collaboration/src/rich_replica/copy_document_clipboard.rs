//! Explicit document-family semantic Copy; original clipboard record meanings stay unchanged.
use super::{RichReplica, SharedObservation, clipboard::ClipboardContent};
use crate::Error;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{RichClipboardFragment, RichSelection, RichSelectionKind},
};
impl RichReplica {
    /// Copy complete document scope, or the current general text/node/grid scope, as a pure read.
    /// # Errors
    /// Stale/foreign/wrong-family, native selection/schema, clipboard or encoding budgets reject.
    /// Read-only owners may copy; the original rich clipboard V1 envelope is not widened.
    pub fn copy_document_clipboard_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<Option<ClipboardContent>, Error> {
        self.check(observation)?;
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document clipboard family required"));
        }
        if !self.document_selected() {
            return self.copy_general_clipboard_guarded(observation);
        }
        let context = super::paragraphs::context(&self.codec);
        let selection = RichSelection::try_new(&self.document, RichSelectionKind::Document)
            .map_err(|_| Error::Contract("document copy scope"))?;
        let Some(fragment) =
            RichClipboardFragment::copy_selection(&context, &self.document, &selection)
                .map_err(|_| Error::Contract("document clipboard capture"))?
        else {
            return Ok(None);
        };
        Ok(Some(ClipboardContent {
            rich_json: RichClipboardJsonCodec::new(context)
                .encode(&fragment)
                .map_err(|_| Error::Contract("document clipboard encoding"))?,
            plain_text: fragment
                .plain_text()
                .map_err(|_| Error::Contract("document clipboard plain text"))?,
        }))
    }
}
