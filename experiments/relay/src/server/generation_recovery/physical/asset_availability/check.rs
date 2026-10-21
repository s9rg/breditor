//! Actual A/B/C checks surround all provider callbacks; final comparison has no later callback.
use super::super::{
    PhysicalServerAssetRecoveryState, PhysicalServerRoomRecoveryStateIdentity,
    asset_state::capture_state, selected::check_selected,
};
use super::PhysicalServerAssetAvailabilityRead;
use crate::{
    Error, Result, Room, ServerAssetReferenceOutcome, ServerLogGenerationRoomBackup,
    assets::AssetStore,
    server::{
        ServerAssetAvailabilityMissing, ServerRecoveryAssetProvider,
        backup::{
            ResolvedServerAssets, check_complete_asset_read_budget, check_server_asset_provider,
            resolve_server_assets,
        },
    },
};
use serde::Serialize;
use std::sync::Arc;

pub(super) struct Selected<'a> {
    pub original: &'a ServerLogGenerationRoomBackup,
    pub ancestor: &'a ServerLogGenerationRoomBackup,
    pub custody: &'a crate::room::GenerationOperationCustody,
    pub owner: &'a str,
    pub expected: &'a PhysicalServerRoomRecoveryStateIdentity,
}
impl Selected<'_> {
    fn check_native(&self, room: &mut Room, assets: &mut AssetStore) -> Result<()> {
        check_selected(
            room,
            assets,
            self.original,
            self.ancestor,
            self.custody,
            self.owner,
            self.expected,
        )
    }
}
pub(super) enum Checked {
    Ready(Arc<PhysicalServerAssetAvailabilityRead>),
    Pending(Box<PhysicalServerAssetRecoveryState>, Vec<ServerAssetAvailabilityMissing>),
}
#[derive(Serialize)]
struct Pending<'a> {
    state: &'a PhysicalServerAssetRecoveryState,
    missing: &'a [ServerAssetAvailabilityMissing],
}
fn pending(
    state: &PhysicalServerAssetRecoveryState,
    missing: &[ServerAssetAvailabilityMissing],
) -> Result<()> {
    check_complete_asset_read_budget(&Pending { state, missing })
}
pub(super) fn check(
    room: &mut Room,
    assets: &mut AssetStore,
    selected: &Selected<'_>,
    provider: &dyn ServerRecoveryAssetProvider,
) -> Result<Checked> {
    selected.check_native(room, assets)?;
    check_server_asset_provider(provider)?;
    let state = capture_state(
        room,
        assets,
        selected.original,
        selected.ancestor,
        selected.custody,
        selected.owner,
    )?;
    if state.current != *selected.expected {
        return Err(Error::Contract("physical asset selected cut changed"));
    }
    let ServerAssetReferenceOutcome::Ready { references } = &state.references.outcome else {
        pending(&state, &[])?;
        check_server_asset_provider(provider)?;
        selected.check_native(room, assets)?;
        return Ok(Checked::Pending(Box::new(state), Vec::new()));
    };
    let resolved: ResolvedServerAssets = resolve_server_assets(assets, references, provider)?;
    check_server_asset_provider(provider)?;
    if !resolved.missing.is_empty() {
        pending(&state, &resolved.missing)?;
        selected.check_native(room, assets)?;
        return Ok(Checked::Pending(Box::new(state), resolved.missing));
    }
    let read = PhysicalServerAssetAvailabilityRead {
        format: "breditor/physical-server-asset-availability",
        format_version: 1,
        state,
        resolutions: resolved.resolutions,
        assets: resolved.assets,
    };
    check_complete_asset_read_budget(&read)?;
    check_server_asset_provider(provider)?;
    // No user/provider callback follows this final actual source comparison.
    selected.check_native(room, assets)?;
    Ok(Checked::Ready(Arc::new(read)))
}
