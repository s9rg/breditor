use std::{
    borrow::Cow,
    cell::{Cell, RefCell},
    fmt, io,
};

use serde::{
    Deserialize, Serialize,
    de::{DeserializeSeed, Error as _, IgnoredAny, SeqAccess, Visitor},
    ser::SerializeSeq,
};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, OperationRecordError, TransactionCodecError,
        TransactionRecordError, TransactionRecordErrorCode, TransactionRecordLocation,
    },
    identity::QualifiedName,
    operation::{Operation, OperationValidationError},
    record::{
        DecimalU64Record, OperationRecordV1, PendingFormatsUpdateRecordV1, SchemaIdRecord,
        SelectionRelocationRecordV1, SelectionUpdateRecordV1, SnapshotIdRecordV1,
        TRANSACTION_REQUEST_FORMAT as RECORD_FORMAT,
        TRANSACTION_REQUEST_FORMAT_VERSION as RECORD_FORMAT_VERSION, TransactionMetadataRecordV1,
        TransactionRequestRecordV1,
    },
    schema::{SchemaId, SchemaVersion},
    state::{EditorContext, EditorState, LineageId, Revision, SnapshotId},
    transaction::Transaction,
};

use super::{
    operation_payload_v1::{decode_operation_payload_v1, encode_operation_payload_v1},
    operation_preflight::{preflight_operation_payload, preflight_operation_payloads},
    transaction_payload_v1::{
        decode_pending_formats_update_v1, decode_selection_relocation_v1,
        decode_selection_update_v1, decode_transaction_metadata_v1,
        encode_pending_formats_update_v1, encode_selection_relocation_v1,
        encode_selection_update_v1, encode_transaction_metadata_v1,
    },
};

const MAX_INITIAL_OPERATION_CAPACITY: u64 = 256;

/// Stable identifier for Breditor's exact-base atomic request envelope.
pub const TRANSACTION_REQUEST_FORMAT: &str = RECORD_FORMAT;

/// Transaction-request wire version implemented by this codec.
pub const TRANSACTION_REQUEST_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

/// Strict JSON codec for an atomic transaction request bound to one context.
///
/// Decode requires the complete immutable base state because the wire snapshot
/// is an identity reference, not a document copy or content hash. The codec
/// reconstructs a request but never applies it. Atomic replay remains the job
/// of [`Transaction::apply`] or [`crate::session::EditorSession`].
#[derive(Clone, Debug)]
pub struct TransactionJsonCodec {
    context: EditorContext,
}

