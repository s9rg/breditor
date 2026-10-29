//! Separate exact previous/current operator control. Original controls are not relabelled.
mod identity;
mod lease;
mod prepare;
mod routes;
pub use identity::ServerLogGenerationDeliveryRecoveryControlIdentity;
pub use lease::ServerLogGenerationDeliveryRecoveryControl;
pub use prepare::prepare_log_generation_delivery_recovery_control;

/// Trusted sibling composition only; all routes retain weak references to actual existing owners.
pub(super) fn router_for_path(
    control: &ServerLogGenerationDeliveryRecoveryControl,
) -> axum::Router {
    super::control::router_for_delivery(&control.state.current)
        .merge(routes::router(std::sync::Arc::downgrade(&control.state)))
}

#[cfg(test)]
pub(super) fn request_for_test(
    control: &ServerLogGenerationDeliveryRecoveryControl,
    request: axum::extract::Request,
) -> impl std::future::Future<Output = axum::response::Response> + Send + 'static {
    let weak = std::sync::Arc::downgrade(&control.state);
    async move { routes::check(axum::extract::State(weak), request).await }
}
