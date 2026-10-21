//! Exclusive bounded hash-chained write-ahead log. The file, not a browser acknowledgement,
//! is the authority for accepted history and account/writer ownership after a process restart.
use crate::{Error, Recovery, Result, Role, protocol::Receipt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions, TryLockError},
    io::{Seek, SeekFrom, Write},
    path::Path,
};
mod decoder;
mod snapshot;
pub(crate) use snapshot::LogSnapshot;

const MAX_RECORD: u64 = 20 * 1024 * 1024;
pub(crate) const MAX_LOG: u64 = 256 * 1024 * 1024;
const MAX_RECORDS: u64 = 4096;
const HEADER: u64 = 72;

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Event {
    SeedAtomicTransportV2 {
        configuration: String,
        profile: crate::AtomicTransportProfile,
        room: String,
        owner: String,
        journal: String,
    },
    Seed {
        configuration: String,
        room: String,
        owner: String,
        journal: String,
    },
    SeedStructuralV2 {
        configuration: String,
        standard_inline_v1: bool,
        room: String,
        owner: String,
        journal: String,
    },
    SeedLayoutV3 {
        configuration: String,
        standard_inline_v1: bool,
        room: String,
        owner: String,
        journal: String,
    },
    Grant {
        actor: String,
        principal: String,
        role: Option<Role>,
    },
    Register {
        principal: String,
        writer: String,
        resume_hash: [u8; 32],
    },
    RegisterObserverV1 {
        principal: String,
        writer: String,
        resume_hash: [u8; 32],
    },
    EnableReviewV1 {
        actor: String,
        binding: String,
    },
    NativeHistoryBoundaryV1 {
        actor: String,
        lane: crate::ServerNativeHistoryLane,
        boundary: crate::room::NativeHistoryBoundary,
        before: [u8; 32],
        after: [u8; 32],
    },
    GrantReviewV1 {
        actor: String,
        principal: String,
        role: Option<crate::ReviewRole>,
    },
    RegisterReviewV1 {
        principal: String,
        actor: breditor_collab_feasibility::review::ReviewActorId,
        resume_hash: [u8; 32],
    },
    RegisterReviewObserverV1 {
        principal: String,
        actor: breditor_collab_feasibility::review::ReviewActorId,
        resume_hash: [u8; 32],
    },
    CommitReviewV1 {
        source: crate::ReviewSource,
        frame: String,
        receipt: breditor_collab_feasibility::review::ReviewBatchReceipt,
    },
    EnableDocumentVersionsV1 {
        actor: String,
        binding: String,
    },
    PublishDocumentVersionV1 {
        principal: String,
        packet: String,
    },
    EnableDocumentSuggestionsV1 {
        actor: String,
        binding: String,
        effect_writer: String,
    },
    GrantDocumentSuggestionsV1 {
        actor: String,
        principal: String,
        role: Option<crate::SuggestionRole>,
    },
    PublishDocumentSuggestionV1 {
        principal: String,
        packet: String,
    },
    EnableDocumentSuggestionRevisionsV1 {
        actor: String,
        binding: String,
    },
    PrepareDocumentSuggestionRevisionV1 {
        principal: String,
        request: crate::SuggestionRevisionRequest,
    },
    CommitDocumentSuggestionRevisionV1 {
        prepared_at: String,
        revision_id: String,
    },
    DecideDocumentSuggestionV1 {
        principal: String,
        request: crate::SuggestionDecisionRequest,
        effect: Option<crate::SuggestionEffect>,
        frame: Option<String>,
    },
    DecideOwnedDocumentSuggestionV1 {
        principal: String,
        accepting_writer: String,
        request: crate::SuggestionDecisionRequest,
        effect: Option<crate::SuggestionEffect>,
        frame: Option<String>,
    },
    Commit {
        principal: String,
        writer: String,
        frame: String,
        receipt: Receipt,
    },
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
    #[cfg(test)]
    read_only_after_append: Option<std::path::PathBuf>,
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
        let mut log = Self {
            file,
            next: 0,
            previous: [0; 32],
            bytes: 0,
            poisoned: false,
            #[cfg(test)]
            read_only_after_append: None,
        };
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
        let decoder::DecodedLog { records, bytes, previous, recovery } =
            decoder::read_records(&mut file, length)?;
        // Semantic replay must succeed before a caller authorizes removing even an incomplete tail.
        file.seek(SeekFrom::Start(bytes))?;
        Ok((
            Self {
                file,
                next: u64::try_from(records.len()).map_err(|_| Error::Contract("log sequence"))?,
                previous,
                bytes,
                poisoned: false,
                #[cfg(test)]
                read_only_after_append: None,
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
    #[cfg(test)]
    pub(crate) fn use_read_only_handle_for_test(&mut self, path: &Path) -> Result<()> {
        // A real OS write failure after native preparation, not a fake acknowledgement or core.
        self.file = File::open(path)?;
        Ok(())
    }
    #[cfg(test)]
    pub(crate) fn use_read_only_after_next_append_for_test(&mut self, path: &Path) {
        self.read_only_after_append = Some(path.to_path_buf());
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
        #[cfg(test)]
        if let Some(path) = self.read_only_after_append.take() {
            self.file = File::open(path)?;
        }
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
