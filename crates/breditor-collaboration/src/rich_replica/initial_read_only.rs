//! One-shot local policy initialization at the unobserved Wasm ownership boundary.
//!
//! This capability is crate-private: native callers cannot use it to bypass a
//! live owner's guarded policy publications. The Wasm wrapper permanently seals
//! it before returning either kind of observation, even if that guard is freed.
//! No permission is read from a checkpoint, journal entry, role or wire frame.

use super::RichReplica;
use crate::Error;
use std::cell::Cell;

pub(crate) struct InitialReadOnly {
    open: Cell<bool>,
}

impl InitialReadOnly {
    pub(crate) const fn new() -> Self {
        Self { open: Cell::new(true) }
    }

    pub(crate) fn seal(&self) {
        self.open.set(false);
    }

    /// Set the host-selected mode exactly once, without publishing or editing history.
    pub(crate) fn initialize(&self, owner: &mut RichReplica, read_only: bool) -> Result<(), Error> {
        if !self.open.replace(false) {
            return Err(Error::Contract("initial read-only policy requires an unobserved owner"));
        }
        owner.read_only = read_only;
        Ok(())
    }
}

#[cfg(test)]
#[path = "initial_read_only_tests.rs"]
mod tests;
