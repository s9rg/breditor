mod clear_selection;
#[cfg(feature = "diagnostic-selection-inputs")]
mod input_diagnostics;
mod node_index;
mod read_selection;
mod scalar_input;
mod set_range_selection;
mod snapshot;
mod snapshot_result;
#[cfg(feature = "selection-token-codes")]
mod token_code;
#[cfg(all(feature = "candidate-rust-selection-tokens", not(feature = "selection-token-codes")))]
mod token_input;

pub use snapshot::BreditorSelection;
pub use snapshot_result::BreditorSelectionResult;
