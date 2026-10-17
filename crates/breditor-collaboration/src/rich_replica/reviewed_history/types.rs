//! Closed nonsecret recovery attribution. The caller separately authenticates server decisions.
use crate::{
    Error,
    rich_replica::{DocumentSuggestionEffect, session::writer_id},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde::{Deserialize, Serialize};

/// Pinned local history identity, not account authentication, permission or a writer lease.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewedHistoryIdentity {
    /// Exact separately enabled suggestion lane, supplied from authenticated host metadata.
    pub binding: String,
    /// Account whose exact device-owned final decisions may enter this local history.
    pub principal: ReviewPrincipalId,
    /// Separately owned host effect author; never this local document writer.
    pub effect_writer: String,
}
impl ReviewedHistoryIdentity {
    pub(super) fn check(&self, local: &str) -> Result<(), Error> {
        if self.binding.len() != 64
            || !self.binding.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || writer_id(&self.effect_writer)? == writer_id(local)?
        {
            return Err(Error::Contract("reviewed history lane identity"));
        }
        Ok(())
    }
}

/// Descriptive ORIGINAL owned Accept supplied by an already authenticated host integration.
/// Rust proves the native effect and exact local device binding, not server authority or fsync.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnedSuggestionAcceptance {
    /// Exact original suggestion lane, not a credential.
    pub binding: String,
    /// Canonical positive u64 server decision order, not a wall-clock timestamp.
    pub sequence: String,
    /// Original authenticated deciding account, not the proposal's display author.
    pub principal: ReviewPrincipalId,
    /// Original authenticated document device; another device on this account cannot adopt it.
    pub accepting_writer: String,
    /// Native-proven original proposal and effect range, including its semantic-only start.
    pub effect: DocumentSuggestionEffect,
}
impl OwnedSuggestionAcceptance {
    pub(super) fn check(
        &self,
        identity: &ReviewedHistoryIdentity,
        local: &str,
    ) -> Result<(), Error> {
        identity.check(local)?;
        let order =
            self.sequence.parse::<u64>().map_err(|_| Error::Contract("reviewed decision order"))?;
        if order == 0
            || order.to_string() != self.sequence
            || self.binding != identity.binding
            || self.principal != identity.principal
            || self.accepting_writer != local
            || self.effect.writer_group.writer != identity.effect_writer
        {
            return Err(Error::Contract("reviewed acceptance account/device/lane"));
        }
        Ok(())
    }
}
