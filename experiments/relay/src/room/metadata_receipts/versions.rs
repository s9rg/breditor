//! Reuse original frozen pages and the first accepted immutable version packet.
use super::{LanePage, LaneSelection, packet::PacketFingerprint};
use crate::{DocumentVersionCatalogPage, DocumentVersionsCursor, Error, Result, Room};

pub(super) fn read(
    room: &Room,
    principal: &str,
    selected: &LaneSelection<DocumentVersionsCursor>,
) -> Result<LanePage<DocumentVersionCatalogPage>> {
    let cursor = match (room.versions.is_some(), selected) {
        (false, LaneSelection::Disabled {}) => return Ok(LanePage::Disabled {}),
        (true, LaneSelection::Start {}) => None,
        (true, LaneSelection::After { cursor }) => Some(cursor),
        _ => return Err(Error::Contract("metadata versions lane selection")),
    };
    let catalog = room.document_versions_page(principal, cursor)?;
    let mut packets = Vec::with_capacity(catalog.entries.len());
    for entry in &catalog.entries {
        let id = &entry.version.id;
        let packet = room.document_version_packet(principal, id)?.ok_or(Error::NeedsRecovery)?;
        packets.push(PacketFingerprint::of(id, &packet));
    }
    Ok(LanePage::Page { catalog, packets })
}
