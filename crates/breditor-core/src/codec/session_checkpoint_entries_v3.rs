//! Bounded count admission and editor-value preflight for structural history.

use std::fmt;

use serde::de::{DeserializeSeed, Error as _, SeqAccess, Visitor};
use serde_json::value::RawValue;

use crate::state::EditorContext;

use super::{
    JsonFailure,
    editor_value_preflight_v2::preflight_pending_format_records_v2,
    operation_preflight::preflight_operation_payload,
    operation_sequence_v3::{OperationSequenceErrorV3, count_operation_sequence_v3},
    session_checkpoint_entries_v2::BorrowedSessionHistoryEntryRecordV2,
};

const MAX_INITIAL_HISTORY_ENTRY_CAPACITY: u64 = 256;

/// One borrowed, count-admitted V4 history entry.
pub(crate) struct PreflightedSessionHistoryEntryV3<'a> {
    pub(crate) raw: &'a RawValue,
    pub(crate) operations: u64,
}

/// Failure encountered before constructing or replaying an owned V4 history chain.
pub(crate) enum SessionHistoryEntriesPreflightErrorV3 {
    Json(JsonFailure),
    EntryJson { entry_index: u64, source: JsonFailure },
    EmptyOperations { entry_index: u64 },
    Operations { entry_index: u64, source: OperationSequenceErrorV3 },
    AggregateOperationLimit { actual: u64, maximum: u64 },
    AggregateOperationOverflow,
}

/// Counts every entry's operations and preflights editor values before replay.
/// Operation payloads are individually preflighted when decoded. Aggregate
/// counts are admitted before any owned operation or history boundary exists.
pub(crate) fn preflight_session_history_entries_v3<'a>(
    json: &'a str,
    context: &EditorContext,
    expected_count: u64,
    maximum_operations: u64,
) -> Result<Vec<PreflightedSessionHistoryEntryV3<'a>>, SessionHistoryEntriesPreflightErrorV3> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = SessionHistoryEntriesSeedV3 {
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
        SessionHistoryEntriesPreflightErrorV3::Json(JsonFailure::from_serde(&error))
    })?;
    deserializer.end().map_err(|error| {
        SessionHistoryEntriesPreflightErrorV3::Json(JsonFailure::from_serde(&error))
    })?;
    Ok(entries)
}

struct SessionHistoryEntriesSeedV3<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    maximum_operations: u64,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightErrorV3>,
}

impl<'de> DeserializeSeed<'de> for SessionHistoryEntriesSeedV3<'_> {
    type Value = Vec<PreflightedSessionHistoryEntryV3<'de>>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(SessionHistoryEntriesVisitorV3 {
            context: self.context,
            expected_count: self.expected_count,
            maximum_operations: self.maximum_operations,
            deferred_error: self.deferred_error,
        })
    }
}

struct SessionHistoryEntriesVisitorV3<'a> {
    context: &'a EditorContext,
    expected_count: u64,
    maximum_operations: u64,
    deferred_error: &'a mut Option<SessionHistoryEntriesPreflightErrorV3>,
}

impl<'de> Visitor<'de> for SessionHistoryEntriesVisitorV3<'_> {
    type Value = Vec<PreflightedSessionHistoryEntryV3<'de>>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a counted JSON array of property-preserving history entries")
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
            let record: BorrowedSessionHistoryEntryRecordV2<'de> =
                match serde_json::from_str(raw.get()) {
                    Ok(record) => record,
                    Err(error) => {
                        *self.deferred_error =
                            Some(SessionHistoryEntriesPreflightErrorV3::EntryJson {
                                entry_index,
                                source: JsonFailure::from_serde(&error),
                            });
                        return Err(A::Error::custom("session history entry is invalid"));
                    }
                };
            let operations = match count_operation_sequence_v3(
                record.forward_operations.get(),
                self.context.max_operations_per_transaction(),
            ) {
                Ok(operations) => operations,
                Err(source) => {
                    *self.deferred_error =
                        Some(SessionHistoryEntriesPreflightErrorV3::Operations {
                            entry_index,
                            source,
                        });
                    return Err(A::Error::custom("session history operations are invalid"));
                }
            };
            let operation_count = operations;
            if operation_count == 0 {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightErrorV3::EmptyOperations { entry_index });
                return Err(A::Error::custom("session history entry is empty"));
            }
            let Some(next_aggregate) = aggregate_operations.checked_add(operation_count) else {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightErrorV3::AggregateOperationOverflow);
                return Err(A::Error::custom("session history operation count overflowed"));
            };
            aggregate_operations = next_aggregate;
            if aggregate_operations > self.maximum_operations {
                *self.deferred_error =
                    Some(SessionHistoryEntriesPreflightErrorV3::AggregateOperationLimit {
                        actual: aggregate_operations,
                        maximum: self.maximum_operations,
                    });
                return Err(A::Error::custom("session history operation limit exceeded"));
            }
            if let Err(error) =
                preflight_operation_payload(record.result_selection.get(), self.context)
            {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightErrorV3::EntryJson {
                    entry_index,
                    source: JsonFailure::from_serde(&error),
                });
                return Err(A::Error::custom("session history result selection is invalid"));
            }
            if let Err(error) = preflight_pending_format_records_v2(
                record.result_pending_formats.get(),
                self.context,
            ) {
                *self.deferred_error = Some(SessionHistoryEntriesPreflightErrorV3::EntryJson {
                    entry_index,
                    source: JsonFailure::from_serde(&error),
                });
                return Err(A::Error::custom("session history result formats are invalid"));
            }
            entries.push(PreflightedSessionHistoryEntryV3 { raw, operations });
            entry_index = entry_index.saturating_add(1);
        }
        if entry_index != self.expected_count {
            return Err(A::Error::custom("session history entry count changed"));
        }
        Ok(entries)
    }
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
