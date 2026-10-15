//! Original room/schema/model-bound update envelope around opaque replication-engine bytes.
use crate::Error;
use breditor_core::codec::DocumentJsonCodecV2;
use serde::{Deserialize, Serialize};

const MAX_ENGINE_BYTES: usize = 1024 * 1024;
const MAX_FRAME_BYTES: usize = 5 * MAX_ENGINE_BYTES;
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
struct Frame {
    format: String,
    format_version: u32,
    document: String,
    schema: Schema,
    schema_fingerprint: String,
    model_version: u32,
    engine: Engine,
    bytes: Vec<u8>,
}
pub(super) fn encode(
    codec: &DocumentJsonCodecV2,
    document: &str,
    bytes: Vec<u8>,
) -> Result<String, Error> {
    if bytes.is_empty() || bytes.len() > MAX_ENGINE_BYTES {
        return Err(Error::Limit("rich engine frame bytes"));
    }
    let value = serde_json::to_string(&Frame {
        format: "breditor/rich-replica-update".into(),
        format_version: 1,
        document: document.into(),
        schema: Schema {
            name: codec.schema().id().name().as_str().into(),
            version: codec.schema().id().version().get(),
        },
        schema_fingerprint: codec.schema().fingerprint().to_string(),
        model_version: 4,
        engine: Engine {
            name: "loro".into(),
            version: "1.16.2+breditor.deterministic-history.1".into(),
        },
        bytes,
    })?;
    if value.len() > MAX_FRAME_BYTES {
        return Err(Error::Limit("rich update envelope bytes"));
    }
    Ok(value)
}
pub(super) fn decode(
    codec: &DocumentJsonCodecV2,
    document: &str,
    input: &str,
) -> Result<Vec<u8>, Error> {
    if input.len() > MAX_FRAME_BYTES {
        return Err(Error::Limit("rich update envelope bytes"));
    }
    let frame: Frame = serde_json::from_str(input)?;
    if frame.format != "breditor/rich-replica-update"
        || frame.format_version != 1
        || frame.model_version != 4
        || frame.engine.name != "loro"
        || frame.engine.version != "1.16.2+breditor.deterministic-history.1"
    {
        return Err(Error::Contract("rich update protocol binding"));
    }
    if frame.document != document
        || frame.schema.name != codec.schema().id().name().as_str()
        || frame.schema.version != codec.schema().id().version().get()
        || frame.schema_fingerprint != codec.schema().fingerprint().to_string()
    {
        return Err(Error::Contract("rich update room/schema binding"));
    }
    if frame.bytes.is_empty() || frame.bytes.len() > MAX_ENGINE_BYTES {
        return Err(Error::Limit("rich engine frame bytes"));
    }
    Ok(frame.bytes)
}
