//! Closed new wire family; uploaded content IDs never invent native binding generations.
use super::super::ServerLogGenerationRecoveryControlIdentity;
use crate::{Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, Result};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde::Deserialize;

pub(in crate::server) const MAX_BYTES: usize = crate::server::MAX_SERVER_ASSET_AVAILABILITY_BYTES;
#[derive(Deserialize, Eq, Ord, PartialEq, PartialOrd)]
#[serde(deny_unknown_fields)]
pub(super) struct Binding {
    pub asset: String,
    pub generation: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    format: String,
    format_version: u32,
    pub selection: ServerLogGenerationRecoveryControlIdentity,
    pub references: Vec<Binding>,
    pub uploads: Vec<String>,
}
pub(super) fn content(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
impl Request {
    pub fn validate(&self, selected: &ServerLogGenerationRecoveryControlIdentity) -> Result<()> {
        if self.format != "breditor/server-log-generation-recovery-asset-requirements"
            || self.format_version != 1
            || self.selection != *selected
            || self.references.len().saturating_add(self.uploads.len())
                > MAX_SERVER_ASSET_REFERENCE_PAIRS
            || self.references.windows(2).any(|pair| pair[0] >= pair[1])
            || self.uploads.windows(2).any(|pair| pair[0] >= pair[1])
            || self.references.iter().any(|pair| {
                [&pair.asset, &pair.generation]
                    .iter()
                    .any(|value| value.is_empty() || value.len() > 1024)
            })
            || self.uploads.iter().any(|asset| !content(asset))
        {
            return Err(Error::Contract("generation client asset requirement selection or bounds"));
        }
        Ok(())
    }
    pub fn references(&self) -> impl Iterator<Item = VersionAssetReference> + '_ {
        self.references.iter().map(|pair| VersionAssetReference {
            asset: pair.asset.clone(),
            generation: pair.generation.clone(),
        })
    }
}
