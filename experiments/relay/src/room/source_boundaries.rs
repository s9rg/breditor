//! Native historical cuts must name registered authors and complete durable accepted groups.
use super::Room;
use crate::{Error, Result};
use breditor_collab_feasibility::rich_replica::WriterDependency;
impl Room {
    pub(super) fn check_document_source_writer(&self, writer: &str) -> Result<()> {
        if writer == "1"
            || self.suggestions.is_some() && writer == super::suggestions::EFFECT_WRITER
            || self.writers.get(writer).is_some_and(|author| !author.observer)
        {
            Ok(())
        } else {
            Err(Error::Contract("version source has no registered document author"))
        }
    }
    pub(super) fn check_document_source_cuts(&self, clocks: &[WriterDependency]) -> Result<()> {
        if !clocks.iter().any(|clock| clock.writer == "1") {
            return Err(Error::Contract("version source omits genesis"));
        }
        for clock in clocks {
            self.check_document_source_writer(&clock.writer)?;
            if clock.writer == "1" && clock.counter == self.seed_writer_through {
                continue;
            }
            if !self.receipts.values().any(|accepted| {
                accepted.receipt.writer == clock.writer && accepted.receipt.through == clock.counter
            }) {
                return Err(Error::Contract("version source cuts an unaccepted semantic group"));
            }
        }
        Ok(())
    }
}
