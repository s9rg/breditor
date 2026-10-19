//! Exact complete persisted bytes. No compaction, serialization rewrite or acknowledgement.
use super::{Log, decoder};
use crate::{Error, Result};
use std::io::{Read, Seek, SeekFrom};

pub(crate) struct LogSnapshot {
    pub bytes: Vec<u8>,
    pub records: u64,
    previous: [u8; 32],
}

impl LogSnapshot {
    /// Decode the exact retained, complete typed records; never scan arbitrary document strings.
    pub fn records(&self) -> Result<Vec<super::Record>> {
        let decoded = decoder::read_records(&mut self.bytes.as_slice(), self.bytes.len() as u64)?;
        if decoded.recovery.truncated_bytes != 0
            || decoded.records.len() as u64 != self.records
            || decoded.previous != self.previous
        {
            return Err(Error::Contract("retained log record cut differs"));
        }
        Ok(decoded.records)
    }

    pub fn cut(&self) -> (u64, [u8; 32]) {
        (self.records, self.previous)
    }

    pub fn admit(bytes: Vec<u8>) -> Result<Self> {
        let decoded = decoder::read_records(
            &mut bytes.as_slice(),
            u64::try_from(bytes.len()).map_err(|_| Error::Contract("log byte budget"))?,
        )?;
        if decoded.recovery.truncated_bytes != 0 {
            return Err(Error::Contract("room backup has an incomplete tail"));
        }
        Ok(Self {
            bytes,
            records: u64::try_from(decoded.records.len())
                .map_err(|_| Error::Contract("log record budget"))?,
            previous: decoded.previous,
        })
    }
}

impl Log {
    /// A byte-identical replacement inode is not this owner's exclusive native log.
    pub(crate) fn guard_path(&self, path: &std::path::Path) -> Result<()> {
        let actual = std::fs::symlink_metadata(path)?;
        if !actual.is_file() {
            return Err(Error::Contract("native log path type"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let held = self.file.metadata()?;
            if actual.dev() != held.dev() || actual.ino() != held.ino() {
                return Err(Error::Contract("native log owner path differs"));
            }
        }
        #[cfg(not(unix))]
        let _ = self.file.metadata()?;
        Ok(())
    }

    pub fn snapshot_cut(&self) -> Result<(u64, [u8; 32])> {
        self.ready()?;
        Ok((self.next, self.previous))
    }

    pub fn snapshot(&mut self) -> Result<LogSnapshot> {
        self.ready()?;
        let result = (|| {
            if self.file.metadata()?.len() != self.bytes {
                return Err(Error::Contract("live log bytes changed outside authority"));
            }
            self.file.seek(SeekFrom::Start(0))?;
            let mut bytes = vec![
                0;
                usize::try_from(self.bytes)
                    .map_err(|_| Error::Contract("log byte budget"))?
            ];
            self.file.read_exact(&mut bytes)?;
            let snapshot = LogSnapshot::admit(bytes)?;
            if self.file.metadata()?.len() != self.bytes
                || snapshot.records != self.next
                || snapshot.previous != self.previous
            {
                return Err(Error::Contract("live log lineage changed outside authority"));
            }
            Ok(snapshot)
        })();
        // Reading the file must not move the next append away from its exact durable end.
        let reset = self.file.seek(SeekFrom::Start(self.bytes));
        match (result, reset) {
            (Ok(snapshot), Ok(_)) => Ok(snapshot),
            (Err(error), _) => {
                self.invalidate();
                Err(error)
            }
            (_, Err(error)) => {
                self.invalidate();
                Err(Error::Io(error))
            }
        }
    }
}
