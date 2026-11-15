//! Verify selected attachment data against a retained, whole-file-pinned original.
use super::{ParticipantArchive, branches::inspect_original};
use crate::{
    Error, Result, Room,
    room::{RelaySegmentServingCustody, recovered_discussion::DiscussionRecord},
};

impl RelaySegmentServingCustody {
    pub(crate) fn verify_recovered_discussion(
        &self,
        room: &Room,
        owner: &str,
        archive: [u8; 32],
        record: &DiscussionRecord<'_>,
    ) -> Result<()> {
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
        let part = alternatives.part(index)?;
        let original = ParticipantArchive::open(part, &pin.owner)?;
        let metadata =
            room.capture_participant_inventory_at(owner, room.backup_identity()?)?.metadata();
        inspect_original(room, &metadata, pin, &original, part, |comments| {
            record.verify_original(&original.manifest_sha256, comments)
        })?;
        alternatives.check()
    }
}
