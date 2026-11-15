//! Inspect two explicit originals against one already authenticated native cut.
use super::{
    RelaySegmentClientJournal, RelaySegmentClientJournalPin, RelaySegmentJournalOwner,
    delivery::DeliveryRecord,
    participant::ParticipantArchive,
    selected::{DocumentInput, SelectedSources},
    verify::{clocks, restore_review},
};
use crate::{
    Error, RecoveredRelaySegmentRoom, Result, Room, RoomParticipantInventoryMetadata,
    archive_input::ArchiveSlice,
};
use serde::Serialize;

/// Exact local and accepted positions for one document writer or comment actor.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentBranchClock {
    /// Candidate's own head, including unpublished work.
    pub local_through: String,
    /// Actual accepted head at the independently selected native cut.
    pub accepted_through: String,
    /// Position compared on both sides. This is the smaller of their two heads.
    pub compared_through: String,
    /// True when both native streams have the same prefix at this position.
    pub prefix_matches: bool,
}

/// Detached comparison of one exact original participant backup.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentParticipantBranch {
    /// Original binary file pin and both original registration identities.
    pub pin: RelaySegmentClientJournalPin,
    /// Original document author clock in the room's selected wire family.
    pub document: RelaySegmentBranchClock,
    /// Independent original review actor clock.
    pub review: RelaySegmentBranchClock,
}

impl Room {
    pub(crate) fn inspect_relay_participant_branches(
        &self,
        participants: &RoomParticipantInventoryMetadata,
        current: &RelaySegmentClientJournal,
        incoming: &RelaySegmentClientJournal,
    ) -> Result<[RelaySegmentParticipantBranch; 2]> {
        if !matches!(current.pin.owner, RelaySegmentJournalOwner::IndependentParticipant { .. })
            || current.pin.owner != incoming.pin.owner
            || current.pin.sha256 == incoming.pin.sha256
        {
            return Err(Error::Contract("select two original archives of the same participant"));
        }
        let current_read = inspect(self, participants, current)?;
        let incoming_read = inspect(self, participants, incoming)?;
        current.file.check()?;
        incoming.file.check()?;
        Ok([current_read, incoming_read])
    }
}

fn inspect(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    source: &RelaySegmentClientJournal,
) -> Result<RelaySegmentParticipantBranch> {
    source.file.check()?;
    let archive = source.participant.as_ref().ok_or(Error::NeedsRecovery)?;
    inspect_part(room, participants, &source.pin, archive, source.file.all())
}

impl RecoveredRelaySegmentRoom {
    pub(crate) fn handover_alternate_branches(
        &self,
        participants: &RoomParticipantInventoryMetadata,
    ) -> Result<Vec<RelaySegmentParticipantBranch>> {
        let Some(alternatives) = &self.alternatives else {
            return Ok(Vec::new());
        };
        let mut branches = Vec::with_capacity(alternatives.pins().len());
        for (index, pin) in alternatives.pins().iter().enumerate() {
            let part = alternatives.part(index)?;
            let archive = ParticipantArchive::open(part, &pin.owner)?;
            branches.push(inspect_part(&self.room, participants, pin, &archive, part)?);
        }
        alternatives.check()?;
        Ok(branches)
    }
}

fn inspect_part(
    room: &Room,
    participants: &RoomParticipantInventoryMetadata,
    pin: &RelaySegmentClientJournalPin,
    archive: &ParticipantArchive,
    part: ArchiveSlice<'_>,
) -> Result<RelaySegmentParticipantBranch> {
    let selected = SelectedSources::read(participants, std::slice::from_ref(pin))?;
    let document = selected.documents.first().ok_or(Error::NeedsRecovery)?;
    let DocumentInput::Participant(review) = document.input else {
        return Err(Error::Contract("standalone SDK participant archive required"));
    };
    let native = archive.read_records(part)?;
    let sections =
        archive.delivery_sections(native.document, native.review, native.versions, &native.stores);
    let record = DeliveryRecord::from_sections(sections, participants, document.row, review)?;
    let local = record.document(room)?;
    if local.writer() != document.row.clock.writer
        || local.document_id() != participants.room.document
    {
        return Err(Error::Contract("client journal document binding differs"));
    }
    let (family, json) = record.review();
    let comments = restore_review(&local, review, family, json)?;
    Ok(RelaySegmentParticipantBranch {
        pin: pin.clone(),
        document: clocks::compare_document(
            room,
            &local,
            &selected.document_clocks,
            &document.row.clock,
            document.row.observer,
            true,
        )?,
        review: clocks::compare_review(room, &comments, &selected.review_rows, review, true)?,
    })
}
