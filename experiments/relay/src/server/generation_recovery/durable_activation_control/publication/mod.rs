//! Authenticated publication owns a real listener and actual committed Native
//! service. The joint descriptor pin is association DATA, never local readiness.
mod identity;
mod observe;
mod prepare;
mod publish;
mod routes;
mod serve;
mod state;

pub use identity::{
    NativeRoomPublicationBinding, NativeRoomPublicationIdentity, NativeRoomPublicationReceipt,
    NativeRoomPublicationRequest,
};
pub use prepare::prepare_native_room_publication;
pub use state::NativeRoomPublication;

#[cfg(test)]
pub(in crate::server::generation_recovery) fn publication_request_for_test(
    owner: &NativeRoomPublication,
    request: axum::extract::Request,
) -> impl std::future::Future<Output = axum::response::Response> + Send + 'static {
    let weak = std::sync::Arc::downgrade(&owner.state);
    async move { routes::publish(axum::extract::State(weak), request).await }
}
#[cfg(test)]
pub(in crate::server::generation_recovery) fn publication_observation_for_test(
    owner: &NativeRoomPublication,
) -> (usize, bool, usize) {
    (
        owner.state.requests.available_permits(),
        owner.state.worker_entered.load(std::sync::atomic::Ordering::Acquire),
        owner.state.connections.count(),
    )
}
#[cfg(test)]
pub(in crate::server::generation_recovery) fn publication_closed_for_test(
    owner: &NativeRoomPublication,
) -> bool {
    owner.state.local().is_err()
}
#[cfg(test)]
pub(in crate::server::generation_recovery) fn publication_block_for_test(
    owner: &NativeRoomPublication,
    entered: tokio::sync::oneshot::Sender<()>,
    released: std::sync::mpsc::Receiver<()>,
) -> std::thread::JoinHandle<()> {
    let state = owner.state.clone();
    std::thread::spawn(move || {
        let _actual = state.phase.lock().expect("actual publication exclusion");
        let _ = entered.send(());
        released.recv_timeout(std::time::Duration::from_secs(30)).expect("release publication");
    })
}
