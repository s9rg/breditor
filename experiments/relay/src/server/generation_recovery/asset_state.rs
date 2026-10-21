//! Exact complete server references compose with the full physical origin/current selection.
use super::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryStateIdentity,
    capture::capture_state,
};
use crate::{Error, Result, ServerLogGenerationRetainedAssetReferences};
use serde::Serialize;
/// Owner-authenticated server-only dependency inventory. Ready references do not prove provider
/// mappings, stored bytes for opaque bindings, all clients/outboxes or whole-room activation.
/// Serialized metadata is not a live native/ownership/registration or provider capability.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogGenerationAssetRecoveryState {
    /// Distinct generation-aware read family; original server states remain unchanged.
    pub format: &'static str,
    /// Exact independent read revision, currently one.
    pub format_version: u32,
    /// Complete original/current joined archives and every current native registration.
    pub current: ServerLogGenerationRecoveryStateIdentity,
    /// Whole conservative native causal/packet read. Pending is not replaced by an empty list.
    pub references: ServerLogGenerationRetainedAssetReferences,
}
impl PreparedLogGenerationRecoveryHost {
    /// Capture native/raster/registration selections and all retained server-scope references in
    /// the same authenticated serialized transaction. No upload, provider fetch, packet decision,
    /// client flush, grant or activation occurs. Existing complete read bounds remain in force.
    /// # Errors
    /// Wrong current authentication/non-owner, stale/uncertain source or custody, native read
    /// failure, mismatched physical selections or whole encoded result overflow refuses.
    pub async fn capture_asset_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerLogGenerationAssetRecoveryState> {
        self.host.authentication.authenticate(principal, token)?;
        let owner = principal.to_owned();
        let original = self.original.clone();
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host custody absent"))?;
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("generation host assets absent"))?;
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                let current =
                    capture_state(room, &mut assets, &original, &custody, &owner)?.identity()?;
                let references = room.log_generation_retained_asset_references(&owner)?;
                if references.source != current.server.native
                    || current.participants.source != references.source
                {
                    return Err(Error::Contract("generation host asset source cuts differ"));
                }
                let state = ServerLogGenerationAssetRecoveryState {
                    format: "breditor/server-log-generation-asset-recovery-state",
                    format_version: 1,
                    current,
                    references,
                };
                super::super::backup::check_complete_asset_read_budget(&state)?;
                custody.check_source(room, &mut assets, &original, &owner)?;
                Ok(state)
            })
            .await
    }
}
