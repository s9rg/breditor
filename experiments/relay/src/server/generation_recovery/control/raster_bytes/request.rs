//! A content ID selects bytes, never a provider mapping or an editing lease.
use super::super::ServerLogGenerationRecoveryControlIdentity;
use crate::{Error, Result};
use serde::Deserialize;
pub(in super::super) const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub(super) const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    format: String,
    format_version: u32,
    pub selection: ServerLogGenerationRecoveryControlIdentity,
    pub asset: String,
}
impl Request {
    pub fn validate(&self, selected: &ServerLogGenerationRecoveryControlIdentity) -> Result<()> {
        let content = self.asset.strip_prefix("sha256:").is_some_and(|value| {
            value.len() == 64
                && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        });
        if self.format != "breditor/server-log-generation-recovery-raster-request"
            || self.format_version != 1
            || self.selection != *selected
            || !content
        {
            return Err(Error::Contract("recovery raster request selection or content identity"));
        }
        Ok(())
    }
}
