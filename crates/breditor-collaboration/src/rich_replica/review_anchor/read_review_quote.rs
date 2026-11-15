//! Original plain text is derived from retained native history, never a current-coordinate guess.
use super::historical_clipboard::HistoricalClipboard;
use crate::{Error, rich_replica::RichReplica};
use serde::Serialize;

/// Why a valid original target does not supply a bounded quote.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewQuoteLoss {
    /// The complete quote exceeds 64 KiB UTF-8; no silently truncated text is returned.
    TooLarge,
}

/// Read-only historical quote, independent of current orphaning, selection and review permissions.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewAnchorQuote {
    /// A document-wide discussion has no selected quote.
    Document,
    /// Retain the original anchor until its document history arrives.
    Pending,
    /// Complete original selected plain text, including Unicode and native table separators.
    Quoted {
        /// Data, not markup; an original caret has an empty quote.
        #[serde(rename = "plainText")]
        plain_text: String,
    },
    /// An explicit resource refusal, not substitution with current or neighboring content.
    Unavailable {
        /// Machine-readable limit reason.
        reason: ReviewQuoteLoss,
    },
}

impl RichReplica {
    /// Read the target's original text at its captured native causal cut without changing history.
    /// Deleted current targets still retain their original quote. Read-only owners may read it.
    /// # Errors
    /// Invalid binding, non-closed causal cuts, targets invalid at capture or projection errors reject.
    pub fn read_review_quote(&self, input: &str) -> Result<ReviewAnchorQuote, Error> {
        let fragment = match self.historical_clipboard(input)? {
            HistoricalClipboard::Pending => return Ok(ReviewAnchorQuote::Pending),
            HistoricalClipboard::Document => return Ok(ReviewAnchorQuote::Document),
            HistoricalClipboard::Selection(fragment) => fragment,
        };
        let plain_text = fragment
            .map_or_else(|| Ok(String::new()), |fragment| fragment.plain_text())
            .map_err(|_| Error::Contract("review historical quote plain text"))?;
        if plain_text.len() > 64 * 1024 {
            return Ok(ReviewAnchorQuote::Unavailable { reason: ReviewQuoteLoss::TooLarge });
        }
        Ok(ReviewAnchorQuote::Quoted { plain_text })
    }
}
