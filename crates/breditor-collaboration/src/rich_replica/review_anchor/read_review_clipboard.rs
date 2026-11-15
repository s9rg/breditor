//! Copy historical formatting and structure through the existing semantic clipboard codec.
use super::historical_clipboard::HistoricalClipboard;
use crate::{
    Error,
    rich_replica::{ClipboardContent, RichReplica},
};
use breditor_core::codec::RichClipboardJsonCodec;
use serde::Serialize;

/// Original semantic clipboard content at an independently admitted review anchor.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewAnchorClipboard {
    /// A document-wide discussion has no selected content.
    Document,
    /// Required source operations have not arrived.
    Pending,
    /// The captured selection contained no content.
    Empty,
    /// Complete admitted content within the native clipboard budget.
    Copied {
        /// Native rich clipboard data and its exact plain-text projection.
        clipboard: ClipboardContent,
    },
}

impl RichReplica {
    /// Export the captured selection at its original causal cut.
    ///
    /// # Errors
    /// Invalid native source, inadmissible selection or complete clipboard overflow refuses.
    pub fn read_review_clipboard(&self, input: &str) -> Result<ReviewAnchorClipboard, Error> {
        let fragment = match self.historical_clipboard(input)? {
            HistoricalClipboard::Pending => return Ok(ReviewAnchorClipboard::Pending),
            HistoricalClipboard::Document => return Ok(ReviewAnchorClipboard::Document),
            HistoricalClipboard::Selection(None) => return Ok(ReviewAnchorClipboard::Empty),
            HistoricalClipboard::Selection(Some(fragment)) => fragment,
        };
        let context = super::super::paragraphs::context(&self.codec);
        let rich_json = RichClipboardJsonCodec::new(context)
            .encode(&fragment)
            .map_err(|_| Error::Contract("review historical clipboard encoding"))?;
        let plain_text = fragment
            .plain_text()
            .map_err(|_| Error::Contract("review historical clipboard plain text"))?;
        Ok(ReviewAnchorClipboard::Copied { clipboard: ClipboardContent { rich_json, plain_text } })
    }
}
