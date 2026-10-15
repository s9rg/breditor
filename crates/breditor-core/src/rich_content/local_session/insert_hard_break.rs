//! Explicit line break within one text owner, distinct from paragraph/list structural Enter.

use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};

impl RichLocalSession {
    /// Replace the current text selection with exactly one U+000A in one history group.
    ///
    /// The existing guarded range planner retains logical-start typing formats,
    /// advances the caret by one UTF-16 code unit and preserves code's plain-text
    /// rule. It never creates an HTML node, normalizes surrounding CR/LF/tab
    /// characters, splits a block or fabricates identities. Prose Enter remains
    /// a separate structural action. This additive command also works on V1
    /// text, whose existing language already admits LF.
    ///
    /// # Errors
    /// Rejects stale observations, non-text/unsupported ranges or active host limits
    /// without publishing partial text, selection, pending styles or history.
    pub fn insert_hard_break(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.replace_selection_plain_text(snapshot, "\n")
    }
}
