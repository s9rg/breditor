//! Separate canonical envelope around unchanged original manifest and record bytes.
use super::{AssetBackupInfo, AssetStoreBackup};
use crate::{
    Error, Result,
    assets::{AssetInfo, MAX_ASSETS, MAX_STORED_BYTES, record},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;

pub(super) const MAGIC: &[u8] = b"BREDITOR-RASSET1\n";
pub(super) const PREFIX: usize = MAGIC.len() + 4 + 32;
pub(super) const MAX_HEADER: usize = 1024 * 1024;
/// Existing raster/record limits plus bounded transport overhead; never a store budget increase.
pub const MAX_SERVER_ASSET_BACKUP_BYTES: u64 = PREFIX as u64
    + MAX_HEADER as u64
    + 4096
    + MAX_STORED_BYTES
    + MAX_ASSETS as u64 * (record::HEADER + record::MAX_METADATA as u64);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Section {
    pub bytes: u64,
    pub offset: u64,
    pub sha256: [u8; 32],
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Entry {
    pub info: AssetInfo,
    pub record: Section,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Header {
    pub format: String,
    pub format_version: u32,
    pub binding: String,
    pub bytes: u64,
    pub manifest: Section,
    pub records: Vec<Entry>,
}
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn prefix(header: &[u8]) -> Result<Vec<u8>> {
    if header.len() > MAX_HEADER {
        return Err(Error::Contract("asset backup header budget"));
    }
    let mut prefix = MAGIC.to_vec();
    prefix.extend_from_slice(
        &u32::try_from(header.len())
            .map_err(|_| Error::Contract("asset backup header budget"))?
            .to_be_bytes(),
    );
    prefix.extend_from_slice(&sha(header));
    Ok(prefix)
}

impl AssetStoreBackup {
    /// Encode unchanged original files in the independent canonical envelope, without source I/O.
    /// # Errors
    /// Rejects the separate complete framed budget; never truncates files or increases store limits.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut file = Vec::new();
        file.try_reserve_exact(
            usize::try_from(self.encoded_len()?)
                .map_err(|_| Error::Contract("asset backup encoded length"))?,
        )
        .map_err(|_| Error::Contract("asset backup output memory"))?;
        self.write_to(&mut file)?;
        Ok(file)
    }
    /// Exact independent framing length, without copying raster record bodies or source I/O.
    /// # Errors
    /// Refuses header, overflow and complete archive budgets before any output is written.
    pub fn encoded_len(&self) -> Result<u64> {
        let header = serde_json::to_vec(&self.header)?;
        let prefix = prefix(&header)?;
        let mut length = (prefix.len() as u64)
            .checked_add(header.len() as u64)
            .and_then(|value| value.checked_add(self.manifest.len() as u64))
            .ok_or(Error::Contract("asset backup encoded length"))?;
        for asset in &self.records {
            length = length
                .checked_add(asset.encoded.len() as u64)
                .ok_or(Error::Contract("asset backup encoded length"))?;
        }
        if length > MAX_SERVER_ASSET_BACKUP_BYTES {
            return Err(Error::Contract("asset backup byte budget"));
        }
        Ok(length)
    }
    /// Write the exact original canonical archive without another complete raster buffer.
    /// Does not read source files, upload, mutate or poison the live store.
    /// # Errors
    /// Refuses framing budgets before writing and propagates destination errors. A partial
    /// destination is not a complete archive and cannot qualify recovery.
    pub fn write_to(&self, writer: &mut impl Write) -> Result<()> {
        self.encoded_len()?;
        let header = serde_json::to_vec(&self.header)?;
        writer.write_all(&prefix(&header)?)?;
        writer.write_all(&header)?;
        writer.write_all(&self.manifest)?;
        for asset in &self.records {
            writer.write_all(&asset.encoded)?;
        }
        Ok(())
    }
    /// Detached complete original metadata and selected file identity, not a permission grant.
    #[must_use]
    pub fn info(&self) -> AssetBackupInfo {
        AssetBackupInfo {
            format: "breditor/relay-asset-backup",
            format_version: 1,
            identity: self.identity.clone(),
            assets: self.records.iter().map(|a| a.info.clone()).collect(),
        }
    }
}
