//! Independently bounded raw archives and exact oldest-first checkpoint streams.
use super::backup_files::{copy_file, read_owned};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, RelaySegmentBaseIdentity,
    Result,
    archive_input::{ArchiveInput, ArchiveSlice, CheckpointInput},
    log::generations::{GenerationDirectory, GenerationFileWitness},
    room::SegmentCheckpointEncoding,
};
use flate2::{Compression, write::GzEncoder};
use std::{
    fs::{self, File},
    io::{self, Seek, SeekFrom, Write},
    sync::Arc,
};

pub(super) const FILE: &str = "packed.bin";
const RAW_MAGIC: &[u8; 8] = b"BRLINE1\n";
const COMPRESSED_MAGIC: &[u8; 8] = b"BRLINE2\n";
const COMPACTED_MAGIC: &[u8; 8] = b"BRLINE3\n";
const HEADER: u64 = 12;
const RAW_LENGTHS: u64 = 16;
const COMPRESSED_LENGTHS: u64 = 24;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Encoding {
    Raw,
    Compressed,
    Compacted,
}

impl Encoding {
    fn lengths(self) -> u64 {
        match self {
            Self::Raw => RAW_LENGTHS,
            Self::Compressed | Self::Compacted => COMPRESSED_LENGTHS,
        }
    }

    fn magic(self) -> &'static [u8; 8] {
        match self {
            Self::Raw => RAW_MAGIC,
            Self::Compressed => COMPRESSED_MAGIC,
            Self::Compacted => COMPACTED_MAGIC,
        }
    }
}

pub(super) struct PackedNativeLineage {
    source: PackedSource,
    pub(super) newest: Arc<RelaySegmentBaseFile>,
}

pub(super) fn write(
    directory: &GenerationDirectory,
    chain: &[&RelaySegmentBaseFile],
    encoding: Encoding,
) -> Result<()> {
    let mut file = create(directory, chain.len(), encoding)?;
    for base in chain {
        let (mut archive, checkpoint) = base.stored_inputs();
        if encoding == Encoding::Compacted
            && base.checkpoint_encoding() == SegmentCheckpointEncoding::Compactable
        {
            // A held original must still be valid when we replace it with the proof.
            base.check()?;
            archive = None;
        }
        write_inputs(&mut file, encoding, archive, checkpoint)?;
    }
    file.sync_all()?;
    Ok(())
}

pub(super) fn create(
    directory: &GenerationDirectory,
    count: usize,
    encoding: Encoding,
) -> Result<File> {
    let count = u32::try_from(count).map_err(|_| Error::Contract("packed lineage count"))?;
    let mut file = directory.create_file(FILE, &[])?;
    file.write_all(encoding.magic())?;
    file.write_all(&count.to_be_bytes())?;
    Ok(file)
}

fn maximum_bytes(count: u32, encoding: Encoding) -> Result<u64> {
    u64::from(count)
        .checked_mul(
            MAX_SERVER_LOG_GENERATION_BACKUP_BYTES
                + RelaySegmentBaseFile::CHECKPOINT_LIMIT
                + encoding.lengths(),
        )
        .and_then(|bytes| bytes.checked_add(HEADER))
        .ok_or(Error::Contract("packed lineage byte budget"))
}

fn check_layout(directory: &GenerationDirectory) -> Result<()> {
    directory.guard()?;
    for entry in fs::read_dir(&directory.path)? {
        let name = entry?.file_name();
        if name != ".owner" && name != FILE {
            return Err(Error::Contract("packed lineage contains unexpected files"));
        }
    }
    directory.guard()
}

pub(super) fn write_frame(
    output: &mut File,
    encoding: Encoding,
    archive_len: u64,
    checkpoint_len: u64,
    write_archive: impl FnOnce(&mut dyn Write) -> Result<()>,
    write_checkpoint: impl Fn(&mut dyn Write) -> Result<()>,
) -> Result<()> {
    if archive_len == 0 && encoding != Encoding::Compacted {
        return Err(Error::Contract("relay predecessor archive has been compacted"));
    }
    output.write_all(&archive_len.to_be_bytes())?;
    output.write_all(&checkpoint_len.to_be_bytes())?;
    if encoding == Encoding::Raw {
        write_archive(output)?;
        return write_checkpoint(output);
    }
    let length_position = output.stream_position()?;
    output.write_all(&0_u64.to_be_bytes())?;
    write_archive(output)?;
    let start = output.stream_position()?;
    let mut compressed = GzEncoder::new(&mut *output, Compression::default());
    write_checkpoint(&mut compressed)?;
    compressed.finish()?;
    let mut end = output.stream_position()?;
    if end - start >= checkpoint_len {
        output.seek(SeekFrom::Start(start))?;
        write_checkpoint(output)?;
        end = output.stream_position()?;
        output.set_len(end)?;
    }
    output.seek(SeekFrom::Start(length_position))?;
    output.write_all(&(end - start).to_be_bytes())?;
    output.seek(SeekFrom::Start(end))?;
    Ok(())
}

