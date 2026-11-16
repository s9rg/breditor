//! Carry verified archive selections and packet history beside older immutable checkpoints.
use super::{RelaySegmentBaseFile, RelaySegmentBaseIdentity};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    room::{
        asset_references::{MAX_PACKET_HISTORY_BYTES, PacketHistory},
        materialized_checkpoint::PhysicalClosure,
    },
};
use serde::{Deserialize, Serialize};
use std::io::BufReader;
#[cfg(feature = "server")]
use std::io::{self, Write};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ArchiveRetirement {
    pub(super) binding: [u8; 32],
    pub(super) closure: PhysicalClosure,
    pub(super) history: PacketHistory,
}

impl ArchiveRetirement {
    pub(super) const BYTE_LIMIT: u64 = MAX_PACKET_HISTORY_BYTES as u64 + 256 * 1024;

    pub(super) fn read(
        input: &ArchiveInput,
        expected: &RelaySegmentBaseIdentity,
        binding: [u8; 32],
        parent: Option<&RelaySegmentBaseFile>,
    ) -> Result<Self> {
        input.check()?;
        let bytes = input.all();
        if bytes.len() == 0 || bytes.len() > Self::BYTE_LIMIT {
            return Err(Error::Contract("relay archive retirement byte budget"));
        }
        let proof: Self = serde_json::from_reader(BufReader::new(bytes.reader()))?;
        if proof.binding != binding {
            return Err(Error::Contract("relay archive retirement binding differs"));
        }
        proof.history.check_range(
            parent.map_or(0, |base| base.identity().predecessor.source.records),
            expected.predecessor.source.records,
        )?;
        input.check()?;
        Ok(proof)
    }
}

#[cfg(feature = "server")]
impl RelaySegmentBaseFile {
    pub(crate) const ARCHIVE_RETIREMENT_LIMIT: u64 = ArchiveRetirement::BYTE_LIMIT;

    pub(crate) fn check_retirement_against(&self, source: &Self) -> Result<()> {
        if self.binding() != source.binding() {
            return Err(Error::Contract("retired portable predecessor differs from live history"));
        }
        if let Some(proof) = &self.retirement {
            let mut measured =
                crate::archive_digest::ArchiveDigest::new(Self::ARCHIVE_RETIREMENT_LIMIT);
            source.write_archive_retirement(&mut measured)?;
            let bytes = proof.all();
            if measured.finish() != (bytes.digest()?, bytes.len()) {
                return Err(Error::Contract("portable retirement proof differs from live history"));
            }
        } else {
            source.check()?;
        }
        self.check()
    }

    pub(crate) fn write_archive_retirement(&self, output: &mut impl Write) -> Result<()> {
        self.check()?;
        if let Some(input) = &self.retirement {
            let bytes = input.all();
            if io::copy(&mut bytes.reader(), output)? != bytes.len() {
                return Err(Error::Contract("relay archive retirement copy truncated"));
            }
        } else {
            let mut offset = 0;
            let files = self
                .sections
                .iter()
                .map(|(name, entry)| {
                    let file = crate::log::generations::GenerationFileSection {
                        name: name.clone(),
                        offset,
                        bytes: entry.bytes,
                        sha256: entry.sha256,
                    };
                    offset += entry.bytes;
                    file
                })
                .collect();
            let parent = self.parent();
            let first = parent.map_or(0, |base| base.identity().predecessor.source.records);
            let history =
                PacketHistory::capture_from(first, |visit| self.visit_original_records(visit))??;
            let proof = ArchiveRetirement {
                binding: self.binding(),
                closure: PhysicalClosure {
                    root: self.root_generation().to_owned(),
                    parent: parent.map(Self::binding),
                    archive_sha256: self.identity().predecessor.archive_sha256,
                    files,
                },
                history,
            };
            serde_json::to_writer(output, &proof)?;
        }
        self.check()
    }
}
