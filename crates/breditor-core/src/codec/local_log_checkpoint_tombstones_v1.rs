use std::{
    collections::{BTreeMap, btree_map::Entry},
    fmt,
};

use serde::de::{DeserializeSeed, Error as _, SeqAccess, Visitor};
use serde_json::value::RawValue;

use crate::local_log::{LocalLogSequence, MAX_LOCAL_LOG_IDENTITY_BYTES, ReplayId};

use super::{
    BoundedDiagnostic, JsonFailure, LocalLogCheckpointCodecError, LocalLogCheckpointRecordError,
    LocalLogCheckpointRecordErrorCode, LocalLogCheckpointRecordLocation,
    LocalLogCheckpointResourceLimit, LocalLogCheckpointTopologyError,
};

const MAX_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;

pub(crate) fn count_replay_tombstones(
    json: &str,
    maximum: u64,
) -> Result<u64, LocalLogCheckpointCodecError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = ReplayTombstoneCountSeed { maximum, deferred_error: &mut deferred_error }
        .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error);
    }
    let count = decoded
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointCodecError::InvalidJson)?;
    deserializer
        .end()
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointCodecError::InvalidJson)?;
    Ok(count)
}

pub(crate) fn decode_replay_tombstones(
    json: &str,
    expected_count: u64,
) -> Result<BTreeMap<ReplayId, LocalLogSequence>, LocalLogCheckpointCodecError> {
    let mut deferred_error = None;
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let decoded = ReplayTombstonesSeed { expected_count, deferred_error: &mut deferred_error }
        .deserialize(&mut deserializer);
    if let Some(error) = deferred_error {
        return Err(error);
    }
    let tombstones = decoded
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointCodecError::InvalidJson)?;
    deserializer
        .end()
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointCodecError::InvalidJson)?;
    Ok(tombstones)
}

struct ReplayTombstoneCountSeed<'a> {
    maximum: u64,
    deferred_error: &'a mut Option<LocalLogCheckpointCodecError>,
}

impl<'de> DeserializeSeed<'de> for ReplayTombstoneCountSeed<'_> {
    type Value = u64;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(ReplayTombstoneCountVisitor {
            maximum: self.maximum,
            deferred_error: self.deferred_error,
        })
    }
}

struct ReplayTombstoneCountVisitor<'a> {
    maximum: u64,
    deferred_error: &'a mut Option<LocalLogCheckpointCodecError>,
}

impl<'de> Visitor<'de> for ReplayTombstoneCountVisitor<'_> {
    type Value = u64;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded JSON array of replay tombstones")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut count = 0_u64;
        while sequence.next_element::<&'de RawValue>()?.is_some() {
            let Some(next_count) = count.checked_add(1) else {
                *self.deferred_error = Some(
                    LocalLogCheckpointResourceLimit::ReplayTombstones {
                        actual: u64::MAX,
                        maximum: self.maximum,
                    }
                    .into(),
                );
                return Err(A::Error::custom("replay tombstone count overflowed"));
            };
            count = next_count;
            if count > self.maximum {
                *self.deferred_error = Some(
                    LocalLogCheckpointResourceLimit::ReplayTombstones {
                        actual: count,
                        maximum: self.maximum,
                    }
                    .into(),
                );
                return Err(A::Error::custom("replay tombstone limit exceeded"));
            }
        }
        Ok(count)
    }
}

struct ReplayTombstonesSeed<'a> {
    expected_count: u64,
    deferred_error: &'a mut Option<LocalLogCheckpointCodecError>,
}

impl<'de> DeserializeSeed<'de> for ReplayTombstonesSeed<'_> {
    type Value = BTreeMap<ReplayId, LocalLogSequence>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(ReplayTombstonesVisitor {
            expected_count: self.expected_count,
            deferred_error: self.deferred_error,
        })
    }
}

struct ReplayTombstonesVisitor<'a> {
    expected_count: u64,
    deferred_error: &'a mut Option<LocalLogCheckpointCodecError>,
}

