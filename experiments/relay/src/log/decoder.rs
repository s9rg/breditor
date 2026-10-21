//! Original log integrity and bounded lineage admission, shared by ordinary open and backups.
use super::{MAX_LOG, MAX_RECORDS, Record, frame};
use crate::{Error, Recovery, Result};
use std::io::Read;

pub(super) struct DecodedLog {
    pub records: Vec<Record>,
    pub bytes: u64,
    pub previous: [u8; 32],
    pub recovery: Recovery,
}

/// Preserve ordinary torn-tail semantics; a complete archive separately requires no tail.
pub(super) fn read_records(reader: &mut impl Read, length: u64) -> Result<DecodedLog> {
    read_records_from(reader, length, frame::Family::Original, 0, [0; 32])
}

/// Bounded one-segment transport admission from an independently selected preceding global cut.
/// This does not prove a generation manifest, a complete room, native semantics or authority.
/// Original selection stays zero-based/nonempty. Continuations may be empty active files and
/// preserve global sequence/digest without widening the original reader's admission contract.
pub(super) fn read_records_from(
    reader: &mut impl Read,
    length: u64,
    family: frame::Family,
    first: u64,
    mut previous: [u8; 32],
) -> Result<DecodedLog> {
    if family == frame::Family::Original && (first != 0 || previous != [0; 32]) {
        return Err(Error::Contract("original log requires its original origin"));
    }
    if length > MAX_LOG {
        return Err(Error::Contract("log byte budget"));
    }
    let mut records = Vec::new();
    let mut offset = 0_u64;
    let mut recovery = Recovery::default();
    while offset < length {
        let Some(parsed) = frame::read(reader, length - offset)? else {
            recovery.truncated_bytes = length - offset;
            break;
        };
        let record = parsed.record;
        let local = u64::try_from(records.len()).map_err(|_| Error::Contract("log sequence"))?;
        let expected = first.checked_add(local).ok_or(Error::Contract("log sequence"))?;
        if frame::Family::admit(&record)? != family
            || record.sequence != expected
            || record.previous != previous
        {
            return Err(Error::Contract("log lineage"));
        }
        if local >= MAX_RECORDS {
            return Err(Error::Contract("log record budget"));
        }
        expected.checked_add(1).ok_or(Error::Contract("log sequence"))?;
        previous = parsed.digest;
        offset += parsed.bytes;
        records.push(record);
    }
    if records.is_empty() && family == frame::Family::Original {
        return Err(Error::Contract("log has no complete seed"));
    }
    Ok(DecodedLog { records, bytes: offset, previous, recovery })
}
