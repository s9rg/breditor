//! Read the original split records into the existing native delivery verifier.
use super::{super::delivery::DeliverySections, ParticipantArchive, RecordKind};
use crate::{Error, Result, archive_input::ArchiveSlice};

#[derive(Default)]
pub(in super::super) struct ArchiveStores {
    pub relay: String,
    pub suggestions: Option<String>,
    pub revisions: Option<String>,
    pub versions: Option<String>,
}

pub(in super::super) struct ArchiveRecords {
    pub document: String,
    pub review: String,
    pub versions: Vec<String>,
    pub stores: ArchiveStores,
}

impl ParticipantArchive {
    pub fn delivery_sections<'a>(
        &'a self,
        document: String,
        review: String,
        versions: Vec<String>,
        stores: &'a ArchiveStores,
    ) -> DeliverySections<'a> {
        let identity = &self.source;
        DeliverySections {
            identity: &identity.history,
            binding: &identity.binding,
            retained_binding: &identity.retained,
            document,
            review,
            versions,
            relay: &stores.relay,
            suggestions: stores.suggestions.as_deref(),
            revisions: stores.revisions.as_deref(),
            version_store: stores.versions.as_deref(),
        }
    }

    pub fn read_records(&self, input: ArchiveSlice<'_>) -> Result<ArchiveRecords> {
        let mut records = ArchiveRecords {
            document: String::new(),
            review: String::new(),
            versions: Vec::new(),
            stores: ArchiveStores::default(),
        };
        for record in &self.records {
            let slice = input.section(self.body + record.offset, record.bytes)?;
            let value = String::from_utf8(slice.read(record.bytes)?.into_owned())
                .map_err(|_| Error::Contract("participant archive record UTF-8"))?;
            match record.kind {
                RecordKind::Document => records.document = value,
                RecordKind::Review => records.review = value,
                RecordKind::Version => records.versions.push(value),
                RecordKind::Relay => records.stores.relay = value,
                RecordKind::Suggestions => records.stores.suggestions = Some(value),
                RecordKind::Revisions => records.stores.revisions = Some(value),
                RecordKind::Versions => records.stores.versions = Some(value),
            }
        }
        input.check()?;
        Ok(records)
    }
}
