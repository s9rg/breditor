//! Complete native server dependency DATA, separate from original metadata catalogs,
//! provider-byte checks, client acknowledgements and serving activation.
use crate::{Error, Result, ServerLogGenerationRetainedAssetReferences};
use serde::{Deserialize, Serialize};

pub(super) const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub(super) const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
pub(super) const SCOPE: &str =
    "selected-server-native-causal-and-complete-physical-packet-dependencies";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request<S> {
    format: String,
    format_version: u32,
    selection: S,
}
impl<S: PartialEq> Request<S> {
    pub fn validate(&self, expected: &S, family: &str) -> Result<()> {
        if self.format != family || self.format_version != 1 || self.selection != *expected {
            return Err(Error::Contract("native dependency request source or family"));
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Read<S> {
    pub format: &'static str,
    pub format_version: u32,
    pub selection: S,
    pub request_sha256: String,
    pub scope: &'static str,
    pub native: ServerLogGenerationRetainedAssetReferences,
}
