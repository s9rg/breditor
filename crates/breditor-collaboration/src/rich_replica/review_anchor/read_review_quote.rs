//! Original plain text is derived from retained native history, never a current-coordinate guess.
use crate::{
    Error,
    rich_replica::{ReviewAnchorResolution, ReviewAnchorTarget, RichReplica},
};
use breditor_core::rich_content::RichClipboardFragment;
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
        let Some(source) = self.historical_review_document(input)? else {
            return Ok(ReviewAnchorQuote::Pending);
        };
        let ReviewAnchorResolution::Resolved { target } = super::resolve_review_anchor::resolve_at(
            &source.packet,
            &source.doc,
            &source.document,
        )?
        else {
            return Err(Error::Contract("review quote target was invalid at its captured cut"));
        };
        let ReviewAnchorTarget::Selection(selection) = target else {
            return Ok(ReviewAnchorQuote::Document);
        };
        let context = super::super::paragraphs::context(&self.codec);
        let fragment = RichClipboardFragment::copy_general_selection(
            &context,
            &source.document,
            &selection.admit(&source.document)?,
        )
        .map_err(|_| Error::Contract("review historical quote projection"))?;
        let plain_text = fragment
            .map_or_else(|| Ok(String::new()), |fragment| fragment.plain_text())
            .map_err(|_| Error::Contract("review historical quote plain text"))?;
        if plain_text.len() > 64 * 1024 {
            return Ok(ReviewAnchorQuote::Unavailable { reason: ReviewQuoteLoss::TooLarge });
        }
        Ok(ReviewAnchorQuote::Quoted { plain_text })
    }
}
