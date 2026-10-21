//! Durable storage-phase handoff; account/provider/client activation remains separate.
mod begin;
mod context;
mod coordinator;
mod interruption;
mod marker;
mod publish;
mod resume;
#[cfg(test)]
mod tests;
pub use coordinator::OperationalLogGenerationServerRoom;
