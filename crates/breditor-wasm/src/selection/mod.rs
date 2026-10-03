mod clear_selection;
#[cfg(feature = "diagnostic-selection-inputs")]
mod input_diagnostics;
mod node_index;
mod read_selection;
mod scalar_input;
mod set_range_selection;
mod snapshot;
mod snapshot_result;

pub use snapshot::BreditorSelection;
pub use snapshot_result::BreditorSelectionResult;
