use crate::{
    session::EditorSession,
    transaction::{Commit, ReplayDirection},
};

use super::{LocalLogEvent, LocalLogEventApplicationError, LocalLogEventKind};

impl LocalLogEvent {
    /// Returns operations that recovery would actually execute for this event.
    ///
    /// History events consult the authoritative retained recipe instead of the
    /// untrusted logged proof. An unavailable branch contributes no execution
    /// work and will be rejected by [`Self::apply_to_session`].
    pub(crate) fn authoritative_operation_count(&self, session: &EditorSession) -> usize {
        match self.kind() {
            LocalLogEventKind::Commit => {
                self.as_commit().map_or(0, |commit| commit.forward_operations().len())
            }
            LocalLogEventKind::Undo => {
                session.replay_operation_count(ReplayDirection::Undo).unwrap_or(0)
            }
            LocalLogEventKind::Redo => {
                session.replay_operation_count(ReplayDirection::Redo).unwrap_or(0)
            }
            LocalLogEventKind::CloseHistoryGroup | LocalLogEventKind::ClearHistory => 0,
        }
    }

    pub(crate) fn apply_to_session(
        &self,
        session: &mut EditorSession,
    ) -> Result<(), LocalLogEventApplicationError> {
        self.validate().map_err(|error| LocalLogEventApplicationError::invalid_event(&error))?;
        match self.kind() {
            LocalLogEventKind::Commit => self.apply_commit(session),
            LocalLogEventKind::Undo => self.apply_history_replay(session, ReplayDirection::Undo),
            LocalLogEventKind::Redo => self.apply_history_replay(session, ReplayDirection::Redo),
            LocalLogEventKind::CloseHistoryGroup => session
                .close_history_group_if_effective()
                .then_some(())
                .ok_or_else(|| LocalLogEventApplicationError::ineffective_control(self.kind())),
            LocalLogEventKind::ClearHistory => session
                .clear_history_if_effective()
                .then_some(())
                .ok_or_else(|| LocalLogEventApplicationError::ineffective_control(self.kind())),
        }
    }

    fn apply_commit(
        &self,
        session: &mut EditorSession,
    ) -> Result<(), LocalLogEventApplicationError> {
        let kind = self.kind();
        let commit = self.retained_commit()?;
        session
            .accept_commit(commit)
            .map_err(|error| LocalLogEventApplicationError::from_commit_error(kind, &error))
    }

    fn apply_history_replay(
        &self,
        session: &mut EditorSession,
        direction: ReplayDirection,
    ) -> Result<(), LocalLogEventApplicationError> {
        let kind = self.kind();
        let logged_commit = self.retained_commit()?;
        let authoritative_count = session
            .replay_operation_count(direction)
            .ok_or_else(|| LocalLogEventApplicationError::replay_unavailable(kind))?;
        if logged_commit.forward_operations().len() != authoritative_count {
            return Err(LocalLogEventApplicationError::replay_commit_mismatch(kind));
        }
        let prepared = session
            .preflight_replay(direction)
            .map_err(|error| LocalLogEventApplicationError::from_history_error(kind, &error))?
            .ok_or_else(|| LocalLogEventApplicationError::replay_unavailable(kind))?;
        if !prepared.commit().same_checkpoint_proof(logged_commit) {
            return Err(LocalLogEventApplicationError::replay_commit_mismatch(kind));
        }
        session
            .publish_prepared_replay(prepared)
            .map(|_| ())
            .map_err(|_| LocalLogEventApplicationError::prepared_replay_stale(kind))
    }

    fn retained_commit(&self) -> Result<&Commit, LocalLogEventApplicationError> {
        self.as_commit()
            .ok_or_else(|| LocalLogEventApplicationError::runtime_invariant(self.kind()))
    }
}
