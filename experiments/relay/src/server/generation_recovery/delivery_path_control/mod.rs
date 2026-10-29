//! Authenticated complete ordered native path, composed with unchanged live operator controls.
mod identity;
mod lease;
mod prepare;
mod routes;
pub use identity::ServerLogGenerationDeliveryPathRecoveryControlIdentity;
pub use lease::ServerLogGenerationDeliveryPathRecoveryControl;
pub use prepare::prepare_log_generation_delivery_path_recovery_control;

#[cfg(test)]
pub(super) fn request_for_test(
    control: &ServerLogGenerationDeliveryPathRecoveryControl,
    request: axum::extract::Request,
    kind: u8,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = axum::response::Response> + Send>> {
    match kind {
        0 => {
            let weak = std::sync::Arc::downgrade(&control.state);
            Box::pin(async move { routes::check(axum::extract::State(weak), request).await })
        }
        1 => Box::pin(super::delivery_control::request_for_test(&control.state.current, request)),
        _ => Box::pin(super::control::request_for_test(
            &control.state.current.state.current,
            request,
        )),
    }
}
