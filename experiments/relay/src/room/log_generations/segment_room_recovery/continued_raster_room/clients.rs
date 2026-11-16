//! Select and retain original companion journals and queues using the single-raster room codecs.
use super::super::{
    RelaySegmentClientJournal, RelaySegmentClientUploadArchive,
    client_journals::{self, JournalDirectory, JournalSelection, RetainedJournals},
    client_uploads::{self, RetainedUploadSelection, RetainedUploads},
    discussion_sources::check_sources,
    restore::OriginalJournals,
};
use crate::{Error, Result, log::generations::GenerationDirectory};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Independently selected companion client files. These preserve exact bytes and queue
/// state for later reconciliation, while the restored native raster cut remains exact.
#[derive(Clone, Copy, Default)]
pub struct ContinuedRasterRoomClientArchives<'a> {
    /// Standalone upload queues in canonical writer order.
    pub uploads: &'a [RelaySegmentClientUploadArchive],
    /// Selected original client journals, including participant files with embedded queues.
    pub journals: &'a [RelaySegmentClientJournal],
    /// Independently retained alternate participant branches.
    pub alternatives: &'a [RelaySegmentClientJournal],
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ClientSelection {
    uploads: Option<RetainedUploadSelection>,
    journals: Option<JournalSelection>,
    alternatives: Option<JournalSelection>,
}

pub(super) struct RetainedClients {
    pub uploads: Option<RetainedUploads>,
    pub journals: Option<RetainedJournals>,
    pub alternatives: Option<RetainedJournals>,
}

impl RetainedClients {
    pub fn create(
        required: &BTreeSet<[u8; 32]>,
        inputs: ContinuedRasterRoomClientArchives<'_>,
        create: impl FnOnce() -> Result<GenerationDirectory>,
    ) -> Result<(GenerationDirectory, Self)> {
        let originals =
            OriginalJournals { selected: inputs.journals, alternatives: inputs.alternatives };
        let sources = originals.uploads(inputs.uploads)?;
        client_uploads::select(&sources, Some(&BTreeSet::new()))?;
        check_sources(
            required,
            inputs.journals.iter().chain(inputs.alternatives).map(RelaySegmentClientJournal::pin),
        )?;
        let directory = create()?;
        let uploads = (!sources.is_empty())
            .then(|| RetainedUploads::create(&directory, &sources))
            .transpose()?;
        let (journals, alternatives) =
            if inputs.journals.is_empty() { (None, None) } else { originals.retain(&directory)? };
        let clients = Self { uploads, journals, alternatives };
        clients.check(required)?;
        Ok((directory, clients))
    }

    pub fn selection(&self) -> ClientSelection {
        ClientSelection {
            uploads: self.uploads.as_ref().map(|uploads| uploads.selection().clone()),
            journals: self.journals.as_ref().map(|journals| journals.selection().clone()),
            alternatives: self.alternatives.as_ref().map(|journals| journals.selection().clone()),
        }
    }

    pub fn reopen(
        directory: &GenerationDirectory,
        completed: &ClientSelection,
        required: &BTreeSet<[u8; 32]>,
    ) -> Result<Self> {
        let uploads = completed
            .uploads
            .as_ref()
            .map(|pin| RetainedUploads::reopen(directory, pin))
            .transpose()?;
        let journals = completed
            .journals
            .as_ref()
            .map(|pin| RetainedJournals::reopen(directory, pin, JournalDirectory::Selected))
            .transpose()?;
        let alternatives = completed
            .alternatives
            .as_ref()
            .map(|pin| RetainedJournals::reopen(directory, pin, JournalDirectory::Alternatives))
            .transpose()?;
        if let Some(alternatives) = &alternatives {
            let selected = journals.as_ref().ok_or(Error::NeedsRecovery)?;
            client_journals::check_alternatives(selected.pins(), alternatives.pins())?;
        }
        let clients = Self { uploads, journals, alternatives };
        clients.check(required)?;
        Ok(clients)
    }

    pub fn check(&self, required: &BTreeSet<[u8; 32]>) -> Result<()> {
        let journals = [&self.journals, &self.alternatives];
        for archive in journals.into_iter().flatten() {
            archive.check()?;
        }
        if let Some(uploads) = &self.uploads {
            uploads.check()?;
        }
        check_sources(required, journals.into_iter().flatten().flat_map(RetainedJournals::pins))
    }
}