impl TransactionJsonCodec {
    /// Creates a transaction-request codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the schema, limits, and operation ceiling used by this codec.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one request against the supplied complete base state.
    ///
    /// The honest round-trip law is
    /// `decode(encode(transaction), transaction.base_state()) == transaction`.
    /// Explicit result selections are structurally reconstructed here but are
    /// resolved against the result document only during atomic application.
    /// A host decoding untrusted requests must authorize or sanitize metadata:
    /// `HistoryIntent::Ignore` can clear both live history branches after a
    /// content commit, and `HistoryIntent::Merge` changes grouping behavior.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionCodecError`] for context misuse, an oversized or
    /// malformed record, unsupported format, schema/base mismatch, an operation
    /// limit, or failed checked reconstruction. JSON locations for nested raw
    /// payloads are local to the named payload rather than the outer envelope.
    pub fn decode(
        &self,
        json: &str,
        base: &EditorState,
    ) -> Result<Transaction, TransactionCodecError> {
        if base.context() != &self.context {
            return Err(TransactionCodecError::ContextConfigurationMismatch);
        }
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(TransactionCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedTransactionHeader<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::InvalidJson)?;
        if header.format != TRANSACTION_REQUEST_FORMAT {
            return Err(TransactionCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: TRANSACTION_REQUEST_FORMAT,
            });
        }
        if header.format_version != TRANSACTION_REQUEST_FORMAT_VERSION {
            return Err(TransactionCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: TRANSACTION_REQUEST_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedTransactionRequestV1<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        if &schema != self.context.schema().id() {
            return Err(TransactionCodecError::SchemaMismatch {
                expected: self.context.schema().id().clone(),
                found: schema,
            });
        }

        let snapshot = snapshot_id_from_raw(envelope.base_snapshot)?;
        if &snapshot != base.snapshot() {
            return Err(TransactionCodecError::BaseSnapshotMismatch {
                expected: base.snapshot().clone(),
                found: snapshot,
            });
        }

        let operation_count =
            preflight_operation_payloads(envelope.operations.get(), &self.context)
                .map_err(|error| JsonFailure::from_serde(&error))
                .map_err(TransactionCodecError::InvalidJson)?;
        let operation_maximum = self.context.max_operations_per_transaction();
        if operation_count > u64::from(operation_maximum) {
            return Err(TransactionCodecError::OperationLimit {
                actual: operation_count,
                maximum: operation_maximum,
            });
        }
        let operations =
            decode_operation_sequence(envelope.operations.get(), &self.context, operation_count)?;

        for payload in [
            envelope.selection_relocation,
            envelope.selection_update,
            envelope.pending_formats_update,
            envelope.metadata,
        ] {
            preflight_operation_payload(payload.get(), &self.context)
                .map_err(|error| JsonFailure::from_serde(&error))
                .map_err(TransactionCodecError::InvalidJson)?;
        }
        let selection_relocation: SelectionRelocationRecordV1 =
            decode_raw_record(envelope.selection_relocation)?;
        let selection_update: SelectionUpdateRecordV1 =
            decode_raw_record(envelope.selection_update)?;
        let pending_formats_update: PendingFormatsUpdateRecordV1 =
            decode_raw_record(envelope.pending_formats_update)?;
        let metadata: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;

        Ok(Transaction::from_parts(
            base.clone(),
            operations,
            decode_selection_relocation_v1(selection_relocation),
            decode_selection_update_v1(selection_update)?,
            decode_pending_formats_update_v1(pending_formats_update, &self.context)?,
            decode_transaction_metadata_v1(metadata)?,
        ))
    }

    /// Encodes one context-valid request into deterministic compact JSON.
    ///
    /// This stable Rust V1 representation is not a canonical content hash,
    /// durable commit/log record, signature, or exactly-once transport. History
    /// intent is behavior requested from a live session and must be authorized
    /// by a host before decoding untrusted requests into that session.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionCodecError`] when the base context differs, the
    /// request exceeds a semantic limit, an operation/state field fails static
    /// validation, serialization fails, or the result exceeds the decode budget.
    pub fn encode(&self, transaction: &Transaction) -> Result<String, TransactionCodecError> {
        if transaction.base_state().context() != &self.context {
            return Err(TransactionCodecError::ContextConfigurationMismatch);
        }
        let operation_count = usize_to_u64(transaction.operations().len());
        let operation_maximum = self.context.max_operations_per_transaction();
        if operation_count > u64::from(operation_maximum) {
            return Err(TransactionCodecError::OperationLimit {
                actual: operation_count,
                maximum: operation_maximum,
            });
        }

        let schema = self.context.schema().id();
        let snapshot = transaction.base_snapshot();
        let record = TransactionRequestRecordV1 {
            format: TRANSACTION_REQUEST_FORMAT.to_owned(),
            format_version: TRANSACTION_REQUEST_FORMAT_VERSION,
            schema: SchemaIdRecord {
                name: schema.name().as_str().to_owned(),
                version: schema.version().get(),
            },
            base_snapshot: SnapshotIdRecordV1 {
                lineage: snapshot.lineage().as_str().to_owned(),
                revision: DecimalU64Record::new(snapshot.revision().get()),
            },
            operations: OperationSequenceEncoding::new(transaction.operations(), &self.context),
            selection_relocation: encode_selection_relocation_v1(
                transaction.selection_relocation(),
            ),
            selection_update: encode_selection_update_v1(transaction.selection_update()),
            pending_formats_update: encode_pending_formats_update_v1(
                transaction.pending_formats_update(),
                &self.context,
            )?,
            metadata: encode_transaction_metadata_v1(transaction.metadata()),
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded {
            return Err(TransactionCodecError::OutputTooLarge {
                minimum: byte_counter.bytes,
                maximum,
            });
        }
        if let Some((operation_index, source)) = record.operations.take_validation_error() {
            return Err(TransactionCodecError::OperationValidation { operation_index, source });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::Encoding)
    }
}

struct OperationSequenceEncoding<'a> {
    operations: &'a [Operation],
    context: &'a EditorContext,
    validation_complete: Cell<bool>,
    validation_error: RefCell<Option<(u64, OperationValidationError)>>,
}

impl<'a> OperationSequenceEncoding<'a> {
    fn new(operations: &'a [Operation], context: &'a EditorContext) -> Self {
        Self {
            operations,
            context,
            validation_complete: Cell::new(false),
            validation_error: RefCell::new(None),
        }
    }

