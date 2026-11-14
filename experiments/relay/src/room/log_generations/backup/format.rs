//! One backing buffer and exact distinct framing. No component or legacy budget is widened.
use super::{
    ServerLogGenerationBackup, ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
};
use crate::{
    Error, Result, RoomBackupIdentity,
    log::generations::{GenerationFileSection, MAX_GENERATION_BODY_BYTES},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
pub(super) const MAGIC: &[u8] = b"BREDITOR-RELAY-GENERATIONS1\n";
pub(super) const PREFIX: usize = MAGIC.len() + 4 + 32;
pub(super) const MAX_HEADER: usize = 128 * 1024;
/// Independent bounded envelope around the new retained file closure; not a legacy limit change.
pub const MAX_SERVER_LOG_GENERATION_BACKUP_BYTES: u64 =
    MAX_GENERATION_BODY_BYTES + MAX_HEADER as u64 + PREFIX as u64;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Header {
    pub format: String,
    pub format_version: u32,
    pub source: RoomBackupIdentity,
    pub manifest: [u8; 32],
    pub files: Vec<GenerationFileSection>,
}
pub(super) fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub(super) fn prefix(header: &Header, body_bytes: u64) -> Result<Vec<u8>> {
    let encoded = serde_json::to_vec(header)?;
    if encoded.is_empty()
        || encoded.len() > MAX_HEADER
        || body_bytes + encoded.len() as u64 + PREFIX as u64
            > MAX_SERVER_LOG_GENERATION_BACKUP_BYTES
    {
        return Err(Error::Contract("generation backup encoded budget"));
    }
    let mut prefix = Vec::with_capacity(PREFIX + encoded.len());
    prefix.extend_from_slice(MAGIC);
    prefix.extend_from_slice(
        &u32::try_from(encoded.len())
            .map_err(|_| Error::Contract("generation backup header"))?
            .to_be_bytes(),
    );
    prefix.extend_from_slice(&sha(&encoded));
    prefix.extend_from_slice(&encoded);
    Ok(prefix)
}

pub(super) fn finish(mut body: Vec<u8>, header: Header) -> Result<ServerLogGenerationBackup> {
    let prefix = prefix(&header, body.len() as u64)?;
    body.try_reserve_exact(prefix.len())
        .map_err(|_| Error::Contract("generation backup memory"))?;
    body.splice(0..0, prefix);
    let identity = ServerLogGenerationBackupIdentity {
        source: header.source.clone(),
        manifest: header.manifest,
        archive_sha256: sha(&body),
    };
    Ok(ServerLogGenerationBackup { bytes: body, header, identity })
}
impl ServerLogGenerationBackup {
    #[cfg(test)]
    pub(in crate::room::log_generations) fn allocation_for_test(&self) -> (usize, usize) {
        (self.bytes.as_ptr() as usize, self.bytes.capacity())
    }
    /// Encode the exact admitted file. Large callers can use `write_to` to avoid another copy.
    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }
    /// Write the exact immutable archive without source I/O, native changes or publication.
    /// # Errors
    /// Propagates destination write errors; partial output is not a completed archive.
    pub fn write_to(&self, writer: &mut impl Write) -> Result<()> {
        writer.write_all(&self.bytes)?;
        Ok(())
    }
    /// Inspect detached selection and byte/file counts, not current account or host authority.
    #[must_use]
    pub fn info(&self) -> ServerLogGenerationBackupInfo {
        ServerLogGenerationBackupInfo {
            format: "breditor/relay-log-generation-backup",
            format_version: 1,
            identity: self.identity.clone(),
            files: self.header.files.len(),
            bytes: self.bytes.len() as u64,
        }
    }
}
