//! Only original two-record committed relations count; inert Prepares do not.
use super::{LanePage, LaneSelection, packet::PacketFingerprint};
use crate::{Error, Result, Room, SuggestionRevisionsCursor, SuggestionRevisionsPage};

pub(super) fn read(
    room: &Room,
    principal: &str,
    selected: &LaneSelection<SuggestionRevisionsCursor>,
) -> Result<LanePage<SuggestionRevisionsPage>> {
    let cursor = match (room.suggestion_revisions_enabled(), selected) {
        (false, LaneSelection::Disabled {}) => return Ok(LanePage::Disabled {}),
        (true, LaneSelection::Start {}) => None,
        (true, LaneSelection::After { cursor }) => Some(cursor),
        _ => return Err(Error::Contract("metadata revisions lane selection")),
    };
    let catalog = room.document_suggestion_revisions_page(principal, cursor)?;
    let mut packets = Vec::with_capacity(catalog.revisions.len());
    for receipt in &catalog.revisions {
        let id = &receipt.revision.id;
        let packet =
            room.document_suggestion_revision_packet(principal, id)?.ok_or(Error::NeedsRecovery)?;
        packets.push(PacketFingerprint::of(id, &packet));
    }
    Ok(LanePage::Page { catalog, packets })
}
