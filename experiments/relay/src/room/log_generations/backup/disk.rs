//! Select native restore ranges only after admitting the exact physical closure and cut.
use super::{ServerLogGenerationBackupIdentity, admission::admit_sections};
use crate::{
    Error, Result,
    archive_input::{ArchiveEntry, ArchiveSlice},
    log::generations::SegmentArchiveOrigin,
};
use std::collections::BTreeMap;

pub(in crate::room::log_generations) fn admit_native_file(
    archive: ArchiveSlice<'_>,
    expected: &ServerLogGenerationBackupIdentity,
) -> Result<BTreeMap<String, ArchiveEntry>> {
    admit_generation_file(archive, expected, None)
}

pub(super) fn admit_generation_file(
    archive: ArchiveSlice<'_>,
    expected: &ServerLogGenerationBackupIdentity,
    origin: Option<&SegmentArchiveOrigin<'_>>,
) -> Result<BTreeMap<String, ArchiveEntry>> {
    let (header, body) = admit_sections(archive, origin)?;
    if header.source != expected.source
        || header.manifest != expected.manifest
        || archive.digest()? != expected.archive_sha256
    {
        return Err(Error::Contract("joined generation native component differs"));
    }
    let start = body.file_offset()?;
    Ok(header
        .files
        .into_iter()
        .map(|entry| {
            (
                entry.name,
                ArchiveEntry {
                    offset: start + entry.offset,
                    bytes: entry.bytes,
                    sha256: entry.sha256,
                },
            )
        })
        .collect())
}
