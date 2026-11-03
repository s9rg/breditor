//! Host preparation takes an actual already-bound socket, never an address DTO.
use super::super::DurableNativeActivationControl;
use super::{
    NativeRoomPublication, NativeRoomPublicationIdentity, routes,
    state::{Phase, State},
};
use crate::Result;
use std::{
    net::TcpListener,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
use tokio::sync::Semaphore;

/// Prepare POST/OPTIONS `/recovery/native-publication/v1/publish` for the actual
/// activation control and bound normal-service listener. Reuses its independently
/// provisioned operator accounts, never normal client credentials. Preparation
/// retains a real standard listener independently of any async runtime;
/// only an authenticated request against the real committed Native lease starts it.
/// The joint descriptor digest is association, not proof of client readiness.
/// # Errors
/// Closed Native control, entropy, nonblocking setup or listener inspection refuses.
pub fn prepare_native_room_publication(
    native: Arc<DurableNativeActivationControl>,
    listener: TcpListener,
) -> Result<(axum::Router, NativeRoomPublication)> {
    native.state.local()?;
    listener.set_nonblocking(true)?;
    let identity = NativeRoomPublicationIdentity {
        format: "breditor/native-room-publication-control".into(),
        format_version: 1,
        instance: crate::credentials::issue()?,
        activation: native.identity(),
        listener: listener.local_addr()?.to_string(),
    };
    let state = Arc::new(State {
        native,
        identity,
        live: AtomicBool::new(true),
        requests: Arc::new(Semaphore::new(1)),
        phase: Mutex::new(Phase::Waiting(Some(listener))),
        connections: crate::server::publication_connections::Connections::new(),
        #[cfg(test)]
        worker_entered: AtomicBool::new(false),
    });
    Ok((routes::router(Arc::downgrade(&state)), NativeRoomPublication { state }))
}
