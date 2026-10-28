//! Independent review namespace and positive, ordered requested ranges.
use super::super::PhysicalRoomRecoveryControlIdentity;
use crate::{Error, Result, ReviewOriginalAuthorizationRange};
use serde::Deserialize;
pub(in crate::server) const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub(super) const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    format: String,
    format_version: u32,
    pub selection: PhysicalRoomRecoveryControlIdentity,
    pub binding: String,
    pub ranges: Vec<ReviewOriginalAuthorizationRange>,
}
impl Request {
    pub fn validate(&self, selected: &PhysicalRoomRecoveryControlIdentity) -> Result<()> {
        if self.format != "breditor/physical-room-review-original-authorizations-request"
            || self.format_version != 1
            || self.selection != *selected
        {
            return Err(Error::Contract("original review authority request family or source"));
        }
        ReviewOriginalAuthorizationRange::validate_list(&self.binding, &self.ranges)
    }
}
