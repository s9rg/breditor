//! Pure observed general Copy; no authoring mode, UI change or history entry is inferred.
use super::{RichReplica, SharedObservation, clipboard::ClipboardContent};
use crate::Error;
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichClipboardFragment};
impl RichReplica {
    /// Capture selected rich content with partial table shape and neutral unselected cells.
    /// Partial images contribute only selected caption text; full images retain asset/alt fields.
    /// Read-only owners may copy. The original copy method and clipboard envelope stay unchanged.
    /// # Errors
    /// Rejects stale/foreign observations before native selection, schema and resource admission.
    pub fn copy_general_clipboard_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<Option<ClipboardContent>, Error> {
        self.check(observation)?;
        let Some(selection) = self.selection()? else {
            return Ok(None);
        };
        let context = super::paragraphs::context(&self.codec);
        let Some(fragment) = RichClipboardFragment::copy_general_selection(
            &context,
            &self.document,
            &selection.admit(&self.document)?,
        )
        .map_err(|_| Error::Contract("shared general clipboard capture"))?
        else {
            return Ok(None);
        };
        Ok(Some(ClipboardContent {
            rich_json: RichClipboardJsonCodec::new(context)
                .encode(&fragment)
                .map_err(|_| Error::Contract("shared general clipboard encoding"))?,
            plain_text: fragment
                .plain_text()
                .map_err(|_| Error::Contract("shared general clipboard plain text"))?,
        }))
    }
}
