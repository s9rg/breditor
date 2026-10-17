//! Explicit grouped replay family; original journal factories never reinterpret native groups.
use super::{
    RichReplica, SharedRichProfile,
    session::{Entry, Journal, MAX_ENTRIES, MAX_JOURNAL_BYTES},
};
use crate::Error;
use breditor_core::codec::DocumentJsonCodecV2;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{IgnoredAny, SeqAccess, Visitor},
};
use std::{
    fmt,
    io::{self, Write},
};

const FORMAT: &str = "breditor/shared-typing-session";
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Encoding<'a> {
    format: &'static str,
    format_version: u32,
    model_version: u32,
    journal_version: u32,
    journal: &'a Journal,
    joins: &'a [u32],
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope {
    format: String,
    format_version: u32,
    model_version: u32,
    journal_version: u32,
    journal: Journal<BoundedEntries>,
    #[serde(deserialize_with = "join_records")]
    joins: Vec<u32>,
}
pub(super) struct BoundedEntries(pub(super) Vec<Entry>);
impl<'de> Deserialize<'de> for BoundedEntries {
    fn deserialize<D: Deserializer<'de>>(reader: D) -> Result<Self, D::Error> {
        struct Entries;
        impl<'de> Visitor<'de> for Entries {
            type Value = BoundedEntries;
            fn expecting(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
                out.write_str("bounded grouped journal entries")
            }
            fn visit_seq<A: SeqAccess<'de>>(
                self,
                mut sequence: A,
            ) -> Result<Self::Value, A::Error> {
                let mut entries = Vec::new();
                while entries.len() < MAX_ENTRIES {
                    match sequence.next_element()? {
                        Some(entry) => entries.push(entry),
                        None => return Ok(BoundedEntries(entries)),
                    }
                }
                if sequence.next_element::<IgnoredAny>()?.is_some() {
                    return Err(serde::de::Error::custom("shared grouped journal entry limit"));
                }
                Ok(BoundedEntries(entries))
            }
        }
        reader.deserialize_seq(Entries)
    }
}
pub(super) fn join_records<'de, D: Deserializer<'de>>(reader: D) -> Result<Vec<u32>, D::Error> {
    struct Records;
    impl<'de> Visitor<'de> for Records {
        type Value = Vec<u32>;
        fn expecting(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
            out.write_str("bounded shared typing join indices")
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
            let mut values = Vec::new();
            while values.len() < MAX_ENTRIES {
                match sequence.next_element()? {
                    Some(value) => values.push(value),
                    None => return Ok(values),
                }
            }
            if sequence.next_element::<IgnoredAny>()?.is_some() {
                return Err(serde::de::Error::custom("shared typing join limit"));
            }
            Ok(values)
        }
    }
    reader.deserialize_seq(Records)
}
struct Counter {
    bytes: usize,
    exceeded: bool,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_JOURNAL_BYTES - self.bytes {
            self.exceeded = true;
            return Err(io::Error::other("shared typing checkpoint byte limit"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
impl RichReplica {
    /// Save the exact new grouped replay contract under the original whole-envelope byte budget.
    /// Per-input forward records remain retained; grouped inverses use explicit native spans.
    /// This is a separately leased writer's history, not authorization or portable document import.
    /// # Errors
    /// Disabled mode, malformed internal partition or resource/serialization failure rejects.
    pub fn typing_checkpoint(&self) -> Result<String, Error> {
        if self.general_ranges_enabled() {
            return Err(Error::Contract("use explicit general shared typing checkpoint"));
        }
        self.encode_typing_checkpoint(FORMAT)
    }
    /// Save the separate general-range and natural-typing history family.
    /// # Errors
    /// Wrong mode, malformed partition or the unchanged envelope byte budget rejects.
    pub fn general_typing_checkpoint(&self) -> Result<String, Error> {
        if self.replay_contract != super::general_history::ReplayContract::GeneralV1 {
            return Err(Error::Contract("general shared typing history required"));
        }
        self.encode_typing_checkpoint(super::general_history::TYPING_ENVELOPE)
    }
    pub(super) fn encode_typing_checkpoint(&self, format: &'static str) -> Result<String, Error> {
        if self.reviewed_contract {
            return Err(Error::Contract("use explicit reviewed checkpoint"));
        }
        let history =
            self.typing.as_ref().ok_or(Error::Contract("shared typing history disabled"))?;
        history.validate(&self.journal)?;
        let value = Encoding {
            format,
            format_version: 1,
            model_version: self.model_version(),
            journal_version: self.journal_version(),
            journal: &self.journal,
            joins: &history.joins,
        };
        let mut counter = Counter { bytes: 0, exceeded: false };
        let result = serde_json::to_writer(&mut counter, &value);
        if counter.exceeded {
            return Err(Error::Limit("shared typing checkpoint bytes"));
        }
        result?;
        Ok(serde_json::to_string(&value)?)
    }
    /// Restore an explicitly grouped original-language owner with fresh observation/typing state.
    /// # Errors
    /// Wrong grammar/room/family/bindings, invalid replay/partition or bounds reject before exposure.
    pub fn restore_typing(
        codec: DocumentJsonCodecV2,
        room: &str,
        input: &str,
    ) -> Result<Self, Error> {
        super::protocol::Protocol::require_original(&codec)?;
        Self::restore_typing_bound(codec, room, input)
    }
    pub(super) fn restore_typing_bound(
        codec: DocumentJsonCodecV2,
        room: &str,
        input: &str,
    ) -> Result<Self, Error> {
        Self::restore_typing_contract_bound(
            codec,
            room,
            input,
            super::general_history::ReplayContract::Original,
        )
    }
    pub(super) fn restore_typing_contract_bound(
        codec: DocumentJsonCodecV2,
        room: &str,
        input: &str,
        contract: super::general_history::ReplayContract,
    ) -> Result<Self, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("shared typing checkpoint bytes"));
        }
        let value: Envelope = serde_json::from_str(input)?;
        let protocol = super::protocol::Protocol::from_codec(&codec)?;
        let format = match contract {
            super::general_history::ReplayContract::Original => FORMAT,
            super::general_history::ReplayContract::GeneralV1 => {
                super::general_history::TYPING_ENVELOPE
            }
            super::general_history::ReplayContract::DocumentV1 => {
                super::document_checkpoint::TYPING_ENVELOPE
            }
        };
        if value.format != format
            || value.format_version != 1
            || value.model_version != protocol.model()
            || value.journal_version != protocol.journal()
            || value.journal.document != room
        {
            return Err(Error::Contract("shared typing checkpoint binding"));
        }
        Self::from_journal_contract_parts(
            codec,
            value.journal.map_entries(|entries| entries.0),
            Some(value.joins),
            false,
            contract,
        )
    }
}
impl SharedRichProfile {
    /// Recover only the explicitly selected general-range natural-typing family.
    /// # Errors
    /// Wrong family/profile/room, altered replay, invalid groups or active budgets reject.
    pub fn restore_general_typing(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        RichReplica::restore_typing_contract_bound(
            self.codec.clone(),
            room,
            input,
            super::general_history::ReplayContract::GeneralV1,
        )
    }
    /// Replay-admit only the separate grouped family after reacquiring the exact saved writer lease.
    /// Recovery retains exact future history but closes continuation and restores no permission.
    /// # Errors
    /// Wrong family/profile/room, malformed or divergent replay and resource bounds reject.
    pub fn restore_typing(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        RichReplica::restore_typing_bound(self.codec.clone(), room, input)
    }
}
