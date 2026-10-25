//! Detached original native payloads; no editing grant, new receipt or activation.
use super::super::PhysicalRoomRecoveryControlIdentity;
use crate::ReviewCatchup;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Read {
    pub format: &'static str,
    pub format_version: u32,
    pub selection: PhysicalRoomRecoveryControlIdentity,
    pub request_sha256: String,
    pub scope: &'static str,
    pub document_frame: Option<String>,
    /// Historical batch sources are preserved. currentRole describes the
    /// authenticated server-side reader, NEVER a recipient client's permission.
    pub review: Option<ReviewCatchup>,
}
