use std::{
    cell::{Cell, RefCell},
    fmt,
};

use serde::{
    Serialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
    ser::SerializeSeq,
};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationRecordError},
    operation::{Operation, OperationValidationError},
    record::OperationRecordV1,
    state::EditorContext,
};

use super::{
    operation_payload_v1::{decode_operation_payload_v1, encode_operation_payload_v1},
    operation_preflight::preflight_operation_payloads,
};

const MAX_INITIAL_OPERATION_CAPACITY: u64 = 256;

pub(crate) struct OperationSequenceEncoding<'a> {
    operations: &'a [Operation],
    context: &'a EditorContext,
    validation_complete: Cell<bool>,
    validation_error: RefCell<Option<IndexedOperationValidationError>>,
}

impl<'a> OperationSequenceEncoding<'a> {
    pub(crate) fn new(operations: &'a [Operation], context: &'a EditorContext) -> Self {
        Self {
            operations,
            context,
            validation_complete: Cell::new(false),
            validation_error: RefCell::new(None),
        }
    }

    pub(crate) fn take_validation_error(&self) -> Option<IndexedOperationValidationError> {
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
                *self.validation_error.borrow_mut() = Some(IndexedOperationValidationError {
                    operation_index: usize_to_u64(operation_index),
                    source,
                });
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

pub(crate) struct IndexedOperationValidationError {
    pub(crate) operation_index: u64,
    pub(crate) source: OperationValidationError,
}

#[derive(Clone, Copy)]
pub(crate) struct OperationSequenceLimitError {
    pub(crate) actual: u64,
    pub(crate) maximum: u32,
}

pub(crate) enum OperationSequenceDecodeError {
    Json(JsonFailure),
    Limit(OperationSequenceLimitError),
    OperationJson { operation_index: u64, source: JsonFailure },
    OperationRecord { operation_index: u64, source: OperationRecordError },
    OperationValidation(IndexedOperationValidationError),
}

#[derive(Clone, Copy)]
pub(crate) struct OperationSequencePreflight {
    expected_count: u64,
}

pub(crate) fn validate_operation_sequence_count(
    operations: &[Operation],
    context: &EditorContext,
) -> Result<(), OperationSequenceLimitError> {
    validate_operation_count(usize_to_u64(operations.len()), context)
}

pub(crate) fn preflight_operation_sequence(
    json: &str,
    context: &EditorContext,
) -> Result<OperationSequencePreflight, OperationSequenceDecodeError> {
    let operation_count = preflight_operation_payloads(json, context)
        .map_err(|error| OperationSequenceDecodeError::Json(JsonFailure::from_serde(&error)))?;
    validate_operation_count(operation_count, context)
        .map_err(OperationSequenceDecodeError::Limit)?;
    Ok(OperationSequencePreflight { expected_count: operation_count })
}

fn validate_operation_count(
    actual: u64,
    context: &EditorContext,
) -> Result<(), OperationSequenceLimitError> {
    let maximum = context.max_operations_per_transaction();
    if actual > u64::from(maximum) {
        return Err(OperationSequenceLimitError { actual, maximum });
    }
    Ok(())
}

pub(crate) fn decode_operation_sequence(
    json: &str,
    context: &EditorContext,
    preflight: OperationSequencePreflight,
) -> Result<Vec<Operation>, OperationSequenceDecodeError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = OperationSequenceSeed {
        context,
        expected_count: preflight.expected_count,
        deferred_error: &mut deferred_error,
    }
    .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error.into_public());
    }
    let operations = decoded
        .map_err(|error| OperationSequenceDecodeError::Json(JsonFailure::from_serde(&error)))?;
    deserializer
        .end()
        .map_err(|error| OperationSequenceDecodeError::Json(JsonFailure::from_serde(&error)))?;
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
                    Some(DeferredOperationError::Validation(IndexedOperationValidationError {
                        operation_index,
                        source,
                    }));
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
    Validation(IndexedOperationValidationError),
}

impl DeferredOperationError {
    fn into_public(self) -> OperationSequenceDecodeError {
        match self {
            Self::Json { operation_index, source } => {
                OperationSequenceDecodeError::OperationJson { operation_index, source }
            }
            Self::Record { operation_index, source } => {
                OperationSequenceDecodeError::OperationRecord { operation_index, source }
            }
            Self::Validation(error) => OperationSequenceDecodeError::OperationValidation(error),
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
    use std::cell::Cell;

    use serde::{Serialize, ser::SerializeSeq};

    use super::{MAX_INITIAL_OPERATION_CAPACITY, initial_operation_capacity};
    use crate::codec::json_size::JsonByteCounter;

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
    fn over_budget_serialization_never_visits_later_sequence_items() {
        let visits = Cell::new(0_u32);
        let mut counter = JsonByteCounter::new(2);
        assert!(serde_json::to_writer(&mut counter, &VisitSequence(&visits)).is_err());

        assert!(counter.exceeded());
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
