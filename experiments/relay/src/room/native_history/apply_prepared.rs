//! Apply a boundary only at the independently selected logical cut.
use super::ServerNativeHistoryReceipt;
use super::plan::ServerNativeHistorySelection;
use crate::{Error, Result, Room};

impl Room {
    /// Recheck the selected logical cut, native candidate and append cost before durable publication.
    /// Use `resolve_native_history_boundary` to inspect the original receipt after a lost reply.
    /// # Errors
    /// Other principals, wrong room/format, stale selections, changed append cost, invalid
    /// native boundaries or uncertain storage refuse.
    pub fn apply_prepared_native_history_boundary(
        &mut self,
        principal: &str,
        selection: ServerNativeHistorySelection,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.check_native_selection(principal, &selection)?;
        if self.native_history_append_cut()? != selection.source {
            return Err(Error::Contract("native history selection is stale"));
        }
        let prepared =
            self.prepare_uncommitted_native_history(selection.lane, &selection.boundary)?;
        if prepared.before != selection.before || prepared.after != selection.after {
            return Err(Error::Contract("native history selection cut differs"));
        }
        let append =
            self.native_boundary_append(principal, selection.lane, &selection.boundary, &prepared)?;
        if append != selection.append {
            return Err(Error::Contract("native history selection append differs"));
        }
        self.append_native_history(principal, selection.lane, selection.boundary, prepared)
    }
}
