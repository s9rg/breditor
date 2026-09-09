//! Property-preserving singular operation JSON codec.

use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationV3CodecError},
    identity::QualifiedName,
    operation::Operation,
    record::{OperationEnvelopeHeader, OperationRecordV2, SchemaIdRecord},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
};

use super::{
    json_size::JsonByteCounter,
    operation_payload_v2::{decode_operation_payload_v2, encode_operation_payload_v2},
    operation_preflight_v2::preflight_operation_payload_v2,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Wire version implemented by [`OperationJsonCodecV3`].
pub const OPERATION_V3_FORMAT_VERSION: u32 = 3;

/// Strict JSON codec for one fingerprint-bound, property-preserving operation.
///
/// V3 retains the V2 envelope and schema-binding contract while replacing the
/// primitive payload generation. Inline-format properties are represented by
/// the same deterministic value language and limits used by document V2; V3
/// therefore nests no new document generation.
#[derive(Clone, Debug)]
pub struct OperationJsonCodecV3 {
    context: EditorContext,
}

impl OperationJsonCodecV3 {
    /// Creates a V3 operation codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the immutable context used for binding and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one property-preserving V3 operation.
    ///
    /// The raw property payload is fully preflighted before owned record
    /// reconstruction, including canonical key order, key grammar, exact
    /// numeric representation, nesting, counts, and string budgets.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV3CodecError`] for an oversized input, malformed or
    /// noncanonical JSON, a non-V3 envelope, invalid binding text, a binding
    /// mismatch, checked reconstruction failure, or active-schema validation
    /// failure.
    pub fn decode(&self, json: &str) -> Result<Operation, OperationV3CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(OperationV3CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: OperationEnvelopeHeader = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::InvalidJson)?;
        if header.format != super::operation_json::OPERATION_FORMAT {
            return Err(OperationV3CodecError::UnsupportedFormat {
                found: header.format.into(),
                expected: super::operation_json::OPERATION_FORMAT,
            });
        }
        if header.format_version != OPERATION_V3_FORMAT_VERSION {
            return Err(OperationV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: OPERATION_V3_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedOperationEnvelopeV3<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::InvalidJson)?;
        let schema = schema_id_from_record(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(OperationV3CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        preflight_operation_payload_v2(envelope.operation.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::InvalidJson)?;
        let record: OperationRecordV2 = serde_json::from_str(envelope.operation.get())
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::InvalidJson)?;
        let operation = decode_operation_payload_v2(record)?;
        operation.validate(&self.context)?;
        Ok(operation)
    }

    /// Encodes one context-valid operation into deterministic compact V3 JSON.
    ///
    /// All format properties, including nested values, are retained exactly.
    /// The output is guaranteed to fit this codec's configured input budget.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV3CodecError::Validation`] when the operation fails
    /// active-schema validation, [`OperationV3CodecError::OutputTooLarge`] when
    /// its encoding exceeds the input budget, or
    /// [`OperationV3CodecError::Encoding`] on serialization failure.
    pub fn encode(&self, operation: &Operation) -> Result<String, OperationV3CodecError> {
        operation.validate(&self.context)?;
        let record = OperationRecordEnvelopeV3 {
            binding: self.context.schema().durable_binding(),
            operation: encode_operation_payload_v2(operation),
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(OperationV3CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV3CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedOperationEnvelopeV3<'a> {
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

struct OperationRecordEnvelopeV3 {
    binding: DurableSchemaBinding,
    operation: OperationRecordV2,
}

impl Serialize for OperationRecordEnvelopeV3 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("OperationRecordEnvelopeV3", 5)?;
        record.serialize_field("format", super::operation_json::OPERATION_FORMAT)?;
        record.serialize_field("formatVersion", &OPERATION_V3_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.binding.schema(), self.binding.fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("operation", &self.operation)?;
        record.end()
    }
}

fn schema_id_from_record(record: SchemaIdRecord) -> Result<SchemaId, OperationV3CodecError> {
    let name = QualifiedName::try_new(&record.name).map_err(|source| {
        OperationV3CodecError::InvalidSchemaName { value: record.name.into(), source }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        OperationV3CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}
