//! Bounded streaming integrity traversal. A checked cut is not native replay or deployment proof.
use super::{MAX_LOG, MAX_RECORDS, Record, frame};
use crate::{Error, Recovery, Result};
use sha2::{Digest, Sha256};
use std::io::Read;

pub(super) struct ScannedLog {
    pub records: u64,
    pub bytes: u64,
    pub previous: [u8; 32],
    pub recovery: Recovery,
}

/// Discard each decoded record immediately; the full log is never collected for this check.
pub(super) fn verify_records_from(
    reader: &mut impl Read,
    length: u64,
    family: frame::Family,
    first: u64,
    previous: [u8; 32],
) -> Result<ScannedLog> {
    visit_records_from(reader, length, family, first, previous, |_| Ok(()))
}

pub(super) fn verify_and_hash_records(
    reader: &mut impl Read,
    length: u64,
    family: frame::Family,
    first: u64,
    previous: [u8; 32],
) -> Result<(ScannedLog, [u8; 32])> {
    struct HashingReader<R> {
        input: R,
        digest: Sha256,
    }
    impl<R: Read> Read for HashingReader<R> {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            let count = self.input.read(buffer)?;
            self.digest.update(&buffer[..count]);
            Ok(count)
        }
    }
    let mut input = HashingReader { input: reader, digest: Sha256::new() };
    let cut = verify_records_from(&mut input, length, family, first, previous)?;
    Ok((cut, input.digest.finalize().into()))
}

/// Private transport visitor. Callbacks may observe a prefix before a later error and must not
/// publish accepted native state. Ordinary open collects privately; archive verification discards.
pub(super) fn visit_records_from(
    reader: &mut impl Read,
    length: u64,
    family: frame::Family,
    first: u64,
    mut previous: [u8; 32],
    mut visit: impl FnMut(Record) -> Result<()>,
) -> Result<ScannedLog> {
    if family == frame::Family::Original && (first != 0 || previous != [0; 32]) {
        return Err(Error::Contract("original log requires its original origin"));
    }
    if length > MAX_LOG {
        return Err(Error::Contract("log byte budget"));
    }
    let mut records = 0_u64;
    let mut offset = 0_u64;
    let mut recovery = Recovery::default();
    while offset < length {
        let Some(parsed) = frame::read(reader, length - offset)? else {
            recovery.truncated_bytes = length - offset;
            break;
        };
        let record = parsed.record;
        let expected = first.checked_add(records).ok_or(Error::Contract("log sequence"))?;
        if frame::Family::admit(&record)? != family
            || record.sequence != expected
            || record.previous != previous
        {
            return Err(Error::Contract("log lineage"));
        }
        if records >= MAX_RECORDS {
            return Err(Error::Contract("log record budget"));
        }
        expected.checked_add(1).ok_or(Error::Contract("log sequence"))?;
        previous = parsed.digest;
        offset += parsed.bytes;
        records += 1;
        visit(record)?;
    }
    if records == 0 && family == frame::Family::Original {
        return Err(Error::Contract("log has no complete seed"));
    }
    Ok(ScannedLog { records, bytes: offset, previous, recovery })
}
