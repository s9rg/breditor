//! A host observation reads actual held publication; it never starts serving.
use super::{
    NativeRoomPublication, NativeRoomPublicationReceipt,
    state::{Phase, State},
};
use crate::{Error, Result};

impl State {
    fn observe(&self) -> Result<NativeRoomPublicationReceipt> {
        self.local()?;
        self.native.state.with_serving_router(self.connections.clone(), |_| {
            let held = self.phase.lock().map_err(|_| Error::NeedsRecovery)?;
            self.local()?;
            let Phase::Serving { receipt, service, .. } = &*held else {
                return Err(Error::NeedsRecovery);
            };
            if !service.running() {
                return Err(Error::NeedsRecovery);
            }
            Ok(serde_json::from_slice(receipt)?)
        })
    }
}
impl NativeRoomPublication {
    /// Observe the actual held serving task under its current Native deployment
    /// lease. This never binds a socket, submits a request or publishes routes.
    /// The returned receipt is DATA, not a local editor or new serving lease.
    /// Actual file checks run off async I/O workers. A cancelled waiter does
    /// not revoke the already held Native service.
    /// # Errors
    /// Unpublished, closed, busy, failed or superseded actual custody refuses.
    pub async fn observe(&self) -> Result<NativeRoomPublicationReceipt> {
        self.state.local()?;
        let state = self.state.clone();
        tokio::task::spawn_blocking(move || state.observe())
            .await
            .map_err(|_| Error::NeedsRecovery)?
    }
}
