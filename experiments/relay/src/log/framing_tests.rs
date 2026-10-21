//! Preserve the original exact frame and torn-tail rules before sharing generation framing.
use super::{Event, Log, decoder};
use std::{fmt::Write as _, fs, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

pub(super) struct Files(PathBuf);
impl Files {
    pub(super) fn new() -> TestResult<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir()
            .join(format!("breditor-log-framing-{}-{stamp}-{serial}", std::process::id()));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    pub(super) fn log(&self) -> PathBuf {
        self.0.join("original.log")
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_file(self.log());
        let _ = fs::remove_dir(&self.0);
    }
}
pub(super) fn seed() -> Event {
    Event::Seed {
        configuration: "unit".into(),
        room: "room".into(),
        owner: "owner".into(),
        journal: "unit".into(),
    }
}

#[test]
fn original_frame_matches_the_independent_literal_pre_refactor_vector() -> TestResult {
    let files = Files::new()?;
    let _owner = Log::create(&files.log(), seed())?;
    let bytes = fs::read(files.log())?;
    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in &bytes {
        write!(hex, "{byte:02x}")?;
    }
    assert_eq!(hex, include_str!("fixtures/original-seed.hex").trim());
    let parsed = decoder::read_records(&mut bytes.as_slice(), bytes.len() as u64)?;
    assert_eq!(parsed.records.len(), 1);
    assert_eq!(parsed.bytes, bytes.len() as u64);
    assert_eq!(parsed.recovery.truncated_bytes, 0);
    Ok(())
}

#[test]
fn every_incomplete_original_final_frame_keeps_the_complete_prefix_without_repair() -> TestResult {
    let files = Files::new()?;
    let mut owner = Log::create(&files.log(), seed())?;
    let first = fs::read(files.log())?;
    owner.append(Event::Grant { actor: "owner".into(), principal: "alice".into(), role: None })?;
    let complete = fs::read(files.log())?;
    for end in first.len() + 1..complete.len() {
        let cut = &complete[..end];
        let parsed = decoder::read_records(&mut &cut[..], cut.len() as u64)?;
        assert_eq!(parsed.records.len(), 1);
        assert_eq!(parsed.bytes, first.len() as u64);
        assert_eq!(parsed.recovery.truncated_bytes, (end - first.len()) as u64);
    }
    let parsed = decoder::read_records(&mut complete.as_slice(), complete.len() as u64)?;
    assert_eq!(parsed.records.len(), 2);
    assert_eq!(parsed.recovery.truncated_bytes, 0);
    assert_eq!(fs::read(files.log())?, complete, "The decoder never edits the live file");
    Ok(())
}
