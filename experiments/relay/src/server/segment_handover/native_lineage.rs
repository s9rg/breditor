//! Copy and verify the exact linked native predecessor chain in oldest-first order.
use super::{
    backup_files::{BackupCopyInput, read_owned},
    packed_native_lineage::{self as packed, PackedNativeLineage},
};
use crate::{
    Error, MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, RelaySegmentBaseIdentity,
    Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{fs, io, sync::Arc};

const LINEAGE: &str = "native-lineage";

struct Part {
    base: Arc<RelaySegmentBaseFile>,
    archive: GenerationFileWitness,
    checkpoint: GenerationFileWitness,
}

pub(super) struct NativeLineage {
    held: Option<(GenerationDirectory, LineageFiles)>,
    retired_digest: Option<[u8; 32]>,
}

enum LineageFiles {
    Split(Vec<Part>),
    Packed(PackedNativeLineage),
}

#[derive(Clone, Copy)]
pub(super) enum LineageLayout {
    Split,
    Packed(packed::Encoding),
    Retired,
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
        let retired_digest = if chain.is_empty() {
            None
        } else {
            let directory = GenerationDirectory::create(&destination.path.join(LINEAGE))?;
            let digest = match layout {
                LineageLayout::Split => {
                    write_split(&directory, &chain)?;
                    None
                }
                LineageLayout::Packed(encoding) => {
                    packed::write(&directory, &chain, encoding)?;
                    None
                }
                LineageLayout::Retired => Some(packed::write_retired(&directory, &chain)?),
            };
            directory.sync()?;
            directory.guard()?;
            digest
        };
        let lineage = Self::open_with_retired_digest(destination, &identities, retired_digest)?;
        lineage.check_retired_history(parent)?;
        Ok((identities, lineage))
    }

    pub(super) fn open(
        root: &GenerationDirectory,
        expected: &[RelaySegmentBaseIdentity],
    ) -> Result<Self> {
        Self::open_with_retired_digest(root, expected, None)
    }

    pub(super) fn open_with_retired_digest(
        root: &GenerationDirectory,
        expected: &[RelaySegmentBaseIdentity],
        digest: Option<[u8; 32]>,
    ) -> Result<Self> {
        if expected.is_empty() {
            if digest.is_some() {
                return Err(Error::Contract("empty portable ancestry has a retirement selection"));
            }
            return Ok(Self { held: None, retired_digest: None });
        }
        let directory = GenerationDirectory::open(&root.path.join(LINEAGE))?;
        let files = if has_packed_file(&directory)? {
            LineageFiles::Packed(PackedNativeLineage::open(&directory, expected, digest)?)
        } else {
            if digest.is_some() {
                return Err(Error::Contract("portable retirement requires a packed lineage"));
            }
            LineageFiles::Split(open_split(&directory, expected)?)
        };
        let lineage = Self { held: Some((directory, files)), retired_digest: digest };
        lineage.check()?;
        Ok(lineage)
    }

    pub(super) fn retired_digest(&self) -> Option<[u8; 32]> {
        self.retired_digest
    }

    pub(super) fn check_retired_history(
        &self,
        mut source: Option<&RelaySegmentBaseFile>,
    ) -> Result<()> {
        if self.retired_digest.is_none() {
            return Ok(());
        }
        let parent = self.parent();
        let mut retired = parent.as_deref();
        while let Some((current, original)) = retired.zip(source) {
            current.check_retirement_against(original)?;
            retired = current.parent();
            source = original.parent();
        }
        if retired.is_some() || source.is_some() {
            return Err(Error::Contract("retired portable predecessor count differs"));
        }
        Ok(())
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
    expected: &[RelaySegmentBaseIdentity],
    encoding: packed::Encoding,
) -> Result<Option<[u8; 32]>> {
    let count = expected.len();
    if count == 0 {
        return Ok(None);
    }
    if matches!(encoding, packed::Encoding::Compacted | packed::Encoding::Retired) {
        let lineage = NativeLineage::open(source, expected)?;
        let parent = lineage.parent();
        let layout = if encoding == packed::Encoding::Retired {
            LineageLayout::Retired
        } else {
            LineageLayout::Packed(encoding)
        };
        let (_, exported) = NativeLineage::export(destination, parent.as_deref(), layout)?;
        lineage.check()?;
        return Ok(exported.retired_digest());
    }
    let source = GenerationDirectory::open(&source.path.join(LINEAGE))?;
    let destination = GenerationDirectory::create(&destination.path.join(LINEAGE))?;
    if has_packed_file(&source)? {
        packed::copy(&source, &destination, count, encoding)?;
    } else {
        let mut output = packed::create(&destination, count, encoding)?;
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
            packed::write_frame(
                &mut output,
                encoding,
                archive.len(),
                checkpoint.len(),
                |out| archive.write(out),
                |out| checkpoint.write(out),
            )?;
        }
        output.sync_all()?;
    }
    source.guard()?;
    destination.sync()?;
    Ok(None)
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
