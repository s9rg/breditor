//! Pure checks of every exact section and full physical lineage; native replay remains mandatory.
use super::{
    ServerLogGenerationBackup, ServerLogGenerationBackupIdentity,
    format::{self, Header},
};
use crate::{
    Error, Result,
    archive_input::ArchiveSlice,
    log::generations::{MAX_GENERATION_FILES, verify_generation_sections},
};
use std::collections::BTreeMap;

pub(super) fn admit(input: &[u8]) -> Result<Header> {
    Ok(admit_sections(ArchiveSlice::Bytes(input))?.0)
}

pub(super) fn admit_sections(input: ArchiveSlice<'_>) -> Result<(Header, ArchiveSlice<'_>)> {
    if input.len() > format::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES {
        return Err(Error::Contract("generation backup framing"));
    }
    let (header, body): (Header, _) = input.header(format::MAGIC, format::MAX_HEADER)?;
    if header.format != "breditor/relay-log-generation-backup"
        || header.format_version != 1
        || header.files.len() > MAX_GENERATION_FILES
    {
        return Err(Error::Contract("generation backup declarations"));
    }
    let mut files = BTreeMap::new();
    let mut next = 0_u64;
    let mut name: Option<&str> = None;
    for part in &header.files {
        if part.offset != next || name.is_some_and(|last| last >= part.name.as_str()) {
            return Err(Error::Contract("generation backup section order"));
        }
        let bytes = body.section(next, part.bytes)?;
        if bytes.digest()? != part.sha256 {
            return Err(Error::Contract("generation backup section checksum"));
        }
        files.insert(part.name.as_str(), bytes);
        next += part.bytes;
        name = Some(&part.name);
    }
    if next != body.len() {
        return Err(Error::Contract("generation backup trailing bytes"));
    }
    let cut = verify_generation_sections(&files)?;
    if cut.manifest != header.manifest
        || cut.records != header.source.records
        || cut.previous != header.source.terminal_log_digest
    {
        return Err(Error::Contract("generation backup selected cut differs"));
    }
    Ok((header, body))
}
impl ServerLogGenerationBackup {
    pub(in crate::room::log_generations) fn inspect_bytes(
        input: &[u8],
    ) -> Result<super::ServerLogGenerationBackupInfo> {
        let header = admit(input)?;
        Ok(super::ServerLogGenerationBackupInfo {
            format: "breditor/relay-log-generation-backup",
            format_version: 1,
            identity: ServerLogGenerationBackupIdentity {
                source: header.source,
                manifest: header.manifest,
                archive_sha256: format::sha(input),
            },
            files: header.files.len(),
            bytes: input.len() as u64,
        })
    }
    /// Admit every exact file, global cut and hash without source writes or native room replay.
    /// A transport-valid archive may still fail native source/role/schema replay at restore.
    /// # Errors
    /// Wrong/ambiguous framing, missing/extra files, torn tails, checksum, lineage or bounds refuse.
    pub fn from_bytes(input: &[u8]) -> Result<Self> {
        let header = admit(input)?;
        let identity = ServerLogGenerationBackupIdentity {
            source: header.source.clone(),
            manifest: header.manifest,
            archive_sha256: format::sha(input),
        };
        Ok(Self { bytes: input.to_vec(), header, identity })
    }
    /// Admit an owned buffer without duplicating the complete archive's backing bytes.
    /// # Errors
    /// Refuses the same exact file, framing, lineage and budget failures as `from_bytes`.
    pub fn from_owned_bytes(bytes: Vec<u8>) -> Result<Self> {
        let header = admit(&bytes)?;
        let identity = ServerLogGenerationBackupIdentity {
            source: header.source.clone(),
            manifest: header.manifest,
            archive_sha256: format::sha(&bytes),
        };
        Ok(Self { bytes, header, identity })
    }
}
