//! Durable storage-phase handoff; account/provider/client activation remains separate.
mod begin;
mod context;
#[cfg(feature = "server")]
mod host_custody;
#[cfg(feature = "server")]
pub(crate) use host_custody::GenerationOperationCustody;
mod coordinator;
mod inspect_torn_tail;
mod interruption;
mod marker;
mod open_committed;
mod publish;
mod resume;
#[cfg(test)]
mod tests;
pub use coordinator::OperationalLogGenerationServerRoom;
pub use inspect_torn_tail::InspectedNativeGenerationTail;
