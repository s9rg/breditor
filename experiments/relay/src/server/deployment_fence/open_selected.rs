//! Cold continuity is selected independently, not inferred from a restored archive.
use super::{RoomDeploymentAuthority, RoomDeploymentSelection, journal, permit::Permit};
use crate::Result;
use std::path::Path;

impl RoomDeploymentAuthority {
    /// Reopen existing custody only if the complete valid chain retains this exact
    /// independently saved selection, including its nonce, not just an epoch number.
    /// Later valid epochs are allowed. A missing/replaced pinned prefix is not repaired.
    /// The returned authority still needs a fresh CAS claim; no saved lease is revived.
    /// Existing `open` keeps its identity-only meaning. A caller supplying an older
    /// pin cannot detect later work for which it retained no independent witness.
    /// This is epoch-ledger continuity, not a complete room/client activation proof.
    ///
    /// ```compile_fail,E0308
    /// use breditor_collab_relay::server::{RoomDeploymentAuthority, RoomDeploymentLease, RoomDeploymentSelection};
    /// fn saved_choice_is_not_a_lease(root: &std::path::Path, pin: &RoomDeploymentSelection)
    ///     -> Result<RoomDeploymentLease, breditor_collab_relay::Error> {
    ///     RoomDeploymentAuthority::open_at_least(root, pin)
    /// }
    /// ```
    /// # Errors
    /// Wrong/noncanonical pin, missing history, divergent retained nonce, uncertain
    /// storage or real lock contention refuse without changing any existing bytes.
    pub fn open_at_least(root: &Path, expected: &RoomDeploymentSelection) -> Result<Self> {
        expected.validate_pin()?;
        let authority = Self::open(root, &expected.identity)?;
        let mut held = Permit::try_acquire(&authority.state, false)?;
        let current = authority.state.selected(held.file()?)?;
        journal::retains_selection(
            held.file()?,
            &authority.state.header_digest,
            authority.state.offset,
            &current,
            expected,
        )?;
        held.finish()?;
        authority.state.healthy()?;
        Ok(authority)
    }
}
