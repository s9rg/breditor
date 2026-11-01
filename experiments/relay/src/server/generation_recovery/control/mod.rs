//! Opt-in separately authenticated read-only operator checks, never service activation.
mod accepted_native;
mod asset_requirements;
mod identity;
mod lease;
mod metadata_packet;
mod native_dependencies;
mod metadata_receipts;
mod original_review;
mod prepare;
mod routes;
pub use identity::ServerLogGenerationRecoveryControlIdentity;
pub use lease::ServerLogGenerationRecoveryControl;
pub use prepare::prepare_log_generation_recovery_control;

/// Trusted composition only; this does not export a raw native host or a new public route builder.
pub(super) fn router_for_delivery(control: &ServerLogGenerationRecoveryControl) -> axum::Router {
    routes::router(std::sync::Arc::downgrade(&control.state))
}

#[cfg(test)]
pub(super) fn request_for_test(
    control: &ServerLogGenerationRecoveryControl,
    request: axum::extract::Request,
) -> impl std::future::Future<Output = axum::response::Response> + Send + 'static {
    let weak = std::sync::Arc::downgrade(&control.state);
    async move { routes::check(axum::extract::State(weak), request).await }
}
