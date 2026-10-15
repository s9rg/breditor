//! Account-level room roles, kept independent of causal writer identifiers.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Persisted document permission. The immutable initial owner separately administers roles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    /// Read admitted catchup and presence; no authored writes or writer allocation.
    Reader,
    /// Read and submit through an exclusively leased writer owned by this principal.
    Editor,
}

pub(crate) fn principal(value: &str) -> Result<()> {
    if value.is_empty() || value.len() > 128 || value.chars().any(char::is_control) {
        return Err(Error::Contract("principal identifier"));
    }
    Ok(())
}
