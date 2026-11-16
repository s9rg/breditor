//! Recover the durable result of a selected boundary without another write.
use super::ServerNativeHistoryReceipt;
use super::plan::ServerNativeHistorySelection;
use crate::{Error, Result, Room};

impl Room {
    /// Read a selection's durable outcome using the exact sequence, intent and native cuts stored
    /// in the boundary receipt. This can recover an acknowledgement after later accepted writes.
    /// # Errors
    /// Other principals, wrong room/format, uncertain storage or a mismatched durable receipt refuse.
    pub fn resolve_native_history_boundary(
        &self,
        principal: &str,
        selection: &ServerNativeHistorySelection,
    ) -> Result<Option<ServerNativeHistoryReceipt>> {
        self.check_native_selection(principal, selection)?;
        self.log.append_cut()?;
        let receipt = self.native_history_retry(selection.lane, &selection.boundary)?;
        if receipt.as_ref().is_some_and(|receipt| {
            receipt.sequence != selection.source.records.to_string()
                || receipt.before != selection.before
                || receipt.after != selection.after
        }) {
            return Err(Error::Contract("durable native history receipt differs from selection"));
        }
        Ok(receipt)
    }
}
