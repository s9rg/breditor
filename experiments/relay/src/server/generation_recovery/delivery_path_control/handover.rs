//! Separate authenticated envelope for a selected path across a real source seal.
use super::super::{
    ServerLogGenerationDeliveryRecoveryControl, ServerLogGenerationHandoverDeliveryPathIdentity,
    VerifiedServerLogGenerationHandoverDeliveryPath,
};
use super::{
    ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationDeliveryPathRecoveryControlIdentity, prepare::prepare,
};
use crate::{Error, Result};
use axum::Router;
use serde::Serialize;
use std::sync::Arc;

/// Detached selection for the bounded handover read. The inner selector still
/// names the ordinary successor-local path and current provider.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity {
    /// The distinct handover read contract.
    pub format: &'static str,
    /// Current contract revision.
    pub format_version: u32,
    /// Complete checked lineage across the sealed restore origin.
    pub path: ServerLogGenerationHandoverDeliveryPathIdentity,
    /// Exact ordinary path and nested current provider selection.
    pub current: ServerLogGenerationDeliveryPathRecoveryControlIdentity,
}

pub(super) struct Handover {
    pub proof: Arc<VerifiedServerLogGenerationHandoverDeliveryPath>,
    pub selection: ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity,
}

impl Handover {
    pub fn receipt(&self, maximum: usize) -> Result<Vec<u8>> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Read<'a> {
            format: &'static str,
            format_version: u32,
            selection: &'a ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity,
            scope: &'static str,
        }
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/server-log-generation-handover-delivery-path-recovery-control-read",
            format_version: 1,
            selection: &self.selection,
            scope: "sealed-native-handover-path-and-current-provider",
        })?;
        if bytes.len() > maximum {
            return Err(Error::Contract("delivery handover operator envelope budget"));
        }
        Ok(bytes)
    }
}

/// Add the opt-in handover read to the genuine successor-local controls. It
/// shares their operator authentication, origin policy and request quota.
///
/// # Errors
/// Wrong host or selection, stale proof, custody or provider failure, and
/// oversized wire selections refuse.
pub async fn prepare_log_generation_handover_delivery_path_recovery_control(
    current: ServerLogGenerationDeliveryRecoveryControl,
    proof: Arc<VerifiedServerLogGenerationHandoverDeliveryPath>,
) -> Result<(Router, ServerLogGenerationDeliveryPathRecoveryControl)> {
    prepare(current, proof.successor.clone(), Some(proof)).await
}
