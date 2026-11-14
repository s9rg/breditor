//! Export the existing native archive format with bounded scratch memory.
use super::{
    ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
    format::{self, Header, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES},
};
use crate::{
    Error, Result, Room, RoomBackupIdentity,
    archive_digest::ArchiveDigest,
    log::{Log, Record, generations::StreamGenerationCapture},
};
use breditor_collab_feasibility::rich_replica::RichReplica;
use std::{
    cell::Cell,
    io::{self, Write},
};

pub(in crate::room) struct BackupOutput<'a, W> {
    pub(in crate::room) destination: &'a mut W,
    pub(in crate::room) digest: ArchiveDigest,
    pub(in crate::room) failed: &'a Cell<bool>,
}

impl<W: Write> Write for BackupOutput<'_, W> {
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

pub(in crate::room) struct NativeBackupStream<'a> {
    prefix: Vec<u8>,
    capture: StreamGenerationCapture<'a>,
    pub(in crate::room) info: ServerLogGenerationBackupInfo,
}

impl NativeBackupStream<'_> {
    pub(in crate::room) fn measure(&mut self) -> Result<()> {
        let mut hash = ArchiveDigest::new(MAX_SERVER_LOG_GENERATION_BACKUP_BYTES);
        self.write_to(&mut hash)?;
        let (sha256, bytes) = hash.finish();
        if bytes != self.info.bytes {
            return Err(Error::Contract("streamed generation backup length differs"));
        }
        self.info.identity.archive_sha256 = sha256;
        Ok(())
    }

    pub(in crate::room) fn write_to(&self, output: &mut impl Write) -> Result<()> {
        output.write_all(&self.prefix)?;
        self.capture.write_body(output)
    }

    pub(in crate::room) fn check(&self) -> Result<()> {
        self.capture.check()
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
        let failed = Cell::new(false);
        self.with_native_backup_stream(principal, &failed, |mut stream| {
            let mut output = BackupOutput {
                destination: writer,
                digest: ArchiveDigest::new(MAX_SERVER_LOG_GENERATION_BACKUP_BYTES),
                failed: &failed,
            };
            stream.write_to(&mut output)?;
            output.flush()?;
            stream.check()?;
            let (sha, bytes) = output.digest.finish();
            if bytes != stream.info.bytes {
                return Err(Error::Contract("streamed generation backup length differs"));
            }
            stream.info.identity.archive_sha256 = sha;
            Ok(stream.info)
        })
    }

    pub(in crate::room) fn with_native_backup_stream<T>(
        &mut self,
        principal: &str,
        other_failure: &Cell<bool>,
        write: impl FnOnce(NativeBackupStream<'_>) -> Result<T>,
    ) -> Result<T> {
        let source = self.stream_source(principal)?;
        with_native_stream(&mut self.log, source, other_failure, write)
    }

    fn stream_source(&self, principal: &str) -> Result<RoomBackupIdentity> {
        self.recovery_inventory_owner(principal)?;
        let physical = self.log.generation_descriptor()?;
        let records = physical
            .next_sequence
            .parse()
            .map_err(|_| Error::Contract("streamed generation backup global cut"))?;
        Ok(self.native_identity_at(records, physical.terminal_digest))
    }

    // Separate borrows let the caller consult the replica while the actual WAL is held.
    pub(in crate::room) fn visit_generation_backup_records(
        &mut self,
        principal: &str,
        mut visit: impl FnMut(&RichReplica, Record) -> Result<()>,
    ) -> Result<ServerLogGenerationBackupIdentity> {
        let source = self.stream_source(principal)?;
        let replica = &self.replica;
        let failed = Cell::new(false);
        let (identity, semantic_error) =
            with_native_stream(&mut self.log, source, &failed, |mut stream| {
                let mut semantic_error = None;
                stream.capture.visit_records(|record| {
                    if semantic_error.is_none() {
                        semantic_error = visit(replica, record).err();
                    }
                    Ok(())
                })?;
                // Final canonical digest includes unpublished files and the complete header.
                stream.measure()?;
                stream.check()?;
                Ok((stream.info.identity, semantic_error))
            })?;
        match semantic_error {
            Some(error) => Err(error),
            None => Ok(identity),
        }
    }
}

fn with_native_stream<T>(
    log: &mut Log,
    source: RoomBackupIdentity,
    other_failure: &Cell<bool>,
    write: impl FnOnce(NativeBackupStream<'_>) -> Result<T>,
) -> Result<T> {
    log.stream_generation_backup(
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
            let bytes = prefix.len() as u64 + body_bytes;
            let info = ServerLogGenerationBackupInfo {
                format: "breditor/relay-log-generation-backup",
                format_version: 1,
                identity: ServerLogGenerationBackupIdentity {
                    source,
                    manifest: header.manifest,
                    archive_sha256: [0; 32],
                },
                files: header.files.len(),
                bytes,
            };
            write(NativeBackupStream { prefix, capture, info })
        },
        other_failure,
    )
}
