//! One held file carries exact oldest-first native archives and checkpoint bytes.
use super::backup_files::read_owned;
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentBaseIdentity, Result,
    archive_input::ArchiveInput,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    fs::{self, File},
    io::Write,
    sync::Arc,
};

pub(super) const FILE: &str = "packed.bin";
const MAGIC: &[u8; 8] = b"BRLINE1\n";
const HEADER: u64 = 12;
const LENGTHS: u64 = 16;

pub(super) struct PackedNativeLineage {
    input: ArchiveInput,
    witness: GenerationFileWitness,
    pub(super) newest: Arc<RelaySegmentBaseFile>,
}

pub(super) fn write(
    directory: &GenerationDirectory,
    chain: &[&RelaySegmentBaseFile],
) -> Result<()> {
    let mut file = create(directory, chain.len())?;
    for base in chain {
        base.write_framed_pair(&mut file)?;
    }
    file.sync_all()?;
    Ok(())
}

pub(super) fn create(directory: &GenerationDirectory, count: usize) -> Result<File> {
    let count = u32::try_from(count).map_err(|_| Error::Contract("packed lineage count"))?;
    let mut file = directory.create_file(FILE, &[])?;
    file.write_all(MAGIC)?;
    file.write_all(&count.to_be_bytes())?;
    Ok(file)
}

pub(super) fn maximum_bytes(count: u32) -> Result<u64> {
    u64::from(count)
        .checked_mul(RelaySegmentBaseFile::PACKED_PAIR_LIMIT + LENGTHS)
        .and_then(|bytes| bytes.checked_add(HEADER))
        .ok_or(Error::Contract("packed lineage byte budget"))
}

pub(super) fn check_layout(directory: &GenerationDirectory) -> Result<()> {
    directory.guard()?;
    for entry in fs::read_dir(&directory.path)? {
        let name = entry?.file_name();
        if name != ".owner" && name != FILE {
            return Err(Error::Contract("packed lineage contains unexpected files"));
        }
    }
    directory.guard()
}

impl PackedNativeLineage {
    pub(super) fn open(
        directory: &GenerationDirectory,
        expected: &[RelaySegmentBaseIdentity],
    ) -> Result<Self> {
        let count =
            u32::try_from(expected.len()).map_err(|_| Error::Contract("packed lineage count"))?;
        check_layout(directory)?;
        let file = read_owned(directory, FILE)?;
        let witness = GenerationFileWitness::of(&file)?;
        let input = ArchiveInput::new(file, maximum_bytes(count)?)?;
        let whole = input.all();
        let header = whole.section(0, HEADER)?.read(HEADER)?;
        if !header.starts_with(MAGIC) || header[8..] != count.to_be_bytes() {
            return Err(Error::Contract("packed lineage header"));
        }
        let mut offset = HEADER;
        let mut parent = None;
        for selection in expected {
            let encoded = whole.section(offset, LENGTHS)?.read(LENGTHS)?;
            let archive_bytes =
                u64::from_be_bytes(encoded[..8].try_into().map_err(|_| Error::NeedsRecovery)?);
            let checkpoint_bytes =
                u64::from_be_bytes(encoded[8..].try_into().map_err(|_| Error::NeedsRecovery)?);
            offset += LENGTHS;
            let archive = input.retained_section(offset, archive_bytes)?;
            offset += archive_bytes;
            let checkpoint = input.retained_section(offset, checkpoint_bytes)?;
            offset += checkpoint_bytes;
            parent = Some(Arc::new(RelaySegmentBaseFile::open_inputs(
                archive, checkpoint, selection, parent,
            )?));
        }
        if offset != whole.len() {
            return Err(Error::Contract("packed lineage trailing bytes"));
        }
        let newest = parent.ok_or(Error::Contract("empty packed lineage"))?;
        let packed = Self { input, witness, newest };
        packed.check(directory)?;
        Ok(packed)
    }

    pub(super) fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        self.input.check_named(&self.witness, &directory.path.join(FILE))
    }
}
