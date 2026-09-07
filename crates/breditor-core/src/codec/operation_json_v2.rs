use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationV2CodecError},
    identity::QualifiedName,
    operation::Operation,
    record::{OperationEnvelopeHeader, OperationRecordV1, SchemaIdRecord},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
};

use super::json_size::JsonByteCounter;
use super::operation_payload_v1::{decode_operation_payload_v1, encode_operation_payload_v1};
use super::operation_preflight::preflight_operation_payload;
use super::schema_binding_encoding::SchemaBindingEncoding;

/// Wire version implemented by [`OperationJsonCodecV2`].
pub const OPERATION_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for one fingerprint-bound V2 operation envelope.
///
/// V2 deliberately reuses the closed primitive operation payload defined for
/// V1. Only the independent outer envelope is new: it adds the compiled-schema
/// fingerprint and cannot accept or emit a V1 envelope. Some structural
/// primitive operations remain exact-base-only; the V2 binding does not weaken
/// their unchanged semantic validation.
#[derive(Clone, Debug)]
pub struct OperationJsonCodecV2 {
    context: EditorContext,
}

impl OperationJsonCodecV2 {
    /// Creates a V2 operation codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the immutable context used for binding and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one V2 operation bound to this codec's complete schema.
    ///
    /// Routing and the exact outer record are checked before schema binding or
    /// primitive-payload reconstruction. A matching durable fingerprint does
    /// not bypass the receiving context's operation validation.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV2CodecError`] for an oversized input, malformed or
    /// noncanonical JSON, a non-V2 envelope, invalid fingerprint text, a
    /// selector or fingerprint mismatch, checked reconstruction failure, or
    /// context-static operation validation failure.
    pub fn decode(&self, json: &str) -> Result<Operation, OperationV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(OperationV2CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: OperationEnvelopeHeader = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::InvalidJson)?;
        if header.format != super::operation_json::OPERATION_FORMAT {
            return Err(OperationV2CodecError::UnsupportedFormat {
                found: header.format.into(),
                expected: super::operation_json::OPERATION_FORMAT,
            });
        }
        if header.format_version != OPERATION_V2_FORMAT_VERSION {
            return Err(OperationV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: OPERATION_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedOperationEnvelopeV2<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::InvalidJson)?;
        let schema = schema_id_from_record(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(OperationV2CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        preflight_operation_payload(envelope.operation.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::InvalidJson)?;
        let record: OperationRecordV1 = serde_json::from_str(envelope.operation.get())
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::InvalidJson)?;
        let operation = decode_operation_payload_v1(record)?;
        operation.validate(&self.context)?;
        Ok(operation)
    }

    /// Encodes one context-valid operation into deterministic compact V2 JSON.
    ///
    /// The encoder is generation-specific and never chooses V1 based on the
    /// active schema. The output carries both the schema selector and complete
    /// compiled-definition fingerprint.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV2CodecError::Validation`] when the operation fails
    /// current context-static validation,
    /// [`OperationV2CodecError::OutputTooLarge`] when the V2 encoding exceeds
    /// the same codec's input budget, or [`OperationV2CodecError::Encoding`] on
    /// serialization failure.
    pub fn encode(&self, operation: &Operation) -> Result<String, OperationV2CodecError> {
        operation.validate(&self.context)?;
        let binding = self.context.schema().durable_binding();
        let record = OperationRecordEnvelopeV2 {
            binding,
            operation: encode_operation_payload_v1(operation),
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(OperationV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV2CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedOperationEnvelopeV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    schema: SchemaIdRecord,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
    #[serde(borrow)]
    operation: &'a RawValue,
}

struct OperationRecordEnvelopeV2 {
    binding: DurableSchemaBinding,
    operation: OperationRecordV1,
}

impl Serialize for OperationRecordEnvelopeV2 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("OperationRecordEnvelopeV2", 5)?;
        record.serialize_field("format", super::operation_json::OPERATION_FORMAT)?;
        record.serialize_field("formatVersion", &OPERATION_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.binding.schema(), self.binding.fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("operation", &self.operation)?;
        record.end()
    }
}

fn schema_id_from_record(record: SchemaIdRecord) -> Result<SchemaId, OperationV2CodecError> {
    let name = QualifiedName::try_new(&record.name).map_err(|source| {
        OperationV2CodecError::InvalidSchemaName { value: record.name.into(), source }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        OperationV2CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}
