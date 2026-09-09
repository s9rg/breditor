use super::EditorEngineEvent;

/// Result of one command evaluated after an optional effective history close.
///
/// The checkpointed engine publishes the history boundary and command as one
/// candidate: both become authoritative only after the final session can be
/// encoded. Retaining the sealed boundary event keeps local-log and host
/// observers from having to infer that an open merge group was closed.
#[must_use = "a history sequence outcome must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub struct EditorHistorySequenceOutcome<T> {
    boundary: Option<EditorEngineEvent>,
    command: T,
}

impl<T> EditorHistorySequenceOutcome<T> {
    pub(super) const fn new(boundary: Option<EditorEngineEvent>, command: T) -> Self {
        Self { boundary, command }
    }

    /// Returns the effective close-history-group event, when the group was open.
    ///
    /// This is the first logical event in the sequence. Its observation records
    /// the intermediate post-boundary state for ordered logging and observers;
    /// when the following command commits, that observation is stale against
    /// the final owner and must not guard a later command. Use the command's
    /// successor observation (or query the engine) for subsequent work.
    #[must_use]
    pub const fn boundary(&self) -> Option<&EditorEngineEvent> {
        self.boundary.as_ref()
    }

    /// Returns the command result evaluated against the post-boundary state.
    #[must_use]
    pub const fn command(&self) -> &T {
        &self.command
    }

    /// Consumes the sequence without discarding either sealed result.
    pub fn into_parts(self) -> (Option<EditorEngineEvent>, T) {
        (self.boundary, self.command)
    }
}

impl<T: std::fmt::Debug> std::fmt::Debug for EditorHistorySequenceOutcome<T> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("EditorHistorySequenceOutcome")
            .field("boundary", &self.boundary)
            .field("command", &self.command)
            .finish()
    }
}
