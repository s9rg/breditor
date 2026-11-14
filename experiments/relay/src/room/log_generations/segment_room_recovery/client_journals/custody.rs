//! One synced, length-delimited file holds all original bytes. A canonical manifest binds the
//! source identities and their ordered byte ranges to the exact replacement directory.
use super::{
    MAX_FILE, MAX_TOTAL, RelaySegmentClientJournal, RelaySegmentClientJournalPin, check_pins,
};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    log::generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
    room::log_generations::recovery::files,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io};

const ROOT: &str = "client-journals";
const DATA: &str = "journals.bin";
const MANIFEST: &str = "manifest.json";
const MAX_MANIFEST: u64 = 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room::log_generations::segment_room_recovery) struct JournalSelection {
    directory: GenerationDirectoryWitness,
    manifest_sha256: [u8; 32],
}

pub(in crate::room::log_generations::segment_room_recovery) struct RetainedJournals {
    directory: GenerationDirectory,
    selection: JournalSelection,
    pins: Vec<RelaySegmentClientJournalPin>,
    offsets: Vec<u64>,
    data: ArchiveInput,
    data_witness: GenerationFileWitness,
    manifest: ArchiveInput,
    manifest_witness: GenerationFileWitness,
}

impl RetainedJournals {
    pub fn create(
        root: &GenerationDirectory,
        sources: &[RelaySegmentClientJournal],
    ) -> Result<Self> {
        let pins = sources.iter().map(|source| source.pin.clone()).collect::<Vec<_>>();
        check_pins(&pins)?;
        let manifest = serde_json::to_vec(&pins)?;
        if manifest.len() as u64 > MAX_MANIFEST {
            return Err(Error::Contract("client journal manifest budget"));
        }
        let directory = GenerationDirectory::create(&root.path.join(ROOT))?;
        let mut data = directory.create_file(DATA, &[])?;
        for source in sources {
            source.file.check()?;
            if io::copy(&mut source.file.all().reader(), &mut data)? != source.pin.bytes {
                return Err(Error::Contract("client journal truncated during retention"));
            }
            source.file.check()?;
        }
        data.sync_all()?;
        files::insert(&directory, MANIFEST, &manifest)?;
        let selection = JournalSelection {
            directory: directory.witness()?,
            manifest_sha256: Sha256::digest(&manifest).into(),
        };
        Self::admit(directory, selection, data)
    }

    pub fn reopen(root: &GenerationDirectory, selected: &JournalSelection) -> Result<Self> {
        let directory = GenerationDirectory::open(&root.path.join(ROOT))?;
        directory.guard_witness(&selected.directory)?;
        let data = files::open(&directory.path.join(DATA))?;
        Self::admit(directory, selected.clone(), data)
    }

    fn admit(
        directory: GenerationDirectory,
        selection: JournalSelection,
        data: File,
    ) -> Result<Self> {
        let manifest = File::open(directory.path.join(MANIFEST))?;
        let manifest_witness = GenerationFileWitness::of(&manifest)?;
        let manifest = ArchiveInput::new(manifest, MAX_MANIFEST)?;
        let bytes = manifest.all().read(MAX_MANIFEST)?;
        if <[u8; 32]>::from(Sha256::digest(&bytes)) != selection.manifest_sha256 {
            return Err(Error::Contract("client journal manifest digest differs"));
        }
        let pins: Vec<RelaySegmentClientJournalPin> = serde_json::from_slice(&bytes)?;
        let total = check_pins(&pins)?;
        if serde_json::to_vec(&pins)? != bytes.as_ref() {
            return Err(Error::Contract("noncanonical client journal manifest"));
        }
        let data_witness = GenerationFileWitness::of(&data)?;
        let data = ArchiveInput::new(data, MAX_TOTAL)?;
        if data.all().len() != total {
            return Err(Error::Contract("client journal archive length differs"));
        }
        let mut offset = 0;
        let mut offsets = Vec::with_capacity(pins.len());
        for pin in &pins {
            offsets.push(offset);
            if data.all().section(offset, pin.bytes)?.digest()? != pin.sha256 {
                return Err(Error::Contract("retained client journal digest differs"));
            }
            offset += pin.bytes;
        }
        let result = Self {
            directory,
            selection,
            pins,
            offsets,
            data,
            data_witness,
            manifest,
            manifest_witness,
        };
        result.check()?;
        Ok(result)
    }

    pub fn selection(&self) -> &JournalSelection {
        &self.selection
    }

    pub fn pins(&self) -> &[RelaySegmentClientJournalPin] {
        &self.pins
    }

    pub fn check(&self) -> Result<()> {
        self.directory.guard_witness(&self.selection.directory)?;
        self.data.check_named(&self.data_witness, &self.directory.path.join(DATA))?;
        self.manifest.check_named(&self.manifest_witness, &self.directory.path.join(MANIFEST))?;
        self.directory.guard()
    }

    pub fn read(&self, index: usize) -> Result<String> {
        self.check()?;
        let pin = &self.pins[index];
        let part = self.data.all().section(self.offsets[index], pin.bytes)?;
        let bytes = part.read(MAX_FILE)?;
        if <[u8; 32]>::from(Sha256::digest(&bytes)) != pin.sha256 {
            return Err(Error::Contract("retained client journal digest differs"));
        }
        self.check()?;
        String::from_utf8(bytes.into_owned()).map_err(|_| Error::Contract("client journal UTF-8"))
    }
}
