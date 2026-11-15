//! Actual complete native bytes and generation-exact current host mappings; no receipt shortcut.
use super::{ServerAssetAvailabilityMissing, ServerAssetResolution, ServerRecoveryAssetProvider};
use crate::{
    Error, Result,
    assets::{AssetInfo, AssetStore},
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::collections::BTreeMap;
pub(in crate::server) struct Resolved {
    pub resolutions: Vec<ServerAssetResolution>,
    pub assets: Vec<AssetInfo>,
    pub missing: Vec<ServerAssetAvailabilityMissing>,
}
pub(in crate::server) fn guard(provider: &dyn ServerRecoveryAssetProvider) -> Result<()> {
    provider.check().map_err(|_| Error::Contract("server asset provider guard refused"))
}
fn key(value: &str) -> Result<()> {
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value.as_bytes()[7..].iter().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
    {
        return Err(Error::Contract("server asset provider content identity"));
    }
    Ok(())
}
fn target(
    provider: &dyn ServerRecoveryAssetProvider,
    pair: &VersionAssetReference,
) -> Result<Option<String>> {
    guard(provider)?;
    // Native IDs are opaque: a hash-like prefix alone does not claim a content digest.
    // Match the existing SDK's exact canonical content-addressed identity policy.
    let target = if key(&pair.asset).is_ok() {
        Some(pair.asset.clone())
    } else {
        provider
            .resolve(pair)
            .map_err(|_| Error::Contract("server asset provider resolution refused"))?
    };
    if let Some(value) = &target {
        key(value)?;
    }
    guard(provider)?;
    Ok(target)
}
// Compare current opaque mappings to the already byte-verified cut. Canonical content
// IDs have no provider mapping. The caller separately rechecks custody of the raster files.
pub(in crate::server) fn check_mappings(
    provider: &dyn ServerRecoveryAssetProvider,
    selected: &[ServerAssetResolution],
) -> Result<()> {
    guard(provider)?;
    for binding in selected {
        if key(&binding.reference.asset).is_err()
            && target(provider, &binding.reference)?.as_deref()
                != Some(binding.content_asset.as_str())
        {
            return Err(Error::Contract("relay segment handover provider inputs changed"));
        }
    }
    guard(provider)
}

pub(in crate::server) fn resolve(
    assets: &AssetStore,
    references: &[VersionAssetReference],
    provider: &dyn ServerRecoveryAssetProvider,
) -> Result<Resolved> {
    guard(provider)?;
    let mut resolutions = Vec::new();
    let mut payloads = BTreeMap::new();
    let mut original_assets = BTreeMap::new();
    let mut missing = Vec::new();
    let mut targets = Vec::new();
    for pair in references {
        let content = target(provider, pair)?;
        targets.push(content.clone());
        let Some(content) = content else {
            missing.push(ServerAssetAvailabilityMissing::Mapping { reference: pair.clone() });
            continue;
        };
        if original_assets
            .insert(pair.asset.clone(), content.clone())
            .is_some_and(|before| before != content)
        {
            return Err(Error::Contract("server asset changed immutable bytes across generations"));
        }
        if !payloads.contains_key(&content) {
            let value = assets.get(&content)?;
            guard(provider)?;
            if let Some(value) = value {
                payloads.insert(content.clone(), value.info);
            } else {
                missing.push(ServerAssetAvailabilityMissing::Bytes {
                    reference: pair.clone(),
                    content_asset: content.clone(),
                });
            }
        }
        resolutions.push(ServerAssetResolution { reference: pair.clone(), content_asset: content });
    }
    for (pair, before) in references.iter().zip(targets) {
        if target(provider, pair)? != before {
            return Err(Error::Contract("server asset provider mapping changed"));
        }
    }
    guard(provider)?;
    Ok(Resolved { resolutions, assets: payloads.into_values().collect(), missing })
}
