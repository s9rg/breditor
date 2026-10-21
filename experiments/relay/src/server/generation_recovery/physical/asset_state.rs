//! All retained native references share the same authenticated A/B/C source transaction.
use super::{
    PhysicalServerRoomRecoveryStateIdentity, PreparedPhysicalRoomRecoveryHost,
    capture::capture_state as capture_recovery_state, selected::check_retained,
};
use crate::{
    Error, Result, Room, ServerLogGenerationRetainedAssetReferences, ServerLogGenerationRoomBackup,
    assets::AssetStore,
};
use serde::Serialize;

/// Complete server-scope dependency read, not provider availability or whole-room activation.
/// Ancestor, actual local origin and current cut remain separate. Pending native history reads
/// stay explicit; this metadata does not provide client/outbox mappings or protected secrets.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalServerAssetRecoveryState {
    /// Independent read family, breditor/physical-server-asset-recovery-state.
    pub format: &'static str,
    /// Exact revision, currently one.
    pub format_version: u32,
    /// All complete physical/native/raster/participant source selections.
    pub current: PhysicalServerRoomRecoveryStateIdentity,
    /// Whole conservative causal/packet read; Pending is never replaced with an empty list.
    pub references: ServerLogGenerationRetainedAssetReferences,
}
pub(super) fn capture_state(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &ServerLogGenerationRoomBackup,
    ancestor: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
) -> Result<PhysicalServerAssetRecoveryState> {
    let current =
        capture_recovery_state(room, assets, original, ancestor, custody, owner)?.identity()?;
    let references = room.log_generation_retained_asset_references(owner)?;
    if references.source != current.server.native
        || references.source != current.participants.source
    {
        return Err(Error::Contract("physical host asset source cuts differ"));
    }
    let state = PhysicalServerAssetRecoveryState {
        format: "breditor/physical-server-asset-recovery-state",
        format_version: 1,
        current,
        references,
    };
    super::super::super::backup::check_complete_asset_read_budget(&state)?;
    check_retained(room, assets, original, ancestor, custody, owner)?;
    Ok(state)
}
impl PreparedPhysicalRoomRecoveryHost {
    /// Capture A/B/C and every server-scope retained asset reference in one room-then-raster
    /// transaction, with current authentication and the existing whole encoded-result bound.
    /// No provider request, client flush, write, packet decision, role or activation changes.
    /// # Errors
    /// Wrong authentication/non-owner, stale/uncertain custody or retention, changed native cut,
    /// a native read failure or complete encoded result overflow refuses.
    pub async fn capture_asset_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<PhysicalServerAssetRecoveryState> {
        self.local.host.authentication.authenticate(principal, token)?;
        let owner = principal.to_owned();
        let original = self.local.original.clone();
        let ancestor = self.ancestor.clone();
        let custody = self
            .local
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("physical host actual local custody absent"))?;
        let assets = self
            .local
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("physical host actual rasters absent"))?;
        self.local
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                capture_state(room, &mut assets, &original, &ancestor, &custody, &owner)
            })
            .await
    }
}
