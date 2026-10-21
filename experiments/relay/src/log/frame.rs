//! Exact bounded frame I/O. Framing integrity never substitutes for room/event semantic replay.
use super::{Event, HEADER, MAX_RECORD, MAX_RECORDS, Record};
use crate::{Error, Result};
use sha2::{Digest, Sha256};
use std::io::Read;

/// Only the caller-selected container may admit continuation records; original open stays strict.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Family {
    Original,
    Continuation,
}
impl Family {
    fn name(self) -> &'static str {
        match self {
            Self::Original => "breditor/relay-log",
            Self::Continuation => "breditor/relay-log-continuation",
        }
    }
    pub(super) fn admit(record: &Record) -> Result<Self> {
        if record.version != 1 {
            return Err(Error::Contract("log lineage"));
        }
        match record.format.as_str() {
            "breditor/relay-log" => Ok(Self::Original),
            "breditor/relay-log-continuation" => Ok(Self::Continuation),
            _ => Err(Error::Contract("log lineage")),
        }
    }
}

pub(super) struct Encoded {
    pub header: [u8; 72],
    pub payload: Vec<u8>,
    pub digest: [u8; 32],
    pub bytes: u64,
}
pub(super) struct Parsed {
    pub record: Record,
    pub digest: [u8; 32],
    pub bytes: u64,
}

/// Original field order, payload bytes and 72-byte header remain exact. No disk write occurs.
pub(super) fn encode(
    event: Event,
    family: Family,
    sequence: u64,
    previous: [u8; 32],
) -> Result<Encoded> {
    if family == Family::Original && sequence >= MAX_RECORDS {
        return Err(Error::Contract("log record budget"));
    }
    let record = Record { format: family.name().into(), version: 1, sequence, previous, event };
    let payload = serde_json::to_vec(&record)?;
    let size = u64::try_from(payload.len()).map_err(|_| Error::Contract("log record size"))?;
    if size > MAX_RECORD {
        return Err(Error::Contract("log byte budget"));
    }
    let digest: [u8; 32] = Sha256::digest(&payload).into();
    let mut header = [0_u8; 72];
    header[..8].copy_from_slice(&size.to_be_bytes());
    header[8..40].copy_from_slice(&digest);
    let header_digest: [u8; 32] = Sha256::digest(&header[..40]).into();
    header[40..].copy_from_slice(&header_digest);
    Ok(Encoded { header, payload, digest, bytes: HEADER + size })
}

/// None means only an incomplete final frame. Complete corrupt/unknown bytes return errors.
/// The supplied remaining length is bounded by the container, and this read never edits a file.
pub(super) fn read(reader: &mut impl Read, remaining: u64) -> Result<Option<Parsed>> {
    if remaining < HEADER {
        return Ok(None);
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
    if size > remaining - HEADER {
        return Ok(None);
    }
    let mut payload =
        vec![0; usize::try_from(size).map_err(|_| Error::Contract("log record size"))?];
    reader.read_exact(&mut payload)?;
    let digest: [u8; 32] = Sha256::digest(&payload).into();
    if header[8..40] != digest {
        return Err(Error::Contract("log record checksum"));
    }
    let record = serde_json::from_slice(&payload)?;
    Ok(Some(Parsed { record, digest, bytes: HEADER + size }))
}
