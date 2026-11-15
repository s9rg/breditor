//! Copy and verify the exact linked native predecessor chain in oldest-first order.
use super::{
    backup_files::{BackupCopyInput, copy_file, read_owned},
    packed_native_lineage::{self as packed, PackedNativeLineage},
};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, RelaySegmentBaseIdentity,
    Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    fs,
    io::{self, Write},
    sync::Arc,
};

const LINEAGE: &str = "native-lineage";

struct Part {
    base: Arc<RelaySegmentBaseFile>,
    archive: GenerationFileWitness,
    checkpoint: GenerationFileWitness,
}

pub(super) struct NativeLineage {
    held: Option<(GenerationDirectory, LineageFiles)>,
}

enum LineageFiles {
    Split(Vec<Part>),
    Packed(PackedNativeLineage),
}

#[derive(Clone, Copy)]
pub(super) enum LineageLayout {
    Split,
    Packed,
}

impl NativeLineage {
    pub(super) fn export(
        destination: &GenerationDirectory,
        parent: Option<&RelaySegmentBaseFile>,
        layout: LineageLayout,
    ) -> Result<(Vec<RelaySegmentBaseIdentity>, Self)> {
        let mut chain = std::iter::successors(parent, |base| base.parent()).collect::<Vec<_>>();
        chain.reverse();
        let identities = chain.iter().map(|base| base.identity().clone()).collect::<Vec<_>>();
        if !chain.is_empty() {
            let directory = GenerationDirectory::create(&destination.path.join(LINEAGE))?;
            match layout {
                LineageLayout::Split => write_split(&directory, &chain)?,
                LineageLayout::Packed => packed::write(&directory, &chain)?,
            }
            directory.sync()?;
            directory.guard()?;
        }
        let lineage = Self::open(destination, &identities)?;
        Ok((identities, lineage))
    }

    pub(super) fn open(
        root: &GenerationDirectory,
        expected: &[RelaySegmentBaseIdentity],
    ) -> Result<Self> {
        if expected.is_empty() {
            return Ok(Self { held: None });
        }
        let directory = GenerationDirectory::open(&root.path.join(LINEAGE))?;
        let files = if has_packed_file(&directory)? {
            LineageFiles::Packed(PackedNativeLineage::open(&directory, expected)?)
        } else {
            LineageFiles::Split(open_split(&directory, expected)?)
        };
        let lineage = Self { held: Some((directory, files)) };
        lineage.check()?;
        Ok(lineage)
    }

    pub(super) fn parent(&self) -> Option<Arc<RelaySegmentBaseFile>> {
        match &self.held.as_ref()?.1 {
            LineageFiles::Split(parts) => parts.last().map(|part| part.base.clone()),
            LineageFiles::Packed(packed) => Some(packed.newest.clone()),
        }
    }

    pub(super) fn check(&self) -> Result<()> {
        let Some((directory, files)) = &self.held else {
            return Ok(());
        };
        directory.guard()?;
        match files {
            LineageFiles::Split(parts) => {
                for (index, part) in parts.iter().enumerate() {
                    part.base.check_named_pair(
                        (&part.archive, &directory.path.join(archive_name(index))),
                        (&part.checkpoint, &directory.path.join(checkpoint_name(index))),
                    )?;
                }
            }
            LineageFiles::Packed(packed) => packed.check(directory)?,
        }
        directory.guard()
    }
}

pub(super) fn copy_packed(
    source: &GenerationDirectory,
    destination: &GenerationDirectory,
    count: usize,
) -> Result<()> {
    if count == 0 {
        return Ok(());
    }
    let source = GenerationDirectory::open(&source.path.join(LINEAGE))?;
    let destination = GenerationDirectory::create(&destination.path.join(LINEAGE))?;
    if has_packed_file(&source)? {
        packed::check_layout(&source)?;
        let count = u32::try_from(count).map_err(|_| Error::Contract("packed lineage count"))?;
        copy_file(&source, &destination, packed::FILE, packed::maximum_bytes(count)?)?;
    } else {
        let mut output = packed::create(&destination, count)?;
        for index in 0..count {
            let archive = archive_name(index);
            let checkpoint = checkpoint_name(index);
            let archive =
                BackupCopyInput::open(&source, &archive, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES)?;
            let checkpoint = BackupCopyInput::open(
                &source,
                &checkpoint,
                RelaySegmentBaseFile::CHECKPOINT_LIMIT,
            )?;
            output.write_all(&archive.len().to_be_bytes())?;
            output.write_all(&checkpoint.len().to_be_bytes())?;
            archive.write(&mut output)?;
            checkpoint.write(&mut output)?;
        }
        output.sync_all()?;
    }
    source.guard()?;
    destination.sync()
}

fn has_packed_file(directory: &GenerationDirectory) -> Result<bool> {
    match fs::symlink_metadata(directory.path.join(packed::FILE)) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn write_split(directory: &GenerationDirectory, chain: &[&RelaySegmentBaseFile]) -> Result<()> {
    for (index, base) in chain.iter().enumerate() {
        let mut archive = directory.create_file(&archive_name(index), &[])?;
        let mut checkpoint = directory.create_file(&checkpoint_name(index), &[])?;
        base.write_original_pair(&mut archive, &mut checkpoint)?;
        archive.sync_all()?;
        checkpoint.sync_all()?;
    }
    Ok(())
}

fn open_split(
    directory: &GenerationDirectory,
    expected: &[RelaySegmentBaseIdentity],
) -> Result<Vec<Part>> {
    let mut parts: Vec<Part> = Vec::new();
    for (index, selection) in expected.iter().enumerate() {
        let archive = read_owned(directory, &archive_name(index))?;
        let checkpoint = read_owned(directory, &checkpoint_name(index))?;
        let archive_witness = GenerationFileWitness::of(&archive)?;
        let checkpoint_witness = GenerationFileWitness::of(&checkpoint)?;
        let base = match parts.last() {
            Some(parent) => RelaySegmentBaseFile::open_linked(
                archive,
                checkpoint,
                selection,
                parent.base.clone(),
            )?,
            None => RelaySegmentBaseFile::open(archive, checkpoint, selection)?,
        };
        parts.push(Part {
            base: Arc::new(base),
            archive: archive_witness,
            checkpoint: checkpoint_witness,
        });
    }
    Ok(parts)
}

fn archive_name(index: usize) -> String {
    format!("{index}.archive")
}

fn checkpoint_name(index: usize) -> String {
    format!("{index}.checkpoint")
}
