//! Experimental, fingerprint-bound structural operation JSON codec.

use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationV5CodecError},
    identity::QualifiedName,
    operation::Operation,
    record::{OperationEnvelopeHeader, SchemaIdRecord},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
};

use super::{
    json_size::JsonByteCounter,
    operation_payload_v4::{OperationPayloadEncodingV4, decode_operation_payload_v4},
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Wire version implemented by [`OperationJsonCodecV5`].
pub const OPERATION_V5_FORMAT_VERSION: u32 = 5;

/// Experimental strict codec for fingerprint-bound operations, including headings.
///
/// V5 adds guarded text-block splices and replacements without widening V1–V4.
/// Their expected source is a node fragment under a synthetic root, not a whole
/// document snapshot. Decode proves static contracts only: applying the result
/// still checks the complete source guards against the live document.
///
/// Transactions and complete histories use the separate V5 request and session
/// codecs. This singular format does not provide commits or browser support.
#[derive(Clone, Debug)]
pub struct OperationJsonCodecV5 {
    context: EditorContext,
}

impl OperationJsonCodecV5 {
    /// Creates a V5 operation codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the immutable context used for binding and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one property-preserving V5 operation.
    ///
    /// The raw property payload is fully preflighted before owned record
    /// reconstruction, including canonical key order, key grammar, exact
    /// numeric representation, nesting, counts, and string budgets.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV5CodecError`] for an oversized input, malformed or
    /// noncanonical JSON, a non-V5 envelope, invalid binding text, a binding
    /// mismatch, checked reconstruction failure, or active-schema validation
    /// failure.
    pub fn decode(&self, json: &str) -> Result<Operation, OperationV5CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(OperationV5CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: OperationEnvelopeHeader = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV5CodecError::InvalidJson)?;
        if header.format != super::operation_json::OPERATION_FORMAT {
            return Err(OperationV5CodecError::UnsupportedFormat {
                found: header.format.into(),
                expected: super::operation_json::OPERATION_FORMAT,
            });
        }
        if header.format_version != OPERATION_V5_FORMAT_VERSION {
            return Err(OperationV5CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: OPERATION_V5_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedOperationEnvelopeV5<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV5CodecError::InvalidJson)?;
        let schema = schema_id_from_record(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(OperationV5CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        let operation = decode_operation_payload_v4(envelope.operation.get(), &self.context)?;
        operation.validate(&self.context)?;
        Ok(operation)
    }

    /// Encodes one context-valid operation into deterministic compact V5 JSON.
    ///
    /// All format properties, including nested values, are retained exactly.
    /// The output is guaranteed to fit this codec's configured input budget.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV5CodecError::Validation`] when the operation fails
    /// active-schema validation, [`OperationV5CodecError::OutputTooLarge`] when
    /// its encoding exceeds the input budget, or
    /// [`OperationV5CodecError::Encoding`] on serialization failure.
    pub fn encode(&self, operation: &Operation) -> Result<String, OperationV5CodecError> {
        let record = OperationRecordEnvelopeV5 {
            binding: self.context.schema().durable_binding(),
            operation: OperationPayloadEncodingV4::try_new(operation, &self.context)?,
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(OperationV5CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV5CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV5CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedOperationEnvelopeV5<'a> {
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

struct OperationRecordEnvelopeV5<'a> {
    binding: DurableSchemaBinding,
    operation: OperationPayloadEncodingV4<'a>,
}

impl Serialize for OperationRecordEnvelopeV5<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("OperationRecordEnvelopeV5", 5)?;
        record.serialize_field("format", super::operation_json::OPERATION_FORMAT)?;
        record.serialize_field("formatVersion", &OPERATION_V5_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.binding.schema(), self.binding.fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("operation", &self.operation)?;
        record.end()
    }
}

fn schema_id_from_record(record: SchemaIdRecord) -> Result<SchemaId, OperationV5CodecError> {
    let name = QualifiedName::try_new(&record.name).map_err(|source| {
        OperationV5CodecError::InvalidSchemaName { value: record.name.into(), source }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        OperationV5CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}