    fn take_validation_error(&self) -> Option<(u64, OperationValidationError)> {
        self.validation_error.borrow_mut().take()
    }
}

impl Serialize for OperationSequenceEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let validate = !self.validation_complete.get();
        let mut sequence = serializer.serialize_seq(Some(self.operations.len()))?;
        for (operation_index, operation) in self.operations.iter().enumerate() {
            if validate && let Err(source) = operation.validate(self.context) {
                *self.validation_error.borrow_mut() = Some((usize_to_u64(operation_index), source));
                return Err(<S::Error as serde::ser::Error>::custom(
                    "transaction operation validation failed",
                ));
            }
            sequence.serialize_element(&encode_operation_payload_v1(operation))?;
        }
        let result = sequence.end()?;
        if validate {
            self.validation_complete.set(true);
        }
        Ok(result)
    }
}

struct JsonByteCounter {
    bytes: usize,
    maximum: usize,
    exceeded: bool,
}

impl JsonByteCounter {
    const fn new(maximum: usize) -> Self {
        Self { bytes: 0, maximum, exceeded: false }
    }
}

impl io::Write for JsonByteCounter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if let Some(bytes) = self.bytes.checked_add(buffer.len()) {
            self.bytes = bytes;
        } else {
            self.bytes = usize::MAX;
            self.exceeded = true;
            return Err(io::Error::other("transaction JSON byte count overflowed"));
        }
        if self.bytes > self.maximum {
            self.exceeded = true;
            return Err(io::Error::other("transaction JSON byte budget exceeded"));
        }
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedTransactionHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedTransactionRequestV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: &'a RawValue,
    #[serde(borrow)]
    base_snapshot: &'a RawValue,
    #[serde(borrow)]
    operations: &'a RawValue,
    #[serde(borrow)]
    selection_relocation: &'a RawValue,
    #[serde(borrow)]
    selection_update: &'a RawValue,
    #[serde(borrow)]
    pending_formats_update: &'a RawValue,
    #[serde(borrow)]
    metadata: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecord<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, TransactionCodecError> {
    let record: BorrowedSchemaIdRecord<'_> = decode_raw_record(raw)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        TransactionCodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        TransactionCodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn snapshot_id_from_raw(raw: &RawValue) -> Result<SnapshotId, TransactionCodecError> {
    let record: BorrowedSnapshotIdRecord<'_> = decode_raw_record(raw)?;
    let lineage = LineageId::try_new(record.lineage.as_ref()).map_err(|error| {
        TransactionRecordError::new(
            TransactionRecordErrorCode::InvalidBaseLineage,
            TransactionRecordLocation::BaseLineage,
            error.to_string(),
        )
    })?;
    let revision =
        DecimalU64Record::try_from_decimal(record.revision.as_ref()).map_err(|error| {
            TransactionRecordError::new(
                TransactionRecordErrorCode::InvalidBaseRevision,
                TransactionRecordLocation::BaseRevision,
                error.to_string(),
            )
        })?;
    Ok(SnapshotId::new(lineage, Revision::new(revision.get())))
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, TransactionCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionCodecError::InvalidJson)
}

fn decode_operation_sequence(
    json: &str,
    context: &EditorContext,
    expected_count: u64,
) -> Result<Vec<Operation>, TransactionCodecError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded =
        OperationSequenceSeed { context, expected_count, deferred_error: &mut deferred_error }
            .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error.into_public());
    }
    let operations = decoded
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionCodecError::InvalidJson)?;
    deserializer
        .end()
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionCodecError::InvalidJson)?;
    Ok(operations)
}

struct OperationSequenceSeed<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    deferred_error: &'a mut Option<DeferredOperationError>,
}

impl<'de> DeserializeSeed<'de> for OperationSequenceSeed<'_> {
    type Value = Vec<Operation>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(OperationSequenceVisitor {
            context: self.context,
            expected_count: self.expected_count,
            deferred_error: self.deferred_error,
        })
    }
}

struct OperationSequenceVisitor<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    deferred_error: &'a mut Option<DeferredOperationError>,
}