impl<'de> Visitor<'de> for ReplayTombstonesVisitor<'_> {
    type Value = BTreeMap<ReplayId, LocalLogSequence>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a counted JSON array of replay identity strings")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut tombstones = BTreeMap::new();
        let mut tombstone_index = 0_u64;
        while let Some(raw) = sequence.next_element::<&'de RawValue>()? {
            if tombstone_index >= self.expected_count {
                return Err(A::Error::custom("replay tombstone count changed"));
            }
            if !raw.get().trim_start().starts_with('"')
                && let Err(error) = serde_json::from_str::<String>(raw.get())
            {
                *self.deferred_error =
                    Some(LocalLogCheckpointCodecError::InvalidReplayTombstoneJson {
                        tombstone_index,
                        source: JsonFailure::from_serde(&error),
                    });
                return Err(A::Error::custom("replay tombstone is not a JSON string"));
            }
            if raw.get().len() > MAX_IDENTITY_STRING_JSON_BYTES {
                *self.deferred_error = Some(
                    LocalLogCheckpointRecordError::new(
                        LocalLogCheckpointRecordErrorCode::InvalidReplayId,
                        LocalLogCheckpointRecordLocation::ReplayTombstone { tombstone_index },
                        "encoded replay ID exceeds its maximum JSON string representation",
                    )
                    .into(),
                );
                return Err(A::Error::custom("encoded replay identity is oversized"));
            }
            let value = match serde_json::from_str::<String>(raw.get()) {
                Ok(value) => value,
                Err(error) => {
                    *self.deferred_error =
                        Some(LocalLogCheckpointCodecError::InvalidReplayTombstoneJson {
                            tombstone_index,
                            source: JsonFailure::from_serde(&error),
                        });
                    return Err(A::Error::custom("replay tombstone is invalid JSON"));
                }
            };
            let replay_id = match ReplayId::try_new(value) {
                Ok(replay_id) => replay_id,
                Err(error) => {
                    *self.deferred_error = Some(
                        LocalLogCheckpointRecordError::new(
                            LocalLogCheckpointRecordErrorCode::InvalidReplayId,
                            LocalLogCheckpointRecordLocation::ReplayTombstone { tombstone_index },
                            error.to_string(),
                        )
                        .into(),
                    );
                    return Err(A::Error::custom("replay tombstone identity is invalid"));
                }
            };
            let Some(sequence_value) = tombstone_index.checked_add(1) else {
                *self.deferred_error = Some(LocalLogCheckpointCodecError::RuntimeInvariant {
                    diagnostic: BoundedDiagnostic::from("replay tombstone sequence overflowed"),
                });
                return Err(A::Error::custom("replay tombstone sequence overflowed"));
            };
            let Ok(sequence_value) = LocalLogSequence::try_new(sequence_value) else {
                *self.deferred_error = Some(LocalLogCheckpointCodecError::RuntimeInvariant {
                    diagnostic: BoundedDiagnostic::from("replay tombstone sequence was zero"),
                });
                return Err(A::Error::custom("replay tombstone sequence was zero"));
            };
            match tombstones.entry(replay_id) {
                Entry::Vacant(entry) => {
                    entry.insert(sequence_value);
                }
                Entry::Occupied(entry) => {
                    let first_index = entry.get().get() - 1;
                    *self.deferred_error = Some(
                        LocalLogCheckpointTopologyError::DuplicateReplayId {
                            first_index,
                            duplicate_index: tombstone_index,
                        }
                        .into(),
                    );
                    return Err(A::Error::custom("replay tombstone identity is duplicated"));
                }
            }
            tombstone_index = tombstone_index
                .checked_add(1)
                .ok_or_else(|| A::Error::custom("replay tombstone index overflowed"))?;
        }
        if tombstone_index != self.expected_count {
            return Err(A::Error::custom("replay tombstone count changed"));
        }
        Ok(tombstones)
    }
}
