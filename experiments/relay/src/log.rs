//! Exclusive bounded hash-chained write-ahead log. The file, not a browser acknowledgement,
//! is the authority for accepted history and account/writer ownership after a process restart.
use crate::{Error, Recovery, Result, Role, protocol::Receipt};
use serde::{Deserialize, Serialize};
use std::{
    fs::{File, OpenOptions, TryLockError},
    io::{Seek, SeekFrom, Write},
    path::Path,
};
mod append_pair;
#[cfg(test)]
mod continuation_tests;
mod decoder;
mod frame;
#[cfg(test)]
mod framing_tests;
pub(crate) mod generations;
mod scan;
#[cfg(test)]
mod scan_tests;
mod snapshot;
mod storage_capacity;
pub(crate) use snapshot::LogSnapshot;
pub use storage_capacity::{
    ServerLogAllowance, ServerLogRotationCapacity, ServerLogStorageCapacity,
};

const MAX_RECORD: u64 = 20 * 1024 * 1024;
pub(crate) const MAX_LOG: u64 = 256 * 1024 * 1024;
const MAX_RECORDS: u64 = 4096;
const HEADER: u64 = 72;
#[cfg(feature = "server")]
pub(crate) const MAX_GENERATION_INCOMPLETE_FRAME_BYTES: u64 = HEADER + MAX_RECORD - 1;

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
    NativeReviewContinuationV2 {
        actor: String,
        next: String,
        before: [u8; 32],
        after: [u8; 32],
    },
    NativeDocumentContinuationV2 {
        actor: String,
        next: String,
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
    family: frame::Family,
    next: u64,
    previous: [u8; 32],
    bytes: u64,
    poisoned: bool,
    generations: Option<generations::Generations>,
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
        Self::create_in_family(path, event, frame::Family::Original)
    }
    fn create_in_family(path: &Path, event: Event, family: frame::Family) -> Result<Self> {
        let file = options().create_new(true).open(path)?;
        lock(&file)?;
        let mut log = Self {
            file,
            family,
            next: 0,
            previous: [0; 32],
            bytes: 0,
            poisoned: false,
            generations: None,
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
                family: frame::Family::Original,
                next: u64::try_from(records.len()).map_err(|_| Error::Contract("log sequence"))?,
                previous,
                bytes,
                poisoned: false,
                generations: None,
                #[cfg(test)]
                read_only_after_append: None,
            },
            records,
            recovery,
        ))
    }
    pub fn finish_recovery(&mut self, recovery: Recovery) -> Result<()> {
        // Semantic replay precedes physical resume, and forged controls precede all tail repair.
        self.recover_generation_rotation()?;
        if recovery.truncated_bytes > 0 {
            self.file.set_len(self.bytes)?;
            self.file.sync_all()?;
        }
        if let Some(state) = &mut self.generations {
            state.opening_length = None;
            state.refresh_active(&self.file)?;
        }
        self.file.seek(SeekFrom::Start(self.bytes))?;
        Ok(())
    }
    pub fn ready(&self) -> Result<()> {
        if self.poisoned {
            return Err(Error::NeedsRecovery);
        }
        if let Some(state) = &self.generations {
            state.guard(&self.file, self.bytes)?;
        }
        Ok(())
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
        let encoded = frame::encode(event, self.family, self.next, self.previous)?;
        self.append_encoded(&encoded)
    }
    fn check_append_capacity(&self, records: u64, bytes: u64) -> Result<bool> {
        if let Some(state) = &self.generations {
            if self.next.checked_add(records).is_none_or(|next| {
                next > MAX_RECORDS * generations::MAX_PHYSICAL_GENERATIONS as u64
            }) || state
                .closed_bytes()
                .checked_add(self.bytes)
                .and_then(|used| used.checked_add(bytes))
                .is_none_or(|bytes| bytes > generations::MAX_PHYSICAL_LOG_BYTES)
            {
                return Err(Error::Contract("physical log retained lifetime budget"));
            }
            let rotate = self.next - state.active_first() + records > MAX_RECORDS
                || self.bytes + bytes > MAX_LOG;
            if rotate && !state.has_rotation_slot() {
                return Err(Error::Contract("physical rotation generation or capacity"));
            }
            return Ok(rotate);
        }
        if self.next + records > MAX_RECORDS {
            return Err(Error::Contract("log record budget"));
        }
        if self.bytes + bytes > MAX_LOG {
            return Err(Error::Contract("log byte budget"));
        }
        Ok(false)
    }
    fn append_encoded(&mut self, encoded: &frame::Encoded) -> Result<u64> {
        let sequence = self.next;
        if self.check_append_capacity(1, encoded.bytes)? {
            self.auto_rotate_generations()?;
        }
        // Once any write can start, failure is uncertain: no subsequent read, write or ack may
        // treat this process's memory as the authority. Recovery replays complete records.
        self.poisoned = true;
        self.file.write_all(&encoded.header)?;
        self.file.write_all(&encoded.payload)?;
        self.file.sync_all()?;
        self.next += 1;
        self.previous = encoded.digest;
        self.bytes += encoded.bytes;
        if let Some(state) = &mut self.generations {
            state.refresh_active(&self.file)?;
            state.guard(&self.file, self.bytes)?;
        }
        self.poisoned = false;
        #[cfg(test)]
        if let Some(path) = self.read_only_after_append.take() {
            self.file = File::open(path)?;
        }
        Ok(sequence)
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
