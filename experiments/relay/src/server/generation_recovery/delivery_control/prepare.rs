//! Compose only genuine same-host/current native capabilities; no caller DTO or callbacks.
use super::super::{
    ServerLogGenerationRecoveryControl, VerifiedServerLogGenerationDeliveryContinuation,
    control::router_for_delivery,
};
use super::{
    ServerLogGenerationDeliveryRecoveryControl, ServerLogGenerationDeliveryRecoveryControlIdentity,
    lease::State, routes,
};
use crate::{Error, Result};
use axum::Router;
use std::sync::{Arc, atomic::AtomicBool};

/// Wrap a genuine current native/provider operator control with a genuine full
/// A <= B <= C continuation proof. Current identity, actual host and owner must
/// match. Consumes the old guard; keep the returned guard for all shared routes.
/// Adds only /recovery/generation-delivery/v1/check POST/OPTIONS; original current
/// read routes and meanings remain unchanged. All share the existing operator
/// credentials, exact Origin policy and two-request quota. Routers hold weak refs.
/// No editing, recovery migration, receipt or activation endpoint is created.
/// # Errors
/// Stale/foreign native or provider proof, different exact current selection,
/// closed current guard, changed actual custody or provider/storage uncertainty refuse.
/// Failure drops the supplied guards, never modifies native/user data.
pub async fn prepare_log_generation_delivery_recovery_control(
    current: ServerLogGenerationRecoveryControl,
    continuation: Arc<VerifiedServerLogGenerationDeliveryContinuation>,
) -> Result<(Router, ServerLogGenerationDeliveryRecoveryControl)> {
    current.state.local()?;
    if current.identity().source != continuation.identity().current {
        return Err(Error::Contract("delivery control current selection differs"));
    }
    continuation
        .check_live_digest(
            &current.state.host,
            &current.state.owner,
            &current.state.native_token_digest,
        )
        .await?;
    current.state.check().await?;
    continuation
        .check_live_digest(
            &current.state.host,
            &current.state.owner,
            &current.state.native_token_digest,
        )
        .await?;
    let selection = ServerLogGenerationDeliveryRecoveryControlIdentity {
        format: "breditor/server-log-generation-delivery-recovery-control".into(),
        format_version: 1,
        instance: crate::credentials::issue()?,
        continuation: continuation.identity(),
        current: current.identity(),
    };
    let router = router_for_delivery(&current);
    let state = Arc::new(State { current, continuation, selection, live: AtomicBool::new(true) });
    let router = router.merge(routes::router(Arc::downgrade(&state)));
    Ok((router, ServerLogGenerationDeliveryRecoveryControl { state }))
}
