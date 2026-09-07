//! Guarded non-JSON action-state reads for expandable host controls.

#[cfg(test)]
mod abi_fixture_action;
mod read;
mod result;
mod snapshot;

pub use result::BreditorActionStatesResult;
pub use snapshot::BreditorActionStateSnapshot;
