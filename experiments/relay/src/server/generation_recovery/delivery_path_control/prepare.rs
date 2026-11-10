//! Trusted same-host composition, never construction from a caller declaration.
use super::super::{
    ServerLogGenerationDeliveryRecoveryControl, VerifiedServerLogGenerationDeliveryPath,
    VerifiedServerLogGenerationHandoverDeliveryPath, delivery_control::router_for_path,
};
use super::{
    ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    handover::{Handover, ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity},
    lease::State,
    routes,
};
use crate::{Error, Result};
use axum::Router;
use std::sync::{Arc, atomic::AtomicBool};
/// Compose the genuine whole ordered native path with the actual prior/current
/// native/provider control. Consumes the supplied guard and retains all original
/// routes, identities, credentials, exact Origin policy and SAME two-request quota.
/// Adds only POST/OPTIONS /recovery/generation-delivery-path/v1/check with a
/// separate 16 MiB envelope; old 64/256 KiB route limits stay unchanged.
/// The inner control's prior may remain original B while the full path includes
/// later C1/C2. No native path entry or old selector is relabelled or discarded.
/// # Errors
/// Closed/stale/foreign host, native path, exact current pins, provider callbacks
/// or uncertain custody/storage refuse. No native data or editing state changes.
pub async fn prepare_log_generation_delivery_path_recovery_control(
    current: ServerLogGenerationDeliveryRecoveryControl,
    path: Arc<VerifiedServerLogGenerationDeliveryPath>,
) -> Result<(Router, ServerLogGenerationDeliveryPathRecoveryControl)> {
    prepare(current, path, None).await
}

pub(super) async fn prepare(
    current: ServerLogGenerationDeliveryRecoveryControl,
    path: Arc<VerifiedServerLogGenerationDeliveryPath>,
    handover: Option<Arc<VerifiedServerLogGenerationHandoverDeliveryPath>>,
) -> Result<(Router, ServerLogGenerationDeliveryPathRecoveryControl)> {
    current.state.local()?;
    if current.identity().continuation.current != path.identity().current {
        return Err(Error::Contract("delivery path control current selection differs"));
    }
    let selection = ServerLogGenerationDeliveryPathRecoveryControlIdentity {
        format: "breditor/server-log-generation-delivery-path-recovery-control".into(),
        format_version: 1,
        instance: crate::credentials::issue()?,
        path: path.identity(),
        current: current.identity(),
    };
    routes::check_envelope(&selection)?;
    let handover = handover.map(|proof| Handover {
        selection: ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity {
            format: "breditor/server-log-generation-handover-delivery-path-recovery-control",
            format_version: 1,
            path: proof.identity(),
            current: selection.clone(),
        },
        proof,
    });
    if let Some(handover) = &handover {
        handover.receipt(routes::MAX_BYTES)?;
    }
    let router = router_for_path(&current);
    let has_handover = handover.is_some();
    let state = Arc::new(State { current, path, selection, handover, live: AtomicBool::new(true) });
    state.check(has_handover).await?;
    let router = router.merge(routes::router(Arc::downgrade(&state), has_handover));
    Ok((router, ServerLogGenerationDeliveryPathRecoveryControl { state }))
}
