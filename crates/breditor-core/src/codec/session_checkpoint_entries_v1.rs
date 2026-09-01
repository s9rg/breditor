use std::fmt;

use serde::{
    Deserialize,
    de::{DeserializeSeed, Error as _, SeqAccess, Visitor},
};
use serde_json::value::RawValue;

use crate::state::EditorContext;

use super::{
    JsonFailure,
    operation_preflight::{preflight_operation_payload, preflight_pending_formats_payload},
    operation_sequence_v1::{
        OperationSequenceDecodeError, OperationSequencePreflight, preflight_operation_sequence,
    },
};

const MAX_INITIAL_HISTORY_ENTRY_CAPACITY: u64 = 256;

pub(crate) struct PreflightedSessionHistoryEntry<'a> {
    pub(crate) raw: &'a RawValue,
    pub(crate) operations: OperationSequencePreflight,
}

pub(crate) enum SessionHistoryEntriesPreflightError {
    Json(JsonFailure),
    EntryJson { entry_index: u64, source: JsonFailure },
    EntryLimit { actual: u64, maximum: u32 },
    EmptyOperations { entry_index: u64 },
    Operations { entry_index: u64, source: OperationSequenceDecodeError },
    AggregateOperationLimit { actual: u64, maximum: u64 },
    AggregateOperationOverflow,
}

pub(crate) fn count_session_history_entries(
    json: &str,
    maximum: u32,
) -> Result<u64, SessionHistoryEntriesPreflightError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = SessionHistoryEntryCountSeed { maximum, deferred_error: &mut deferred_error }
        .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error);
    }
    let count = decoded.map_err(|error| {
        SessionHistoryEntriesPreflightError::Json(JsonFailure::from_serde(&error))
    })?;
    deserializer.end().map_err(|error| {
        SessionHistoryEntriesPreflightError::Json(JsonFailure::from_serde(&error))
    })?;
    Ok(count)
}

pub(crate) fn preflight_session_history_entries<'a>(
    json: &'a str,
    context: &EditorContext,
    expected_count: u64,
    maximum_operations: u64,
) -> Result<Vec<PreflightedSessionHistoryEntry<'a>>, SessionHistoryEntriesPreflightError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = SessionHistoryEntriesSeed {
        context,
        expected_count,
        maximum_operations,
        deferred_error: &mut deferred_error,
    }
    .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error);
    }
    let entries = decoded.map_err(|error| {
        SessionHistoryEntriesPreflightError::Json(JsonFailure::from_serde(&error))
    })?;
    deserializer.end().map_err(|error| {
        SessionHistoryEntriesPreflightError::Json(JsonFailure::from_serde(&error))
    })?;
    Ok(entries)
}

struct SessionHistoryEntryCountSeed<'a> {
    maximum: u32,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightError>,
}

impl<'de> DeserializeSeed<'de> for SessionHistoryEntryCountSeed<'_> {
    type Value = u64;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(SessionHistoryEntryCountVisitor {
            maximum: self.maximum,
            deferred_error: self.deferred_error,
        })
    }
}

struct SessionHistoryEntryCountVisitor<'a> {
    maximum: u32,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightError>,
}

impl<'de> Visitor<'de> for SessionHistoryEntryCountVisitor<'_> {
    type Value = u64;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded JSON array of session history entries")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut count = 0_u64;
        while sequence.next_element::<&'de RawValue>()?.is_some() {
            let Some(next_count) = count.checked_add(1) else {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightError::EntryLimit {
                    actual: u64::MAX,
                    maximum: self.maximum,
                });
                return Err(A::Error::custom("session history entry count overflowed"));
            };
            count = next_count;
            if count > u64::from(self.maximum) {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightError::EntryLimit {
                    actual: count,
                    maximum: self.maximum,
                });
                return Err(A::Error::custom("session history entry limit exceeded"));
            }
        }
        Ok(count)
    }
}

struct SessionHistoryEntriesSeed<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    maximum_operations: u64,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightError>,
}

impl<'de> DeserializeSeed<'de> for SessionHistoryEntriesSeed<'_> {
    type Value = Vec<PreflightedSessionHistoryEntry<'de>>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(SessionHistoryEntriesVisitor {
            context: self.context,
            expected_count: self.expected_count,
            maximum_operations: self.maximum_operations,
            deferred_error: self.deferred_error,
        })
    }
}

