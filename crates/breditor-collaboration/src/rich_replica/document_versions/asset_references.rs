//! Snapshot dependency reads do not infer source authenticity or import native operations.
use super::packet::Packet;
use crate::{
    Error,
    rich_replica::{
        PacketAssetIdentity, PacketAssetReferences, RichReplica, SharedObservation,
        packet_asset_references::{self, admission},
    },
};
use breditor_core::rich_content::inspect_rich_asset_references;
impl RichReplica {
    /// Read every native image binding in an admitted immutable snapshot, including covered cells.
    /// Imported authorship and historical-source claims remain separately verified host concerns.
    /// # Errors
    /// Stale/foreign guards, packet/native admission or complete count/work budgets reject purely.
    pub fn document_version_asset_references_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<PacketAssetReferences, Error> {
        self.check(observed)?;
        let (packet, document) = admission(Packet::read(self, input))?;
        let pairs = inspect_rich_asset_references(&document)
            .map_err(|_| Error::Limit("packet asset admitted snapshot read"))?;
        Ok(PacketAssetReferences {
            packet: PacketAssetIdentity::Version { id: packet.id },
            outcome: packet_asset_references::ready(pairs)?,
        })
    }
    /// Encode the exact guarded admitted snapshot dependency read in its independent metadata family.
    /// # Errors
    /// Native packet/read admission and complete encoded output bounds reject without a prefix.
    pub fn document_version_asset_references_json_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
    ) -> Result<String, Error> {
        packet_asset_references::encode(
            self,
            &self.document_version_asset_references_guarded(observed, input)?,
        )
    }
}
