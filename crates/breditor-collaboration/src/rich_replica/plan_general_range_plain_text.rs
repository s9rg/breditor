//! Native explicit-target style and coverage, not mutable JavaScript planning.
use super::{RichReplica, SharedObservation, selection::Selection};
use crate::Error;
use breditor_core::rich_content::RichGeneralPlainRangePlan;
impl RichReplica {
    /// Read native plain-input style and floor requirements for an explicit target.
    /// Read-only owners may inspect it; returned values grant no mutation authority.
    /// # Errors
    /// Stale/foreign, nontext/nonscalar, over64KiB or invalid native input rejects.
    pub fn plan_general_range_plain_text_guarded(
        &self,
        observation: &SharedObservation,
        target: &Selection,
        text: &str,
    ) -> Result<RichGeneralPlainRangePlan, Error> {
        self.check(observation)?;
        if text.len() > 64 * 1024 {
            return Err(Error::Limit("general plain input bytes"));
        }
        let preview = self.general_range_preview()?;
        preview
            .plan_general_range_plain_text(
                &preview.snapshot(),
                target.admit(&self.document)?.kind(),
                text,
            )
            .map_err(|_| Error::Contract("general plain input plan"))
    }
}
