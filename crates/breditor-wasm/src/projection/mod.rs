#[cfg(feature = "diagnostic-projection-child-count")]
mod child_count_diagnostics;
#[cfg(feature = "diagnostic-projection-format-count")]
mod format_count_diagnostics;
#[cfg(feature = "experimental-text-blocks")]
mod heading;
mod impact;
#[cfg(feature = "experimental-flat-lists")]
mod list;
mod node_record;
mod read_projection;
mod snapshot;
mod snapshot_result;
mod update;

#[cfg(feature = "diagnostic-projection-child-count")]
pub use child_count_diagnostics::debug_last_projection_child_count;
#[cfg(feature = "diagnostic-projection-format-count")]
pub use format_count_diagnostics::debug_last_projection_format_count;
pub use snapshot::BreditorProjection;
pub use snapshot_result::BreditorProjectionResult;
pub use update::BreditorProjectionUpdate;
