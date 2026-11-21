//! Bounded native command group: several ordinary commands published as ONE exact history unit
//! (the agent tool contract's staged Accept, `docs/AI_AGENT_TOOLS.md`).
//!
//! Every step runs on a private scratch owner that starts from the exact current publication
//! (document, selection, pending formats and revision) with empty history, through the
//! step's ordinary implementation and admission against the evolving staged document. Only
//! when every step succeeded — each publishing content or nothing — is the live owner
//! changed, by one `commit_content` whose recipe is the replay-proved local branch rewrite
//! between the observed and final documents (the recipe family slash-command composites,
//! checkpoints and native search replacement already use). Any failure discards the scratch
//! owner: nothing is published and the live owner's token, revision, selection and history
//! stay untouched.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    history_recipe::HistoryRecipe, local_rewrite::LocalRewrite,
};

/// The most steps one command group may contain (the suggestion command-batch ceiling).
pub const RICH_COMMAND_GROUP_MAX_STEPS: usize = 64;

/// Failure of [`RichLocalSession::apply_command_group`]; nothing was published.
#[derive(Debug, thiserror::Error)]
pub enum RichCommandGroupError<E> {
    /// Observation, size, step outcome, history proof or revision failure.
    #[error(transparent)]
    Session(#[from] RichLocalSessionError),
    /// One step's own failure, unchanged, with its zero-based index.
    #[error("command group step {index} failed")]
    Step {
        /// Zero-based step index.
        index: usize,
        /// The step's own failure.
        error: E,
    },
}

impl RichLocalSession {
    /// Run `steps` ordinary commands in order as ONE undo unit.
    ///
    /// `step(owner, observation, index)` receives a scratch owner already showing the
    /// publication left by the previous steps and its exact observation; it must publish
    /// one content change or nothing through the owner's ordinary methods. Undo restores
    /// the observed document, selection and pending formats; Redo replays the final ones.
    /// Under natural typing history the group is always its own unit. A group whose steps
    /// leave the document unchanged publishes nothing and returns `Unchanged`.
    ///
    /// # Errors
    /// A stale/foreign observation, read-only owner, zero or more than
    /// [`RICH_COMMAND_GROUP_MAX_STEPS`] steps, a step that fails, publishes only selection
    /// or typing state, or leaves more than one history unit per step, a history proof
    /// failure or revision overflow publish nothing.
    pub fn apply_command_group<E>(
        &mut self,
        snapshot: &RichLocalSnapshot,
        steps: usize,
        mut step: impl FnMut(&mut Self, &RichLocalSnapshot, usize) -> Result<RichLocalOutcome, E>,
    ) -> Result<RichLocalOutcome, RichCommandGroupError<E>> {
        self.check(snapshot)?;
        self.require_writable()?;
        if steps == 0 || steps > RICH_COMMAND_GROUP_MAX_STEPS {
            return Err(RichLocalSessionError::CommandGroup.into());
        }
        let mut scratch = self.scratch();
        let mut committed = 0_usize;
        for index in 0..steps {
            let observed = scratch.snapshot();
            match step(&mut scratch, &observed, index)
                .map_err(|error| RichCommandGroupError::Step { index, error })?
            {
                RichLocalOutcome::ContentCommitted => committed += 1,
                RichLocalOutcome::Unchanged => {}
                _ => return Err(RichLocalSessionError::CommandGroup.into()),
            }
            if scratch.entries.len() != committed
                || scratch.cursor != committed
                || scratch.read_only
                || scratch.typing_history.is_some()
            {
                return Err(RichLocalSessionError::CommandGroup.into());
            }
        }
        let RichLocalState { document, selection, pending_formats, revision: _ } = scratch.state;
        if committed == 0 || document.document() == self.state.document.document() {
            return Ok(RichLocalOutcome::Unchanged);
        }
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
        )?)
    }
}
