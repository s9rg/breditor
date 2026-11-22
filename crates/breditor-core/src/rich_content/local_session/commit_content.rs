//! Infallible publication after every content/UI/inverse/history preflight succeeds.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalState, history_entry::RichHistoryEntry,
    history_recipe::HistoryRecipe,
};

impl RichLocalSession {
    pub(super) fn commit_content(
        &mut self,
        candidate: RichLocalState,
        forward: HistoryRecipe,
        inverse: HistoryRecipe,
    ) -> Result<RichLocalOutcome, super::RichLocalSessionError> {
        self.require_restricted(&candidate.document)?;
        let entry = RichHistoryEntry {
            before: self.state.clone(),
            after: candidate.clone(),
            forward,
            inverse,
        };
        if let Some(history) = &mut self.typing_history {
            history.append(self.cursor, self.capacity.as_usize());
        }
        self.entries.truncate(self.cursor);
        if self.capacity.get() == 0 {
            self.entries.clear();
            self.cursor = 0;
        } else {
            self.entries.push(entry);
            if self.entries.len() > self.capacity.as_usize() {
                self.entries.remove(0);
            }
            self.cursor = self.entries.len();
        }
        self.probe.commits = self.probe.commits.wrapping_add(1);
        self.publish(candidate);
        Ok(RichLocalOutcome::ContentCommitted)
    }
}
