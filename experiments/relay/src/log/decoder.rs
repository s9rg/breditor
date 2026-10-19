//! Original log integrity and bounded lineage admission, shared by ordinary open and backups.
use super::{HEADER, MAX_LOG, MAX_RECORD, MAX_RECORDS, Record};
use crate::{Error, Recovery, Result};
use sha2::{Digest, Sha256};
use std::io::Read;

pub(super) struct DecodedLog {
    pub records: Vec<Record>,
    pub bytes: u64,
    pub previous: [u8; 32],
    pub recovery: Recovery,
}

/// Preserve ordinary torn-tail semantics; a complete archive separately requires no tail.
pub(super) fn read_records(reader: &mut impl Read, length: u64) -> Result<DecodedLog> {
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
        reader.read_exact(&mut header)?;
        let header_digest: [u8; 32] = Sha256::digest(&header[..40]).into();
        if header[40..] != header_digest {
            return Err(Error::Contract("log header checksum"));
        }
        let size =
            u64::from_be_bytes(header[..8].try_into().map_err(|_| Error::Contract("log header"))?);
        if size == 0 || size > MAX_RECORD {
            return Err(Error::Contract("log record budget"));
        }
        if size > length - offset - HEADER {
            recovery.truncated_bytes = length - offset;
            break;
        }
        let mut payload =
            vec![0; usize::try_from(size).map_err(|_| Error::Contract("log record size"))?];
        reader.read_exact(&mut payload)?;
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
    Ok(DecodedLog { records, bytes: offset, previous, recovery })
}
