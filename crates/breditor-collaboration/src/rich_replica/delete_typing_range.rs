//! Proved adjacent directional user deletion, retaining the actual before-caret UI recipe.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::DeleteText,
    selection::{Selection, TextPoint},
    typing_history::Kind,
};
use crate::{Error, anchor::Affinity};
use breditor_core::rich_content::{BlockId, RichTypingDeleteDirection};
impl RichReplica {
    /// Delete a nonempty same-block scalar range next to the actual caret.
    /// Reversed targets are admitted, but their ordered bounds must touch the requested side.
    /// Crossing CR/LF/Unicode line separators isolates this input from neighboring bursts.
    /// # Errors
    /// Stale/read-only/disabled owners, wrong targets, scalar or staged admission failures reject atomically.
    pub fn delete_typing_range_guarded(
        &mut self,
        observation: &SharedObservation,
        target: &Selection,
        direction: RichTypingDeleteDirection,
        clock_ms: u64,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let kind = match direction {
            RichTypingDeleteDirection::Backward => Kind::Backward,
            RichTypingDeleteDirection::Forward => Kind::Forward,
        };
        let mut request = self.typing_before(kind, clock_ms)?;
        let selection = self.selection()?.ok_or(Error::Contract("shared typing requires caret"))?;
        let caret = selection.caret().ok_or(Error::Contract("shared typing requires caret"))?;
        let Selection::TextRange { anchor, focus } = target else {
            return Err(Error::Contract("shared typing deletion target"));
        };
        let start = anchor.offset.min(focus.offset);
        let end = anchor.offset.max(focus.offset);
        if anchor.block != caret.block
            || focus.block != caret.block
            || start >= end
            || match direction {
                RichTypingDeleteDirection::Backward => end != caret.offset,
                RichTypingDeleteDirection::Forward => start != caret.offset,
            }
        {
            return Err(Error::Contract("shared typing deletion target"));
        }
        target.admit(&self.document)?;
        let block = self
            .document
            .block_path(
                &BlockId::try_new(&caret.block)
                    .map_err(|_| Error::Contract("shared typing deletion block"))?,
            )
            .and_then(|path| self.document.document().node_at(path).ok())
            .and_then(breditor_core::document::NodeRef::as_element)
            .ok_or(Error::Contract("shared typing deletion block"))?;
        request.isolated = block
            .children()
            .iter()
            .filter_map(breditor_core::document::NodeRef::as_text)
            .flat_map(|run| run.text().encode_utf16())
            .enumerate()
            .any(|(index, unit)| {
                index >= start as usize
                    && index < end as usize
                    && matches!(unit, 0x0a | 0x0d | 0x2028 | 0x2029)
            });
        if request.isolated {
            request.join = false;
        }
        let point =
            TextPoint { block: caret.block.clone(), offset: start, affinity: Affinity::After };
        self.apply_with_state_inner(
            vec![Command::DeleteText(DeleteText {
                block: point.block.clone(),
                offset: start,
                length: end - start,
            })],
            SelectionUpdate::Set(Some(Selection::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            PendingFormatsUpdate::Set(None),
            Some(request),
        )
    }
}
