//! One union enforces immutable opaque identity across server and client binding generations.
use super::{
    report::{Missing, Read},
    request::Request,
};
use crate::{
    Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, Result, ServerAssetReferenceOutcome,
    assets::AssetStore,
    server::{
        ServerAssetAvailabilityMissing, ServerRecoveryAssetProvider,
        backup::{
            ResolvedServerAssets, check_complete_asset_read_budget, check_server_asset_provider,
            resolve_server_assets,
        },
        generation_recovery::physical::control::lease::State,
    },
};
use std::collections::{BTreeMap, BTreeSet};

fn preserve_server_selection(state: &State, actual: &ResolvedServerAssets) -> Result<()> {
    let bindings: BTreeMap<_, _> =
        actual.resolutions.iter().map(|row| (&row.reference, row.content_asset.as_str())).collect();
    let payloads: BTreeMap<_, _> =
        actual.assets.iter().map(|row| (row.asset.as_str(), row)).collect();
    if state.proof.metadata().resolutions.iter().any(|before| {
        bindings.get(&before.reference).copied() != Some(before.content_asset.as_str())
    }) || state
        .proof
        .metadata()
        .assets
        .iter()
        .any(|before| payloads.get(before.asset.as_str()).is_none_or(|actual| *actual != before))
    {
        return Err(Error::Contract("physical selected server asset mapping or bytes changed"));
    }
    Ok(())
}

pub(super) fn resolve(
    state: &State,
    assets: &AssetStore,
    request: &Request,
    digest: &str,
    provider: &dyn ServerRecoveryAssetProvider,
) -> Result<Read> {
    let ServerAssetReferenceOutcome::Ready { references } =
        &state.proof.metadata().state.references.outcome
    else {
        return Err(Error::Contract("physical server dependencies no longer complete"));
    };
    let union: BTreeSet<_> = references.iter().cloned().chain(request.references()).collect();
    if union.len().saturating_add(request.uploads.len()) > MAX_SERVER_ASSET_REFERENCE_PAIRS {
        return Err(Error::Contract("physical server/client complete requirement union budget"));
    }
    let resolved = resolve_server_assets(assets, &union.into_iter().collect::<Vec<_>>(), provider)?;
    // The new requirement read must not retarget the controller's already-selected native
    // provider proof even if a callback changes a server-only mapping before both new reads.
    preserve_server_selection(state, &resolved)?;
    let mut payloads: BTreeMap<_, _> =
        resolved.assets.into_iter().map(|info| (info.asset.clone(), info)).collect();
    let mut missing: Vec<_> = resolved
        .missing
        .into_iter()
        .map(|item| match item {
            ServerAssetAvailabilityMissing::Mapping { reference } => Missing::Mapping { reference },
            ServerAssetAvailabilityMissing::Bytes { reference, content_asset } => {
                Missing::Bytes { reference, content_asset }
            }
        })
        .collect();
    for asset in &request.uploads {
        check_server_asset_provider(provider)?;
        if !payloads.contains_key(asset) {
            if let Some(value) = assets.get(asset)? {
                payloads.insert(asset.clone(), value.info);
            } else {
                missing.push(Missing::UploadBytes { content_asset: asset.clone() });
            }
        }
    }
    let read = Read {
        format: "breditor/physical-room-recovery-asset-read",
        format_version: 1,
        selection: state.selection.clone(),
        request_sha256: digest.into(),
        scope: "server-and-declared-client-binding-and-upload-bytes",
        resolutions: resolved.resolutions,
        assets: payloads.into_values().collect(),
        missing,
    };
    check_complete_asset_read_budget(&read)?;
    check_server_asset_provider(provider)?;
    Ok(read)
}
