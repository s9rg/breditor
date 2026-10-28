//! Closed request choices; omission never silently skips an enabled review lane.
use super::super::ServerLogGenerationRecoveryControlIdentity;
use crate::{Error, Result, ReviewCursor};
use serde::Deserialize;

pub(in crate::server) const MAX_REQUEST_BYTES: usize = 64 * 1024;
/// Includes the existing 5 MiB native document envelope after outer escaping,
/// one existing 4 MiB review page, and the independently selected control.
pub(super) const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Document {
    Include,
    Omit,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Review {
    Absent {},
    Start {},
    After { cursor: ReviewCursor },
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    format: String,
    format_version: u32,
    pub selection: ServerLogGenerationRecoveryControlIdentity,
    pub document: Document,
    pub review: Review,
}
impl Request {
    pub fn validate(&self, expected: &ServerLogGenerationRecoveryControlIdentity) -> Result<()> {
        if self.format != "breditor/server-log-generation-recovery-accepted-native-request"
            || self.format_version != 1
            || self.selection != *expected
        {
            return Err(Error::Contract("accepted native request source or family"));
        }
        if let Review::After { cursor } = &self.review
            && (cursor.binding.len() != 64
                || !cursor
                    .binding
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                || cursor
                    .after
                    .parse::<u64>()
                    .ok()
                    .is_none_or(|after| after.to_string() != cursor.after))
        {
            return Err(Error::Contract("accepted native review cursor spelling"));
        }
        Ok(())
    }
}
