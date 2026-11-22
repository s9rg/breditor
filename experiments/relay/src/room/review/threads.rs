//! Read-only materialized discussions for authenticated document readers and host notifications.
use super::Room;
use crate::Result;
use breditor_collab_feasibility::review::ReviewThreadView;

impl Room {
    /// Read the materialized discussions under current document-read permission. `None` means the
    /// review lane is not enabled. Opaque anchors carry document content and are included as-is.
    /// # Errors
    /// Rejects missing read permission, uncertain storage or a broken native review invariant.
    pub fn review_threads(&self, principal: &str) -> Result<Option<Vec<ReviewThreadView>>> {
        self.reader(principal)?;
        self.review_thread_views()
    }
    /// Host-private projection for notifications; never exposed without a separate reader check.
    pub(crate) fn review_thread_views(&self) -> Result<Option<Vec<ReviewThreadView>>> {
        self.log.ready()?;
        match &self.review {
            None => Ok(None),
            Some(state) => Ok(Some(state.session.view()?.threads)),
        }
    }
}
