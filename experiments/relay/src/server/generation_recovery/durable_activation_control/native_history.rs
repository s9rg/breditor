//! Local operator maintenance for custody acquired by the durable activation control.
use super::DurableNativeActivationControl;
use crate::{
    Result, ServerNativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryReceipt,
};

impl DurableNativeActivationControl {
    /// Run an explicit native history boundary on the control's active room.
    /// Authenticate as the room owner using the native credentials.
    /// # Errors
    /// Prepared, uncertain, closed or superseded controls, wrong authentication,
    /// invalid intent or uncertain storage refuses.
    pub async fn apply_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.active_for_handover()?
            .apply_native_history_boundary(principal, token, lane, boundary)
            .await
    }
}
