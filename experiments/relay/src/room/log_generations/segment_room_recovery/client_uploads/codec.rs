//! Original SDK queue framing. Opaque receipt strings retain their exact UTF-16 escapes.
use crate::{Error, Result, archive_input::ArchiveSlice, assets::AssetInfo};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};
use std::fmt::Write;

const MAGIC: &[u8] = b"BREDITOR-ASSETS1\n";
const PREFIX: u64 = MAGIC.len() as u64 + 4;
const MAX_HEADER: u64 = 16 * 1024 * 1024;
const MAX_PAYLOAD: u64 = 100 * 1024 * 1024;
pub(in crate::room::log_generations::segment_room_recovery) const MAX_FILE: u64 =
    PREFIX + MAX_HEADER + MAX_PAYLOAD;
const MAX_JS_INTEGER: u64 = (1 << 53) - 1;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Header<'a> {
    format: &'a str,
    format_version: u32,
    #[serde(borrow)]
    records: Vec<Entry<'a>>,
    sha256: &'a str,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry<'a> {
    asset: String,
    mime: crate::assets::RasterMime,
    bytes: u64,
    width: u32,
    height: u32,
    status: Status,
    attempts: u64,
    #[serde(borrow)]
    storage_ref: &'a RawValue,
    failure: Option<Failure>,
    epoch: u64,
    offset: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Pending,
    Cancelled,
    Failed,
    Uploaded,
}

#[derive(Deserialize, Serialize)]
enum Failure {
    #[serde(rename = "upload_failed")]
    UploadFailed,
}

pub(super) struct Payload {
    pub info: AssetInfo,
    pub offset: u64,
}

pub(super) fn digest_spelling(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub(super) fn hex(bytes: [u8; 32]) -> String {
    let mut output = String::with_capacity(64);
    for byte in bytes {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

fn receipt(value: &RawValue) -> Result<bool> {
    if value.get() == "null" {
        return Ok(false);
    }
    let invalid = Error::Contract("client archive upload receipt");
    let input = value.get().strip_prefix('"').and_then(|s| s.strip_suffix('"')).ok_or(invalid)?;
    let mut input = input.chars();
    let mut units = 0;
    let mut escaped_high = false;
    while let Some(c) = input.next() {
        let mut high = false;
        if c == '\\' {
            match input.next() {
                Some('u') => {
                    let code = hex_escape(&mut input)?;
                    match code {
                        0..=31 if !matches!(code, 8..=10 | 12 | 13) => {}
                        0xd800..=0xdbff => high = true,
                        0xdc00..=0xdfff if !escaped_high => {}
                        _ => {
                            return Err(Error::Contract(
                                "noncanonical client archive receipt escape",
                            ));
                        }
                    }
                }
                Some('"' | '\\' | 'b' | 'f' | 'n' | 'r' | 't') => {}
                _ => return Err(Error::Contract("client archive receipt escape")),
            }
            units += 1;
        } else {
            if c.is_ascii_control() && c != '\u{7f}' {
                return Err(Error::Contract("unescaped client archive receipt control"));
            }
            units += c.len_utf16();
        }
        escaped_high = high;
    }
    if units == 0 || units > 4096 {
        return Err(Error::Contract("client archive receipt length"));
    }
    Ok(true)
}

fn hex_escape(input: &mut std::str::Chars<'_>) -> Result<u32> {
    let mut value = 0;
    for _ in 0..4 {
        let digit = match input.next() {
            Some(c @ ('0'..='9' | 'a'..='f')) => c.to_digit(16).ok_or(Error::NeedsRecovery)?,
            _ => return Err(Error::Contract("client archive receipt escape")),
        };
        value = (value << 4) | digit;
    }
    Ok(value)
}

pub(super) fn read(file: ArchiveSlice<'_>) -> Result<(u64, Vec<Payload>)> {
    let prefix = file.section(0, PREFIX)?.read(PREFIX)?;
    if !prefix.starts_with(MAGIC) {
        return Err(Error::Contract("client upload archive framing"));
    }
    let length = u64::from(u32::from_be_bytes(
        prefix[MAGIC.len()..].try_into().map_err(|_| Error::NeedsRecovery)?,
    ));
    let body = PREFIX + length;
    if length == 0 || length > MAX_HEADER || body > file.len() || file.len() - body > MAX_PAYLOAD {
        return Err(Error::Contract("client upload archive framing budget"));
    }
    let header = file.section(PREFIX, length)?.read(MAX_HEADER)?;
    let parsed: Header<'_> = serde_json::from_slice(&header)?;
    if parsed.format != "breditor/raster-asset-archive"
        || parsed.format_version != 1
        || parsed.records.len() > crate::assets::MAX_ASSETS
        || !digest_spelling(parsed.sha256)
        || header != serde_json::to_vec(&parsed)?
    {
        return Err(Error::Contract("client upload archive metadata"));
    }
    // The producer hashes the canonical header fields before the final sha256 property.
    let digest_field = b",\"sha256\":\"";
    let end = header.len() - (digest_field.len() + 64 + 2);
    if !header[end..].starts_with(digest_field) {
        return Err(Error::Contract("client upload archive header order"));
    }
    let mut hash = Sha256::new();
    hash.update(&header[..end]);
    hash.update(b"}");
    if hex(hash.finalize().into()) != parsed.sha256 {
        return Err(Error::Contract("client upload archive header digest"));
    }
    read_entries(parsed.records, file.len() - body).map(|entries| (body, entries))
}

fn read_entries(entries: Vec<Entry<'_>>, bytes: u64) -> Result<Vec<Payload>> {
    let mut result: Vec<Payload> = Vec::with_capacity(entries.len());
    let mut offset = 0;
    for entry in entries {
        let has_receipt = receipt(entry.storage_ref)?;
        if entry.offset != offset
            || entry.attempts > MAX_JS_INTEGER
            || entry.epoch > MAX_JS_INTEGER
            || (entry.status == Status::Uploaded && !has_receipt)
            || ((entry.status == Status::Failed) != entry.failure.is_some())
            || result.last().is_some_and(|p| p.info.asset >= entry.asset)
        {
            return Err(Error::Contract("client upload archive queue metadata"));
        }
        let info = AssetInfo {
            asset: entry.asset,
            mime: entry.mime,
            bytes: entry.bytes,
            width: entry.width,
            height: entry.height,
        };
        info.validate()?;
        result.push(Payload { info, offset });
        offset += entry.bytes;
    }
    if offset != bytes {
        return Err(Error::Contract("client upload archive complete body"));
    }
    Ok(result)
}
