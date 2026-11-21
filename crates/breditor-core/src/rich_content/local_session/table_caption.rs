//! V4 table captions through the exclusive local owner.
//!
//! Adding a caption inserts one empty trailing paragraph and places the caret in it;
//! removing a caption whose text holds (part of) the selection moves the selection to a
//! node selection of the table. Each is one history group with an exact inverse.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichBlockDraft, RichSelectionKind, RichTableCaptionError, RichTextPoint, TableId,
        actions::{RichAction, RichActionError, SetTableCaption},
        table_caption,
    },
};

impl RichLocalSession {
    /// Add one empty caption with the fresh identity `paragraph` to `table` and place a
    /// caret in it, as one history group.
    /// # Errors
    /// An existing caption ([`RichTableCaptionError::Exists`]), a missing table, a reused
    /// identity, a non-V4 context, stale/read-only owners and admission failures are atomic.
    pub fn add_table_caption(
        &mut self,
        snapshot: &RichLocalSnapshot,
        table: &TableId,
        paragraph: &BlockId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        self.require_table_captions()?;
        let node =
            table_caption::table(&self.state.document, table).map_err(RichActionError::from)?;
        if table_caption::caption(node).is_some() {
            return Err(RichActionError::from(RichTableCaptionError::Exists).into());
        }
        let draft = RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
            .map_err(RichActionError::from)?;
        let action = SetTableCaption::capture(&self.state.document, table, Some(draft))?;
        let point = RichTextPoint::new(paragraph.clone(), TextOffset::ZERO, Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::SetTableCaption(action)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }

    /// Remove `table`'s caption (text, formats and identity) in one history group.
    ///
    /// Removing an absent caption is an admitted no-op. A text selection with an endpoint
    /// in the caption becomes a node selection of the table (no selection when the table is
    /// hidden); other selections map unchanged.
    /// # Errors
    /// A missing table, a non-V4 context, stale/read-only owners and admission failures
    /// are atomic.
    pub fn remove_table_caption(
        &mut self,
        snapshot: &RichLocalSnapshot,
        table: &TableId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        self.require_table_captions()?;
        let document = &self.state.document;
        let node = table_caption::table(document, table).map_err(RichActionError::from)?;
        let caption = table_caption::caption_id(node);
        let table_block = BlockId::try_new(
            crate::rich_content::ast_properties::string(node, "block-id")
                .map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        let action = SetTableCaption::capture(document, table, None)?;
        let inside = caption.as_ref().is_some_and(|caption| {
            match self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind) {
                Some(RichSelectionKind::TextRange { anchor, focus }) => {
                    anchor.block() == caption || focus.block() == caption
                }
                _ => false,
            }
        });
        // A hidden (axisless) table cannot be node-selected; the selection is cleared instead.
        let hidden = document
            .table(table)
            .map_err(RichActionError::from)?
            .is_none_or(|view| view.geometry().is_hidden());
        let (update, pending) = if inside {
            (
                RichSelectionUpdate::Set((!hidden).then_some(RichSelectionKind::Node(table_block))),
                RichPendingFormatsUpdate::Set(None),
            )
        } else {
            (RichSelectionUpdate::Map, RichPendingFormatsUpdate::Map)
        };
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::SetTableCaption(action)],
            update,
            pending,
        )
    }

    fn require_table_captions(&self) -> Result<(), RichLocalSessionError> {
        if self.context.schema().supports_rich_table_captions() {
            Ok(())
        } else {
            Err(RichActionError::from(RichTableCaptionError::Profile).into())
        }
    }
}
