//! Candidate V4 collapsible sections through the exclusive local owner.
//!
//! Open state is persisted document state. Collapsing a section never leaves the
//! logical selection inside its hidden body: such a selection moves to the end of
//! the section's summary in the same publication. Enter in a summary never splits
//! it; it opens a fresh first body paragraph (expanding a collapsed section).
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, NodePath, TextOffset},
    rich_content::{
        BlockId, RichBlockDraft, RichDetailsError, RichDocument, RichFlowParent, RichFlowPosition,
        RichSelectionKind, RichTextPoint,
        actions::{InsertBlocks, RichAction, RichActionError, SetDetailsOpen},
        details, rich_selection,
    },
};

impl RichLocalSession {
    /// Expand (`true`) or collapse (`false`) one section in one history group.
    ///
    /// Setting the current state is an admitted no-op. When collapsing, a selection
    /// with any endpoint, node or grid inside the hidden body becomes a caret at the
    /// end of the summary; other selections map unchanged.
    /// # Errors
    /// Stale observation, read-only owner, non-V4 context, a missing or non-section
    /// target and every admission failure are atomic.
    pub fn set_details_open(
        &mut self,
        snapshot: &RichLocalSnapshot,
        section: &BlockId,
        open: bool,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.context.schema().supports_rich_details() {
            return Err(RichActionError::from(RichDetailsError::Profile).into());
        }
        let action = SetDetailsOpen::capture(&self.state.document, section, open)?;
        let update = if !open && self.selection_in_body(section)? {
            let summary = summary_end(&self.state.document, section)?;
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: summary.clone(),
                focus: summary,
            }))
        } else {
            RichSelectionUpdate::Map
        };
        let pending = if matches!(update, RichSelectionUpdate::Map) {
            RichPendingFormatsUpdate::Map
        } else {
            RichPendingFormatsUpdate::Set(None)
        };
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::SetDetailsOpen(action)],
            update,
            pending,
        )
    }

    /// Enter from a summary caret: insert one fresh empty paragraph as the first body
    /// block (expanding a collapsed section) and place the caret in it, as one history
    /// group. The summary text is never split, whatever the caret offset.
    /// # Errors
    /// A selection other than a collapsed caret in a summary, a reused identity, a
    /// non-V4 context, stale/read-only owners and admission failures are atomic.
    pub fn enter_details_body(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.context.schema().supports_rich_details() {
            return Err(RichActionError::from(RichDetailsError::Profile).into());
        }
        let Some(RichSelectionKind::TextRange { anchor, focus }) =
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind)
        else {
            return Err(RichActionError::from(RichDetailsError::Selection).into());
        };
        if anchor != focus {
            return Err(RichActionError::from(RichDetailsError::Selection).into());
        }
        let document = &self.state.document;
        let section = details::owner_of_summary(document, focus.block())
            .ok_or(RichActionError::from(RichDetailsError::Selection))?;
        let node = details::section(document, &section).map_err(RichActionError::from)?;
        let first_body = node
            .children()
            .get(1)
            .and_then(crate::document::NodeRef::as_element)
            .and_then(|e| crate::rich_content::ast_properties::string(e, "block-id").ok())
            .and_then(|id| BlockId::try_new(id).ok())
            .ok_or(RichActionError::from(RichDetailsError::Shape))?;
        let collapsed = !details::is_open(node);
        let draft = RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
            .map_err(RichActionError::from)?;
        let position =
            RichFlowPosition::new(RichFlowParent::Details(section.clone()), Some(first_body));
        let insert =
            RichAction::InsertBlocks(InsertBlocks::capture(document, &position, vec![draft])?);
        let mut actions = vec![insert];
        if collapsed {
            let inserted = actions[0]
                .apply(&self.context, document)?
                .ok_or(RichActionError::Rewrite)?
                .document()
                .clone();
            actions.push(RichAction::SetDetailsOpen(SetDetailsOpen::capture(
                &inserted, &section, true,
            )?));
        }
        let point = RichTextPoint::new(paragraph.clone(), TextOffset::ZERO, Affinity::After);
        self.dispatch_with_pending_formats(
            snapshot,
            &actions,
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
    }

    fn selection_in_body(&self, section: &BlockId) -> Result<bool, RichLocalSessionError> {
        let document = &self.state.document;
        let root = document.block_path(section).ok_or(RichActionError::MissingTarget)?;
        let Some(selection) = self.state.selection.as_ref() else { return Ok(false) };
        let hidden = |path: Option<&NodePath>| {
            // Body descendants are below the section and not inside child 0 (the summary).
            path.is_some_and(|path| {
                path.len() > root.len()
                    && path.iter().zip(root.iter()).all(|(a, b)| a == b)
                    && path.iter().nth(root.len()) != Some(0)
            })
        };
        Ok(match selection.kind() {
            RichSelectionKind::TextRange { anchor, focus } => {
                hidden(document.block_path(anchor.block()))
                    || hidden(document.block_path(focus.block()))
            }
            RichSelectionKind::Node(id) => hidden(document.block_path(id)),
            RichSelectionKind::Grid { anchor, .. } => hidden(document.table_path(anchor.table())),
            RichSelectionKind::Document => false,
        })
    }
}

fn summary_end(
    document: &RichDocument,
    section: &BlockId,
) -> Result<RichTextPoint, RichLocalSessionError> {
    let node = details::section(document, section).map_err(RichActionError::from)?;
    let summary = node
        .children()
        .get(0)
        .and_then(crate::document::NodeRef::as_element)
        .filter(|e| details::is_summary_kind(e.kind().as_str()))
        .ok_or(RichActionError::from(RichDetailsError::Shape))?;
    let id = BlockId::try_new(
        crate::rich_content::ast_properties::string(summary, "block-id")
            .map_err(|_| RichActionError::Rewrite)?,
    )
    .map_err(|_| RichActionError::Rewrite)?;
    let length = rich_selection::text_length(summary)?;
    Ok(RichTextPoint::new(id, length, Affinity::Before))
}
