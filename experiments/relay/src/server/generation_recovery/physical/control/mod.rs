//! Opt-in separately authenticated read-only operator checks, never service activation.
mod accepted_native;
mod asset_requirements;
mod identity;
mod lease;
mod metadata_receipts;
mod original_review;
mod prepare;
mod routes;
pub use identity::PhysicalRoomRecoveryControlIdentity;
pub use lease::PhysicalRoomRecoveryControl;
pub use prepare::prepare_physical_room_recovery_control;

#[cfg(test)]
pub(in crate::server::generation_recovery) fn request_for_test(
    control: &PhysicalRoomRecoveryControl,
    request: axum::extract::Request,
) -> impl std::future::Future<Output = axum::response::Response> + Send + 'static {
    let weak = std::sync::Arc::downgrade(&control.state);
    async move { routes::check(axum::extract::State(weak), request).await }
}
