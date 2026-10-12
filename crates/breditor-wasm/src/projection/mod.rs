#[cfg(feature = "diagnostic-projection-child-count")]
mod child_count_diagnostics;
#[cfg(feature = "candidate-explicit-child-count")]
mod child_count_transport;
#[cfg(feature = "candidate-word-child-count")]
mod child_count_words;
#[cfg(feature = "diagnostic-projection-format-count")]
mod format_count_diagnostics;
#[cfg(feature = "experimental-text-blocks")]
mod heading;
mod impact;
#[cfg(feature = "experimental-flat-lists")]
mod list;
mod node_record;
#[cfg(feature = "candidate-word-property-integers")]
mod property_integer_words;
mod read_projection;
#[cfg(feature = "candidate-word-projection-scalars")]
mod scalar_words;
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
