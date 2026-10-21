//! Pure checks of every exact section and full physical lineage; native replay remains mandatory.
use super::{
    ServerLogGenerationBackup, ServerLogGenerationBackupIdentity,
    format::{self, Header},
};
use crate::{
    Error, Result,
    log::generations::{MAX_GENERATION_FILES, verify_generation_files},
};
use std::collections::BTreeMap;

pub(super) fn admit(input: &[u8]) -> Result<Header> {
    if input.len() < format::PREFIX
        || input.len() as u64 > format::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES
        || !input.starts_with(format::MAGIC)
    {
        return Err(Error::Contract("generation backup framing"));
    }
    let at = format::MAGIC.len();
    let size = usize::try_from(u32::from_be_bytes(
        input[at..at + 4].try_into().map_err(|_| Error::Contract("generation backup header"))?,
    ))
    .map_err(|_| Error::Contract("generation backup header"))?;
    if size == 0 || size > format::MAX_HEADER {
        return Err(Error::Contract("generation backup header budget"));
    }
    let encoded = input
        .get(format::PREFIX..format::PREFIX + size)
        .ok_or(Error::Contract("generation backup missing header"))?;
    if input[at + 4..format::PREFIX] != format::sha(encoded) {
        return Err(Error::Contract("generation backup header checksum"));
    }
    let header: Header = serde_json::from_slice(encoded)?;
    if header.format != "breditor/relay-log-generation-backup"
        || header.format_version != 1
        || serde_json::to_vec(&header)? != encoded
        || header.files.len() > MAX_GENERATION_FILES
    {
        return Err(Error::Contract("generation backup declarations"));
    }
    let body = &input[format::PREFIX + size..];
    let mut files = BTreeMap::new();
    let mut next = 0_u64;
    let mut name: Option<&str> = None;
    for part in &header.files {
        if part.offset != next || name.is_some_and(|last| last >= part.name.as_str()) {
            return Err(Error::Contract("generation backup section order"));
        }
        let end = next
            .checked_add(part.bytes)
            .ok_or(Error::Contract("generation backup section range"))?;
        let bytes = body
            .get(
                usize::try_from(next)
                    .map_err(|_| Error::Contract("generation backup section range"))?
                    ..usize::try_from(end)
                        .map_err(|_| Error::Contract("generation backup section range"))?,
            )
            .ok_or(Error::Contract("generation backup missing section"))?;
        if format::sha(bytes) != part.sha256 {
            return Err(Error::Contract("generation backup section checksum"));
        }
        files.insert(part.name.as_str(), bytes);
        next = end;
        name = Some(&part.name);
    }
    if next != body.len() as u64 {
        return Err(Error::Contract("generation backup trailing bytes"));
    }
    let cut = verify_generation_files(&files)?;
    if cut.manifest != header.manifest
        || cut.records != header.source.records
        || cut.previous != header.source.terminal_log_digest
    {
        return Err(Error::Contract("generation backup selected cut differs"));
    }
    Ok(header)
}
impl ServerLogGenerationBackup {
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
