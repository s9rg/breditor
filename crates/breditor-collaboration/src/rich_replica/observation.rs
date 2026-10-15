//! Independently owned exact live-publication guard, never a wire credential or persisted token.
use std::sync::Arc;

/// Immutable observation of one shared owner's content, local selection, typing state and history.
#[derive(Clone)]
pub struct SharedObservation {
    pub(super) token: Arc<()>,
    pub(super) view: String,
}
impl SharedObservation {
    /// Frozen JSON read view belonging to this observation, not a mutable replica reference.
    #[must_use]
    pub fn view_json(&self) -> &str {
        &self.view
    }
}
