//! Atomic single-writer groups for relay admission, separate from trusted full-state catchup.
mod admission;
mod digest;
mod export;
mod frame;
mod window;
pub use admission::{PreparedWriterGroup, WriterGroupPreparation, WriterReceipt};
pub use export::WriterClock;
pub use frame::WriterDependency;
pub(super) use window::Window;
const MAX_ENGINE_BYTES: usize = 1024 * 1024;
const MAX_GROUP_BYTES: usize = 5 * MAX_ENGINE_BYTES;
const MAX_BATCH_BYTES: usize = 8 * MAX_ENGINE_BYTES;
const MAX_GROUPS: usize = 64;
const ENGINE: &str = "1.16.2+breditor.deterministic-history.1";
