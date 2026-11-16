//! Select and retain original companion journals and queues using the single-raster room codecs.
use super::super::{
    RelaySegmentClientJournal, RelaySegmentClientUploadArchive,
    client_journals::{self, JournalDirectory, JournalSelection, RetainedJournals},
    client_rasters::SelectedRaster,
    client_uploads::{self, RetainedUploadSelection, RetainedUploads, UploadSource},
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

pub(super) struct ClientSources<'a> {
    originals: OriginalJournals<'a>,
    uploads: Vec<UploadSource<'a>>,
}

impl<'a> ClientSources<'a> {
    pub fn select(
        required: &BTreeSet<[u8; 32]>,
        inputs: ContinuedRasterRoomClientArchives<'a>,
    ) -> Result<Self> {
        let originals =
            OriginalJournals { selected: inputs.journals, alternatives: inputs.alternatives };
        let uploads = originals.uploads(inputs.uploads)?;
        check_sources(
            required,
            inputs.journals.iter().chain(inputs.alternatives).map(RelaySegmentClientJournal::pin),
        )?;
        Ok(Self { originals, uploads })
    }

    pub fn staging_sources(&self, ids: &[String]) -> Result<Vec<SelectedRaster<'a>>> {
        let requested: BTreeSet<_> = ids.iter().map(String::as_str).collect();
        let from_queues = client_uploads::select(&self.uploads, Some(&requested))?;
        if ids.is_empty() {
            return Ok(from_queues);
        }
        let mut rasters = self.originals.rasters(from_queues)?;
        rasters.retain(|raster| requested.contains(raster.info.asset.as_str()));
        if !rasters.iter().map(|raster| &raster.info.asset).eq(ids) {
            return Err(Error::Contract("selected raster absent from client originals"));
        }
        Ok(rasters)
    }

    pub fn retain(
        self,
        directory: &GenerationDirectory,
        required: &BTreeSet<[u8; 32]>,
    ) -> Result<RetainedClients> {
        let uploads = (!self.uploads.is_empty())
            .then(|| RetainedUploads::create(directory, &self.uploads))
            .transpose()?;
        let (journals, alternatives) = if self.originals.selected.is_empty() {
            (None, None)
        } else {
            self.originals.retain(directory)?
        };
        let clients = RetainedClients { uploads, journals, alternatives };
        clients.check(required)?;
        Ok(clients)
    }
}

impl RetainedClients {
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
