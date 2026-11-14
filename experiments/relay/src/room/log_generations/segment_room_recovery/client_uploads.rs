//! Admit and retain complete original upload archives, one per selected registered writer.
mod codec;
mod retained;
pub(super) use retained::{RetainedUploadSelection, RetainedUploads};

use super::client_rasters::SelectedRaster;
use crate::{
    Error, Result,
    archive_input::{ArchiveInput, ArchiveSlice},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::File};

pub(super) const MAX_CLIENTS: usize = 1024;
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;

/// Independently retained host selection of one writer's complete original upload archive.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentClientUploadPin {
    /// Original registered document writer, including observers.
    pub writer: String,
    /// Exact archive file length including upload metadata and all payloads.
    pub bytes: u64,
    /// Lowercase SHA-256 of the complete original file.
    pub sha256: String,
}

impl RelaySegmentClientUploadPin {
    fn check(&self) -> Result<()> {
        let writer = self.writer.parse::<u64>().map_err(|_| Error::Contract("archive writer"))?;
        if writer < 2
            || writer.to_string() != self.writer
            || self.bytes == 0
            || self.bytes > codec::MAX_FILE
            || !codec::digest_spelling(&self.sha256)
        {
            return Err(Error::Contract("client upload archive selection"));
        }
        Ok(())
    }
    fn name(&self) -> String {
        format!("{}.uploads", self.writer)
    }
    fn check_file(&self, file: ArchiveSlice<'_>) -> Result<()> {
        if file.len() != self.bytes || codec::hex(file.digest()?) != self.sha256 {
            return Err(Error::Contract("client upload archive differs from selected file"));
        }
        Ok(())
    }
}

/// One complete admitted SDK upload archive. Upload states, epochs and receipts stay in the file.
pub struct RelaySegmentClientUploadArchive {
    pin: RelaySegmentClientUploadPin,
    file: ArchiveInput,
    body_offset: u64,
    entries: Vec<codec::Payload>,
}

impl RelaySegmentClientUploadArchive {
    /// Open the exact original SDK upload archive against an independent writer/file selection.
    /// Staging rehashes and decodes actual raster payloads before publication.
    ///
    /// # Errors
    /// Refuses changed bytes, unsupported framing, noncanonical metadata and incomplete ranges.
    pub fn open(file: File, expected: RelaySegmentClientUploadPin) -> Result<Self> {
        expected.check()?;
        let file = ArchiveInput::new(file, codec::MAX_FILE)?;
        expected.check_file(file.all())?;
        let (body_offset, entries) = codec::read(file.all())?;
        file.check()?;
        Ok(Self { pin: expected, file, body_offset, entries })
    }
}

pub(super) fn check_pins(pins: &[RelaySegmentClientUploadPin]) -> Result<()> {
    if pins.len() > MAX_CLIENTS {
        return Err(Error::Contract("client upload archive count budget"));
    }
    let mut previous = "";
    let mut bytes = 0;
    for pin in pins {
        pin.check()?;
        if pin.writer.as_str() <= previous {
            return Err(Error::Contract("duplicate or unsorted client upload writer"));
        }
        previous = &pin.writer;
        bytes += pin.bytes;
        if bytes > MAX_TOTAL_BYTES {
            return Err(Error::Contract("client upload archive aggregate byte budget"));
        }
    }
    Ok(())
}

/// Canonical union for server storage; original per-writer queue histories stay independent.
pub(super) fn select(
    archives: &[RelaySegmentClientUploadArchive],
) -> Result<Vec<SelectedRaster<'_>>> {
    if archives.len() > MAX_CLIENTS {
        return Err(Error::Contract("client upload archive count budget"));
    }
    let pins: Vec<_> = archives.iter().map(|archive| archive.pin.clone()).collect();
    check_pins(&pins)?;
    let mut selected = BTreeMap::<&str, SelectedRaster<'_>>::new();
    for archive in archives {
        archive.file.check()?;
        for entry in &archive.entries {
            let raster = SelectedRaster {
                info: &entry.info,
                bytes: archive
                    .file
                    .all()
                    .section(archive.body_offset + entry.offset, entry.info.bytes)?,
            };
            // Every original queue's payload must agree, including duplicates not written again.
            raster.check_digest()?;
            if let Some(prior) = selected.get(entry.info.asset.as_str()) {
                if prior.info != raster.info {
                    return Err(Error::Contract("client upload raster metadata conflict"));
                }
            } else {
                selected.insert(&entry.info.asset, raster);
            }
        }
        archive.file.check()?;
    }
    Ok(selected.into_values().collect())
}
