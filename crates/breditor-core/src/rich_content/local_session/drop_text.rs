//! Inline drag-and-drop inside one owner: move (or copy) one single-block text range to a
//! collapsed target as ONE history unit.
//!
//! 1. **ID.** Wasm command `dropText` (version 1 of the rich local command protocol):
//!    `{"kind":"dropText","data":{"source":<text selection>,"target":<point>,"effect":"move"|"copy"}}`.
//! 2. **Validation.** The owner must be writable and the observation current. `source` must
//!    be a nonempty text range whose endpoints are in one text block (paragraph, heading, code
//!    block or section summary); endpoints inside a V4 mention are snapped outward first.
//!    `target` is validated as a caret in the same snapshot and snapped to the nearest mention
//!    edge. A target strictly inside the source range is refused.
//! 3. **Operations.** A move plans two existing [`ReplaceTextRange`] actions: delete the source
//!    range, then insert the exact source [`TextFragment`] (every run with its formats, including
//!    mentions) at the target, captured against the staged post-deletion snapshot. A copy plans
//!    only the insertion. Both are dispatched as one guarded group; nothing is re-read from a
//!    clipboard, so no identity is fabricated or re-allocated.
//! 4. **Selection and pending formats.** The inserted range is selected (anchor at its start,
//!    focus at its end). Pending formats use ordinary mapping.
//! 5. **History.** One accepted drop is one undo unit. Undo restores the exact previous tree and
//!    the saved selection; Redo replays the drop. Under natural typing history the drop closes
//!    the open typing group like every other content commit.
//! 6. **Stale input and replay.** A stale or foreign observation is refused before planning. The
//!    retained history recipe is the two captured actions, replayed in order.
//! 7. **Failures.** [`RichTextDropError::Source`] for a missing, collapsed or multi-block source,
//!    [`RichTextDropError::InsideSource`] for a target inside the source, and the ordinary
//!    selection, action, schema, restricted-editing and read-only errors. Grammar admission is
//!    final: formatted text or a mention into a code block, for example, is refused by the
//!    insertion's admission. Every failure publishes nothing.
//! 8. **Laws.** A move to either edge of its own source is `Unchanged`. A move keeps the
//!    document's text multiset (the moved runs leave the source and appear at the target with
//!    the same formats). Example: `"ab|cd|ef"` moving `cd` to the end gives `"abefcd"`, and one
//!    Undo restores `"abcdef"` with `cd` selected.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        RichSelection, RichSelectionKind, RichTextPoint,
        actions::{ReplaceTextRange, RichAction, RichActionError, text_patch},
    },
};

/// Whether a drop removes its source (move) or leaves it in place (copy).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichTextDropEffect {
    /// Delete the source range and insert it at the target.
    Move,
    /// Insert a copy at the target and keep the source.
    Copy,
}

/// Payload-free refusal of one inline text drop; nothing was published.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichTextDropError {
    /// The source is not one nonempty text range inside one text block.
    #[error("text drop source must be one nonempty range inside one text block")]
    Source,
    /// The target lies strictly inside the source range.
    #[error("text drop target lies inside its own source range")]
    InsideSource,
}

impl RichLocalSession {
    /// Move or copy one single-block text range to a collapsed target as one undo unit.
    ///
    /// # Errors
    /// Stale observations, read-only owners, [`RichTextDropError`] refusals and any selection,
    /// action, schema or restricted-editing failure publish nothing.
    pub fn drop_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        source: RichSelectionKind,
        target: RichTextPoint,
        effect: RichTextDropEffect,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let document = &self.state.document;
        let source = RichSelection::try_new(document, source)?;
        let RichSelectionKind::TextRange { anchor, focus } = source.kind() else {
            return Err(RichTextDropError::Source.into());
        };
        if anchor.block() != focus.block() || anchor.offset() == focus.offset() {
            return Err(RichTextDropError::Source.into());
        }
        let block = anchor.block().clone();
        let (start, end) = if anchor.offset() <= focus.offset() {
            (anchor.offset(), focus.offset())
        } else {
            (focus.offset(), anchor.offset())
        };
        let caret = RichSelection::try_new(
            document,
            RichSelectionKind::TextRange { anchor: target.clone(), focus: target },
        )?;
        let RichSelectionKind::TextRange { focus: target, .. } = caret.kind() else {
            return Err(RichTextDropError::Source.into());
        };
        let same = target.block() == &block;
        if same && target.offset() > start && target.offset() < end {
            return Err(RichTextDropError::InsideSource.into());
        }
        if effect == RichTextDropEffect::Move
            && same
            && (target.offset() == start || target.offset() == end)
        {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let length = end.get() - start.get();
        let offset =
            |value: u64| TextOffset::try_new(value).map_err(|_| RichActionError::TextRange);
        let moved = text_patch::fragment(text_patch::block_node(document, &block)?)?
            .split_at(start)
            .map_err(|_| RichActionError::TextRange)?
            .1
            .split_at(offset(length)?)
            .map_err(|_| RichActionError::TextRange)?
            .0;
        let mut actions = Vec::with_capacity(2);
        let mut staged = document.clone();
        let mut at = target.offset();
        if effect == RichTextDropEffect::Move {
            let delete = RichAction::ReplaceTextRange(ReplaceTextRange::capture(
                document,
                &source,
                &TextFragment::empty(),
            )?);
            staged = delete
                .apply(&self.context, document)?
                .ok_or(RichTextDropError::Source)?
                .into_parts()
                .0;
            actions.push(delete);
            if same && target.offset() >= end {
                at = offset(target.offset().get() - length)?;
            }
        }
        let point = RichTextPoint::new(target.block().clone(), at, Affinity::After);
        let insertion = RichSelection::try_new(
            &staged,
            RichSelectionKind::TextRange { anchor: point.clone(), focus: point.clone() },
        )?;
        let insert = ReplaceTextRange::capture(&staged, &insertion, &moved)?;
        let end = insert.insertion_end().clone();
        actions.push(RichAction::ReplaceTextRange(insert));
        self.dispatch(
            snapshot,
            &actions,
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: point,
                focus: end,
            })),
        )
    }
}
