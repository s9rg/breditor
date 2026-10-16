//! Admitted rich inline clipboard content replaces an explicit target in one native history step.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{BlockId, RichClipboardFragment, RichSelectionKind};

impl RichLocalSession {
    /// Paste a schema-bound inline clipboard fragment over a general text target.
    ///
    /// The clipboard's complete inline styles are authoritative; unrelated pending
    /// formats never leak into pasted text. No temporary selection is published.
    /// The existing general action retains the actual before-UI and exact history.
    /// # Errors
    /// Stale/read-only, wrong clipboard kind/schema, invalid target/IDs or late limits
    /// reject without changing content, selection, pending formats or either stack.
    pub fn paste_general_inline_clipboard(
        &mut self,
        snapshot: &RichLocalSnapshot,
        target: &RichSelectionKind,
        clipboard: &RichClipboardFragment,
        empty: &[BlockId],
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let inserted = clipboard.text_fragment(&self.context)?;
        self.replace_general_range_text(snapshot, target, &inserted, empty)
    }
}
