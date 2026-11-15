//! Retain original client-native document and review journals without adopting their edits.
mod custody;
#[cfg(feature = "server")]
mod delivery;
#[cfg(feature = "server")]
mod paired;
mod participant;
#[cfg(feature = "server")]
mod selected;
#[cfg(all(test, feature = "server", unix))]
mod tests;
#[cfg(feature = "server")]
mod verify;

pub(super) use custody::{JournalSelection, RetainedJournals};
#[cfg(feature = "server")]
pub use verify::{
    RelaySegmentClientJournalCoverage, RelaySegmentClientJournalHead, RelaySegmentPairedReviewHead,
};

use super::{client_rasters::SelectedRaster, client_uploads::UploadSource};
use crate::{Error, Result, archive_input::ArchiveInput};
use breditor_collab_feasibility::review::ReviewActorId;
use participant::ParticipantArchive;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::File};

const MAX_DELIVERY_FILE: u64 = 352 * 1024 * 1024 + 64 * 1024;
const MAX_FILE: u64 = 256 * 1024 * 1024;
const MAX_TOTAL: u64 = 1024 * 1024 * 1024;
const MAX_JOURNALS: usize = 2047;

/// The explicit native restore family. The relay never guesses a format or migrates a journal.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RelaySegmentDocumentJournalFamily {
    /// Original explicit action history.
    Original,
    /// Original natural typing history.
    Typing,
    /// General selection with explicit history.
    General,
    /// General selection with natural typing history.
    GeneralTyping,
    /// Whole-document selection with explicit history.
    Document,
    /// Whole-document selection with natural typing history.
    DocumentTyping,
    /// Reviewed history with original immutable effect links.
    Reviewed,
    /// Search-aware history.
    Search,
    /// Native document generations.
    Segmented,
    /// Extended native document generations.
    Continued,
}

/// The explicit native review restore family.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RelaySegmentReviewJournalFamily {
    /// Original independent review checkpoint.
    Original,
    /// Native review generations.
    Segmented,
    /// Extended native review generations.
    Continued,
}

/// The original registered identity and the exact native decoder to use for one journal.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RelaySegmentJournalOwner {
    /// One original document writer, including an observer or revoked registration.
    Document {
        /// Original document writer ID.
        writer: String,
        /// Explicit native checkpoint family.
        family: RelaySegmentDocumentJournalFamily,
    },
    /// Original standalone SDK backup of a document writer and same-account review actor.
    PairedSession {
        /// Original registered document writer.
        writer: String,
        /// Original registered review actor.
        actor: String,
    },
    /// Exact original independent-delivery recovery containing both native lanes and outboxes.
    IndependentDelivery {
        /// Original registered document writer.
        writer: String,
        /// Original registered review actor.
        actor: String,
    },
    /// Whole original binary participant archive, including provider rasters and upload state.
    IndependentParticipant {
        /// Original registered document writer.
        writer: String,
        /// Original registered review actor.
        actor: String,
    },
    /// One independent review actor bound to an accompanying document checkpoint.
    Review {
        /// Original review actor ID.
        actor: String,
        /// Document checkpoint that admits the review's native anchors.
        document_writer: String,
        /// Explicit native checkpoint family.
        family: RelaySegmentReviewJournalFamily,
    },
}

/// A host-selected file identity independent of the offered client bytes.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentClientJournalPin {
    /// Original stream identity and native family.
    pub owner: RelaySegmentJournalOwner,
    /// Exact UTF-8 journal byte count.
    pub bytes: u64,
    /// SHA-256 of the complete original journal.
    pub sha256: [u8; 32],
}

impl RelaySegmentJournalOwner {
    fn byte_limit(&self) -> u64 {
        match self {
            Self::IndependentDelivery { .. } => MAX_DELIVERY_FILE,
            Self::IndependentParticipant { .. } => participant::MAX_PARTICIPANT_FILE,
            _ => MAX_FILE,
        }
    }

