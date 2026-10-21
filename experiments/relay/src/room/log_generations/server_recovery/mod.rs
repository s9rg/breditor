//! Exact joined native/raster restoration with actual component custody and one final barrier.
mod begin;
mod check_live;
mod coordinator;
mod custody;
mod finish;
#[cfg(test)]
mod interruption;
mod inventory;
mod native_component;
mod operation;
mod progress;
mod raster_directory;
mod raster_part;
mod selection;
#[cfg(test)]
pub(super) mod tests;
pub(super) use super::recovery::files;
pub use coordinator::{RecoveredLogGenerationServerRoom, ServerLogGenerationRoomRecovery};
#[cfg(feature = "server")]
pub(crate) use operation::GenerationOperationCustody;
pub use operation::OperationalLogGenerationServerRoom;
pub use progress::ServerLogGenerationRoomRecoveryProgress;
