//! Detached pins bind the genuine continuation and literal current control instance.
use super::super::{
    ServerLogGenerationDeliveryContinuationIdentity, ServerLogGenerationRecoveryControlIdentity,
};
use serde::{Deserialize, Serialize};

/// New read-only control family; neither data nor a saved receipt provides native authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationDeliveryRecoveryControlIdentity {
    /// Closed family, breditor/server-log-generation-delivery-recovery-control.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Fresh lifetime-specific operator-control instance.
    pub instance: String,
    /// Exact previous complete archive B and unchanged actual current A/C/registrations.
    pub continuation: ServerLogGenerationDeliveryContinuationIdentity,
    /// Literal current provider/native control, not a substitute generation selector.
    pub current: ServerLogGenerationRecoveryControlIdentity,
}