struct SessionHistoryEntriesVisitor<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    maximum_operations: u64,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightError>,
}

impl<'de> Visitor<'de> for SessionHistoryEntriesVisitor<'_> {
    type Value = Vec<PreflightedSessionHistoryEntry<'de>>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a counted JSON array of session history entries")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let capacity = initial_history_entry_capacity(self.expected_count);
        let mut entries = Vec::with_capacity(capacity);
        let mut entry_index = 0_u64;
        let mut aggregate_operations = 0_u64;
        while let Some(raw) = sequence.next_element::<&'de RawValue>()? {
            if entry_index >= self.expected_count {
                return Err(A::Error::custom("session history entry count changed"));
            }
            let record: BorrowedSessionHistoryEntryRecordV1<'de> =
                match serde_json::from_str(raw.get()) {
                    Ok(record) => record,
                    Err(error) => {
                        *self.deferred_error =
                            Some(SessionHistoryEntriesPreflightError::EntryJson {
                                entry_index,
                                source: JsonFailure::from_serde(&error),
                            });
                        return Err(A::Error::custom("session history entry is invalid"));
                    }
                };
            let operations =
                match preflight_operation_sequence(record.forward_operations.get(), self.context) {
                    Ok(operations) => operations,
                    Err(source) => {
                        *self.deferred_error =
                            Some(SessionHistoryEntriesPreflightError::Operations {
                                entry_index,
                                source,
                            });
                        return Err(A::Error::custom("session history operations are invalid"));
                    }
                };
            let operation_count = operations.operation_count();
            if operation_count == 0 {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightError::EmptyOperations { entry_index });
                return Err(A::Error::custom("session history entry is empty"));
            }
            let Some(next_aggregate) = aggregate_operations.checked_add(operation_count) else {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightError::AggregateOperationOverflow);
                return Err(A::Error::custom("session history operation count overflowed"));
            };
            aggregate_operations = next_aggregate;
            if aggregate_operations > self.maximum_operations {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightError::AggregateOperationLimit {
                        actual: aggregate_operations,
                        maximum: self.maximum_operations,
                    });
                return Err(A::Error::custom("session history operation limit exceeded"));
            }
            if let Err(error) =
                preflight_operation_payload(record.result_selection.get(), self.context)
            {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightError::EntryJson {
                    entry_index,
                    source: JsonFailure::from_serde(&error),
                });
                return Err(A::Error::custom("session history result selection is invalid"));
            }
            if let Err(error) =
                preflight_pending_formats_payload(record.result_pending_formats.get(), self.context)
            {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightError::EntryJson {
                    entry_index,
                    source: JsonFailure::from_serde(&error),
                });
                return Err(A::Error::custom("session history result formats are invalid"));
            }
            entries.push(PreflightedSessionHistoryEntry { raw, operations });
            entry_index += 1;
        }
        if entry_index != self.expected_count {
            return Err(A::Error::custom("session history entry count changed"));
        }
        Ok(entries)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct BorrowedSessionHistoryEntryRecordV1<'a> {
    #[serde(borrow)]
    pub(crate) forward_operations: &'a RawValue,
    #[serde(borrow)]
    pub(crate) result_selection: &'a RawValue,
    #[serde(borrow)]
    pub(crate) result_pending_formats: &'a RawValue,
}

fn initial_history_entry_capacity(expected_count: u64) -> usize {
    usize::try_from(expected_count.min(MAX_INITIAL_HISTORY_ENTRY_CAPACITY)).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{MAX_INITIAL_HISTORY_ENTRY_CAPACITY, initial_history_entry_capacity};

    #[test]
    fn untrusted_entry_count_cannot_drive_an_unbounded_initial_reservation() {
        assert_eq!(initial_history_entry_capacity(0), 0);
        assert_eq!(initial_history_entry_capacity(7), 7);
        assert_eq!(
            initial_history_entry_capacity(u64::MAX),
            usize::try_from(MAX_INITIAL_HISTORY_ENTRY_CAPACITY).unwrap_or(0)
        );
    }
}
