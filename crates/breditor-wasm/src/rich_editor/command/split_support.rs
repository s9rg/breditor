//! Shared post-Enter publication preserving current caret typing formats.
use super::support::checked;
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    document::FormatSet,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichPendingFormatsUpdate,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint, actions::RichAction,
    },
};
pub(super) fn current_formats(
    owner: &RichLocalSession,
    point: &RichTextPoint,
) -> Result<FormatSet, BreditorError> {
    let Some(selection) = owner.state().selection() else {
        return Err(super::invalid());
    };
    let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
        return Err(super::invalid());
    };
    if anchor.block() != focus.block() || anchor.offset() != focus.offset() || focus != point {
        return Err(super::invalid());
    }
    checked(owner.state().effective_caret_formats())
}
pub(super) fn publish(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    action: RichAction,
    right: BlockId,
    formats: FormatSet,
) -> Result<RichLocalOutcome, BreditorError> {
    let caret = RichTextPoint::new(right, TextOffset::ZERO, Affinity::After);
    owner
        .dispatch_with_pending_formats(
            observation,
            &[action],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(Some(formats)),
        )
        .map_err(|value| error::session(&value))
}
