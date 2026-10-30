//! Immutable publication/decision events remain separate from current state.
use super::{LanePage, LaneSelection, packet::PacketFingerprint};
use crate::{
    DocumentSuggestionsCursor, DocumentSuggestionsPage, Error, Result, Room, SuggestionUpdate,
};

pub(super) fn read(
    room: &Room,
    principal: &str,
    selected: &LaneSelection<DocumentSuggestionsCursor>,
) -> Result<LanePage<DocumentSuggestionsPage>> {
    let cursor = match (room.suggestions.is_some(), selected) {
        (false, LaneSelection::Disabled {}) => return Ok(LanePage::Disabled {}),
        (true, LaneSelection::Start {}) => None,
        (true, LaneSelection::After { cursor }) => Some(cursor),
        _ => return Err(Error::Contract("metadata suggestions lane selection")),
    };
    let catalog = room.document_suggestions_page(principal, cursor)?;
    let mut packets = Vec::new();
    for update in &catalog.updates {
        if let SuggestionUpdate::Published(publication) = update {
            let id = &publication.suggestion.id;
            let packet =
                room.document_suggestion_packet(principal, id)?.ok_or(Error::NeedsRecovery)?;
            packets.push(PacketFingerprint::of(id, &packet));
        }
    }
    Ok(LanePage::Page { catalog, packets })
}
