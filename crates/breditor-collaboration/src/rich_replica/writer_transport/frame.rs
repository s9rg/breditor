//! Original bound writer-group envelope with independently checked author/range and payload digest.
use super::{
    super::{RichReplica, session::writer_id},
    digest,
};
use crate::Error;
use loro::{EncodedBlobMode, ExportMode, IdSpan, LoroDoc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// A required applied counter on another causal writer, not a numeric DOM position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriterDependency {
    /// Canonical exact writer identity.
    pub writer: String,
    /// Canonical positive applied counter (exclusive end).
    pub counter: String,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum GroupKind {
    Genesis,
    Action,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Schema {
    name: String,
    version: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Engine {
    name: String,
    version: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Frame {
    format: String,
    format_version: u32,
    document: String,
    schema: Schema,
    schema_fingerprint: String,
    model_version: u32,
    engine: Engine,
    pub kind: GroupKind,
    pub writer: String,
    pub from: String,
    pub through: String,
    pub previous_digest: String,
    pub group_digest: String,
    pub payload_digest: String,
    pub dependencies: Vec<WriterDependency>,
    pub bytes: Vec<u8>,
}
pub(super) struct Checked {
    pub frame: Frame,
    pub writer: u64,
    pub from: i32,
    pub through: i32,
    pub dependencies: Vec<(u64, i32)>,
}
pub(super) fn counter(value: &str) -> Result<i32, Error> {
    let n = value.parse::<i32>().map_err(|_| Error::Contract("shared transport counter"))?;
    if n < 0 || n.to_string() != value {
        return Err(Error::Contract("canonical shared transport counter"));
    }
    Ok(n)
}
pub(super) fn encode(owner: &RichReplica, window: &super::Window) -> Result<String, Error> {
    if window.dependencies.len() > 1024 {
        return Err(Error::Limit("shared writer group dependencies"));
    }
    let writer = writer_id(owner.writer())?;
    let bytes = owner.doc.export(ExportMode::updates_in_range(vec![IdSpan::new(
        writer,
        window.from,
        window.through,
    )]))?;
    if bytes.is_empty() || bytes.len() > super::MAX_ENGINE_BYTES {
        return Err(Error::Limit("shared writer group engine bytes"));
    }
    let schema = owner.codec.schema();
    let frame = Frame {
        format: "breditor/shared-writer-group".into(),
        format_version: 1,
        document: owner.document_id().into(),
        schema: Schema {
            name: schema.id().name().as_str().into(),
            version: schema.id().version().get(),
        },
        schema_fingerprint: schema.fingerprint().to_string(),
        model_version: super::super::MODEL_VERSION,
        engine: Engine { name: "loro".into(), version: super::ENGINE.into() },
        kind: window.kind,
        writer: owner.writer().into(),
        from: window.from.to_string(),
        through: window.through.to_string(),
        previous_digest: digest::operations(owner, writer, 0, window.from)?,
        group_digest: digest::operations(owner, writer, window.from, window.through)?,
        payload_digest: digest::bytes(&bytes),
        dependencies: window.dependencies.clone(),
        bytes,
    };
    let json = serde_json::to_string(&frame)?;
    if json.len() > super::MAX_GROUP_BYTES {
        return Err(Error::Limit("shared writer group JSON bytes"));
    }
    Ok(json)
}
pub(super) fn decode(
    owner: &RichReplica,
    authenticated_writer: &str,
    input: &str,
) -> Result<Checked, Error> {
    let writer = writer_id(authenticated_writer)?;
    if input.len() > super::MAX_GROUP_BYTES {
        return Err(Error::Limit("shared writer group JSON bytes"));
    }
    let frame: Frame = serde_json::from_str(input)?;
    if frame.writer != authenticated_writer || frame.writer == owner.writer() {
        return Err(Error::Contract("shared transport authenticated writer"));
    }
    let schema = owner.codec.schema();
    if frame.format != "breditor/shared-writer-group"
        || frame.format_version != 1
        || frame.model_version != super::super::MODEL_VERSION
        || frame.engine.name != "loro"
        || frame.engine.version != super::ENGINE
    {
        return Err(Error::Contract("shared writer group protocol binding"));
    }
    if frame.document != owner.document_id()
        || frame.schema.name != schema.id().name().as_str()
        || frame.schema.version != schema.id().version().get()
        || frame.schema_fingerprint != schema.fingerprint().to_string()
    {
        return Err(Error::Contract("shared writer group room/schema binding"));
    }
    let from = counter(&frame.from)?;
    let through = counter(&frame.through)?;
    if through <= from || frame.dependencies.len() > 1024 {
        return Err(Error::Contract("shared writer group range/dependencies"));
    }
    if !digest::valid(&frame.previous_digest)
        || !digest::valid(&frame.group_digest)
        || !digest::valid(&frame.payload_digest)
    {
        return Err(Error::Contract("shared writer group digest"));
    }
    if frame.bytes.is_empty() || frame.bytes.len() > super::MAX_ENGINE_BYTES {
        return Err(Error::Limit("shared writer group engine bytes"));
    }
    if frame.payload_digest != digest::bytes(&frame.bytes) {
        return Err(Error::Contract("shared writer group payload digest"));
    }
    let meta = LoroDoc::decode_import_blob_meta(&frame.bytes, true)?;
    if meta.mode != EncodedBlobMode::Updates
        || meta.partial_start_vv.get(&writer).copied().unwrap_or(0) != from
        || meta.partial_end_vv.get(&writer).copied().unwrap_or(0) != through
        || meta
            .partial_start_vv
            .iter()
            .chain(meta.partial_end_vv.iter())
            .any(|(peer, count)| *peer != writer && *count != 0)
    {
        return Err(Error::Contract("shared writer group engine origin/range"));
    }
    let mut seen = BTreeSet::new();
    let mut dependencies = Vec::new();
    for dep in &frame.dependencies {
        let peer = writer_id(&dep.writer)?;
        let count = counter(&dep.counter)?;
        if peer == writer || count == 0 || !seen.insert(peer) {
            return Err(Error::Contract("shared writer group dependency"));
        }
        dependencies.push((peer, count));
    }
    Ok(Checked { frame, writer, from, through, dependencies })
}
