//! Durable storage-phase handoff; account/provider/client activation remains separate.
mod begin;
mod context;
#[cfg(feature = "server")]
mod host_custody;
#[cfg(feature = "server")]
pub(crate) use host_custody::GenerationOperationCustody;
mod coordinator;
mod interruption;
mod marker;
mod publish;
mod resume;
#[cfg(test)]
mod tests;
pub use coordinator::OperationalLogGenerationServerRoom;
