//! Re-derive complete native boundaries before accepting the durable cuts or trimming a torn tail.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane};
use crate::{Error, Result, Room};

impl Room {
    pub(in crate::room) fn replay_native_history(
        &mut self,
        sequence: u64,
        actor: &str,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
        before: [u8; 32],
        after: [u8; 32],
    ) -> Result<()> {
        if actor != self.owner {
            return Err(Error::Contract("native history boundary requires room owner"));
        }
        if self.native_history_retry(lane, boundary)?.is_some() {
            return Err(Error::Contract("duplicate durable native history boundary"));
        }
        if self.native_history_boundaries.len() >= self.native_boundary_limit(Some(boundary)) {
            return Err(Error::Contract("native boundary record budget"));
        }
        let prepared = self.prepare_native_history(lane, boundary)?;
        if prepared.before != before || prepared.after != after {
            return Err(Error::Contract("durable native history cut differs"));
        }
        self.publish_native_history(prepared.candidate)?;
        self.remember_native_history(sequence, lane, boundary.clone(), before, after)?;
        Ok(())
    }
}
