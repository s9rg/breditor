//! Bounded retained-image metadata; neither a checkpoint nor deletion authority.
use super::json_size::JsonByteCounter;
use crate::rich_content::{RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference, RichDocument};
use serde::Serialize;

/// Independent read family; original document/view/history formats stay closed.
pub const RICH_ASSET_REFERENCES_FORMAT: &str = "breditor/rich-retained-asset-references";
/// Original retained-reference read contract revision.
pub const RICH_ASSET_REFERENCES_VERSION: u32 = 1;
/// Complete encoded read ceiling; overflow rejects without returning a prefix.
pub const RICH_ASSET_REFERENCES_MAX_JSON_BYTES: usize = 8 * 1024 * 1024;

/// Native owner history represented by the read, not a room-wide completeness claim.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RichAssetRetention {
    /// Current local content and every retained before/after state, including Redo.
    LocalHistory,
    /// Conservative complete retained shared causal history, including inactive contributions.
    SharedCausal,
}
/// Payload-free failure of complete retained-reference serialization.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichAssetReferenceCodecError {
    /// Count or encoded bytes exceed the separate complete-read policy.
    #[error("asset reference read exceeds its complete-output budget")]
    Limit,
    /// Input pairs must already be unique and sorted by native identity order.
    #[error("asset reference read is not in canonical pair order")]
    Order,
    /// Private native serialization failed before any result escaped.
    #[error("asset reference read encoding failed")]
    Encoding,
}
#[derive(Serialize)]
struct Binding<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
struct Reference<'a> {
    asset: &'a str,
    generation: &'a str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    schema: Binding<'a>,
    document: &'a str,
    revision: String,
    retention: RichAssetRetention,
    references: Vec<Reference<'a>>,
}

/// Serialize a guarded owner's retained pairs with its exact document/revision binding.
///
/// This encoder checks shape/order/limits, not ownership: callers must obtain the pairs and
/// binding from the same guarded native owner. Detached metadata is never mutation, provider
/// or collection authority, and cannot prove that an asynchronous capture remained current.
/// # Errors
/// Rejects count/order/complete encoded byte limits and private serialization failure.
pub fn encode_rich_asset_references(
    document: &RichDocument,
    revision: u64,
    retention: RichAssetRetention,
    references: &[RichAssetReference],
) -> Result<String, RichAssetReferenceCodecError> {
    if references.len() > RICH_ASSET_REFERENCE_MAX_BINDINGS {
        return Err(RichAssetReferenceCodecError::Limit);
    }
    if references.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(RichAssetReferenceCodecError::Order);
    }
    let schema = document.document().schema();
    let read = Read {
        format: RICH_ASSET_REFERENCES_FORMAT,
        format_version: RICH_ASSET_REFERENCES_VERSION,
        schema: Binding {
            name: schema.name().as_str(),
            version: schema.version().get(),
            fingerprint: document.document().schema_fingerprint().to_string(),
        },
        document: document.id().as_str(),
        revision: revision.to_string(),
        retention,
        references: references
            .iter()
            .map(|reference| Reference {
                asset: reference.asset().as_str(),
                generation: reference.generation().as_str(),
            })
            .collect(),
    };
    let mut counter = JsonByteCounter::new(RICH_ASSET_REFERENCES_MAX_JSON_BYTES);
    let result = serde_json::to_writer(&mut counter, &read);
    if counter.exceeded() {
        return Err(RichAssetReferenceCodecError::Limit);
    }
    result.map_err(|_| RichAssetReferenceCodecError::Encoding)?;
    serde_json::to_string(&read).map_err(|_| RichAssetReferenceCodecError::Encoding)
}
