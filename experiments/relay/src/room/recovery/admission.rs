//! Pure bounded whole-file admission. Native log replay occurs before the durable ready barrier.
use super::{
    ServerRoomBackup, ServerRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{
    Error, MAX_ROOM_BACKUP_BYTES, Result, RoomBackup,
    assets::{AssetStoreBackup, MAX_SERVER_ASSET_BACKUP_BYTES},
};
fn section<'a>(body: &'a [u8], part: &Section, next: &mut u64, max: u64) -> Result<&'a [u8]> {
    if part.offset != *next || part.bytes == 0 || part.bytes > max {
        return Err(Error::Contract("server backup component range"));
    }
    let end =
        next.checked_add(part.bytes).ok_or(Error::Contract("server backup component range"))?;
    let bytes = body
        .get(
            usize::try_from(*next).map_err(|_| Error::Contract("server backup component range"))?
                ..usize::try_from(end)
                    .map_err(|_| Error::Contract("server backup component range"))?,
        )
        .ok_or(Error::Contract("server backup component range"))?;
    if format::sha(bytes) != part.sha256 {
        return Err(Error::Contract("server backup component checksum"));
    }
    *next = end;
    Ok(bytes)
}
impl ServerRoomBackup {
    /// Admit exact component archives, native raster decoding and matching original server cut.
    /// This performs no filesystem writes and does not prove native log replay or host authority.
    /// # Errors
    /// Rejects noncanonical/unknown framing, incomplete components, budgets and inconsistent identity.
    pub fn from_bytes(input: &[u8]) -> Result<Self> {
        if input.len() < format::PREFIX
            || input.len() as u64 > format::MAX_SERVER_ROOM_BACKUP_BYTES
            || !input.starts_with(format::MAGIC)
        {
            return Err(Error::Contract("server backup framing/bytes"));
        }
        let at = format::MAGIC.len();
        let size = usize::try_from(u32::from_be_bytes(
            input[at..at + 4].try_into().map_err(|_| Error::Contract("server backup header"))?,
        ))
        .map_err(|_| Error::Contract("server backup header"))?;
        if size == 0 || size > format::MAX_HEADER {
            return Err(Error::Contract("server backup header budget"));
        }
        let encoded = input
            .get(format::PREFIX..format::PREFIX + size)
            .ok_or(Error::Contract("server backup header"))?;
        if input[at + 4..format::PREFIX] != format::sha(encoded) {
            return Err(Error::Contract("server backup header checksum"));
        }
        let header: Header = serde_json::from_slice(encoded)?;
        if header.format != "breditor/server-room-backup"
            || header.format_version != 1
            || serde_json::to_vec(&header)? != encoded
            || header.room.asset_binding != header.assets.binding
        {
            return Err(Error::Contract("server backup declarations"));
        }
        let body = &input[format::PREFIX + size..];
        let mut offset = 0;
        let room = RoomBackup::from_bytes(section(
            body,
            &header.log,
            &mut offset,
            MAX_ROOM_BACKUP_BYTES,
        )?)?;
        let assets = AssetStoreBackup::from_bytes(section(
            body,
            &header.rasters,
            &mut offset,
            MAX_SERVER_ASSET_BACKUP_BYTES,
        )?)?;
        if offset != body.len() as u64
            || assets.info().identity != header.assets
            || room.selected_cut() != (header.room.records, header.room.terminal_log_digest)
        {
            return Err(Error::Contract("server backup selected components"));
        }
        let identity = ServerRoomBackupIdentity {
            room: header.room.clone(),
            assets: header.assets.clone(),
            archive_sha256: format::sha(input),
        };
        Ok(Self { header, room, assets, identity })
    }
}
