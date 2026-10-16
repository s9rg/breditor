//! Native plain-input style and general coverage, without a temporary selection publication.
use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState};
use crate::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::{
        RichSelection, RichSelectionKind,
        actions::{RichActionError, RichGeneralRangePlan, replace_text_range::ordered},
    },
};

/// Immutable native plan for one explicit plain input target; not mutation authority.
#[derive(Clone, Debug)]
pub struct RichGeneralPlainRangePlan {
    pub(super) range: RichGeneralRangePlan,
    inserted: TextFragment,
    pub(super) formats: FormatSet,
    pub(super) collapsed: bool,
}
impl RichGeneralPlainRangePlan {
    /// Exact coverage and fresh paragraph requirements chosen by Rust.
    #[must_use]
    pub const fn range(&self) -> &RichGeneralRangePlan {
        &self.range
    }
    /// Plain text with the admitted native effective input style.
    #[must_use]
    pub const fn inserted(&self) -> &TextFragment {
        &self.inserted
    }
    /// Exact native pending style after explicit plain input, including deletion.
    #[must_use]
    pub const fn formats(&self) -> &FormatSet {
        &self.formats
    }
}
impl RichLocalSession {
    /// Plan an explicit text target while preserving the owner's actual caret and pending styles.
    /// The current caret's style applies when it lies on either target boundary block
    /// inside the target. Otherwise the logical start's affinity determines the style.
    /// # Errors
    /// Rejects stale, nontext, nonscalar, malformed input and native planning failures.
    pub fn plan_general_range_plain_text(
        &self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        text: &str,
    ) -> Result<RichGeneralPlainRangePlan, RichLocalSessionError> {
        self.check(snapshot)?;
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind.into());
        };
        let (start, end) = ordered(&self.state.document, anchor, focus)?;
        let original = super::typing_state::caret(self.state.selection.as_ref()).filter(|caret| {
            (caret.block() == start.block()
                && caret.offset() >= start.offset()
                && (start.block() != end.block() || caret.offset() <= end.offset()))
                || (caret.block() == end.block()
                    && caret.offset() <= end.offset()
                    && (start.block() != end.block() || caret.offset() >= start.offset()))
        });
        let source = original
            .unwrap_or_else(|| super::typing_state::caret(Some(&selection)).unwrap_or(start));
        let formats = if original.is_some() {
            self.state.effective_caret_formats()?
        } else {
            RichLocalState::try_new(
                &self.context,
                self.state.document.clone(),
                Some(RichSelectionKind::TextRange {
                    anchor: source.clone(),
                    focus: source.clone(),
                }),
                None,
                self.state.revision,
            )?
            .effective_caret_formats()?
        };
        let inserted = if text.is_empty() {
            TextFragment::empty()
        } else {
            TextRun::try_new(text, formats.clone())
                .map_err(|_| RichActionError::TextPrimitive)?
                .into()
        };
        let range = RichGeneralRangePlan::capture(&self.state.document, &selection, &inserted)?;
        Ok(RichGeneralPlainRangePlan {
            range,
            inserted,
            formats,
            collapsed: super::typing_state::caret(Some(&selection)).is_some(),
        })
    }
}
