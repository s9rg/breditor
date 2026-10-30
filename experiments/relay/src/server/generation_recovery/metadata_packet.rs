//! Separate selected packet transfer. Original receipt-page wire contracts and
//! defaults remain unchanged; returned bytes are DATA, never an installed ACK.
use crate::{
    Error, Result,
    room::metadata_receipts::{MetadataPacketQuery, MetadataPacketRead},
};
use serde::{Deserialize, Serialize};

pub(super) const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub(super) const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
pub(super) const SCOPE: &str = "selected-server-original-accepted-metadata-packet-bytes";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request<S> {
    format: String,
    format_version: u32,
    selection: S,
    pub packet: MetadataPacketQuery,
}
impl<S: PartialEq> Request<S> {
    pub fn validate(&self, expected: &S, family: &str) -> Result<()> {
        if self.format != family || self.format_version != 1 || self.selection != *expected {
            return Err(Error::Contract("metadata packet request source or family"));
        }
        self.packet.validate()
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
    pub packet: MetadataPacketRead,
}
