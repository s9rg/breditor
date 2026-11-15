//! Resolve the exact original selection and copy its admitted semantic tree.
use super::{ReviewAnchorResolution, ReviewAnchorTarget, resolve_review_anchor::resolve_at};
use crate::{Error, rich_replica::RichReplica};
use breditor_core::rich_content::RichClipboardFragment;

pub(super) enum HistoricalClipboard {
    Pending,
    Document,
    Selection(Option<Box<RichClipboardFragment>>),
}

impl RichReplica {
    pub(super) fn historical_clipboard(&self, input: &str) -> Result<HistoricalClipboard, Error> {
        let Some(source) = self.historical_review_document(input)? else {
            return Ok(HistoricalClipboard::Pending);
        };
        let ReviewAnchorResolution::Resolved { target } =
            resolve_at(&source.packet, &source.doc, &source.document)?
        else {
            return Err(Error::Contract("review quote target was invalid at its captured cut"));
        };
        let ReviewAnchorTarget::Selection(selection) = target else {
            return Ok(HistoricalClipboard::Document);
        };
        let context = super::super::paragraphs::context(&self.codec);
        let fragment = RichClipboardFragment::copy_general_selection(
            &context,
            &source.document,
            &selection.admit(&source.document)?,
        )
        .map_err(|_| Error::Contract("review historical quote projection"))?;
        Ok(HistoricalClipboard::Selection(fragment.map(Box::new)))
    }
}
