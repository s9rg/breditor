//! One held file for the exact portable client inputs in their selected order.
use super::{
    backup_files::{copy_file, read_owned, write_group},
    retained_backup::{
        ALTERNATES, ClientArchives, RelaySegmentRetainedBackupIdentity, SELECTED, UPLOADS,
    },
};
use crate::{
    Error, RelaySegmentClientJournal, RelaySegmentClientUploadArchive, Result,
    archive_input::ArchiveInput,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    fs::{self, File},
    io,
};

const FILE: &str = "client-inputs.bin";
const MAGIC: &[u8; 8] = b"BRCLNT1\n";
const HEADER: u64 = MAGIC.len() as u64;

pub(super) struct PackedClients {
    data: ArchiveInput,
    witness: GenerationFileWitness,
    pub(super) archives: ClientArchives,
}

impl PackedClients {
    pub(super) fn open(
        root: &GenerationDirectory,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Option<Self>> {
        if !present(root)? {
            return Ok(None);
        }
        let file = read_owned(root, FILE)?;
        let witness = GenerationFileWitness::of(&file)?;
        let limit = total_bytes(expected);
        let data = ArchiveInput::new(file, limit)?;
        if data.all().len() != limit
            || data.all().section(0, HEADER)?.read(HEADER)?.as_ref() != MAGIC
        {
            return Err(Error::Contract("packed client archive header or length differs"));
        }
        let mut offset = HEADER;
        let mut next = |bytes| -> Result<ArchiveInput> {
            let part = data.retained_section(offset, bytes)?;
            offset += bytes;
            Ok(part)
        };
        let mut journals = |pins: &[crate::RelaySegmentClientJournalPin]| {
            pins.iter()
                .map(|pin| RelaySegmentClientJournal::admit(next(pin.bytes)?, pin.clone()))
                .collect::<Result<Vec<_>>>()
        };
        let selected = journals(&expected.selected_journals)?;
        let alternates = journals(&expected.alternate_journals)?;
        let uploads = expected
            .standalone_uploads
            .iter()
            .map(|pin| RelaySegmentClientUploadArchive::admit(next(pin.bytes)?, pin.clone()))
            .collect::<Result<Vec<_>>>()?;
        let result =
            Self { data, witness, archives: ClientArchives { selected, alternates, uploads } };
        result.check(root)?;
        Ok(Some(result))
    }

    pub(super) fn check(&self, root: &GenerationDirectory) -> Result<()> {
        root.guard()?;
        self.data.check_named(&self.witness, &root.path.join(FILE))?;
        if !present(root)? {
            return Err(Error::Contract("packed client archive disappeared"));
        }
        root.guard()
    }
}

pub(super) fn create(root: &GenerationDirectory) -> Result<File> {
    root.create_file(FILE, MAGIC)
}

pub(super) fn copy(
    source: &GenerationDirectory,
    destination: &GenerationDirectory,
    expected: &RelaySegmentRetainedBackupIdentity,
) -> Result<()> {
    if present(source)? {
        return copy_file(source, destination, FILE, total_bytes(expected));
    }
    let mut output = create(destination)?;
    write_group(
        source,
        &mut output,
        SELECTED,
        "journal",
        expected.selected_journals.iter().map(|pin| pin.bytes),
    )?;
    write_group(
        source,
        &mut output,
        ALTERNATES,
        "participant",
        expected.alternate_journals.iter().map(|pin| pin.bytes),
    )?;
    write_group(
        source,
        &mut output,
        UPLOADS,
        "uploads",
        expected.standalone_uploads.iter().map(|pin| pin.bytes),
    )?;
    output.sync_all()?;
    Ok(())
}

fn total_bytes(expected: &RelaySegmentRetainedBackupIdentity) -> u64 {
    // Callers validate the roster and the existing aggregate budget of each group.
    HEADER
        + expected
            .selected_journals
            .iter()
            .chain(&expected.alternate_journals)
            .map(|pin| pin.bytes)
            .chain(expected.standalone_uploads.iter().map(|pin| pin.bytes))
            .sum::<u64>()
}

pub(super) fn present(root: &GenerationDirectory) -> Result<bool> {
    root.guard()?;
    match fs::symlink_metadata(root.path.join(FILE)) {
        Ok(_) => {
            for name in [SELECTED, ALTERNATES, UPLOADS] {
                match fs::symlink_metadata(root.path.join(name)) {
                    Ok(_) => {
                        return Err(Error::Contract(
                            "portable backup mixes client archive layouts",
                        ));
                    }
                    Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
            }
            Ok(true)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}
