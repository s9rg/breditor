//! Pure complete native admission before a restore can create any destination.
use super::{
    ArchivedAsset, AssetBackupIdentity, AssetStoreBackup, Manifest,
    format::{self, Header, Section},
};
use crate::{
    Error, Result,
    assets::{self, prepare_asset, record, types::key},
};

fn section<'a>(body: &'a [u8], entry: &Section, offset: &mut u64, max: u64) -> Result<&'a [u8]> {
    if entry.offset != *offset || entry.bytes == 0 || entry.bytes > max {
        return Err(Error::Contract("asset backup section"));
    }
    let end = offset.checked_add(entry.bytes).ok_or(Error::Contract("asset backup section"))?;
    let bytes = body
        .get(
            usize::try_from(*offset).map_err(|_| Error::Contract("asset backup section"))?
                ..usize::try_from(end).map_err(|_| Error::Contract("asset backup section"))?,
        )
        .ok_or(Error::Contract("asset backup section"))?;
    if format::sha(bytes) != entry.sha256 {
        return Err(Error::Contract("asset backup section checksum"));
    }
    *offset = end;
    Ok(bytes)
}
pub(super) fn admit_record(
    encoded: Vec<u8>,
    expected: &assets::AssetInfo,
) -> Result<ArchivedAsset> {
    let stored = record::decode(&encoded, &expected.asset)?;
    if &stored.info != expected {
        return Err(Error::Contract("asset backup original metadata"));
    }
    let prepared = prepare_asset(&stored.info.asset, stored.info.mime.as_str(), stored.bytes)?;
    if prepared.info() != expected {
        return Err(Error::Contract("asset backup native raster metadata"));
    }
    Ok(ArchivedAsset { info: expected.clone(), encoded })
}
pub(super) fn admit_manifest(bytes: &[u8], binding: &str) -> Result<()> {
    if bytes.is_empty() || bytes.len() > 4096 {
        return Err(Error::Contract("asset backup manifest budget"));
    }
    let manifest: Manifest = serde_json::from_slice(bytes)?;
    if manifest.format != "breditor/relay-asset-store"
        || manifest.format_version != 1
        || manifest.binding != binding
    {
        return Err(Error::Contract("asset backup room binding"));
    }
    Ok(())
}

impl AssetStoreBackup {
    /// Admit exact framing, complete original files and ordinary PNG/JPEG/WebP native decoding.
    /// No destination, uploader or service is created. Checksums do not prove host provenance.
    /// # Errors
    /// Rejects unknown/noncanonical metadata, incomplete/extra ranges, budgets and invalid rasters.
    pub fn from_bytes(file: &[u8]) -> Result<Self> {
        if file.len() < format::PREFIX || file.len() as u64 > format::MAX_SERVER_ASSET_BACKUP_BYTES
        {
            return Err(Error::Contract("asset backup byte budget"));
        }
        if !file.starts_with(format::MAGIC) {
            return Err(Error::Contract("asset backup framing"));
        }
        let at = format::MAGIC.len();
        let length = usize::try_from(u32::from_be_bytes(
            file[at..at + 4].try_into().map_err(|_| Error::Contract("asset backup header"))?,
        ))
        .map_err(|_| Error::Contract("asset backup header budget"))?;
        if length == 0 || length > format::MAX_HEADER {
            return Err(Error::Contract("asset backup header budget"));
        }
        let encoded = file
            .get(format::PREFIX..format::PREFIX + length)
            .ok_or(Error::Contract("asset backup header"))?;
        if file[at + 4..format::PREFIX] != format::sha(encoded) {
            return Err(Error::Contract("asset backup header checksum"));
        }
        let header: Header = serde_json::from_slice(encoded)?;
        if serde_json::to_vec(&header)? != encoded
            || header.format != "breditor/relay-asset-backup"
            || header.format_version != 1
            || header.records.len() > assets::MAX_ASSETS
            || header.bytes > assets::MAX_STORED_BYTES
        {
            return Err(Error::Contract("asset backup declarations"));
        }
        key(&header.binding)?;
        let body = &file[format::PREFIX + length..];
        let mut offset = 0;
        let manifest = section(body, &header.manifest, &mut offset, 4096)?.to_vec();
        admit_manifest(&manifest, &header.binding)?;
        let mut records = Vec::new();
        let mut bytes = 0_u64;
        let mut previous = "";
        for entry in &header.records {
            entry.info.validate()?;
            if entry.info.asset.as_str() <= previous {
                return Err(Error::Contract("asset backup asset order"));
            }
            previous = &entry.info.asset;
            bytes += entry.info.bytes;
            if bytes > assets::MAX_STORED_BYTES {
                return Err(Error::Contract("asset backup payload budget"));
            }
            let encoded = section(
                body,
                &entry.record,
                &mut offset,
                record::HEADER + record::MAX_METADATA as u64 + assets::MAX_ASSET_BYTES,
            )?
            .to_vec();
            records.push(admit_record(encoded, &entry.info)?);
        }
        if bytes != header.bytes || offset != body.len() as u64 {
            return Err(Error::Contract("asset backup complete body"));
        }
        let identity = AssetBackupIdentity {
            binding: header.binding.clone(),
            archive_sha256: format::sha(file),
            assets: records.len() as u64,
            bytes,
        };
        Ok(Self { header, manifest, records, identity })
    }
}
