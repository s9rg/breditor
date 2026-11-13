//! Lossless physical encoding for sealed WAL files. Manifests and portable archives use raw bytes.
use super::{
    format,
    held_file::{FileIdentity, FileStamp},
    manifest::ClosedFile,
};
use crate::{Error, Result};
use flate2::{Compression, bufread::GzDecoder, write::GzEncoder};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::Path,
};

// A legal raw frame starts with a big-endian length of at most MAX_RECORD.
// The fixed marker cannot be the start of any such frame.
const MAGIC: &[u8; 8] = b"BRWALGZ1";
pub(super) const STAGE_PREFIX: &str = ".pack-wal-";
pub(super) const MAX_STAGES: usize = 2;
// Space for DEFLATE overhead on a maximum-sized incompressible WAL.
pub(super) const MAX_STAGE_BYTES: u64 = super::super::MAX_LOG + super::super::MAX_LOG / 32 + 65536;

pub(super) fn is_stage(name: &str) -> bool {
    name.starts_with(STAGE_PREFIX)
}

/// Physical result of packing one immutable WAL. The logical cut and archive identity stay intact.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSealedWalPacking {
    /// The exact existing sealed generation.
    pub generation: String,
    /// The original byte count committed by the manifest.
    pub original_bytes: u64,
    /// Bytes of the representation actually held on disk.
    pub stored_bytes: u64,
    /// True if the file is physically packed, including an already-packed retry.
    pub packed: bool,
}

#[derive(Clone, Copy)]
enum Encoding {
    Raw,
    Gzip,
}

pub(super) struct HeldWal {
    pub file: File,
    pub generation: String,
    pub bytes: u64,
    pub physical_bytes: u64,
    pub identity: FileIdentity,
    pub stamp: FileStamp,
    encoding: Encoding,
}

impl HeldWal {
    pub fn clone_handle(&self) -> Result<Self> {
        Ok(Self {
            file: self.file.try_clone()?,
            generation: self.generation.clone(),
            bytes: self.bytes,
            physical_bytes: self.physical_bytes,
            identity: self.identity,
            stamp: self.stamp,
            encoding: self.encoding,
        })
    }
    pub fn raw(file: File, generation: String, bytes: u64) -> Result<Self> {
        Self::new(file, generation, bytes, bytes, Encoding::Raw)
    }

    fn new(
        file: File,
        generation: String,
        bytes: u64,
        physical_bytes: u64,
        encoding: Encoding,
    ) -> Result<Self> {
        let identity = FileIdentity::of(&file)?;
        let stamp = FileStamp::of(&file)?;
        Ok(Self { file, generation, bytes, physical_bytes, identity, stamp, encoding })
    }

    pub fn open(file: File, selected: &ClosedFile) -> Result<Self> {
        let length = file.metadata()?.len();
        if length < MAGIC.len() as u64 || length > selected.bytes {
            return Err(Error::Contract("sealed WAL physical byte budget"));
        }
        let stamp = FileStamp::of(&file)?;
        let mut reader = &file;
        reader.seek(SeekFrom::Start(0))?;
        let mut magic = [0; MAGIC.len()];
        reader.read_exact(&mut magic)?;
        let encoding = if &magic == MAGIC && length < selected.bytes {
            Encoding::Gzip
        } else if &magic != MAGIC && length == selected.bytes {
            Encoding::Raw
        } else {
            return Err(Error::Contract("sealed WAL encoding or length differs"));
        };
        stamp.guard(&file)?;
        Self::new(file, selected.generation.clone(), selected.bytes, length, encoding)
    }

    pub fn guard(&self, path: &Path) -> Result<()> {
        self.stamp.guard(&self.file)?;
        self.identity.guard(&self.file, path)?;
        if self.file.metadata()?.len() != self.physical_bytes {
            return Err(Error::Contract("immutable log file length changed"));
        }
        Ok(())
    }

    pub fn read<T>(
        &self,
        expected: [u8; 32],
        visit: impl FnOnce(&mut dyn Read) -> Result<T>,
    ) -> Result<T> {
        self.stamp.guard(&self.file)?;
        let mut raw = BufReader::new(&self.file);
        raw.seek(SeekFrom::Start(0))?;
        let result = match self.encoding {
            Encoding::Raw => verify(&mut raw, self.bytes, expected, visit)?,
            Encoding::Gzip => {
                let mut magic = [0; MAGIC.len()];
                raw.read_exact(&mut magic)?;
                if &magic != MAGIC {
                    return Err(Error::Contract("packed WAL marker differs"));
                }
                if !raw.fill_buf()?.starts_with(&[0x1f, 0x8b, 8, 0]) {
                    return Err(Error::Contract("packed WAL requires a single fixed gzip header"));
                }
                let mut decoded = GzDecoder::new(raw);
                let result = verify(&mut decoded, self.bytes, expected, visit)?;
                if !decoded.into_inner().fill_buf()?.is_empty() {
                    return Err(Error::Contract("packed WAL has trailing data"));
                }
                result
            }
        };
        self.stamp.guard(&self.file)?;
        if self.file.metadata()?.len() != self.physical_bytes {
            return Err(Error::Contract("sealed WAL changed during read"));
        }
        Ok(result)
    }

    pub fn packing(&self) -> ServerSealedWalPacking {
        ServerSealedWalPacking {
            generation: self.generation.clone(),
            original_bytes: self.bytes,
            stored_bytes: self.physical_bytes,
            packed: matches!(self.encoding, Encoding::Gzip),
        }
    }
}

struct HashingReader<R> {
    input: R,
    digest: Sha256,
}

impl<R: Read> Read for HashingReader<R> {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        let read = self.input.read(output)?;
        self.digest.update(&output[..read]);
        Ok(read)
    }
}

fn verify<T>(
    reader: &mut dyn Read,
    bytes: u64,
    expected: [u8; 32],
    visit: impl FnOnce(&mut dyn Read) -> Result<T>,
) -> Result<T> {
    let mut reader = HashingReader { input: reader.take(bytes), digest: Sha256::new() };
    let result = visit(&mut reader)?;
    let actual: [u8; 32] = reader.digest.finalize().into();
    if reader.input.limit() != 0 || actual != expected {
        return Err(Error::Contract("sealed WAL original bytes differ"));
    }
    if reader.input.into_inner().read(&mut [0])? != 0 {
        return Err(Error::Contract("sealed WAL exceeds original byte count"));
    }
    Ok(result)
}

pub(super) fn write(held: &HeldWal, selected: &ClosedFile, mut stage: &File) -> Result<()> {
    stage.write_all(MAGIC)?;
    let mut encoded = GzEncoder::new(stage, Compression::default());
    held.read(selected.sha256, |reader| {
        std::io::copy(reader, &mut encoded)?;
        Ok(())
    })?;
    encoded.finish()?.sync_all()?;
    Ok(())
}

pub(super) fn selected_name(wal: &HeldWal) -> String {
    format::wal_name(&wal.generation)
}
