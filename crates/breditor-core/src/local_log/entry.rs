use std::fmt;

use super::{
    LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
};

/// One fully identified event in a durable ordered local session.
///
/// This value does not itself prove contiguity, replay-ID uniqueness, append
/// authorization, or durability. An owning log boundary must enforce that
/// `sequence` is the next session-global position and `replay_id` is unique
/// within `session_id`. Compaction may replace `log_id`, but it must preserve
/// the session identity and must not reset the sequence.
#[derive(Eq, PartialEq)]
pub struct LocalLogEntry {
    session_id: LocalSessionId,
    log_id: LocalLogId,
    sequence: LocalLogSequence,
    replay_id: ReplayId,
    event: LocalLogEvent,
}

impl LocalLogEntry {
    /// Creates one fully identified local-log event value.
    #[must_use]
    pub const fn new(
        session_id: LocalSessionId,
        log_id: LocalLogId,
        sequence: LocalLogSequence,
        replay_id: ReplayId,
        event: LocalLogEvent,
    ) -> Self {
        Self { session_id, log_id, sequence, replay_id, event }
    }

    /// Returns the append-generation identity.
    #[must_use]
    pub const fn log_id(&self) -> &LocalLogId {
        &self.log_id
    }

    /// Returns the durable session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the one-based session-global sequence.
    #[must_use]
    pub const fn sequence(&self) -> LocalLogSequence {
        self.sequence
    }

    /// Returns the session-scoped idempotency identity.
    #[must_use]
    pub const fn replay_id(&self) -> &ReplayId {
        &self.replay_id
    }

    /// Returns the retained event.
    #[must_use]
    pub const fn event(&self) -> &LocalLogEvent {
        &self.event
    }

    /// Returns the stable event discriminator without inspecting its payload.
    #[must_use]
    pub const fn event_kind(&self) -> LocalLogEventKind {
        self.event.kind()
    }
}

impl fmt::Debug for LocalLogEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogEntry")
            .field("session_id", &self.session_id)
            .field("log_id", &self.log_id)
            .field("sequence", &self.sequence)
            .field("replay_id", &self.replay_id)
            .field("event_kind", &self.event.kind())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructor_and_getters_preserve_distinct_scopes() -> Result<(), Box<dyn std::error::Error>>
    {
        let entry = LocalLogEntry::new(
            LocalSessionId::try_new("session:stable")?,
            LocalLogId::try_new("log:generation-2")?,
            LocalLogSequence::try_new(41)?,
            ReplayId::try_new("request:41")?,
            LocalLogEvent::close_history_group(),
        );

        assert_eq!(entry.log_id().as_str(), "log:generation-2");
        assert_eq!(entry.session_id().as_str(), "session:stable");
        assert_eq!(entry.sequence().get(), 41);
        assert_eq!(entry.replay_id().as_str(), "request:41");
        assert_eq!(entry.event_kind(), LocalLogEventKind::CloseHistoryGroup);
        assert_eq!(entry.event().as_commit(), None);
        Ok(())
    }

    #[test]
    fn debug_output_classifies_but_does_not_format_the_event_payload()
    -> Result<(), Box<dyn std::error::Error>> {
        let entry = LocalLogEntry::new(
            LocalSessionId::try_new("session:1")?,
            LocalLogId::try_new("log:1")?,
            LocalLogSequence::FIRST,
            ReplayId::try_new("replay:1")?,
            LocalLogEvent::clear_history(),
        );
        let debug = format!("{entry:?}");

        assert!(debug.contains("event_kind: ClearHistory"));
        assert!(!debug.contains("event: "));
        Ok(())
    }
}