impl<'de> Visitor<'de> for OperationSequenceVisitor<'_> {
    type Value = Vec<Operation>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a preflighted JSON array of operation payloads")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let capacity = initial_operation_capacity(self.expected_count);
        let mut operations = Vec::with_capacity(capacity);
        let mut operation_index = 0_u64;
        while let Some(raw) = sequence.next_element::<&'de RawValue>()? {
            let record: OperationRecordV1 = match serde_json::from_str(raw.get()) {
                Ok(record) => record,
                Err(error) => {
                    *self.deferred_error = Some(DeferredOperationError::Json {
                        operation_index,
                        source: JsonFailure::from_serde(&error),
                    });
                    return Err(A::Error::custom("transaction operation record is invalid"));
                }
            };
            let operation = match decode_operation_payload_v1(record) {
                Ok(operation) => operation,
                Err(source) => {
                    *self.deferred_error =
                        Some(DeferredOperationError::Record { operation_index, source });
                    return Err(A::Error::custom("transaction operation record is invalid"));
                }
            };
            if let Err(source) = operation.validate(self.context) {
                *self.deferred_error =
                    Some(DeferredOperationError::Validation { operation_index, source });
                return Err(A::Error::custom("transaction operation validation failed"));
            }
            operations.push(operation);
            operation_index = operation_index.saturating_add(1);
        }
        if operation_index != self.expected_count {
            return Err(A::Error::custom("transaction operation count changed after preflight"));
        }
        Ok(operations)
    }
}

enum DeferredOperationError {
    Json { operation_index: u64, source: JsonFailure },
    Record { operation_index: u64, source: OperationRecordError },
    Validation { operation_index: u64, source: OperationValidationError },
}

impl DeferredOperationError {
    fn into_public(self) -> TransactionCodecError {
        match self {
            Self::Json { operation_index, source } => {
                TransactionCodecError::InvalidOperationJson { operation_index, source }
            }
            Self::Record { operation_index, source } => {
                TransactionCodecError::InvalidOperation { operation_index, source }
            }
            Self::Validation { operation_index, source } => {
                TransactionCodecError::OperationValidation { operation_index, source }
            }
        }
    }
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn initial_operation_capacity(expected_count: u64) -> usize {
    usize::try_from(expected_count.min(MAX_INITIAL_OPERATION_CAPACITY)).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, io::Write as _};

    use serde::{Serialize, ser::SerializeSeq};

    use super::{JsonByteCounter, MAX_INITIAL_OPERATION_CAPACITY, initial_operation_capacity};

    #[test]
    fn untrusted_operation_count_cannot_drive_an_unbounded_initial_reservation() {
        assert_eq!(initial_operation_capacity(0), 0);
        assert_eq!(initial_operation_capacity(7), 7);
        assert_eq!(
            initial_operation_capacity(u64::MAX),
            usize::try_from(MAX_INITIAL_OPERATION_CAPACITY).unwrap_or(0)
        );
    }

    #[test]
    fn encoded_byte_count_overflow_is_distinct_from_the_exact_usize_maximum() {
        let mut counter =
            JsonByteCounter { bytes: usize::MAX, maximum: usize::MAX, exceeded: false };
        assert!(counter.write_all(&[0]).is_err());

        assert_eq!(counter.bytes, usize::MAX);
        assert!(counter.exceeded);
    }

    #[test]
    fn encoded_byte_counter_stops_at_the_first_over_budget_chunk() -> std::io::Result<()> {
        let mut counter = JsonByteCounter::new(3);
        counter.write_all(&[0, 1])?;
        assert!(counter.write_all(&[2, 3]).is_err());

        assert_eq!(counter.bytes, 4);
        assert!(counter.exceeded);
        Ok(())
    }

    #[test]
    fn over_budget_serialization_never_visits_later_sequence_items() {
        let visits = Cell::new(0_u32);
        let mut counter = JsonByteCounter::new(2);
        assert!(serde_json::to_writer(&mut counter, &VisitSequence(&visits)).is_err());

        assert!(counter.exceeded);
        assert_eq!(visits.get(), 1);
    }

    struct VisitSequence<'a>(&'a Cell<u32>);

    impl Serialize for VisitSequence<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            let mut sequence = serializer.serialize_seq(Some(10))?;
            for _ in 0..10 {
                self.0.set(self.0.get() + 1);
                sequence.serialize_element("payload")?;
            }
            sequence.end()
        }
    }
}
