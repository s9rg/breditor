//! Copy and verify the exact linked native predecessor chain in oldest-first order.
use super::backup_files::read_owned;
use crate::{
    RelaySegmentBaseFile, RelaySegmentBaseIdentity, Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::sync::Arc;

const LINEAGE: &str = "native-lineage";

struct Part {
    base: Arc<RelaySegmentBaseFile>,
    archive: GenerationFileWitness,
    checkpoint: GenerationFileWitness,
}

pub(super) struct NativeLineage {
    directory: Option<GenerationDirectory>,
    parts: Vec<Part>,
}

impl NativeLineage {
    pub(super) fn export(
        destination: &GenerationDirectory,
        parent: Option<&RelaySegmentBaseFile>,
    ) -> Result<(Vec<RelaySegmentBaseIdentity>, Self)> {
        let mut chain = std::iter::successors(parent, |base| base.parent()).collect::<Vec<_>>();
        chain.reverse();
        let identities = chain.iter().map(|base| base.identity().clone()).collect::<Vec<_>>();
        if !chain.is_empty() {
            let directory = GenerationDirectory::create(&destination.path.join(LINEAGE))?;
            for (index, base) in chain.into_iter().enumerate() {
                let mut archive = directory.create_file(&archive_name(index), &[])?;
                let mut checkpoint = directory.create_file(&checkpoint_name(index), &[])?;
                base.write_original_pair(&mut archive, &mut checkpoint)?;
                archive.sync_all()?;
                checkpoint.sync_all()?;
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
            return Ok(Self { directory: None, parts: Vec::new() });
        }
        let directory = GenerationDirectory::open(&root.path.join(LINEAGE))?;
        let mut parts: Vec<Part> = Vec::new();
        for (index, selection) in expected.iter().enumerate() {
            let archive = read_owned(&directory, &archive_name(index))?;
            let checkpoint = read_owned(&directory, &checkpoint_name(index))?;
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
        let lineage = Self { directory: Some(directory), parts };
        lineage.check()?;
        Ok(lineage)
    }

    pub(super) fn parent(&self) -> Option<Arc<RelaySegmentBaseFile>> {
        self.parts.last().map(|part| part.base.clone())
    }

    pub(super) fn check(&self) -> Result<()> {
        let Some(directory) = &self.directory else {
            return Ok(());
        };
        directory.guard()?;
        for (index, part) in self.parts.iter().enumerate() {
            part.base.check_named_pair(
                (&part.archive, &directory.path.join(archive_name(index))),
                (&part.checkpoint, &directory.path.join(checkpoint_name(index))),
            )?;
        }
        directory.guard()
    }
}

fn archive_name(index: usize) -> String {
    format!("{index}.archive")
}

fn checkpoint_name(index: usize) -> String {
    format!("{index}.checkpoint")
}
