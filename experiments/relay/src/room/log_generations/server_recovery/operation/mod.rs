//! Durable storage-phase handoff; account/provider/client activation remains separate.
mod begin;
#[cfg(feature = "server")]
mod complete_pending_rotation;
mod context;
#[cfg(feature = "server")]
mod host_custody;
#[cfg(feature = "server")]
pub(crate) use host_custody::GenerationOperationCustody;
mod coordinator;
#[cfg(feature = "server")]
mod inspect_pending_raster;
#[cfg(feature = "server")]
mod inspect_pending_rotation;
mod inspect_torn_tail;
mod interruption;
mod marker;
mod open_committed;
mod publish;
#[cfg(feature = "server")]
mod repair_native_prefix;
mod resume;
#[cfg(feature = "server")]
mod retire_pending_raster;
#[cfg(test)]
mod tests;
pub use coordinator::OperationalLogGenerationServerRoom;
pub use inspect_torn_tail::InspectedNativeGenerationTail;
