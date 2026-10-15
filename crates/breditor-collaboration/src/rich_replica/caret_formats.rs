//! Read the exact typing formats without publishing or guessing from browser DOM.
use super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Effective affinity/pending caret styles under the current exact guard.
    /// # Errors
    /// Rejects stale/foreign observations before selection inspection, non-carets
    /// and output beyond the existing 64 KiB shared pending-format ceiling.
    pub fn caret_formats_json_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<String, Error> {
        self.check(observation)?;
        let selection = self
            .selection()?
            .filter(|value| value.caret().is_some())
            .ok_or(Error::Contract("caret format read requires caret"))?;
        let value = serde_json::to_string(&self.effective_formats(&selection)?)?;
        if value.len() > 64 * 1024 {
            return Err(Error::Limit("caret format read bytes"));
        }
        Ok(value)
    }
}
