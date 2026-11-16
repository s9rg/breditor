//! Capture a checkpoint even at a saturated predecessor whose active WAL cannot rotate.
use super::RelaySegmentBaseIdentity;
use crate::{
    Error, RelayCheckpointIdentity, Result, Room,
    archive_digest::ArchiveDigest,
    room::{
        SegmentCheckpointEncoding, log_generations::backup::BackupOutput, materialized_checkpoint,
    },
};
use std::{
    cell::Cell,
    io::{BufWriter, Write},
};

impl Room {
    /// Write the exact predecessor archive and its materialized state at the same held cut.
    /// The two destinations must be distinct. The caller owns file sync and the durable
    /// selection of the returned identity. Use complete outputs together or discard both.
    /// A successor exports its physical WAL section and checkpoint. Retain the earlier chain
    /// and admit the result with `RelaySegmentBaseFile::open_linked`.
    ///
    /// # Errors
    /// Refuses non-owner access, incomplete or changing WAL custody, pending rotation,
    /// over-budget state and destination errors. The current room may be retried after an
    /// output-only error. No semantic event or rotation is required.
    pub fn write_relay_segment_base(
        &mut self,
        principal: &str,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
    ) -> Result<RelaySegmentBaseIdentity> {
        self.write_relay_segment_base_with_encoding(
            principal,
            archive,
            checkpoint,
            SegmentCheckpointEncoding::Original,
        )
    }

    /// Capture an exact segment base with a version-two native checkpoint.
    /// The checkpoint retains this segment's original packet-bearing events
    /// for future asset inventory, including abandoned revision preparations.
    /// The archive remains byte-identical to the original capture format.
    ///
    /// # Errors
    /// Refuses the same conditions as [`Self::write_relay_segment_base`] and
    /// any packet history exceeding the indexed checkpoint's byte budget.
    pub fn write_relay_segment_base_with_indexed_asset_history(
        &mut self,
        principal: &str,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
    ) -> Result<RelaySegmentBaseIdentity> {
        self.write_relay_segment_base_with_encoding(
            principal,
            archive,
            checkpoint,
            SegmentCheckpointEncoding::IndexedAssetHistory,
        )
    }

    pub(in crate::room) fn write_relay_segment_base_with_encoding(
        &mut self,
        principal: &str,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
        encoding: SegmentCheckpointEncoding,
    ) -> Result<RelaySegmentBaseIdentity> {
        self.recovery_inventory_owner(principal)?;
        let head = self.log.generation_descriptor()?;
        let records = head
            .next_sequence
            .parse()
            .map_err(|_| Error::Contract("relay segment base absolute cut"))?;
        let source = self.native_identity_at(records, head.terminal_digest);
        let mut state =
            materialized_checkpoint::Checkpoint::capture(self, source.clone(), head.manifest)?;
        let failed = Cell::new(false);
        self.with_relay_segment_base_stream(principal, &failed, |mut stream| {
            if stream.info.identity.source != source
                || stream.info.identity.manifest != head.manifest
            {
                return Err(Error::Contract("relay segment base predecessor changed"));
            }
            if encoding == SegmentCheckpointEncoding::IndexedAssetHistory {
                let history =
                    stream.capture_asset_packet_history()?.inspect_err(|_| failed.set(true))?;
                state.include_asset_history(history);
            }
            stream.write_and_pin(archive, &failed)?;
            let predecessor = stream.info.identity.clone();
            let mut checkpoint_file = BufWriter::new(checkpoint);
            let (checkpoint_result, sha256) = {
                let mut writer = BackupOutput {
                    destination: &mut checkpoint_file,
                    digest: ArchiveDigest::new(
                        materialized_checkpoint::MAX_CHECKPOINT_BYTES as u64,
                    ),
                    failed: &failed,
                };
                let result = serde_json::to_writer(&mut writer, &state)
                    .map_err(Error::from)
                    .and_then(|()| writer.flush().map_err(Error::from));
                (result, writer.digest.finish().0)
            };
            // Failed output may still be buffered. Do not let Drop retry after the custody check.
            let _ = checkpoint_file.into_parts();
            // Even a destination failure must not hide uncertain retained custody.
            if let Err(error) = stream.check() {
                failed.set(false);
                return Err(error);
            }
            let () = checkpoint_result.inspect_err(|_| failed.set(true))?;
            let checkpoint = RelayCheckpointIdentity { source, manifest: head.manifest, sha256 };
            Ok(RelaySegmentBaseIdentity { predecessor, checkpoint })
        })
    }
}
