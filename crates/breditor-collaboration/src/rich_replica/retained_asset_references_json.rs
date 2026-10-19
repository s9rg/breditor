//! Source-bound complete native inventory encoding, without a new history family.
use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::codec::{
    RichAssetReferenceCodecError, RichAssetRetention, encode_rich_asset_references,
};

impl RichReplica {
    /// Encode the complete guarded owner-only retained-image inventory, including read-only mode.
    /// # Errors
    /// Stale/foreign guards, unsupported/incomplete causal history and complete read/output limits
    /// reject without publishing or returning a prefix. The result never grants deletion authority.
    pub fn retained_asset_references_json_guarded(
        &self,
        observed: &SharedObservation,
    ) -> Result<String, Error> {
        let references = self.retained_asset_references_guarded(observed)?;
        let revision = self
            .journal
            .publication
            .parse::<u64>()
            .map_err(|_| Error::Contract("retained asset read publication"))?;
        encode_rich_asset_references(
            self.document(),
            revision,
            RichAssetRetention::SharedCausal,
            &references,
        )
        .map_err(|error| match error {
            RichAssetReferenceCodecError::Limit => {
                Error::Limit("retained asset complete encoded read")
            }
            _ => Error::Contract("retained asset canonical read encoding"),
        })
    }
}
