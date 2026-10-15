//! Exclusive bounded hash-chained write-ahead log. The file, not a browser acknowledgement,
//! is the authority for accepted history and account/writer ownership after a process restart.
use crate::{Error, Recovery, Result, Role, protocol::Receipt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions, TryLockError},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

const MAX_RECORD: u64 = 20 * 1024 * 1024;
const MAX_LOG: u64 = 256 * 1024 * 1024;
const MAX_RECORDS: u64 = 4096;
const HEADER: u64 = 72;

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Event {
    Seed { configuration: String, room: String, owner: String, journal: String },
    Grant { actor: String, principal: String, role: Option<Role> },
    Register { principal: String, writer: String, resume_hash: [u8; 32] },
    Commit { principal: String, writer: String, frame: String, receipt: Receipt },
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Record {
    format: String,
    version: u32,
    pub sequence: u64,
    previous: [u8; 32],
    pub event: Event,
}
pub(crate) struct Log {
    file: File,
    next: u64,
    previous: [u8; 32],
    bytes: u64,
    poisoned: bool,
}
fn lock(file: &File) -> Result<()> {
    file.try_lock().map_err(|e| match e {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(e) => Error::Io(e),
    })
}
fn options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
impl Log {
    pub fn create(path: &Path, event: Event) -> Result<Self> {
        let file = options().create_new(true).open(path)?;
        lock(&file)?;
        let mut log = Self { file, next: 0, previous: [0; 32], bytes: 0, poisoned: false };
        log.append(event)?;
        // The caller supplies an existing data directory; creation must persist its name too.
        File::open(path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new(".")))?
            .sync_all()?;
        Ok(log)
    }
    pub fn open(path: &Path) -> Result<(Self, Vec<Record>, Recovery)> {
        let mut file = options().open(path)?;
        lock(&file)?;
        let length = file.metadata()?.len();
        if length > MAX_LOG {
            return Err(Error::Contract("log byte budget"));
        }
        let mut records = Vec::new();
        let mut offset = 0_u64;
        let mut previous = [0; 32];
        let mut recovery = Recovery::default();
        while offset < length {
            if length - offset < HEADER {
                recovery.truncated_bytes = length - offset;
                break;
            }
            let mut header = [0_u8; 72];
            file.read_exact(&mut header)?;
            let header_digest: [u8; 32] = Sha256::digest(&header[..40]).into();
            if header[40..] != header_digest {
                return Err(Error::Contract("log header checksum"));
            }
            let size = u64::from_be_bytes(
                header[..8].try_into().map_err(|_| Error::Contract("log header"))?,
            );
            if size == 0 || size > MAX_RECORD {
                return Err(Error::Contract("log record budget"));
            }
            if size > length - offset - HEADER {
                recovery.truncated_bytes = length - offset;
                break;
            }
            let mut payload =
                vec![0; usize::try_from(size).map_err(|_| Error::Contract("log record size"))?];
            file.read_exact(&mut payload)?;
            let digest: [u8; 32] = Sha256::digest(&payload).into();
            if header[8..40] != digest {
                return Err(Error::Contract("log record checksum"));
            }
            let record: Record = serde_json::from_slice(&payload)?;
            if record.format != "breditor/relay-log"
                || record.version != 1
                || record.sequence
                    != u64::try_from(records.len()).map_err(|_| Error::Contract("log sequence"))?
                || record.previous != previous
            {
                return Err(Error::Contract("log lineage"));
            }
            if record.sequence >= MAX_RECORDS {
                return Err(Error::Contract("log record budget"));
            }
            previous = digest;
            offset += HEADER + size;
            records.push(record);
        }
        if records.is_empty() {
            return Err(Error::Contract("log has no complete seed"));
        }
        // Semantic replay must succeed before a caller authorizes removing even an incomplete tail.
        file.seek(SeekFrom::Start(offset))?;
        Ok((
            Self {
                file,
                next: u64::try_from(records.len()).map_err(|_| Error::Contract("log sequence"))?,
                previous,
                bytes: offset,
                poisoned: false,
            },
            records,
            recovery,
        ))
    }
    pub fn finish_recovery(&mut self, recovery: Recovery) -> Result<()> {
        if recovery.truncated_bytes > 0 {
            self.file.set_len(self.bytes)?;
            self.file.sync_all()?;
        }
        Ok(())
    }
    pub fn ready(&self) -> Result<()> {
        if self.poisoned { Err(Error::NeedsRecovery) } else { Ok(()) }
    }
    pub fn invalidate(&mut self) {
        self.poisoned = true;
    }
    pub fn append(&mut self, event: Event) -> Result<u64> {
        self.ready()?;
        if self.next >= MAX_RECORDS {
            return Err(Error::Contract("log record budget"));
        }
        let record = Record {
            format: "breditor/relay-log".into(),
            version: 1,
            sequence: self.next,
            previous: self.previous,
            event,
        };
        let payload = serde_json::to_vec(&record)?;
        let size = u64::try_from(payload.len()).map_err(|_| Error::Contract("log record size"))?;
        if size > MAX_RECORD || self.bytes + HEADER + size > MAX_LOG {
            return Err(Error::Contract("log byte budget"));
        }
        let digest: [u8; 32] = Sha256::digest(&payload).into();
        let mut header = [0_u8; 72];
        header[..8].copy_from_slice(&size.to_be_bytes());
        header[8..40].copy_from_slice(&digest);
        let header_digest: [u8; 32] = Sha256::digest(&header[..40]).into();
        header[40..].copy_from_slice(&header_digest);
        // Once any write can start, failure is uncertain: no subsequent read, write or ack may
        // treat this process's memory as the authority. Recovery replays complete records.
        self.poisoned = true;
        self.file.write_all(&header)?;
        self.file.write_all(&payload)?;
        self.file.sync_all()?;
        self.poisoned = false;
        self.next += 1;
        self.previous = digest;
        self.bytes += HEADER + size;
        Ok(record.sequence)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_real_write_error_requires_recovery_before_any_further_transaction()
    -> std::result::Result<(), Box<dyn std::error::Error>> {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir()
            .join(format!("breditor-relay-io-{}-{nonce}.log", std::process::id()));
        let mut log = Log::create(
            &path,
            Event::Seed {
                configuration: "unit".into(),
                room: "room".into(),
                owner: "owner".into(),
                journal: "unit".into(),
            },
        )?;
        let before = std::fs::read(&path)?;
        // A real read-only filesystem handle rejects Write without unsafe/fake core admission.
        log.file = File::open(&path)?;
        assert!(matches!(
            log.append(Event::Grant {
                actor: "owner".into(),
                principal: "alice".into(),
                role: Some(Role::Editor)
            }),
            Err(Error::Io(_))
        ));
        assert!(matches!(log.ready(), Err(Error::NeedsRecovery)));
        assert!(matches!(
            log.append(Event::Grant { actor: "owner".into(), principal: "bob".into(), role: None }),
            Err(Error::NeedsRecovery)
        ));
        assert_eq!(std::fs::read(&path)?, before);
        drop(log);
        let (log, records, report) = Log::open(&path)?;
        assert_eq!(records.len(), 1);
        assert_eq!(report.truncated_bytes, 0);
        log.ready()?;
        drop(log);
        std::fs::remove_file(path)?;
        Ok(())
    }
}
