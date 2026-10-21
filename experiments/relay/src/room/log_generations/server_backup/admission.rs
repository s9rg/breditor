//! Closed joined framing and complete component admission before any destination I/O.
use super::super::ServerLogGenerationBackup;
use super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, Result,
    assets::{AssetStoreBackup, MAX_SERVER_ASSET_BACKUP_BYTES},
};
use std::ops::Range;

struct Selection {
    header: Header,
    log: Range<usize>,
    rasters: Range<usize>,
}
fn section(
    input: &[u8],
    body: usize,
    part: &Section,
    next: &mut u64,
    limit: u64,
) -> Result<Range<usize>> {
    if part.offset != *next || part.bytes == 0 || part.bytes > limit {
        return Err(Error::Contract("joined generation section bounds"));
    }
    let end = next
        .checked_add(part.bytes)
        .ok_or(Error::Contract("joined generation section overflow"))?;
    let start = body
        .checked_add(
            usize::try_from(*next)
                .map_err(|_| Error::Contract("joined generation section size"))?,
        )
        .ok_or(Error::Contract("joined generation section size"))?;
    let stop = body
        .checked_add(
            usize::try_from(end).map_err(|_| Error::Contract("joined generation section size"))?,
        )
        .ok_or(Error::Contract("joined generation section size"))?;
    let bytes =
        input.get(start..stop).ok_or(Error::Contract("joined generation incomplete section"))?;
    if format::sha(bytes) != part.sha256 {
        return Err(Error::Contract("joined generation section checksum"));
    }
    *next = end;
    Ok(start..stop)
}
fn selected(input: &[u8]) -> Result<Selection> {
    if input.len() < format::PREFIX
        || input.len() as u64 > format::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES
        || !input.starts_with(format::MAGIC)
    {
        return Err(Error::Contract("joined generation framing or bytes"));
    }
    let at = format::MAGIC.len();
    let size = usize::try_from(u32::from_be_bytes(
        input[at..at + 4].try_into().map_err(|_| Error::Contract("joined generation header"))?,
    ))
    .map_err(|_| Error::Contract("joined generation header"))?;
    if size == 0 || size > format::MAX_HEADER {
        return Err(Error::Contract("joined generation header budget"));
    }
    let body = format::PREFIX + size;
    let encoded = input
        .get(format::PREFIX..body)
        .ok_or(Error::Contract("joined generation incomplete header"))?;
    if input[at + 4..format::PREFIX] != format::sha(encoded) {
        return Err(Error::Contract("joined generation header checksum"));
    }
    let header: Header = serde_json::from_slice(encoded)?;
    if header.format != "breditor/server-log-generation-room-backup"
        || header.format_version != 1
        || serde_json::to_vec(&header)? != encoded
        || header.native.source.asset_binding != header.assets.binding
        || header.log.sha256 != header.native.archive_sha256
        || header.rasters.sha256 != header.assets.archive_sha256
    {
        return Err(Error::Contract("joined generation declarations"));
    }
    let mut next = 0;
    let log = section(input, body, &header.log, &mut next, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
    let rasters = section(input, body, &header.rasters, &mut next, MAX_SERVER_ASSET_BACKUP_BYTES)?;
    if rasters.end != input.len() {
        return Err(Error::Contract("joined generation trailing bytes"));
    }
    if ServerLogGenerationBackup::inspect_bytes(&input[log.clone()])?.identity != header.native {
        return Err(Error::Contract("joined generation native component differs"));
    }
    Ok(Selection { header, log, rasters })
}
impl ServerLogGenerationRoomBackup {
    /// Admit complete bounded component archives and native raster decoding, without destination
    /// writes or native room replay. This borrowed-input API owns copies of its components.
    /// # Errors
    /// Wrong/ambiguous framing, inconsistent cuts, incomplete ranges, invalid rasters or budgets refuse.
    pub fn from_bytes(input: &[u8]) -> Result<Self> {
        let selected = selected(input)?;
        let assets = AssetStoreBackup::from_bytes(&input[selected.rasters])?;
        if assets.info().identity != selected.header.assets {
            return Err(Error::Contract("joined generation raster selection differs"));
        }
        let native = ServerLogGenerationBackup::from_bytes(&input[selected.log])?;
        let identity = ServerLogGenerationRoomBackupIdentity {
            native: selected.header.native.clone(),
            assets: selected.header.assets.clone(),
            archive_sha256: format::sha(input),
        };
        Ok(Self { header: selected.header, native, assets, identity })
    }
    /// Admit owned input while transferring its backing allocation to the native component.
    /// The native section moves in place; it is not copied into another full history buffer.
    /// Admitted raster records retain their ordinary owned representation. The original input
    /// capacity is retained, so this is not a complete memory/performance qualification.
    /// # Errors
    /// Refuses the same complete component/native-raster/framing failures as `from_bytes`.
    pub fn from_owned_bytes(mut input: Vec<u8>) -> Result<Self> {
        let selected = selected(&input)?;
        let assets = AssetStoreBackup::from_bytes(&input[selected.rasters])?;
        if assets.info().identity != selected.header.assets {
            return Err(Error::Contract("joined generation raster selection differs"));
        }
        let identity = ServerLogGenerationRoomBackupIdentity {
            native: selected.header.native.clone(),
            assets: selected.header.assets.clone(),
            archive_sha256: format::sha(&input),
        };
        input.truncate(selected.log.end);
        input.drain(..selected.log.start);
        let native = ServerLogGenerationBackup::from_owned_bytes(input)?;
        Ok(Self { header: selected.header, native, assets, identity })
    }
}
