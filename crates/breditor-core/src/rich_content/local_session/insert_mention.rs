//! Candidate V4 mention insertion: one guarded replacement of a typed trigger, one undo step.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::{TextFragment, TextRun},
    position::Affinity,
    rich_content::{
        RichMention, RichMentionError, RichSelection, RichSelectionKind, RichTextPoint,
        actions::{ReplaceTextRange, RichAction, RichActionError, replace_text_range::ordered},
        mention::with_mention,
    },
};

impl RichLocalSession {
    /// Replace one text range (normally the typed `@query` trigger) by a mention.
    ///
    /// The range must lie in one paragraph, heading or section summary (a summary is
    /// phrasing content like a paragraph); it may be collapsed (plain
    /// insertion at a caret). It is snapped outward like every selection, so it
    /// never splits an existing mention. The inserted text is the mention
    /// (`@` + label, carrying the styles of the range start without any mention)
    /// followed by one plain space with those styles, and the caret lands after
    /// the space. This is **one** history group: a single Undo restores the
    /// typed trigger and the actual pre-edit selection exactly.
    /// # Errors
    /// A non-V4 context, stale/foreign observation, read-only owner, a missing,
    /// cross-block or code/non-text target and every resource/admission failure
    /// are refused atomically.
    pub fn insert_mention(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        mention: &RichMention,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.context.schema().supports_rich_mentions() {
            return Err(RichActionError::from(RichMentionError::Profile).into());
        }
        let selection = RichSelection::try_new(&self.state.document, target.clone())?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::from(RichMentionError::Target).into());
        };
        if anchor.block() != focus.block()
            || !self
                .state
                .document
                .block_path(anchor.block())
                .and_then(|path| self.state.document.document().node_at(path).ok())
                .and_then(crate::document::NodeRef::as_element)
                .is_some_and(|node| {
                    matches!(
                        node.kind().as_str(),
                        "breditor/paragraph" | "breditor/heading" | "breditor/details-summary"
                    )
                })
        {
            return Err(RichActionError::from(RichMentionError::Target).into());
        }
        let (start, _) = ordered(&self.state.document, anchor, focus)?;
        // The trigger's own styles (the run that starts at the range start), never a mention.
        let start = RichTextPoint::new(start.block().clone(), start.offset(), Affinity::After);
        let base = RichLocalState::try_new(
            &self.context,
            self.state.document.clone(),
            Some(RichSelectionKind::TextRange { anchor: start.clone(), focus: start }),
            None,
            self.state.revision,
        )?
        .effective_caret_formats()?;
        let inserted = TextFragment::try_from_runs(vec![
            TextRun::try_new(mention.text(), with_mention(&base, mention))
                .map_err(|_| RichActionError::TextPrimitive)?,
            TextRun::try_new(" ", base.clone()).map_err(|_| RichActionError::TextPrimitive)?,
        ])
        .map_err(|_| RichActionError::TextPrimitive)?;
        let action = ReplaceTextRange::capture(&self.state.document, &selection, &inserted)?;
        let caret = action.insertion_end().clone();
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceTextRange(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(Some(base)),
        )
    }
}
