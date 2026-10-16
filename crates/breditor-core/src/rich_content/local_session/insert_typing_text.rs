//! Native same-caret insertion bursts; paste, composition and replacements stay explicit.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    typing_history::{Kind, separator},
};

impl RichLocalSession {
    /// Publish plain user typing, optionally sharing one native Undo unit with adjacent input.
    ///
    /// `clock_ms` is a host monotonic millisecond hint, not stored time or authority.
    /// Backwards clocks, a gap over 750 ms, a changed caret/style/kind, an intervening
    /// publication or 64 retained steps starts a new unit. Line separators are
    /// isolated on both sides. Empty input leaves the active burst untouched.
    /// Use existing explicit commands for paste/composition/range replacement.
    /// # Errors
    /// Rejects stale/read-only/disabled owners, non-caret or invalid input atomically.
    pub fn insert_typing_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
        clock_ms: u64,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let (join, formats) = self.typing_before(Kind::Insert, clock_ms)?;
        let outcome = self.insert_plain_text(snapshot, text)?;
        if outcome == RichLocalOutcome::ContentCommitted {
            self.typing_after(join, Kind::Insert, clock_ms, formats, separator(text));
        }
        Ok(outcome)
    }
}
