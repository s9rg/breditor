//! Shared data encoding for separately authenticated physical/generation reads.
//! It cannot manufacture a live controller, accepted receipt or editing grant.
use crate::{
    Error, Result,
    room::metadata_receipts::{MetadataPage, MetadataPageSelection},
};
use serde::{Deserialize, Serialize};

pub(super) const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub(super) const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
pub(super) const SCOPE: &str =
    "selected-server-original-metadata-receipts-and-packet-fingerprints-page";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request<S> {
    format: String,
    format_version: u32,
    selection: S,
    pub metadata: MetadataPageSelection,
}
impl<S: PartialEq> Request<S> {
    pub fn validate(&self, expected: &S, family: &str) -> Result<()> {
        if self.format != family || self.format_version != 1 || self.selection != *expected {
            return Err(Error::Contract("metadata page request source or family"));
        }
        self.metadata.validate()
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
    pub metadata: MetadataPage,
}