fn write_inputs(
    file: &mut File,
    encoding: Encoding,
    archive: Option<&ArchiveInput>,
    checkpoint: &CheckpointInput,
) -> Result<()> {
    let input = archive.map(ArchiveInput::all);
    write_frame(
        file,
        encoding,
        input.map_or(0, ArchiveSlice::len),
        checkpoint.len(),
        |out| {
            if let Some((archive, input)) = archive.zip(input) {
                archive.check()?;
                if io::copy(&mut input.reader(), out)? != input.len() {
                    return Err(Error::Contract("relay segment predecessor copy was truncated"));
                }
                archive.check()?;
            }
            Ok(())
        },
        |out| checkpoint.write_to(out),
    )
}

pub(super) fn copy(
    source: &GenerationDirectory,
    destination: &GenerationDirectory,
    count: usize,
    encoding: Encoding,
) -> Result<()> {
    let mut packed = PackedSource::open(source, count)?;
    if packed.encoding == encoding {
        copy_file(source, destination, FILE, packed.input.all().len())?;
        return packed.check(source);
    }
    let mut output = create(destination, count, encoding)?;
    for _ in 0..count {
        let (archive, checkpoint) = packed.next()?;
        write_inputs(&mut output, encoding, archive.as_ref(), &checkpoint)?;
    }
    packed.finish(source)?;
    output.sync_all()?;
    Ok(())
}

struct PackedSource {
    input: ArchiveInput,
    witness: GenerationFileWitness,
    encoding: Encoding,
    offset: u64,
}

impl PackedSource {
    fn open(directory: &GenerationDirectory, count: usize) -> Result<Self> {
        let count = u32::try_from(count).map_err(|_| Error::Contract("packed lineage count"))?;
        check_layout(directory)?;
        let file = read_owned(directory, FILE)?;
        let witness = GenerationFileWitness::of(&file)?;
        let input = ArchiveInput::new(file, maximum_bytes(count, Encoding::Compressed)?)?;
        let header = input.all().section(0, HEADER)?.read(HEADER)?;
        let encoding = match &header[..8] {
            prefix if prefix == RAW_MAGIC => Encoding::Raw,
            prefix if prefix == COMPRESSED_MAGIC => Encoding::Compressed,
            prefix if prefix == COMPACTED_MAGIC => Encoding::Compacted,
            _ => return Err(Error::Contract("packed lineage header")),
        };
        if header[8..] != count.to_be_bytes() || input.all().len() > maximum_bytes(count, encoding)?
        {
            return Err(Error::Contract("packed lineage count or byte budget"));
        }
        Ok(Self { input, witness, encoding, offset: HEADER })
    }

    fn next(&mut self) -> Result<(Option<ArchiveInput>, CheckpointInput)> {
        let widths = self.encoding.lengths();
        let frame = self.input.all().section(self.offset, widths)?.read(widths)?;
        let length = |start: usize| -> Result<u64> {
            Ok(u64::from_be_bytes(
                frame[start..start + 8].try_into().map_err(|_| Error::NeedsRecovery)?,
            ))
        };
        let archive_len = length(0)?;
        let checkpoint_len = length(8)?;
        let stored = if self.encoding == Encoding::Raw { checkpoint_len } else { length(16)? };
        if archive_len > MAX_SERVER_LOG_GENERATION_BACKUP_BYTES {
            return Err(Error::Contract("packed archive byte budget"));
        }
        self.offset += widths;
        let archive = if archive_len == 0 && self.encoding == Encoding::Compacted {
            None
        } else {
            Some(self.input.retained_section(self.offset, archive_len)?)
        };
        self.offset += archive_len;
        let input = self.input.retained_section(self.offset, stored)?;
        self.offset += stored;
        let checkpoint =
            CheckpointInput::packed(input, checkpoint_len, RelaySegmentBaseFile::CHECKPOINT_LIMIT)?;
        Ok((archive, checkpoint))
    }

    fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        self.input.check_named(&self.witness, &directory.path.join(FILE))?;
        check_layout(directory)
    }

    fn finish(&self, directory: &GenerationDirectory) -> Result<()> {
        if self.offset != self.input.all().len() {
            return Err(Error::Contract("packed lineage trailing bytes"));
        }
        self.check(directory)
    }
}

impl PackedNativeLineage {
    pub(super) fn open(
        directory: &GenerationDirectory,
        expected: &[RelaySegmentBaseIdentity],
    ) -> Result<Self> {
        let mut source = PackedSource::open(directory, expected.len())?;
        let mut parent = None;
        for selection in expected {
            let (archive, checkpoint) = source.next()?;
            parent = Some(Arc::new(RelaySegmentBaseFile::open_selected(
                archive, checkpoint, selection, parent,
            )?));
        }
        source.finish(directory)?;
        let newest = parent.ok_or(Error::Contract("empty packed lineage"))?;
        Ok(Self { source, newest })
    }

    pub(super) fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        self.source.check(directory)
    }
}
