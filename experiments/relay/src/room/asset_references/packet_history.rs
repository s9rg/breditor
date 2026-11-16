//! The exact packet-bearing events needed to replay retained asset dependencies.
use crate::{
    Error, Result,
    log::{Event, Record, generations::StreamGenerationCapture},
};
use serde::{Deserialize, Deserializer, Serialize, de};
use std::{fmt, io};

pub(in crate::room) const MAX_PACKET_HISTORY_BYTES: usize = 64 * 1024 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct PacketHistory {
    first_sequence: u64,
    #[serde(deserialize_with = "read_records")]
    records: Vec<PacketRecord>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct PacketRecord {
    pub(super) sequence: u64,
    pub(super) event: PacketEvent,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum PacketEvent {
    Version { packet: String },
    Suggestion { packet: String },
    RevisionPrepare { previous: String, packet: String },
    RevisionCommit { prepared_at: String, revision_id: String },
}

impl PacketRecord {
    pub(in crate::room) fn from_log(record: Record) -> Option<Self> {
        let event = match record.event {
            Event::PublishDocumentVersionV1 { packet, .. } => PacketEvent::Version { packet },
            Event::PublishDocumentSuggestionV1 { packet, .. } => PacketEvent::Suggestion { packet },
            Event::PrepareDocumentSuggestionRevisionV1 { request, .. } => {
                PacketEvent::RevisionPrepare {
                    previous: request.previous_suggestion_id,
                    packet: request.revision_packet,
                }
            }
            Event::CommitDocumentSuggestionRevisionV1 { prepared_at, revision_id } => {
                PacketEvent::RevisionCommit { prepared_at, revision_id }
            }
            _ => return None,
        };
        Some(Self { sequence: record.sequence, event })
    }
}

impl PacketHistory {
    /// Read only this physical segment. The caller must handle the inner budget
    /// result after the held WAL read so a budget refusal cannot fence the log.
    pub(in crate::room) fn capture(stream: &StreamGenerationCapture<'_>) -> Result<Result<Self>> {
        let first_sequence =
            stream.segment_base().map_or(0, |base| base.identity().predecessor.source.records);
        Self::capture_from(first_sequence, |visit| stream.visit_records(visit))
    }

    pub(in crate::room) fn capture_from(
        first_sequence: u64,
        read: impl FnOnce(&mut dyn FnMut(Record) -> Result<()>) -> Result<()>,
    ) -> Result<Result<Self>> {
        let mut records = Vec::new();
        let mut budget = Budget::default();
        let mut admission = Ok(());
        read(&mut |record| {
            if admission.is_ok()
                && let Some(packet) = PacketRecord::from_log(record)
            {
                admission = budget.reserve(&packet).map(|()| records.push(packet));
            }
            Ok(())
        })?;
        Ok(admission.map(|()| Self { first_sequence, records }))
    }

    pub(in crate::room) fn check_range(&self, first: u64, end: u64) -> Result<()> {
        if self.first_sequence != first || first > end {
            return Err(Error::Contract("relay asset packet history range"));
        }
        let mut next = first.max(1);
        for record in &self.records {
            if record.sequence < next || record.sequence >= end {
                return Err(Error::Contract("relay asset packet history sequence"));
            }
            next = record.sequence + 1;
        }
        Ok(())
    }

    pub(in crate::room) fn into_records(self) -> impl Iterator<Item = PacketRecord> {
        self.records.into_iter()
    }
}

#[derive(Default)]
struct Budget(usize);

impl Budget {
    fn reserve(&mut self, record: &PacketRecord) -> Result<()> {
        // Charge an additional byte for the array separator. Do not allocate
        // a second copy of the serialized packet to measure it.
        io::Write::write_all(self, b",")?;
        serde_json::to_writer(self, record)?;
        Ok(())
    }
}

impl io::Write for Budget {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_PACKET_HISTORY_BYTES - self.0 {
            return Err(io::Error::other("relay asset packet history byte budget"));
        }
        self.0 += bytes.len();
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn read_records<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Vec<PacketRecord>, D::Error> {
    struct Records;
    impl<'de> de::Visitor<'de> for Records {
        type Value = Vec<PacketRecord>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a bounded chronological asset packet history")
        }

        fn visit_seq<A: de::SeqAccess<'de>>(
            self,
            mut input: A,
        ) -> std::result::Result<Self::Value, A::Error> {
            let mut records = Vec::new();
            let mut budget = Budget::default();
            while let Some(record) = input.next_element()? {
                budget.reserve(&record).map_err(de::Error::custom)?;
                records.push(record);
            }
            Ok(records)
        }
    }
    deserializer.deserialize_seq(Records)
}
