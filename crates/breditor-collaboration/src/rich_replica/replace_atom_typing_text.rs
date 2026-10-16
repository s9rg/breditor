//! First-key atom replacement starts a new native typing group on the staged owner.
use super::{
    RichReplica, SharedObservation, atom_edit,
    typing_history::{Kind, Request, separator},
};
use crate::Error;
impl RichReplica {
    /// Replace a whole atom with plain user input; later same-caret typing may join this group.
    ///
    /// Requires opt-in native typing history and never joins the previous burst.
    /// Empty input proves the source then publishes nothing and consumes no ID.
    /// The existing typing journal retains every original explicit command.
    /// # Errors
    /// Stale/read-only/disabled, non-atoms, reused IDs and admission failures publish nothing.
    pub fn replace_atom_typing_text_guarded(
        &mut self,
        observation: &SharedObservation,
        paragraph: &str,
        text: &str,
        clock_ms: u64,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.typing_history_enabled() {
            return Err(Error::Contract("shared typing history disabled"));
        }
        atom_edit::target(self)?;
        if text.is_empty() {
            return Ok(false);
        }
        let request = Request {
            join: false,
            kind: Kind::Insert,
            clock: clock_ms,
            formats: vec![],
            isolated: separator(text),
        };
        let (commands, selection, pending) = self.plan_atom_replacement(paragraph, text)?;
        self.apply_with_state_inner(commands, selection, pending, Some(request), None)
    }
}
