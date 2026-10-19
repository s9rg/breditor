//! Exclusive native owner capture. No visible-document fallback, flush, provider fetch or GC.
use super::{
    ServerAssetReferenceOutcome, ServerRetainedAssetReferences,
    packets::{self, References},
    read_budget,
};
use crate::{Error, Result, Room};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
impl Room {
    /// Inventory conservative native causal history and every complete retained server packet.
    /// Includes deleted/losing image bindings, versions, proposals, committed revisions and
    /// complete orphaned revision Prepare records, even after replay abandons their active state.
    /// The caller authenticates the owner before supplying its principal, as for other Room APIs.
    /// This read changes no author history, role, lease, receipt, publication, file or asset.
    ///
    /// # Errors
    /// Rejects non-owners, uncertain/externally changed storage, invalid native dependency reads,
    /// incomplete causal forms, missing typed packet ancestry and whole encoded/count budgets.
    /// Native packet source Pending remains Pending, never a partial Ready reference list.
    pub fn retained_asset_references(
        &mut self,
        principal: &str,
    ) -> Result<ServerRetainedAssetReferences> {
        self.recovery_inventory_owner(principal)?;
        let selected = self.backup_identity()?;
        let records = self.log.snapshot()?.records()?;
        let observation = self.replica.observe()?;
        let mut output = References::default();
        output.add(
            self.replica.retained_asset_references_guarded(&observation)?.into_iter().map(|r| {
                VersionAssetReference {
                    asset: r.asset().as_str().into(),
                    generation: r.generation().as_str().into(),
                }
            }),
        )?;
        output.add(self.retained_effect_asset_references()?)?;
        packets::collect(self, records, &mut output)?;
        self.replica.check(&observation)?;
        if self.backup_identity()? != selected {
            return Err(Error::Contract("server asset reference native cut changed"));
        }
        let outcome = if output.pending.is_empty() {
            ServerAssetReferenceOutcome::Ready { references: output.pairs.into_iter().collect() }
        } else {
            ServerAssetReferenceOutcome::Pending { packets: output.pending }
        };
        let value = ServerRetainedAssetReferences {
            format: "breditor/server-retained-asset-references",
            format_version: 1,
            room: selected,
            scope: "native-causal-and-complete-server-log-packets",
            sources: output.sources,
            outcome,
        };
        read_budget::check(&value)?;
        Ok(value)
    }
}
