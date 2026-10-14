//! Rich AST materialization over independently replicated structure, text and owned metadata.
//!
//! This is the in-progress shared editor coordinator, not a shipping transport.
//! A semantic Document V2 is a validated export, never a mutable shared root register.

pub mod actions;
mod column_order;
mod creation;
mod history_cursors;
mod history_metadata;
mod initialize;
mod insert_plain_text;
mod materialize;
mod merges;
mod model;
mod observation;
mod placement;
mod planning;
pub mod selection;
mod session;
mod set_pending_formats;
mod set_selection;
mod text;
mod ui_state;
mod update_frame;
mod view;

pub use actions::Command;
pub use observation::SharedObservation;
pub use session::RichReplica;
pub use ui_state::{PendingFormatsUpdate, SelectionUpdate};
