//! Distinct complete physical source, conservative native history and every retained packet.
use super::{
    ServerAssetReferenceOutcome, ServerLogGenerationRetainedAssetReferences,
    packets::PacketScanner, read_budget,
};
use crate::{Result, Room};
impl Room {
    /// Read conservative causal/effect history and every complete retained packet across all
    /// physical files, including inert revision preparations. Neither the visible AST nor active
    /// catalog entries substitute for retained dependencies. One packet scanner spans all files.
    /// The whole actual archive is pinned/rechecked under current owner access; no provider fetch,
    /// upload, deletion, source event or connection lease is performed. Client sources are separate.
    /// # Errors
    /// Non-owner access, original/changed/uncertain storage, incomplete source reads and complete
    /// pair/encoded budgets refuse. Missing native packet dependencies yield whole Pending only.
    pub fn log_generation_retained_asset_references(
        &mut self,
        principal: &str,
    ) -> Result<ServerLogGenerationRetainedAssetReferences> {
        self.recovery_inventory_owner(principal)?;
        let observed = self.replica.observe()?;
        let mut output = self.native_retained_reference_seed(&observed)?;
        let mut packets = PacketScanner::default();
        let source = self.visit_generation_backup_records(principal, |replica, record| {
            packets.accept(replica, &observed, record, &mut output)
        })?;
        self.replica.check(&observed)?;
        let outcome = if output.pending.is_empty() {
            ServerAssetReferenceOutcome::Ready { references: output.pairs.into_iter().collect() }
        } else {
            ServerAssetReferenceOutcome::Pending { packets: output.pending }
        };
        let value = ServerLogGenerationRetainedAssetReferences {
            format: "breditor/server-log-generation-asset-references",
            format_version: 1,
            source,
            scope: "native-causal-and-complete-physical-generation-packets",
            sources: output.sources,
            outcome,
        };
        read_budget::check(&value)?;
        Ok(value)
    }
}
