//! Explicit pending typing-format publication, separate from user content history.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::document::FormatSet;

impl RichLocalSession {
    /// Set complete schema-admitted pending caret formats without creating an undo unit.
    ///
    /// `Some(empty)` explicitly types plain text; `None` derives formats from the caret.
    ///
    /// # Errors
    /// Rejects stale observations, non-caret selection, unsupported formats or active limits.
    pub fn set_pending_formats(
        &mut self,
        snapshot: &RichLocalSnapshot,
        formats: Option<FormatSet>,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.dispatch_with_pending_formats(
            snapshot,
            &[],
            RichSelectionUpdate::Map,
            RichPendingFormatsUpdate::Set(formats),
        )
    }
}
