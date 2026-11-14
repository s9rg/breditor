//! Exact selected client payloads added to a private, unpublished restore.
use crate::{
    Error, Result,
    archive_input::{ArchiveEntry, ArchiveInput},
    assets::{
        AssetBackupIdentity, AssetInfo, AssetStore, MAX_ASSET_BYTES, MAX_ASSETS, MAX_STORED_BYTES,
        prepare_asset,
    },
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::File,
};

/// A host-selected client raster with independently selected immutable metadata.
/// Queue status and server upload receipts remain with the original client.
pub struct RelaySegmentClientRaster {
    info: AssetInfo,
    file: ArchiveInput,
}

impl RelaySegmentClientRaster {
    /// Hold a regular raster file for exact native admission during restore.
    ///
    /// # Errors
    /// Refuses unbounded, empty or mismatched file sizes and invalid raster metadata.
    pub fn open(file: File, expected: AssetInfo) -> Result<Self> {
        expected.validate()?;
        let file = ArchiveInput::new(file, MAX_ASSET_BYTES)?;
        if file.all().len() != expected.bytes {
            return Err(Error::Contract("client raster selected file size differs"));
        }
        Ok(Self { info: expected, file })
    }
}

/// Validate a complete union before creating the destination. Actual bytes are
/// read and installed individually so the union never needs a full payload buffer.
pub(super) fn check_selected(
    rasters: &[RelaySegmentClientRaster],
    base: &AssetBackupIdentity,
    entries: &BTreeMap<String, ArchiveEntry>,
) -> Result<()> {
    let mut assets = BTreeSet::new();
    let mut bytes = base.bytes;
    let mut count = base.assets;
    if rasters.len() > MAX_ASSETS {
        return Err(Error::Contract("client raster count budget"));
    }
    for raster in rasters {
        raster.file.check()?;
        if !assets.insert(&raster.info.asset) {
            return Err(Error::Contract("duplicate client raster selection"));
        }
        if !entries.contains_key(&format!("{}.asset", &raster.info.asset[7..])) {
            count += 1;
            bytes += raster.info.bytes;
        }
    }
    if count > MAX_ASSETS as u64 || bytes > MAX_STORED_BYTES {
        return Err(Error::Contract("restored raster union budget"));
    }
    Ok(())
}

pub(super) fn install(
    store: &mut AssetStore,
    rasters: &[RelaySegmentClientRaster],
) -> Result<Vec<String>> {
    let mut selected = Vec::with_capacity(rasters.len());
    for raster in rasters {
        let bytes = raster.file.all().read(MAX_ASSET_BYTES)?.into_owned();
        let prepared = prepare_asset(&raster.info.asset, raster.info.mime.as_str(), bytes)?;
        if prepared.info() != &raster.info {
            return Err(Error::Contract("client raster selected metadata differs"));
        }
        raster.file.check()?;
        store.put(prepared)?;
        selected.push(raster.info.asset.clone());
    }
    for raster in rasters {
        raster.file.check()?;
    }
    selected.sort_unstable();
    Ok(selected)
}

pub(super) fn check_retained(store: &AssetStore, expected: &[String]) -> Result<()> {
    if expected.len() > MAX_ASSETS {
        return Err(Error::Contract("client raster count budget"));
    }
    let mut previous = "";
    for asset in expected {
        if asset.as_str() <= previous {
            return Err(Error::Contract("client raster selection order"));
        }
        if store.get(asset)?.is_none() {
            return Err(Error::Contract("selected client raster missing or changed"));
        }
        previous = asset;
    }
    Ok(())
}
