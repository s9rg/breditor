//! Export the existing native archive format with bounded scratch memory.
use super::{
    ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
    format::{self, Header, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES},
};
use crate::{
    Error, Result, Room, archive_digest::ArchiveDigest, log::generations::StreamGenerationCapture,
};
use std::{
    cell::Cell,
    io::{self, Write},
};

struct Output<'a, W> {
    destination: &'a mut W,
    digest: ArchiveDigest,
    failed: &'a Cell<bool>,
}

impl<W: Write> Write for Output<'_, W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let count = self.destination.write(data).inspect_err(|_| self.failed.set(true))?;
        self.digest.write_all(&data[..count])?;
        if count == 0 && !data.is_empty() {
            self.failed.set(true);
        }
        Ok(count)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.destination.flush().inspect_err(|_| self.failed.set(true))
    }
}

impl Room {
    /// Write the same canonical archive as `export_log_generation_backup` through a
    /// synchronous destination. Memory used to copy the archive does not grow
    /// with the sum of the WAL bytes. The caller owns the destination and its sync
    /// or publication. A returned identity selects the complete stream.
    ///
    /// # Errors
    /// Refuses non-owner access, incomplete or changed source files, pending rotation,
    /// storage bounds and destination errors. If it fails, the destination may
    /// contain a partial stream and must be discarded. A destination-only error
    /// leaves a valid room available for retry.
    pub fn write_log_generation_backup(
        &mut self,
        principal: &str,
        writer: &mut impl Write,
    ) -> Result<ServerLogGenerationBackupInfo> {
        self.recovery_inventory_owner(principal)?;
        let source = self.backup_identity()?;
        let failed = Cell::new(false);
        self.log.stream_generation_backup(
            |capture: StreamGenerationCapture<'_>| {
                if source.records != capture.cut.records
                    || source.terminal_log_digest != capture.cut.previous
                {
                    return Err(Error::Contract("streamed generation backup selection changed"));
                }
                let body_bytes = capture.sections.last().map_or(0, |part| part.offset + part.bytes);
                let header = Header {
                    format: "breditor/relay-log-generation-backup".into(),
                    format_version: 1,
                    source: source.clone(),
                    manifest: capture.cut.manifest,
                    files: capture.sections.clone(),
                };
                let prefix = format::prefix(&header, body_bytes)?;
                let mut output = Output {
                    destination: writer,
                    digest: ArchiveDigest::new(MAX_SERVER_LOG_GENERATION_BACKUP_BYTES),
                    failed: &failed,
                };
                output.write_all(&prefix)?;
                capture.write_body(&mut output)?;
                output.flush()?;
                let (archive_sha256, bytes) = output.digest.finish();
                Ok(ServerLogGenerationBackupInfo {
                    format: "breditor/relay-log-generation-backup",
                    format_version: 1,
                    identity: ServerLogGenerationBackupIdentity {
                        source,
                        manifest: header.manifest,
                        archive_sha256,
                    },
                    files: header.files.len(),
                    bytes,
                })
            },
            &failed,
        )
    }
}
