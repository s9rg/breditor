//! Stream the original SDK participant archive without changing its framing or stored records.
#[cfg(feature = "server")]
mod records;

use super::{MAX_DELIVERY_FILE, RelaySegmentJournalOwner};
use crate::{
    Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, RelaySegmentClientUploadPin, Result,
    archive_input::ArchiveSlice,
    assets::{AssetInfo, RasterMime},
    room::log_generations::segment_room_recovery::{
        client_rasters::SelectedRaster,
        client_uploads::{self, UploadLayout, UploadSource},
    },
};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const MAGIC: &[u8] = b"BREDITOR-INDEPENDENT-DELIVERY-PARTICIPANT1\n";
const PREFIX: u64 = MAGIC.len() as u64 + 4;
const MAX_HEADER: u64 = 64 * 1024 * 1024;
const MAX_RASTERS: u64 = 100 * 1024 * 1024;
pub(super) const MAX_PARTICIPANT_FILE: u64 =
    PREFIX + MAX_HEADER + MAX_DELIVERY_FILE + MAX_RASTERS + client_uploads::codec::MAX_FILE;

const CHECKSUM_SUFFIX: usize = b",\"sha256\":\"".len() + 64 + b"\"}".len();
const FORMAT: &str = "breditor/shared-independent-delivery-participant-backup";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Header {
    format: String,
    format_version: u32,
    metadata: Box<RawValue>,
    records: Vec<Record>,
    assets: Vec<RasterRange>,
    uploads: Part,
    sha256: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    format: String,
    format_version: u32,
    identity: Identity,
    document: String,
    revision: String,
    bindings: Vec<Binding>,
    assets: Vec<Raster>,
    source_bytes: u64,
    asset_bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    participant: String,
    principal: String,
    source: Source,
    assets: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Source {
    pub history: Box<RawValue>,
    pub binding: Box<RawValue>,
    pub retained: Box<RawValue>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Binding {
    #[cfg_attr(not(feature = "server"), allow(dead_code))]
    pub asset: String,
    pub generation: String,
    identity: BindingKind,
    pub content_asset: String,
}

#[derive(Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum BindingKind {
    ContentAddressed,
    HostVerified,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Record {
    kind: RecordKind,
    index: usize,
    bytes: u64,
    offset: u64,
    sha256: String,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum RecordKind {
    Document,
    Review,
    Version,
    Relay,
    Suggestions,
    Revisions,
    Versions,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RasterRange {
    content_asset: String,
    mime: RasterMime,
    width: u32,
    height: u32,
    bytes: u64,
    offset: u64,
}

#[derive(Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Raster {
    content_asset: String,
    mime: RasterMime,
    width: u32,
    height: u32,
    bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Part {
    offset: u64,
    bytes: u64,
    sha256: String,
}

pub(super) struct ParticipantArchive {
    #[cfg(feature = "server")]
    records: Vec<Record>,
    #[cfg(feature = "server")]
    metadata: Metadata,
    rasters: Vec<(u64, AssetInfo)>,
    body: u64,
    upload_offset: u64,
    upload_pin: RelaySegmentClientUploadPin,
    upload: UploadLayout,
}

impl ParticipantArchive {
    pub fn open(input: ArchiveSlice<'_>, owner: &RelaySegmentJournalOwner) -> Result<Self> {
        let RelaySegmentJournalOwner::IndependentParticipant { writer, actor } = owner else {
            return Err(Error::Contract("participant archive requires an explicit selection"));
        };
        let (body, header) = read_header(input)?;
        let metadata: Metadata = serde_json::from_str(header.metadata.get())?;
        if serde_json::to_string(&metadata)? != header.metadata.get() {
            return Err(Error::Contract("participant archive metadata is not canonical"));
        }
        metadata.check(writer, actor)?;
        let body_bytes = input.section(body, input.len() - body)?;
        check_records(&header.records, body_bytes, metadata.source_bytes)?;
        let rasters = verify_rasters(&header.assets, &metadata, body_bytes)?;
        let upload_offset = metadata.source_bytes + metadata.asset_bytes;
        if header.uploads.offset != upload_offset
            || header.uploads.bytes != body_bytes.len().saturating_sub(upload_offset)
        {
            return Err(Error::Contract("participant archive upload extent differs"));
        }
        let upload_pin = RelaySegmentClientUploadPin {
            writer: writer.clone(),
            bytes: header.uploads.bytes,
            sha256: header.uploads.sha256,
        };
        let upload =
            UploadLayout::read(body_bytes.section(upload_offset, upload_pin.bytes)?, &upload_pin)?;
        input.check()?;
        Ok(Self {
            #[cfg(feature = "server")]
            records: header.records,
            #[cfg(feature = "server")]
            metadata,
            rasters,
            body,
            upload_offset,
            upload_pin,
            upload,
        })
    }

    #[cfg(feature = "server")]
    pub fn source(&self) -> &Source {
        &self.metadata.identity.source
    }

    #[cfg(feature = "server")]
    pub fn bindings(&self) -> &[Binding] {
        &self.metadata.bindings
    }

    pub fn upload<'a>(&'a self, input: ArchiveSlice<'a>) -> Result<UploadSource<'a>> {
        Ok(UploadSource {
            pin: &self.upload_pin,
            bytes: input.section(self.body + self.upload_offset, self.upload_pin.bytes)?,
            layout: &self.upload,
        })
    }

    pub fn add_rasters<'a>(
        &'a self,
        input: ArchiveSlice<'a>,
        selected: &mut BTreeMap<&'a str, SelectedRaster<'a>>,
    ) -> Result<()> {
        for (offset, info) in &self.rasters {
            let bytes = input.section(self.body + offset, info.bytes)?;
            client_uploads::add_raster(selected, SelectedRaster { info, bytes })?;
        }
        Ok(())
    }
}

fn read_header(input: ArchiveSlice<'_>) -> Result<(u64, Header)> {
    let lead = input.section(0, PREFIX)?.read(PREFIX)?;
    if !lead.starts_with(MAGIC) {
        return Err(Error::Contract("participant archive framing differs"));
    }
    let len = u64::from(u32::from_be_bytes(
        lead[MAGIC.len()..]
            .try_into()
            .map_err(|_| Error::Contract("participant archive prefix"))?,
    ));
    if len == 0 || len > MAX_HEADER || input.len() > MAX_PARTICIPANT_FILE {
        return Err(Error::Contract("participant archive header byte budget"));
    }
    let encoded = input.section(PREFIX, len)?.read(MAX_HEADER)?;
    let header: Header = serde_json::from_slice(&encoded)?;
    if header.format != FORMAT
        || header.format_version != 1
        || serde_json::to_vec(&header)? != encoded.as_ref()
    {
        return Err(Error::Contract("participant archive header differs"));
    }
    // The original writer hashes the canonical header body before appending its final sha256.
    let body_end = encoded
        .len()
        .checked_sub(CHECKSUM_SUFFIX)
        .ok_or(Error::Contract("participant archive header checksum"))?;
    let mut digest = Sha256::new();
    digest.update(&encoded[..body_end]);
    digest.update(b"}");
    if hex(digest.finalize().into()) != header.sha256 {
        return Err(Error::Contract("participant archive header checksum differs"));
    }
    Ok((PREFIX + len, header))
}

fn hex(bytes: [u8; 32]) -> String {
    let mut text = String::with_capacity(64);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(text, "{byte:02x}");
    }
    text
}

impl Metadata {
    fn check(&self, writer: &str, actor: &str) -> Result<()> {
        let history: serde_json::Value = serde_json::from_str(self.identity.source.history.get())?;
        if self.format != "breditor/shared-independent-delivery-participant-bytes"
            || self.format_version != 1
            || self.identity.assets != "whole-store"
            || !local_label(&self.identity.participant, 200)
            || !local_label(&self.identity.principal, 256)
            || history["native"]["writer"] != writer
            || history["native"]["room"] != self.document
            || history["review"]["actor"] != actor
            || history["review"]["principal"] != self.identity.principal
            || !self
                .revision
                .parse::<u64>()
                .is_ok_and(|revision| revision.to_string() == self.revision)
            || self.source_bytes == 0
            || self.source_bytes > MAX_DELIVERY_FILE
            || self.asset_bytes > MAX_RASTERS
            || self.bindings.len() > MAX_SERVER_ASSET_REFERENCE_PAIRS
            || self.assets.len() > self.bindings.len()
        {
            return Err(Error::Contract("participant archive identity or budget differs"));
        }
        let mut previous = None;
        let mut contents = BTreeMap::new();
        let mut referenced = BTreeSet::new();
        for binding in &self.bindings {
            let key = (binding.asset.as_str(), binding.generation.as_str());
            let addressed = content(&binding.asset);
            if !asset_key(key.0)
                || !asset_key(key.1)
                || !content(&binding.content_asset)
                || (binding.identity == BindingKind::ContentAddressed) != addressed
                || addressed && binding.asset != binding.content_asset
                || previous.is_some_and(|prior| key <= prior)
                || contents
                    .insert(key.0, binding.content_asset.as_str())
                    .is_some_and(|prior| prior != binding.content_asset)
            {
                return Err(Error::Contract("participant archive raster binding differs"));
            }
            previous = Some(key);
            referenced.insert(binding.content_asset.as_str());
        }
        for asset in &self.assets {
            if !referenced.remove(asset.content_asset.as_str()) {
                return Err(Error::Contract("participant archive raster inventory differs"));
            }
        }
        if !referenced.is_empty() {
            return Err(Error::Contract("participant archive raster inventory incomplete"));
        }
        Ok(())
    }
}

fn local_label(value: &str, limit: usize) -> bool {
    !value.trim().is_empty() && value.len() <= limit && !value.chars().any(char::is_control)
}

fn asset_key(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

fn content(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn check_records(records: &[Record], body: ArchiveSlice<'_>, source_bytes: u64) -> Result<()> {
    if !(3..=38).contains(&records.len())
        || records[0].kind != RecordKind::Document
        || records[1].kind != RecordKind::Review
        || !records.iter().any(|row| row.kind == RecordKind::Relay)
    {
        return Err(Error::Contract("participant archive record roster differs"));
    }
    let mut offset = 0;
    let mut previous = None;
    let mut versions = 0;
    for row in records {
        let (index, limit) = match row.kind {
            RecordKind::Document | RecordKind::Review => (0, 64 * 1024 * 1024),
            RecordKind::Version => {
                let index = versions;
                versions += 1;
                (index, 4 * 1024 * 1024)
            }
            RecordKind::Relay => (0, 16 * 1024),
            RecordKind::Suggestions | RecordKind::Revisions | RecordKind::Versions => {
                (0, 32 * 1024 * 1024)
            }
        };
        let key = (row.kind, row.index);
        if row.index != index
            || versions > 32
            || row.offset != offset
            || row.bytes == 0
            || row.bytes > limit
            || previous.is_some_and(|prior| prior >= key)
            || hex(body.section(row.offset, row.bytes)?.digest()?) != row.sha256
        {
            return Err(Error::Contract("participant archive record extent or digest differs"));
        }
        previous = Some(key);
        offset += row.bytes;
    }
    if offset != source_bytes {
        return Err(Error::Contract("participant archive source extent differs"));
    }
    Ok(())
}

fn verify_rasters(
    ranges: &[RasterRange],
    metadata: &Metadata,
    body: ArchiveSlice<'_>,
) -> Result<Vec<(u64, AssetInfo)>> {
    if ranges.len() != metadata.assets.len() {
        return Err(Error::Contract("participant archive raster roster differs"));
    }
    let mut offset = metadata.source_bytes;
    let mut previous = "";
    let mut rasters = Vec::new();
    for (range, expected) in ranges.iter().zip(&metadata.assets) {
        if range.content_asset.as_str() <= previous
            || range.offset != offset
            || range.content_asset != expected.content_asset
            || range.mime != expected.mime
            || range.width != expected.width
            || range.height != expected.height
            || range.bytes != expected.bytes
            || range.bytes == 0
            || range.bytes > MAX_RASTERS
            || range.width == 0
            || range.height == 0
            || !content(&range.content_asset)
            || hex(body.section(range.offset, range.bytes)?.digest()?) != range.content_asset[7..]
        {
            return Err(Error::Contract("participant archive raster extent or identity differs"));
        }
        rasters.push((
            offset,
            AssetInfo {
                asset: range.content_asset.clone(),
                mime: range.mime,
                width: range.width,
                height: range.height,
                bytes: range.bytes,
            },
        ));
        offset += range.bytes;
        previous = &range.content_asset;
    }
    if offset - metadata.source_bytes != metadata.asset_bytes {
        return Err(Error::Contract("participant archive raster extent differs"));
    }
    Ok(rasters)
}
