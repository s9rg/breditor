use serde::{Serialize, Serializer, ser::SerializeMap};

use crate::record::DecimalU64Record;

/// Stable identifier for Breditor's durable one-entry local-log envelope.
pub(crate) const LOCAL_LOG_ENTRY_FORMAT: &str = "breditor/local-log-entry";

/// Durable local-log-entry wire version implemented by this record.
pub(crate) const LOCAL_LOG_ENTRY_FORMAT_VERSION: u32 = 1;

/// Generic V1 encoding record for one ordered local-log event.
///
/// This type intentionally does not implement `Deserialize`; untrusted event
/// payloads pass through the codec's borrowed strict boundary before checked
/// reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LocalLogEntryRecordV1<Event> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) session_id: String,
    pub(crate) log_id: String,
    pub(crate) sequence: DecimalU64Record,
    pub(crate) replay_id: String,
    pub(crate) event: Event,
}

/// Generic V1 encoding record for one exact session mutation.
pub(crate) enum LocalLogEventRecordV1<Commit> {
    /// Publishes one ordinary proved commit.
    Commit { commit: Commit },
    /// Replays and verifies the nearest undo entry.
    Undo { commit: Commit },
    /// Replays and verifies the nearest redo entry.
    Redo { commit: Commit },
    /// Records one explicit history merge-group closure.
    CloseHistoryGroup {},
    /// Records one explicit retained-history clear.
    ClearHistory {},
}

impl<Commit> Serialize for LocalLogEventRecordV1<Commit>
where
    Commit: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let field_count = match self {
            Self::Commit { .. } | Self::Undo { .. } | Self::Redo { .. } => 2,
            Self::CloseHistoryGroup {} | Self::ClearHistory {} => 1,
        };
        let mut map = serializer.serialize_map(Some(field_count))?;
        match self {
            Self::Commit { commit } => {
                map.serialize_entry("kind", "commit")?;
                map.serialize_entry("commit", commit)?;
            }
            Self::Undo { commit } => {
                map.serialize_entry("kind", "undo")?;
                map.serialize_entry("commit", commit)?;
            }
            Self::Redo { commit } => {
                map.serialize_entry("kind", "redo")?;
                map.serialize_entry("commit", commit)?;
            }
            Self::CloseHistoryGroup {} => map.serialize_entry("kind", "closeHistoryGroup")?,
            Self::ClearHistory {} => map.serialize_entry("kind", "clearHistory")?,
        }
        map.end()
    }
}
