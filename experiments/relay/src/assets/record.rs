//! One immutable metadata+payload file with independently checked metadata and content hashes.
use super::{AssetInfo, PreparedAsset, StoredAsset, asset_id};
use crate::{Error, Result};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
const MAGIC: &[u8; 8] = b"BRASSET1";
const HEADER: u64 = 44;
const MAX_METADATA: usize = 4096;
fn options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
pub(super) fn write(path: &Path, prepared: &PreparedAsset) -> Result<()> {
    let metadata = serde_json::to_vec(&prepared.info)?;
    if metadata.len() > MAX_METADATA {
        return Err(Error::Contract("asset metadata bytes"));
    }
    let mut file = options().open(path)?;
    file.write_all(MAGIC)?;
    file.write_all(
        &u32::try_from(metadata.len())
            .map_err(|_| Error::Contract("asset metadata bytes"))?
            .to_be_bytes(),
    )?;
    file.write_all(&Sha256::digest(&metadata))?;
    file.write_all(&metadata)?;
    file.write_all(&prepared.bytes)?;
    file.sync_all()?;
    Ok(())
}
pub(super) fn read(path: &Path, expected: &str) -> Result<StoredAsset> {
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > HEADER + MAX_METADATA as u64 + super::MAX_ASSET_BYTES
    {
        return Err(Error::Contract("asset file type/bytes"));
    }
    let mut file = File::open(path)?;
    let mut header = [0_u8; 44];
    file.read_exact(&mut header)?;
    if &header[..8] != MAGIC {
        return Err(Error::Contract("asset file version"));
    }
    let size = usize::try_from(u32::from_be_bytes(
        header[8..12].try_into().map_err(|_| Error::Contract("asset metadata header"))?,
    ))
    .map_err(|_| Error::Contract("asset metadata bytes"))?;
    if size == 0 || size > MAX_METADATA {
        return Err(Error::Contract("asset metadata bytes"));
    }
    let mut metadata = vec![0_u8; size];
    file.read_exact(&mut metadata)?;
    let digest: [u8; 32] = Sha256::digest(&metadata).into();
    if header[12..] != digest {
        return Err(Error::Contract("asset metadata checksum"));
    }
    let info: AssetInfo = serde_json::from_slice(&metadata)?;
    info.validate()?;
    if info.asset != expected {
        return Err(Error::Contract("asset file identity"));
    }
    let mut bytes = Vec::new();
    file.take(super::MAX_ASSET_BYTES + 1).read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).map_err(|_| Error::Contract("asset bytes"))? != info.bytes
        || asset_id(&bytes) != expected
    {
        return Err(Error::Contract("asset file payload integrity"));
    }
    Ok(StoredAsset { info, bytes })
}
