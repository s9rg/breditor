//! Streaming property-preserving operation-sequence boundaries.

use std::{cell::RefCell, fmt};

use serde::{
    Serialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
    ser::SerializeSeq,
};
use serde_json::value::RawValue;

use crate::{
    codec::{JsonFailure, OperationRecordError},
    operation::Operation,
    record::OperationRecordV2,
    state::EditorContext,
};

use super::{
    operation_payload_v2::{decode_operation_payload_v2, encode_operation_payload_v2},
    operation_preflight_v2::preflight_operation_payloads_v2,
    operation_sequence_v1::{IndexedOperationValidationError, OperationSequenceLimitError},
};

const MAX_INITIAL_OPERATION_CAPACITY: u64 = 256;

/// Borrowed serializer for one property-preserving operation array.
pub(crate) struct OperationSequenceEncodingV2<'a> {
    operations: &'a [Operation],
    context: &'a EditorContext,
    validation_error: RefCell<Option<IndexedOperationValidationError>>,
}

impl<'a> OperationSequenceEncodingV2<'a> {
    pub(crate) fn new(operations: &'a [Operation], context: &'a EditorContext) -> Self {
        Self { operations, context, validation_error: RefCell::new(None) }
    }

    pub(crate) fn take_validation_error(&self) -> Option<IndexedOperationValidationError> {
        self.validation_error.borrow_mut().take()
    }
}

impl Serialize for OperationSequenceEncodingV2<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.operations.len()))?;
        for (operation_index, operation) in self.operations.iter().enumerate() {
            if let Err(source) = operation.validate(self.context) {
                *self.validation_error.borrow_mut() = Some(IndexedOperationValidationError {
                    operation_index: usize_to_u64(operation_index),
                    source,
                });
                return Err(<S::Error as serde::ser::Error>::custom(
                    "transaction V3 operation validation failed",
                ));
            }
            sequence.serialize_element(&encode_operation_payload_v2(operation))?;
        }
        sequence.end()
    }
}

pub(crate) enum OperationSequenceDecodeErrorV2 {
    Json(JsonFailure),
    Limit(OperationSequenceLimitError),
    OperationJson { operation_index: u64, source: JsonFailure },
    OperationRecord { operation_index: u64, source: OperationRecordError },
    OperationValidation(IndexedOperationValidationError),
}

#[derive(Clone, Copy)]
pub(crate) struct OperationSequencePreflightV2 {
    expected_count: u64,
}

impl OperationSequencePreflightV2 {
    /// Returns the operation count established by allocation preflight.
    pub(crate) const fn operation_count(self) -> u64 {
        self.expected_count
    }
}

pub(crate) fn preflight_operation_sequence_v2(
    json: &str,
    context: &EditorContext,
) -> Result<OperationSequencePreflightV2, OperationSequenceDecodeErrorV2> {
    let operation_count = preflight_operation_payloads_v2(json, context)
        .map_err(|error| OperationSequenceDecodeErrorV2::Json(JsonFailure::from_serde(&error)))?;
    validate_operation_sequence_count_for_v2(operation_count, context)
        .map_err(OperationSequenceDecodeErrorV2::Limit)?;
    Ok(OperationSequencePreflightV2 { expected_count: operation_count })
}

fn validate_operation_sequence_count_for_v2(
    actual: u64,
    context: &EditorContext,
) -> Result<(), OperationSequenceLimitError> {
    let maximum = context.max_operations_per_transaction();
    if actual > u64::from(maximum) {
        Err(OperationSequenceLimitError { actual, maximum })
    } else {
        Ok(())
    }
}

pub(crate) fn decode_operation_sequence_v2(
    json: &str,
    context: &EditorContext,
    preflight: OperationSequencePreflightV2,
) -> Result<Vec<Operation>, OperationSequenceDecodeErrorV2> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = OperationSequenceSeedV2 {
        context,
        expected_count: preflight.expected_count,
        deferred_error: &mut deferred_error,
    }
    .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error.into_public());
    }
    let operations = decoded
        .map_err(|error| OperationSequenceDecodeErrorV2::Json(JsonFailure::from_serde(&error)))?;
    deserializer
        .end()
        .map_err(|error| OperationSequenceDecodeErrorV2::Json(JsonFailure::from_serde(&error)))?;
    Ok(operations)
}

struct OperationSequenceSeedV2<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    deferred_error: &'a mut Option<DeferredOperationErrorV2>,
}

impl<'de> DeserializeSeed<'de> for OperationSequenceSeedV2<'_> {
    type Value = Vec<Operation>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(OperationSequenceVisitorV2 {
            context: self.context,
            expected_count: self.expected_count,
            deferred_error: self.deferred_error,
        })
    }
}

struct OperationSequenceVisitorV2<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    deferred_error: &'a mut Option<DeferredOperationErrorV2>,
}

impl<'de> Visitor<'de> for OperationSequenceVisitorV2<'_> {
    type Value = Vec<Operation>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a preflighted JSON array of property-preserving operation payloads")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let capacity = initial_operation_capacity(self.expected_count);
        let mut operations = Vec::with_capacity(capacity);
        let mut operation_index = 0_u64;
        while let Some(raw) = sequence.next_element::<&'de RawValue>()? {
            let record: OperationRecordV2 = match serde_json::from_str(raw.get()) {
                Ok(record) => record,
                Err(error) => {
                    *self.deferred_error = Some(DeferredOperationErrorV2::Json {
                        operation_index,
                        source: JsonFailure::from_serde(&error),
                    });
                    return Err(A::Error::custom("transaction V3 operation record is invalid"));
                }
            };
            let operation = match decode_operation_payload_v2(record) {
                Ok(operation) => operation,
                Err(source) => {
                    *self.deferred_error =
                        Some(DeferredOperationErrorV2::Record { operation_index, source });
                    return Err(A::Error::custom("transaction V3 operation record is invalid"));
                }
            };
            if let Err(source) = operation.validate(self.context) {
                *self.deferred_error =
                    Some(DeferredOperationErrorV2::Validation(IndexedOperationValidationError {
                        operation_index,
                        source,
                    }));
                return Err(A::Error::custom("transaction V3 operation validation failed"));
            }
            operations.push(operation);
            operation_index = operation_index.saturating_add(1);
        }
        if operation_index != self.expected_count {
            return Err(A::Error::custom("transaction V3 operation count changed after preflight"));
        }
        Ok(operations)
    }
}

enum DeferredOperationErrorV2 {
    Json { operation_index: u64, source: JsonFailure },
    Record { operation_index: u64, source: OperationRecordError },
    Validation(IndexedOperationValidationError),
}

impl DeferredOperationErrorV2 {
    fn into_public(self) -> OperationSequenceDecodeErrorV2 {
        match self {
            Self::Json { operation_index, source } => {
                OperationSequenceDecodeErrorV2::OperationJson { operation_index, source }
            }
            Self::Record { operation_index, source } => {
                OperationSequenceDecodeErrorV2::OperationRecord { operation_index, source }
            }
            Self::Validation(error) => OperationSequenceDecodeErrorV2::OperationValidation(error),
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
    use super::{MAX_INITIAL_OPERATION_CAPACITY, initial_operation_capacity};

    #[test]
    fn untrusted_count_cannot_drive_an_unbounded_initial_reservation() {
        assert_eq!(initial_operation_capacity(0), 0);
        assert_eq!(initial_operation_capacity(7), 7);
        assert_eq!(
            initial_operation_capacity(u64::MAX),
            usize::try_from(MAX_INITIAL_OPERATION_CAPACITY).unwrap_or(0)
        );
    }
}
