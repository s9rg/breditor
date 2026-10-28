//! Unforgeable current serving epoch, not a restored account or portable receipt.
use super::{identity::RoomDeploymentSelection, journal, permit::Permit, state::State};
use crate::{Error, Result};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
struct LeaseState {
    authority: Arc<State>,
    selection: RoomDeploymentSelection,
    generation: u64,
    frame: [u8; 104],
    live: AtomicBool,
}
/// Actual host/file-bound serving lease. Clones share retirement; metadata does
/// not reconstruct it. Every native serving transaction rechecks current bytes.
/// ```compile_fail
/// use breditor_collab_relay::server::RoomDeploymentLease;
/// let _: RoomDeploymentLease = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::RoomDeploymentLease;
/// let _: RoomDeploymentLease = Default::default();
/// ```
#[derive(Clone)]
pub struct RoomDeploymentLease {
    state: Arc<LeaseState>,
}
impl RoomDeploymentLease {
    pub(super) fn new(
        authority: Arc<State>,
        selection: RoomDeploymentSelection,
        generation: u64,
        frame: [u8; 104],
    ) -> Self {
        Self {
            state: Arc::new(LeaseState {
                authority,
                selection,
                generation,
                frame,
                live: AtomicBool::new(true),
            }),
        }
    }
    /// Detached epoch choice only, never another serving lease.
    #[must_use]
    pub fn selection(&self) -> RoomDeploymentSelection {
        self.state.selection.clone()
    }
    /// Retire all clones. Already admitted native work retains its actual lock
    /// until it settles; retirement does not erase or roll back any accepted work.
    pub fn close(&self) {
        self.state.live.store(false, Ordering::Release);
    }
    pub(super) fn live(&self) -> Result<()> {
        self.state.authority.healthy()?;
        if self.state.live.load(Ordering::Acquire) { Ok(()) } else { Err(Error::Lease) }
    }
    /// Check actual current epoch bytes, not just a local boolean or DTO.
    /// # Errors
    /// Retired/superseded leases, busy/changed namespaces and uncertain storage refuse.
    pub fn check(&self) -> Result<()> {
        self.live()?;
        let mut held = Permit::try_acquire(&self.state.authority, false)?;
        self.check_held(&mut held)?;
        held.finish()?;
        self.live()
    }
    pub(super) fn authority(&self) -> super::RoomDeploymentAuthority {
        super::RoomDeploymentAuthority { state: self.state.authority.clone() }
    }
    pub(super) fn serving(&self) -> Result<Permit<'_>> {
        self.live()?;
        let mut held = Permit::serving(&self.state.authority)?;
        self.check_held(&mut held)?;
        Ok(held)
    }
    pub(super) fn check_held(&self, held: &mut Permit<'_>) -> Result<()> {
        let state = &self.state.authority;
        state.check_file(held.file()?)?;
        let current = journal::check_lease(
            held.file()?,
            &state.identity,
            &state.header_digest,
            state.offset,
            self.state.generation,
            &self.state.frame,
        );
        match &current {
            Ok(()) | Err(Error::Lease) => {}
            Err(_) => state.poisoned.store(true, Ordering::Release),
        }
        current?;
        state.check_file(held.file()?)?;
        self.live()
    }
}
