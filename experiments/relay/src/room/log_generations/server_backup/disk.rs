//! Complete file-backed archive admission. The held input remains private to the restore engine.
use super::{
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo,
    format::{self, Header},
};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, Result,
    archive_input::{ArchiveEntry, ArchiveInput, ArchiveSlice},
    assets::{MAX_SERVER_ASSET_BACKUP_BYTES, admit_asset_file},
};
use std::{collections::BTreeMap, fs::File};

/// An exact joined backup held open for bounded-memory recovery on Unix.
/// Admission checks both components before any destination is reserved. It grants no host
/// authority and does not fence an old deployment.
pub struct ServerLogGenerationRoomBackupFile {
    pub(in crate::room::log_generations) input: ArchiveInput,
    pub(in crate::room::log_generations) native: BTreeMap<String, ArchiveEntry>,
    pub(in crate::room::log_generations) rasters: BTreeMap<String, ArchiveEntry>,
    pub(in crate::room::log_generations) identity: ServerLogGenerationRoomBackupIdentity,
}

impl ServerLogGenerationRoomBackupFile {
    /// Pin one read-only handle and admit its complete canonical native and raster contents.
    /// Select the expected identity from trusted host configuration. Keep the file unmodified
    /// while using the returned source, including across calls which resume a partial restore.
    /// # Errors
    /// Wrong selection, changed bytes, invalid framing/native cut/rasters or read errors refuse.
    pub fn open(file: File, expected: &ServerLogGenerationRoomBackupIdentity) -> Result<Self> {
        let input = ArchiveInput::new(file, format::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES)?;
        let archive = input.all();
        let (header, body): (Header, _) = archive.header(format::MAGIC, format::MAX_HEADER)?;
        super::admission::validate_header(&header)?;
        if header.native != expected.native
            || header.assets != expected.assets
            || archive.digest()? != expected.archive_sha256
        {
            return Err(Error::Contract("joined generation selected archive"));
        }
        let section = |part: &format::Section, offset, limit| -> Result<ArchiveSlice<'_>> {
            if part.offset != offset || part.bytes == 0 || part.bytes > limit {
                return Err(Error::Contract("joined generation section bounds"));
            }
            body.section(offset, part.bytes)
        };
        let log = section(&header.log, 0, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
        let rasters = section(&header.rasters, log.len(), MAX_SERVER_ASSET_BACKUP_BYTES)?;
        if log.len() + rasters.len() != body.len() {
            return Err(Error::Contract("joined generation trailing bytes"));
        }
        let native = super::super::backup::admit_native_file(log, &expected.native)?;
        let rasters = admit_asset_file(rasters, &expected.assets)?;
        input.check()?;
        Ok(Self { input, native, rasters, identity: expected.clone() })
    }

    /// Detached selection and byte count established by admission.
    #[must_use]
    pub fn info(&self) -> ServerLogGenerationRoomBackupInfo {
        ServerLogGenerationRoomBackupInfo {
            format: "breditor/server-log-generation-room-backup",
            format_version: 1,
            identity: self.identity.clone(),
            bytes: self.input.all().len(),
        }
    }
}
