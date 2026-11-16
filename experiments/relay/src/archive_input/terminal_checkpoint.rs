//! An exact, bounded terminal checkpoint stored as one gzip member.
use super::{ArchiveInput, CheckpointInput};
use crate::{Error, Result};
use std::fs::File;
#[cfg(feature = "server")]
use std::io::{self, Seek, SeekFrom, Write};

const MAGIC: &[u8; 8] = b"BRCKPT1\n";
const HEADER_BYTES: u64 = 16;
pub(crate) const LEGACY_CHECKPOINT_BYTES: usize = 512 * 1024 * 1024;
pub(crate) const TERMINAL_CHECKPOINT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub(crate) const TERMINAL_CHECKPOINT_FILE_BYTES: u64 =
    TERMINAL_CHECKPOINT_BYTES + 4 * 1024 * 1024 + HEADER_BYTES;

impl CheckpointInput {
    pub(crate) fn open_file(file: File) -> Result<Self> {
        let input = ArchiveInput::new(file, TERMINAL_CHECKPOINT_FILE_BYTES)?;
        let bytes = input.all();
        if bytes.len() < 8 || bytes.section(0, 8)?.read(8)?.as_ref() != MAGIC {
            if bytes.len() > LEGACY_CHECKPOINT_BYTES as u64 {
                return Err(Error::Contract("raw checkpoint byte budget"));
            }
            return Ok(Self::raw(input));
        }
        let size = bytes.section(8, 8)?.read(8)?;
        let decoded = u64::from_be_bytes(size[..].try_into().map_err(|_| Error::NeedsRecovery)?);
        if decoded == 0 || decoded > TERMINAL_CHECKPOINT_BYTES || bytes.len() <= HEADER_BYTES {
            return Err(Error::Contract("terminal checkpoint byte budget"));
        }
        let body = input.retained_section(HEADER_BYTES, bytes.len() - HEADER_BYTES)?;
        Ok(Self::terminal(body, decoded))
    }
}

#[cfg(feature = "server")]
pub(crate) struct TerminalCheckpointWriter<'a> {
    encoder: flate2::write::GzEncoder<&'a mut File>,
    decoded: u64,
}

#[cfg(feature = "server")]
impl<'a> TerminalCheckpointWriter<'a> {
    pub(crate) fn new(file: &'a mut File) -> Result<Self> {
        if file.stream_position()? != 0 || file.metadata()?.len() != 0 {
            return Err(Error::Contract("terminal checkpoint destination must be empty"));
        }
        file.write_all(MAGIC)?;
        file.write_all(&0_u64.to_be_bytes())?;
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        Ok(Self { encoder, decoded: 0 })
    }

    pub(crate) fn finish(self) -> Result<()> {
        let file = self.encoder.finish()?;
        let end = file.stream_position()?;
        if self.decoded == 0 || end > TERMINAL_CHECKPOINT_FILE_BYTES {
            return Err(Error::Contract("terminal checkpoint byte budget"));
        }
        file.seek(SeekFrom::Start(8))?;
        file.write_all(&self.decoded.to_be_bytes())?;
        file.seek(SeekFrom::Start(end))?;
        Ok(())
    }
}

#[cfg(feature = "server")]
impl Write for TerminalCheckpointWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() as u64 > TERMINAL_CHECKPOINT_BYTES - self.decoded {
            return Err(io::Error::other("terminal checkpoint decoded byte budget"));
        }
        let accepted = self.encoder.write(bytes)?;
        self.decoded += accepted as u64;
        Ok(accepted)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.encoder.flush()
    }
}

#[cfg(all(test, feature = "server"))]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::{fs, path::PathBuf};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Result<Self> {
            let path = std::env::temp_dir()
                .join(format!("breditor-terminal-checkpoint-{}", crate::credentials::issue()?));
            fs::create_dir(&path)?;
            Ok(Self(path))
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn extended_terminal_stream_roundtrips_beyond_the_legacy_ceiling() -> TestResult {
        let scratch = Scratch::new()?;
        let path = scratch.0.join("check");
        let mut file = File::create_new(&path)?;
        let mut writer = TerminalCheckpointWriter::new(&mut file)?;
        let chunk = vec![b'x'; 1024 * 1024];
        let mut expected = Sha256::new();
        for _ in 0..513 {
            writer.write_all(&chunk)?;
            expected.update(&chunk);
        }
        writer.finish()?;
        file.sync_all()?;
        assert!(file.metadata()?.len() < chunk.len() as u64);
        let saved = CheckpointInput::open_file(File::open(&path)?)?;
        assert!(saved.is_terminal());
        assert!(saved.len() > LEGACY_CHECKPOINT_BYTES as u64);
        assert_eq!(saved.digest()?, <[u8; 32]>::from(expected.finalize()));
        let raw = scratch.0.join("legacy");
        let legacy = File::create_new(&raw)?;
        legacy.set_len(saved.len())?;
        assert!(matches!(
            CheckpointInput::open_file(File::open(raw)?),
            Err(Error::Contract("raw checkpoint byte budget"))
        ));
        Ok(())
    }

    #[test]
    fn terminal_stream_rejects_over_budget_length_truncation_and_trailing_members() -> TestResult {
        let scratch = Scratch::new()?;
        let path = scratch.0.join("check");
        let mut file = File::create_new(&path)?;
        let mut writer = TerminalCheckpointWriter::new(&mut file)?;
        writer.write_all(b"exact terminal checkpoint")?;
        writer.finish()?;
        drop(file);
        let original = fs::read(&path)?;
        let mut oversized = original.clone();
        oversized[8..16].copy_from_slice(&(TERMINAL_CHECKPOINT_BYTES + 1).to_be_bytes());
        fs::write(&path, oversized)?;
        assert!(matches!(
            CheckpointInput::open_file(File::open(&path)?),
            Err(Error::Contract("terminal checkpoint byte budget"))
        ));
        let mut wrong_length = original.clone();
        wrong_length[8..16].copy_from_slice(&1_u64.to_be_bytes());
        let mut trailing = original.clone();
        trailing.extend_from_slice(&original[16..]);
        let mut wrong_crc = original.clone();
        let trailer = wrong_crc.len() - 8;
        wrong_crc[trailer] ^= 1;
        for rejected in [&original[..original.len() - 1], &wrong_length, &trailing, &wrong_crc] {
            fs::write(&path, rejected)?;
            assert!(CheckpointInput::open_file(File::open(&path)?)?.digest().is_err());
        }
        Ok(())
    }
}
