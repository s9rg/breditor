//! Explicit replay capability, independent from document grammar and peer causal semantics.
use super::{
    RichReplica, SharedObservation, SharedRichProfile,
    session::{Journal, MAX_JOURNAL_BYTES},
};
use crate::Error;

pub(super) const JOURNAL: &str = "breditor/rich-replica-general-journal";
pub(super) const TYPING_JOURNAL: &str = "breditor/rich-replica-general-typing-journal";
pub(super) const TYPING_ENVELOPE: &str = "breditor/shared-general-typing-session";
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ReplayContract {
    Original,
    GeneralV1,
    DocumentV1,
}
/// Native-only capability selection; never silently inferred from saved records.
#[derive(Clone, Copy)]
pub(super) struct ReplayCapabilities {
    pub scope: ReplayContract,
    pub reviewed: bool,
    pub search: bool,
}
impl ReplayCapabilities {
    pub fn journal(self, protocol: super::protocol::Protocol, typing: bool) -> (&'static str, u32) {
        if self.search {
            super::search::journal(self.scope, typing)
        } else {
            self.scope.journal(protocol, typing)
        }
    }
}
impl ReplayContract {
    pub const fn journal(
        self,
        protocol: super::protocol::Protocol,
        typing: bool,
    ) -> (&'static str, u32) {
        match (self, typing) {
            (Self::Original, false) => ("breditor/rich-replica-journal", protocol.journal()),
            (Self::Original, true) => {
                (super::typing_history::JOURNAL_FORMAT, super::typing_history::JOURNAL_VERSION)
            }
            (Self::GeneralV1, false) => (JOURNAL, 1),
            (Self::GeneralV1, true) => (TYPING_JOURNAL, 1),
            (Self::DocumentV1, false) => (super::document_checkpoint::JOURNAL, 1),
            (Self::DocumentV1, true) => (super::document_checkpoint::TYPING_JOURNAL, 1),
        }
    }
}
impl RichReplica {
    /// Whether this owner explicitly selected the general semantic range replay family.
    #[must_use]
    pub const fn general_ranges_enabled(&self) -> bool {
        matches!(self.replay_contract, ReplayContract::GeneralV1 | ReplayContract::DocumentV1)
    }
    /// Select the separate general-range history family without changing causal content or stacks.
    /// Original records replay unchanged. This is one-way and requires explicit matching recovery.
    /// # Errors
    /// Stale/read-only, replay, policy or save-budget failure retains the original family and owner.
    pub fn enable_general_ranges_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.general_ranges_enabled() {
            return Ok(false);
        }
        self.require_writable()?;
        let mut candidate = self.staged()?;
        candidate.replay_contract = ReplayContract::GeneralV1;
        let (format, version) = candidate.history_family(candidate.typing.is_some());
        candidate.journal.format = format.into();
        candidate.journal.version = version;
        self.adopt(candidate)?;
        Ok(true)
    }
    /// Save an explicitly enabled general-range owner with ordinary selective history.
    /// # Errors
    /// Wrong history family or the unchanged whole-journal byte budget rejects.
    pub fn general_checkpoint(&self) -> Result<String, Error> {
        if self.replay_contract != ReplayContract::GeneralV1 || self.typing.is_some() {
            return Err(Error::Contract("explicit general history checkpoint required"));
        }
        self.encode_explicit_journal()
    }
}
impl SharedRichProfile {
    /// Recover only the explicit general-range journal after reacquiring its exact writer lease.
    /// Old factories continue rejecting this family; general recovery never silently upgrades old saves.
    /// # Errors
    /// Wrong family/room/schema, replay divergence, unknown records and resource failures reject.
    pub fn restore_general(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        if input.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("general journal bytes"));
        }
        let journal: Journal = serde_json::from_str(input)?;
        if journal.document != room {
            return Err(Error::Contract("general journal room"));
        }
        RichReplica::from_journal_contract_parts(
            self.codec.clone(),
            journal,
            None,
            false,
            ReplayContract::GeneralV1,
        )
    }
}
