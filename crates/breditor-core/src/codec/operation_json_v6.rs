//! Experimental, fingerprint-bound structural operation JSON codec.

use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationV6CodecError},
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
    operation_payload_v5::{OperationPayloadEncodingV5, decode_operation_payload_v5},
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Wire version implemented by [`OperationJsonCodecV6`].
pub const OPERATION_V6_FORMAT_VERSION: u32 = 6;

/// Experimental strict codec for fingerprint-bound operations, including flat lists.
///
/// V6 adds flat-list reframing, splices and structural replacement without widening V1–V5.
/// Their expected source is a node fragment under a synthetic root, not a whole
/// document snapshot. Decode proves static contracts only: applying the result
/// still checks the complete source guards against the live document.
///
/// This singular operation format is the foundation for durable list histories;
/// it does not by itself provide saved sessions or browser support.
#[derive(Clone, Debug)]
pub struct OperationJsonCodecV6 {
    context: EditorContext,
}

impl OperationJsonCodecV6 {
    /// Creates a V6 operation codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the immutable context used for binding and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one property-preserving V6 operation.
    ///
    /// The raw property payload is fully preflighted before owned record
    /// reconstruction, including canonical key order, key grammar, exact
    /// numeric representation, nesting, counts, and string budgets.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV6CodecError`] for an oversized input, malformed or
    /// noncanonical JSON, a non-V6 envelope, invalid binding text, a binding
    /// mismatch, checked reconstruction failure, or active-schema validation
    /// failure.
    pub fn decode(&self, json: &str) -> Result<Operation, OperationV6CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(OperationV6CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: OperationEnvelopeHeader = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV6CodecError::InvalidJson)?;
        if header.format != super::operation_json::OPERATION_FORMAT {
            return Err(OperationV6CodecError::UnsupportedFormat {
                found: header.format.into(),
                expected: super::operation_json::OPERATION_FORMAT,
            });
        }
        if header.format_version != OPERATION_V6_FORMAT_VERSION {
            return Err(OperationV6CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: OPERATION_V6_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedOperationEnvelopeV6<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV6CodecError::InvalidJson)?;
        let schema = schema_id_from_record(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(OperationV6CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        let operation = decode_operation_payload_v5(envelope.operation.get(), &self.context)?;
        operation.validate(&self.context)?;
        Ok(operation)
    }

    /// Encodes one context-valid operation into deterministic compact V6 JSON.
    ///
    /// All format properties, including nested values, are retained exactly.
    /// The output is guaranteed to fit this codec's configured input budget.
    ///
    /// # Errors
    ///
    /// Returns [`OperationV6CodecError::Validation`] when the operation fails
    /// active-schema validation, [`OperationV6CodecError::OutputTooLarge`] when
    /// its encoding exceeds the input budget, or
    /// [`OperationV6CodecError::Encoding`] on serialization failure.
    pub fn encode(&self, operation: &Operation) -> Result<String, OperationV6CodecError> {
        let record = OperationRecordEnvelopeV6 {
            binding: self.context.schema().durable_binding(),
            operation: OperationPayloadEncodingV5::try_new(operation, &self.context)?,
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(OperationV6CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV6CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationV6CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedOperationEnvelopeV6<'a> {
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

struct OperationRecordEnvelopeV6<'a> {
    binding: DurableSchemaBinding,
    operation: OperationPayloadEncodingV5<'a>,
}

impl Serialize for OperationRecordEnvelopeV6<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("OperationRecordEnvelopeV6", 5)?;
        record.serialize_field("format", super::operation_json::OPERATION_FORMAT)?;
        record.serialize_field("formatVersion", &OPERATION_V6_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.binding.schema(), self.binding.fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("operation", &self.operation)?;
        record.end()
    }
}

fn schema_id_from_record(record: SchemaIdRecord) -> Result<SchemaId, OperationV6CodecError> {
    let name = QualifiedName::try_new(&record.name).map_err(|source| {
        OperationV6CodecError::InvalidSchemaName { value: record.name.into(), source }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        OperationV6CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}
