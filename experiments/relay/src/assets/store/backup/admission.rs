//! Pure complete native admission before a restore can create any destination.
use super::{
    ArchivedAsset, AssetBackupIdentity, AssetStoreBackup, Manifest,
    format::{self, Header, Section},
};
use crate::{
    Error, Result,
    archive_input::ArchiveSlice,
    assets::{self, prepare_asset, record, types::key},
};

fn section<'a>(
    body: ArchiveSlice<'a>,
    entry: &Section,
    offset: &mut u64,
    max: u64,
) -> Result<ArchiveSlice<'a>> {
    if entry.offset != *offset || entry.bytes == 0 || entry.bytes > max {
        return Err(Error::Contract("asset backup section"));
    }
    let bytes = body.section(*offset, entry.bytes)?;
    if bytes.digest()? != entry.sha256 {
        return Err(Error::Contract("asset backup section checksum"));
    }
    *offset += entry.bytes;
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

fn admit(
    file: ArchiveSlice<'_>,
    mut record: impl FnMut(ArchivedAsset),
) -> Result<(Header, ArchiveSlice<'_>, AssetBackupIdentity)> {
    if file.len() > format::MAX_SERVER_ASSET_BACKUP_BYTES {
        return Err(Error::Contract("asset backup byte budget"));
    }
    let (header, body): (Header, _) = file.header(format::MAGIC, format::MAX_HEADER)?;
    if header.format != "breditor/relay-asset-backup"
        || header.format_version != 1
        || header.records.len() > assets::MAX_ASSETS
        || header.bytes > assets::MAX_STORED_BYTES
    {
        return Err(Error::Contract("asset backup declarations"));
    }
    key(&header.binding)?;
    let mut offset = 0;
    let manifest = section(body, &header.manifest, &mut offset, 4096)?.read(4096)?;
    admit_manifest(&manifest, &header.binding)?;
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
        let limit = record::HEADER + record::MAX_METADATA as u64 + assets::MAX_ASSET_BYTES;
        let encoded = section(body, &entry.record, &mut offset, limit)?.read(limit)?.into_owned();
        record(admit_record(encoded, &entry.info)?);
    }
    if bytes != header.bytes || offset != body.len() {
        return Err(Error::Contract("asset backup complete body"));
    }
    let identity = AssetBackupIdentity {
        binding: header.binding.clone(),
        archive_sha256: file.digest()?,
        assets: header.records.len() as u64,
        bytes,
    };
    Ok((header, body, identity))
}

impl AssetStoreBackup {
    /// Admit exact framing, complete original files and ordinary PNG/JPEG/WebP native decoding.
    /// No destination, uploader or service is created. Checksums do not prove host provenance.
    /// # Errors
    /// Rejects unknown/noncanonical metadata, incomplete/extra ranges, budgets and invalid rasters.
    pub fn from_bytes(file: &[u8]) -> Result<Self> {
        let mut records = Vec::new();
        let (header, body, identity) =
            admit(ArchiveSlice::Bytes(file), |record| records.push(record))?;
        let manifest = body.section(0, header.manifest.bytes)?.read(4096)?.into_owned();
        Ok(Self { header, manifest, records, identity })
    }
}

pub(crate) fn admit_asset_file(
    file: ArchiveSlice<'_>,
    expected: &AssetBackupIdentity,
) -> Result<std::collections::BTreeMap<String, crate::archive_input::ArchiveEntry>> {
    use crate::archive_input::ArchiveEntry;
    let (header, body, identity) = admit(file, drop)?;
    if &identity != expected {
        return Err(Error::Contract("joined generation raster selection differs"));
    }
    let start = body.file_offset()?;
    let entry = |section: &Section| ArchiveEntry {
        offset: start + section.offset,
        bytes: section.bytes,
        sha256: section.sha256,
    };
    Ok(std::iter::once(("store.json".into(), entry(&header.manifest)))
        .chain(header.records.into_iter().map(|asset| {
            (super::selected_files::record_name(&asset.info.asset), entry(&asset.record))
        }))
        .collect())
}
