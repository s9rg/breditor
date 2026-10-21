//! Original log integrity and bounded lineage admission, shared by ordinary open and backups.
use super::{Record, frame, scan};
use crate::{Recovery, Result};
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
    previous: [u8; 32],
) -> Result<DecodedLog> {
    let mut records = Vec::new();
    let cut = scan::visit_records_from(reader, length, family, first, previous, |record| {
        records.push(record);
        Ok(())
    })?;
    Ok(DecodedLog { records, bytes: cut.bytes, previous: cut.previous, recovery: cut.recovery })
}
