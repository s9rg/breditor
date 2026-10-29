//! Detached ordered pins and literal inner control; DATA never recreates native authority.
use super::super::{
    ServerLogGenerationDeliveryPathIdentity, ServerLogGenerationDeliveryRecoveryControlIdentity,
};
use serde::{Deserialize, Serialize};
/// Separately named read-only whole-path operator selection; no ACK or editing grant.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationDeliveryPathRecoveryControlIdentity {
    /// Closed family, breditor/server-log-generation-delivery-path-recovery-control.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Fresh instance bound to this actual operator lifetime.
    pub instance: String,
    /// Every literal ordered predecessor and unchanged current origin/server/inventory.
    pub path: ServerLogGenerationDeliveryPathIdentity,
    /// Unchanged actual single-prior/current provider control; its selected prior is not relabelled.
    pub current: ServerLogGenerationDeliveryRecoveryControlIdentity,
}
