use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationCodecError},
    identity::QualifiedName,
    operation::Operation,
    record::{OperationEnvelopeHeader, OperationRecordEnvelopeV1, SchemaIdRecord},
    schema::{CompiledSchema, SchemaId, SchemaVersion, require_exact_breditor_base},
    state::EditorContext,
};

use super::operation_payload_v1::{
    decode_operation_payload_v1, encode_operation_payload_v1, validate_operation_payload_v1,
};
use super::operation_preflight::preflight_operation_payload;

/// Stable identifier for Breditor's singular operation envelope.
pub const OPERATION_FORMAT: &str = "breditor/operation";

/// Wire version implemented by this codec.
pub const OPERATION_FORMAT_VERSION: u32 = 1;

/// Strict JSON codec for one guarded operation under one immutable context.
///
/// The codec reconstructs operations only through their checked constructors
/// and never captures content from a live document. Consequently every
/// optimistic source guard survives decoding exactly. A successful encoding is
/// guaranteed to fit this same codec's input-byte budget.
#[derive(Clone, Debug)]
pub struct OperationJsonCodec {
    context: EditorContext,
}

impl OperationJsonCodec {
    /// Creates a codec bound to one editor schema and resource profile.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the immutable context used for static operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one versioned, context-valid operation.
    ///
    /// Decoding proves record shape, schema identity, checked operation
    /// construction, canonical fragments, and statically knowable resource
    /// limits. Target existence, optimistic-guard equality, and complete result
    /// validity remain authoritative atomic application checks.
    ///
    /// # Errors
    ///
    /// Returns [`OperationCodecError`] for an oversized input, malformed or
    /// noncanonical JSON, unsupported envelope, schema mismatch, invalid
    /// checked construction, or context-static validation failure.
    /// Allocation-preflight JSON locations are relative to the raw `operation`
    /// payload; envelope and owned-record locations are relative to `json`.
    pub fn decode(&self, json: &str) -> Result<Operation, OperationCodecError> {
        self.ensure_v1_schema()?;
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(OperationCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: OperationEnvelopeHeader = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationCodecError::InvalidJson)?;
        if header.format != OPERATION_FORMAT {
            return Err(OperationCodecError::UnsupportedFormat {
                found: header.format.into(),
                expected: OPERATION_FORMAT,
            });
        }
        if header.format_version != OPERATION_FORMAT_VERSION {
            return Err(OperationCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: OPERATION_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedOperationEnvelopeV1<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationCodecError::InvalidJson)?;
        let schema = schema_id_from_record(envelope.schema)?;
        if &schema != self.context.schema().id() {
            return Err(OperationCodecError::SchemaMismatch {
                expected: self.context.schema().id().clone(),
                found: schema,
            });
        }

        preflight_operation_payload(envelope.operation.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationCodecError::InvalidJson)?;
        let record: OperationRecordEnvelopeV1 = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationCodecError::InvalidJson)?;
        let operation = decode_operation_payload_v1(record.operation)?;
        validate_operation_payload_v1(&operation, &self.context)?;
        Ok(operation)
    }

    /// Encodes one context-valid operation into deterministic compact JSON.
    ///
    /// This is a stable Rust V1 encoding, not a cross-language canonical hash.
    /// The record contains one guarded operation only; it is not a transaction,
    /// commit, history entry, or exactly-once replay protocol.
    ///
    /// # Errors
    ///
    /// Returns [`OperationCodecError::SchemaMismatch`] when the context is not
    /// the exact built-in V1 schema, [`OperationCodecError::Validation`] when
    /// the operation violates this codec's active context,
    /// [`OperationCodecError::OutputTooLarge`] when its encoding cannot be
    /// decoded under the same byte budget, or [`OperationCodecError::Encoding`]
    /// on serialization failure.
    pub fn encode(&self, operation: &Operation) -> Result<String, OperationCodecError> {
        self.ensure_v1_schema()?;
        let record = record_from_operation(self.context.schema().id(), operation, &self.context)?;
        let encoded = serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(OperationCodecError::Encoding)?;
        let maximum = self.context.limits().max_json_bytes();
        if encoded.len() > maximum {
            return Err(OperationCodecError::OutputTooLarge { actual: encoded.len(), maximum });
        }
        Ok(encoded)
    }

    fn ensure_v1_schema(&self) -> Result<(), OperationCodecError> {
        require_exact_breditor_base(self.context.schema()).map_err(|_| {
            OperationCodecError::SchemaMismatch {
                expected: CompiledSchema::breditor_base().id().clone(),
                found: self.context.schema().id().clone(),
            }
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedOperationEnvelopeV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    schema: SchemaIdRecord,
    #[serde(borrow)]
    operation: &'a RawValue,
}

fn schema_id_from_record(record: SchemaIdRecord) -> Result<SchemaId, OperationCodecError> {
    let name = QualifiedName::try_new(&record.name).map_err(|source| {
        OperationCodecError::InvalidSchemaName { value: record.name.into(), source }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        OperationCodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn record_from_operation(
    schema: &SchemaId,
    operation: &Operation,
    context: &EditorContext,
) -> Result<OperationRecordEnvelopeV1, crate::operation::OperationValidationError> {
    Ok(OperationRecordEnvelopeV1 {
        format: OPERATION_FORMAT.to_owned(),
        format_version: OPERATION_FORMAT_VERSION,
        schema: SchemaIdRecord {
            name: schema.name().as_str().to_owned(),
            version: schema.version().get(),
        },
        operation: encode_operation_payload_v1(operation, context)?,
    })
}
