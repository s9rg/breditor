//! Exact-publication native writing reads; no causal or history side effects.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::{RichWritingError, RichWritingTools, inspect_rich_writing_tools};

impl RichReplica {
    /// Read accepted document counts and headings under the complete owner guard.
    ///
    /// Read-only owners are supported. The detached result is display data, not
    /// a fresh command source, writer identity or authority to navigate/edit.
    /// # Errors
    /// Rejects stale/foreign observations, traversal limits and AST contradictions
    /// before returning any result. Reads never publish or clear retained Redo.
    pub fn writing_tools_guarded(
        &self,
        observed: &SharedObservation,
    ) -> Result<RichWritingTools, Error> {
        self.check(observed)?;
        inspect_rich_writing_tools(self.document()).map_err(|error| match error {
            RichWritingError::DocumentLimit => Error::Limit("writing tools document budget"),
            RichWritingError::Invariant => Error::Contract("writing tools admitted document"),
        })
    }
}