    pub(super) fn key(&self) -> (u8, &str) {
        match self {
            Self::Document { writer, .. }
            | Self::PairedSession { writer, .. }
            | Self::IndependentDelivery { writer, .. }
            | Self::IndependentParticipant { writer, .. } => (0, writer),
            Self::Review { actor, .. } => (1, actor),
        }
    }
}

impl RelaySegmentClientJournalPin {
    fn check(&self) -> Result<()> {
        let valid_writer = |writer: &str| {
            writer
                .parse::<u64>()
                .is_ok_and(|id| (2..u64::MAX).contains(&id) && id.to_string() == writer)
        };
        let registered_shape = match &self.owner {
            RelaySegmentJournalOwner::Document { writer, .. } => valid_writer(writer),
            RelaySegmentJournalOwner::PairedSession { writer, actor }
            | RelaySegmentJournalOwner::IndependentDelivery { writer, actor }
            | RelaySegmentJournalOwner::IndependentParticipant { writer, actor } => {
                valid_writer(writer) && ReviewActorId::try_new(actor).is_ok()
            }
            RelaySegmentJournalOwner::Review { actor, document_writer, .. } => {
                ReviewActorId::try_new(actor).is_ok() && valid_writer(document_writer)
            }
        };
        if !registered_shape || self.bytes == 0 || self.bytes > self.owner.byte_limit() {
            return Err(Error::Contract("client journal pin"));
        }
        Ok(())
    }
}

/// Held original journal bytes. A matching pin gives no registration or write authority.
pub struct RelaySegmentClientJournal {
    pin: RelaySegmentClientJournalPin,
    file: ArchiveInput,
    participant: Option<ParticipantArchive>,
}

impl RelaySegmentClientJournal {
    /// Open an exact original file. Native replay is performed against the selected room cut.
    ///
    /// # Errors
    /// Refuses invalid identities, implausible lengths, file changes and wrong digests.
    pub fn open(file: File, pin: RelaySegmentClientJournalPin) -> Result<Self> {
        pin.check()?;
        let file = ArchiveInput::new(file, pin.owner.byte_limit())?;
        if file.all().len() != pin.bytes || file.all().digest()? != pin.sha256 {
            return Err(Error::Contract("client journal differs from selected file"));
        }
        file.check()?;
        let participant = match pin.owner {
            RelaySegmentJournalOwner::IndependentParticipant { .. } => {
                Some(ParticipantArchive::open(file.all(), &pin.owner)?)
            }
            _ => None,
        };
        Ok(Self { pin, file, participant })
    }

    pub(super) fn participant_upload(&self) -> Result<Option<UploadSource<'_>>> {
        self.participant.as_ref().map(|archive| archive.upload(self.file.all())).transpose()
    }

    pub(super) fn add_participant_rasters<'a>(
        &'a self,
        selected: &mut BTreeMap<&'a str, SelectedRaster<'a>>,
    ) -> Result<()> {
        if let Some(participant) = &self.participant {
            participant.add_rasters(self.file.all(), selected)?;
        }
        Ok(())
    }
}

pub(super) fn check_sources(sources: &[RelaySegmentClientJournal]) -> Result<()> {
    let pins: Vec<_> = sources.iter().map(|source| source.pin.clone()).collect();
    check_pins(&pins)?;
    Ok(())
}

fn check_pins(pins: &[RelaySegmentClientJournalPin]) -> Result<u64> {
    if pins.len() > MAX_JOURNALS {
        return Err(Error::Contract("client journal count budget"));
    }
    let mut previous = None;
    let mut total = 0;
    for pin in pins {
        pin.check()?;
        let key = pin.owner.key();
        if previous.is_some_and(|previous| previous >= key) {
            return Err(Error::Contract("duplicate or unsorted client journal owner"));
        }
        previous = Some(key);
        total += pin.bytes;
        if total > MAX_TOTAL {
            return Err(Error::Contract("client journal aggregate byte budget"));
        }
    }
    Ok(total)
}
