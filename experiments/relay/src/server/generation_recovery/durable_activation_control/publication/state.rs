//! The actual listener, Native service and owned task never come from a DTO.
use super::super::DurableNativeActivationControl;
use super::{NativeRoomPublicationBinding, NativeRoomPublicationIdentity, serve::Serving};
use crate::{Error, Result};
use std::{
    net::TcpListener,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::Semaphore;

pub(super) enum Phase {
    Waiting(Option<TcpListener>),
    Serving { joint: NativeRoomPublicationBinding, receipt: Vec<u8>, service: Arc<Serving> },
}
pub(super) struct State {
    pub native: Arc<DurableNativeActivationControl>,
    pub identity: NativeRoomPublicationIdentity,
    pub live: AtomicBool,
    pub requests: Arc<Semaphore>,
    pub phase: Mutex<Phase>,
    pub connections: Arc<crate::server::publication_connections::Connections>,
    #[cfg(test)]
    pub worker_entered: AtomicBool,
}
impl State {
    pub fn local(&self) -> Result<()> {
        if self.live.load(Ordering::Acquire) { Ok(()) } else { Err(Error::NeedsRecovery) }
    }
    pub fn signal_close(&self) -> Result<Option<Arc<Serving>>> {
        let mut held = self.phase.lock().map_err(|_| Error::NeedsRecovery)?;
        self.live.store(false, Ordering::Release);
        self.connections.stop()?;
        match &mut *held {
            Phase::Waiting(listener) => {
                drop(listener.take());
                Ok(None)
            }
            Phase::Serving { service, .. } => {
                service.signal()?;
                Ok(Some(service.clone()))
            }
        }
    }
}

/// Host-owned publication of an actual bound listener and committed Native
/// service. Routers have weak references; saved selections cannot create it.
/// ```compile_fail
/// use breditor_collab_relay::server::NativeRoomPublication;
/// let _: NativeRoomPublication = serde_json::from_str("{}").unwrap();
/// ```
pub struct NativeRoomPublication {
    pub(super) state: Arc<State>,
}
impl NativeRoomPublication {
    /// Detached association only. Does not start normal serving.
    #[must_use]
    pub fn identity(&self) -> NativeRoomPublicationIdentity {
        self.state.identity.clone()
    }
    /// Stop accepting normal connections and await the actual owned server and
    /// every admitted WebSocket future through its normal native lease cleanup.
    /// Cancelled waiters leave the same task available for a later close.
    /// This does not roll back or revoke the already committed Native epoch.
    /// # Errors
    /// Poisoned custody, an actual server failure or failed join needs recovery.
    pub async fn close(&self) -> Result<()> {
        if let Some(service) = self.state.signal_close()? {
            service.wait().await?;
        }
        self.state.connections.drained().await?;
        Ok(())
    }
}
impl Drop for NativeRoomPublication {
    fn drop(&mut self) {
        let _ = self.state.signal_close();
    }
}
