//! Bounded arrays of experimental structural operation payloads.

use super::{
    JsonFailure, OperationV5CodecError,
    operation_payload_v4::{OperationPayloadEncodingV4, decode_operation_payload_v4},
    operation_sequence_v1::OperationSequenceLimitError,
};
use crate::{operation::Operation, state::EditorContext};
use serde::{
    Serialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
    ser::SerializeSeq,
};
use serde_json::value::RawValue;
use std::{cell::RefCell, fmt};

pub(super) struct IndexedOperationCodecErrorV5 {
    pub(super) operation_index: u64,
    pub(super) source: Box<OperationV5CodecError>,
}

pub(super) enum OperationSequenceErrorV4 {
    Json(JsonFailure),
    Limit(OperationSequenceLimitError),
    Payload(IndexedOperationCodecErrorV5),
}

/// Counts borrowed raw items before reconstructing any operation. A first
/// excess item establishes a count lower bound and is never materialized.
pub(super) fn count_operation_sequence_v4(
    json: &str,
    maximum: u32,
) -> Result<u64, OperationSequenceErrorV4> {
    let mut excess = None;
    let mut decoder = serde_json::Deserializer::from_str(json);
    let count = CountSeed { maximum, excess: &mut excess }.deserialize(&mut decoder);
    if let Some(error) = excess {
        return Err(OperationSequenceErrorV4::Limit(error));
    }
    let count = count.map_err(|error| json_error(&error))?;
    decoder.end().map_err(|error| json_error(&error))?;
    Ok(count)
}

struct CountSeed<'a> {
    maximum: u32,
    excess: &'a mut Option<OperationSequenceLimitError>,
}
impl<'de> DeserializeSeed<'de> for CountSeed<'_> {
    type Value = u64;
    fn deserialize<D>(self, decoder: D) -> Result<u64, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        decoder.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for CountSeed<'_> {
    type Value = u64;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded operation array")
    }
    fn visit_seq<A>(self, mut sequence: A) -> Result<u64, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut count = 0_u64;
        while sequence.next_element::<&RawValue>()?.is_some() {
            count += 1; // At most u32::MAX + 1; the check below stops scanning.
            if count > u64::from(self.maximum) {
                *self.excess =
                    Some(OperationSequenceLimitError { actual: count, maximum: self.maximum });
                return Err(A::Error::custom("operation count exceeds host policy"));
            }
        }
        Ok(count)
    }
}

/// Every individual source/result fragment gets its ordinary context limits.
/// Combined retention is bounded by the outer JSON bytes and operation count;
/// a request may describe sequential edits whose sum exceeds one document.
pub(super) fn decode_operation_sequence_v4(
    json: &str,
    context: &EditorContext,
    expected_count: u64,
) -> Result<Vec<Operation>, OperationSequenceErrorV4> {
    let mut failure = None;
    let mut decoder = serde_json::Deserializer::from_str(json);
    let operations =
        DecodeSeed { context, expected_count, failure: &mut failure }.deserialize(&mut decoder);
    if let Some(error) = failure {
        return Err(OperationSequenceErrorV4::Payload(error));
    }
    let operations = operations.map_err(|error| json_error(&error))?;
    decoder.end().map_err(|error| json_error(&error))?;
    Ok(operations)
}

struct DecodeSeed<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    failure: &'a mut Option<IndexedOperationCodecErrorV5>,
}
impl<'de> DeserializeSeed<'de> for DecodeSeed<'_> {
    type Value = Vec<Operation>;
    fn deserialize<D>(self, decoder: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        decoder.deserialize_seq(self)
    }
}
impl<'de> Visitor<'de> for DecodeSeed<'_> {
    type Value = Vec<Operation>;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a counted array of structural operation payloads")
    }
    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let capacity = usize::try_from(self.expected_count.min(256)).unwrap_or(0);
        let mut operations = Vec::with_capacity(capacity);
        let mut operation_index = 0_u64;
        while let Some(raw) = sequence.next_element::<&RawValue>()? {
            if operation_index >= self.expected_count
                || operation_index >= u64::from(self.context.max_operations_per_transaction())
            {
                return Err(A::Error::custom("operation count changed after admission"));
            }
            let operation =
                decode_operation_payload_v4(raw.get(), self.context).and_then(|operation| {
                    operation.validate(self.context)?;
                    Ok(operation)
                });
            match operation {
                Ok(operation) => operations.push(operation),
                Err(source) => {
                    *self.failure = Some(IndexedOperationCodecErrorV5 {
                        operation_index,
                        source: Box::new(source),
                    });
                    return Err(A::Error::custom("invalid structural operation payload"));
                }
            }
            operation_index += 1;
        }
        if operation_index != self.expected_count {
            return Err(A::Error::custom("operation count changed after admission"));
        }
        Ok(operations)
    }
}

pub(super) struct OperationSequenceEncodingV4<'a> {
    operations: &'a [Operation],
    context: &'a EditorContext,
    error: RefCell<Option<IndexedOperationCodecErrorV5>>,
}
impl<'a> OperationSequenceEncodingV4<'a> {
    pub(super) fn new(operations: &'a [Operation], context: &'a EditorContext) -> Self {
        Self { operations, context, error: RefCell::new(None) }
    }
    pub(super) fn take_error(&self) -> Option<IndexedOperationCodecErrorV5> {
        self.error.borrow_mut().take()
    }
}
impl Serialize for OperationSequenceEncodingV4<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.operations.len()))?;
        for (index, operation) in self.operations.iter().enumerate() {
            let payload = match OperationPayloadEncodingV4::try_new(operation, self.context) {
                Ok(payload) => payload,
                Err(source) => {
                    *self.error.borrow_mut() = Some(IndexedOperationCodecErrorV5 {
                        operation_index: u64::try_from(index).unwrap_or(u64::MAX),
                        source: Box::new(source),
                    });
                    return Err(serde::ser::Error::custom("invalid structural operation payload"));
                }
            };
            sequence.serialize_element(&payload)?;
        }
        sequence.end()
    }
}

fn json_error(error: &serde_json::Error) -> OperationSequenceErrorV4 {
    OperationSequenceErrorV4::Json(JsonFailure::from_serde(error))
}
