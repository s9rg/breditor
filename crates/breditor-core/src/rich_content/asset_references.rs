//! Native immutable image references, without byte resolution or deletion authority.
use super::{AssetGeneration, AssetId, RichDocument, RichIdentityError};
use std::collections::BTreeSet;

/// Independent complete-read ceiling; overflow rejects instead of truncating references.
pub const RICH_ASSET_REFERENCE_MAX_BINDINGS: usize = 100_000;

/// One immutable host asset and its exact image-binding generation.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct RichAssetReference {
    asset: AssetId,
    generation: AssetGeneration,
}
impl RichAssetReference {
    /// Validate both opaque native identities, without requiring a particular asset provider.
    /// # Errors
    /// Rejects invalid identity syntax; hashes, receipts and permissions are not inferred.
    pub fn try_new(asset: &str, generation: &str) -> Result<Self, RichIdentityError> {
        Ok(Self {
            asset: AssetId::try_new(asset)?,
            generation: AssetGeneration::try_new(generation)?,
        })
    }
    /// Exact immutable host asset identity, not an object URL or credential.
    #[must_use]
    pub const fn asset(&self) -> &AssetId {
        &self.asset
    }
    /// Original paired binding generation; never reconstructed from another contribution.
    #[must_use]
    pub const fn generation(&self) -> &AssetGeneration {
        &self.generation
    }
}

/// Payload-free failure of a complete native asset-reference read.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichAssetReferenceError {
    /// No partial result may escape when the separate reference budget is exceeded.
    #[error("asset reference read exceeds its complete-result budget")]
    Limit,
    /// An admitted document and its native identity directory disagree.
    #[error("asset reference read contradicts the admitted document")]
    Invariant,
    /// The caller did not observe this exact native owner publication.
    #[error("asset reference read requires the current owner observation")]
    Observation,
}

pub(crate) fn collect_document(
    document: &RichDocument,
    output: &mut BTreeSet<RichAssetReference>,
) -> Result<(), RichAssetReferenceError> {
    // The directory includes covered table-cell content, not just rendered image nodes.
    for id in document.image_ids() {
        let image = document
            .image(id)
            .map_err(|_| RichAssetReferenceError::Invariant)?
            .ok_or(RichAssetReferenceError::Invariant)?;
        output.insert(RichAssetReference {
            asset: image.asset().clone(),
            generation: image.generation().clone(),
        });
        if output.len() > RICH_ASSET_REFERENCE_MAX_BINDINGS {
            return Err(RichAssetReferenceError::Limit);
        }
    }
    Ok(())
}

/// Read every image in this admitted AST, including covered cells, in canonical pair order.
///
/// This is current content only. Use a local/shared retained-history read and include separate
/// versions/outboxes before making a room backup. An inventory grants no collection authority.
/// # Errors
/// Rejects directory contradictions or complete-result budget overflow without a partial prefix.
pub fn inspect_rich_asset_references(
    document: &RichDocument,
) -> Result<Vec<RichAssetReference>, RichAssetReferenceError> {
    let mut output = BTreeSet::new();
    collect_document(document, &mut output)?;
    Ok(output.into_iter().collect())
}
