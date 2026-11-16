//! Read predecessor packets and the current bounded suffix as a single chronological source.
use super::{
    PacketRecord, ServerAssetReferenceOutcome, ServerAssetReferenceSource, packets::PacketScanner,
    read_budget,
};
use crate::{
    Error, RelaySegmentBaseIdentity, Result, Room, RoomBackupIdentity,
    archive_digest::ArchiveDigest,
};
use serde::Serialize;
use std::cell::Cell;

/// Complete native asset references across the retained predecessor and the live suffix.
#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRelaySegmentAssetReferences {
    /// Exact checkpoint-backed predecessor and portable archive selection.
    pub base: RelaySegmentBaseIdentity,
    /// Original room identity at the current absolute position.
    pub room: RoomBackupIdentity,
    /// Selected suffix manifest.
    pub manifest: [u8; 32],
    /// Hash of the exact suffix section inventory and its content hashes.
    pub suffix_files_sha256: [u8; 32],
    /// Historical packet locations at their original absolute positions.
    pub sources: Vec<ServerAssetReferenceSource>,
    /// Complete references or whole Pending. This inventory does not authorize deletion.
    pub outcome: ServerAssetReferenceOutcome,
}

impl Room {
    /// Read every predecessor and suffix packet under the live room's ownership.
    /// Also includes conservative document and effect history, even for removed images.
    ///
    /// # Errors
    /// Wrong owner, unavailable predecessor, changed WALs, invalid history and exceeded
    /// reference limits refuse the whole read.
    pub fn relay_segment_retained_asset_references(
        &mut self,
        principal: &str,
    ) -> Result<ServerRelaySegmentAssetReferences> {
        self.recovery_inventory_owner(principal)?;
        if self.log.segment_base().is_none() {
            return Err(Error::Contract("relay segment asset read requires a successor"));
        }
        let head = self.log.generation_descriptor()?;
        let room = self.native_identity_at(
            head.next_sequence
                .parse()
                .map_err(|_| Error::Contract("relay segment absolute cut"))?,
            head.terminal_digest,
        );
        let observed = self.replica.observe()?;
        let mut output = self.native_retained_reference_seed(&observed)?;
        let replica = &self.replica;
        let mut packets = PacketScanner::default();
        let mut packet_error = None;
        let rejected = Cell::new(false);
        let (base, suffix_files_sha256) = self.log.stream_held_generation(
            |stream| {
                let base = stream.segment_base().ok_or(Error::NeedsRecovery)?;
                let mut visit = |packet| {
                    if packet_error.is_none() {
                        packet_error =
                            packets.accept_packet(replica, &observed, packet, &mut output).err();
                    }
                    Ok(())
                };
                base.visit_asset_packets(&mut visit)?;
                stream.visit_records(|record| {
                    if let Some(packet) = PacketRecord::from_log(record) {
                        visit(packet)?;
                    }
                    Ok(())
                })?;
                if stream.cut.manifest != head.manifest
                    || stream.cut.records != room.records
                    || stream.cut.previous != room.terminal_log_digest
                {
                    return Err(Error::Contract("relay segment asset cut differs"));
                }
                let mut digest = ArchiveDigest::new(128 * 1024);
                serde_json::to_writer(&mut digest, &stream.sections)?;
                base.check()?;
                stream.check()?;
                Ok((base.identity().clone(), digest.finish().0))
            },
            &rejected,
        )?;
        if let Some(error) = packet_error {
            return Err(error);
        }
        replica.check(&observed)?;
        let outcome = if output.pending.is_empty() {
            ServerAssetReferenceOutcome::Ready { references: output.pairs.into_iter().collect() }
        } else {
            ServerAssetReferenceOutcome::Pending { packets: output.pending }
        };
        let value = ServerRelaySegmentAssetReferences {
            base,
            room,
            manifest: head.manifest,
            suffix_files_sha256,
            sources: output.sources,
            outcome,
        };
        read_budget::check(&value)?;
        Ok(value)
    }
}
