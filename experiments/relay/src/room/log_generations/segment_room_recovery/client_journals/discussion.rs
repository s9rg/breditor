//! Restore and verify an exact retained original outside the serving room and epoch locks.
use super::{
    ParticipantArchive, RelaySegmentClientJournalPin,
    branches::{OriginalParticipantBranch, restore_original},
    selected::SelectedSources,
};
use crate::{
    Error, Result, Room, RoomParticipantInventoryMetadata,
    room::{RelaySegmentServingCustody, recovered_discussion::DiscussionRecord},
};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;

pub(crate) struct RecoveredDiscussionSource {
    profile: SharedRichProfile,
    inventory: RoomParticipantInventoryMetadata,
}

/// Keeps the verified transcript bound to the packet that was compared.
pub(crate) struct VerifiedRecoveredDiscussion {
    source: OriginalParticipantBranch,
    pin: RelaySegmentClientJournalPin,
    packet: String,
}

impl Room {
    pub(crate) fn recovered_discussion_source(
        &self,
        owner: &str,
    ) -> Result<RecoveredDiscussionSource> {
        Ok(RecoveredDiscussionSource {
            profile: self.profile.clone(),
            inventory: current_inventory(self, owner)?,
        })
    }
}

impl RelaySegmentServingCustody {
    pub(crate) fn prepare_recovered_discussion(
        &self,
        room: &RecoveredDiscussionSource,
        archive: [u8; 32],
        packet: String,
    ) -> Result<VerifiedRecoveredDiscussion> {
        let alternatives = self
            .alternatives
            .as_ref()
            .ok_or(Error::Contract("no retained alternate participant archives"))?;
        let (index, pin) = alternatives
            .pins()
            .iter()
            .enumerate()
            .find(|(_, pin)| pin.sha256 == archive)
            .ok_or(Error::Contract("recovered discussion source is not retained"))?;
        let record = DiscussionRecord::read(&packet)?;
        let part = alternatives.part(index)?;
        let original = ParticipantArchive::open(part, &pin.owner)?;
        let selected = SelectedSources::read(&room.inventory, std::slice::from_ref(pin))?;
        let source = restore_original(&room.profile, &room.inventory, &selected, &original, part)?;
        record.verify_original(&archive, &source.endpoint, &source.comments)?;
        alternatives.check()?;
        Ok(VerifiedRecoveredDiscussion { source, pin: pin.clone(), packet })
    }
}

impl VerifiedRecoveredDiscussion {
    pub(crate) fn publish(
        self,
        room: &mut Room,
        owner: &str,
        thread: &breditor_collab_feasibility::review::ReviewThreadId,
    ) -> Result<crate::room::recovered_discussion::DiscussionEntry> {
        let Self { source, pin, packet } = self;
        room.publish_recovered_discussion(owner, thread, pin.sha256, packet, |room| {
            let current = current_inventory(room, owner)?;
            let selected = SelectedSources::read(&current, std::slice::from_ref(&pin))?;
            source.compare(room, &selected, &pin)?;
            Ok(())
        })
    }
}

fn current_inventory(room: &Room, owner: &str) -> Result<RoomParticipantInventoryMetadata> {
    let head = room.log.generation_descriptor()?;
    let records = head
        .next_sequence
        .parse()
        .map_err(|_| Error::Contract("recovered discussion source cut"))?;
    let cut = room.native_identity_at(records, head.terminal_digest);
    Ok(room.capture_participant_inventory_at(owner, cut)?.metadata())
}
