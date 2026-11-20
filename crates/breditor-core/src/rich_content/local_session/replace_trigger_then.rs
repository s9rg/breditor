//! Bounded native composite: remove one typed trigger, then run one follow-up step, as ONE
//! exact history unit (slash commands).
//!
//! Both steps run on a private scratch owner that starts from the exact current
//! publication (document, selection, pending formats and revision) with empty
//! history. The trigger removal is the ordinary `replace_range_plain_text` with
//! empty text; the follow-up step is captured by its normal implementation against
//! the evolving post-removal document, so it maps the post-removal caret exactly as
//! it would after a separate removal. Only when both steps committed content is the
//! live owner changed, by one `commit_content` whose recipe is the replay-proved
//! local branch rewrite between the observed and final documents (the same recipe
//! family that checkpoints and native search replacement already use). Any failure
//! discards the scratch owner: nothing is published, and the live owner's token,
//! revision, selection and history stay untouched.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    history_recipe::HistoryRecipe, local_rewrite::LocalRewrite,
};
use crate::{
    document::NodeRef,
    rich_content::{RichSelection, RichSelectionKind},
    session::HistoryCapacity,
};
use std::sync::Arc;

/// Failure of [`RichLocalSession::replace_trigger_then`]; nothing was published.
#[derive(Debug, thiserror::Error)]
pub enum RichTriggerStepError<E> {
    /// Observation, target, trigger removal, history proof or revision failure.
    #[error(transparent)]
    Session(#[from] RichLocalSessionError),
    /// The follow-up step's own failure, unchanged.
    #[error("the follow-up step after trigger removal failed")]
    Step(E),
}

impl RichLocalSession {
    /// Remove one typed trigger range, then run exactly one follow-up step, as ONE undo unit.
    ///
    /// `trigger` must be a nonempty text range inside one paragraph, heading or
    /// section summary (never a code block). `step` receives a scratch owner already
    /// showing the post-removal publication (caret collapsed at the trigger start)
    /// and its exact observation; it must publish exactly one content change through
    /// the owner's ordinary methods. Undo then restores the typed trigger and the
    /// actual pre-command selection and pending formats; Redo replays the final
    /// document, selection and pending formats. Under natural typing history the
    /// composite is always its own unit, so the typed trigger burst remains a
    /// separate Undo step.
    ///
    /// # Errors
    /// A stale/foreign observation, read-only owner, invalid target, a follow-up
    /// that fails, publishes no content or more than one unit, history proof
    /// failure or revision overflow publish nothing.
    pub fn replace_trigger_then<E>(
        &mut self,
        snapshot: &RichLocalSnapshot,
        trigger: &RichSelectionKind,
        step: impl FnOnce(&mut Self, &RichLocalSnapshot) -> Result<RichLocalOutcome, E>,
    ) -> Result<RichLocalOutcome, RichTriggerStepError<E>> {
        self.check(snapshot)?;
        self.require_writable()?;
        self.require_trigger(trigger)?;
        let mut scratch = self.scratch();
        let observed = scratch.snapshot();
        if scratch.replace_range_plain_text(&observed, trigger, "")?
            != RichLocalOutcome::ContentCommitted
        {
            return Err(RichLocalSessionError::TriggerStep.into());
        }
        let removed = scratch.snapshot();
        let outcome = step(&mut scratch, &removed).map_err(RichTriggerStepError::Step)?;
        if outcome != RichLocalOutcome::ContentCommitted
            || scratch.entries.len() != 2
            || scratch.cursor != 2
            || scratch.read_only
            || scratch.typing_history.is_some()
        {
            return Err(RichLocalSessionError::TriggerStep.into());
        }
        let RichLocalState { document, selection, pending_formats, revision: _ } = scratch.state;
        let forward = LocalRewrite::between(&self.state.document, &document);
        let inverse = forward.inverse();
        if forward.apply(&self.context, &self.state.document)?.document() != document.document()
            || inverse.apply(&self.context, &document)?.document() != self.state.document.document()
        {
            return Err(RichLocalSessionError::HistoryMismatch.into());
        }
        let candidate = RichLocalState {
            document,
            selection,
            pending_formats,
            revision: self.state.revision.successor().map_err(RichLocalSessionError::from)?,
        };
        Ok(self.commit_content(
            candidate,
            HistoryRecipe::Recovered(forward),
            HistoryRecipe::Recovered(inverse),
        ))
    }

    fn require_trigger(&self, trigger: &RichSelectionKind) -> Result<(), RichLocalSessionError> {
        let selection = RichSelection::try_new(&self.state.document, trigger.clone())?;
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichLocalSessionError::TriggerStep);
        };
        let prose = self
            .state
            .document
            .block_path(anchor.block())
            .and_then(|path| self.state.document.document().node_at(path).ok())
            .and_then(NodeRef::as_element)
            .is_some_and(|node| {
                matches!(
                    node.kind().as_str(),
                    "breditor/paragraph" | "breditor/heading" | "breditor/details-summary"
                )
            });
        if anchor.block() != focus.block() || anchor.offset() == focus.offset() || !prose {
            return Err(RichLocalSessionError::TriggerStep);
        }
        Ok(())
    }

    /// A private owner at the exact current publication with empty, plain history.
    fn scratch(&self) -> Self {
        Self {
            context: self.context.clone(),
            state: self.state.clone(),
            entries: vec![],
            cursor: 0,
            capacity: HistoryCapacity::default(),
            token: Arc::new(()),
            read_only: false,
            read_only_revision: None,
            typing_history: None,
        }
    }
}
