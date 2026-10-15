//! Rich AST materialization over independently replicated structure, text and owned metadata.
//!
//! This is the in-progress shared editor coordinator, not a shipping transport.
//! A semantic Document V2 is a validated export, never a mutable shared root register.

pub mod actions;
mod annotations;
mod captions;
mod cell_bodies;
mod clipboard;
mod clipboard_flow;
mod clipboard_grid;
mod clipboard_namespace;
mod clipboard_plan;
mod column_order;
mod creation;
mod history_cursors;
mod history_metadata;
mod initialize;
mod insert_plain_text;
mod list_structure;
mod list_targets;
mod materialize;
mod merges;
mod model;
mod navigate_grid;
mod observation;
mod paragraphs;
mod paste_flow_at_text;
mod placement;
mod planning;
mod profile;
mod range_plan;
mod replace_plain_text_range;
pub mod selection;
mod session;
mod set_pending_formats;
mod set_selection;
mod target_kinds;
mod target_validation;
mod text;
pub mod text_flow;
mod ui_state;
mod update_frame;
mod view;

pub use actions::Command;
/// Private shared projection revision; incompatible causal interpretations must reject old frames.
pub const MODEL_VERSION: u32 = 11;
pub use clipboard::{ClipboardContent, PasteTarget};
pub use clipboard_namespace::ClipboardNamespace;
pub use navigate_grid::GridNavigationResult;
pub use observation::SharedObservation;
pub use profile::SharedRichProfile;
pub use session::RichReplica;
pub use ui_state::{PendingFormatsUpdate, SelectionUpdate};
