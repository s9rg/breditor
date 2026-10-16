//! Rich AST materialization over independently replicated structure, text and owned metadata.
//!
//! This is the in-progress shared editor coordinator, not a shipping transport.
//! A semantic Document V2 is a validated export, never a mutable shared root register.

pub mod actions;
mod annotations;
mod atom_edit;
mod captions;
mod caret_formats;
mod cell_bodies;
mod change_selection_formats;
mod clipboard;
mod clipboard_flow;
mod clipboard_grid;
mod clipboard_namespace;
mod clipboard_plan;
mod close_typing_group;
mod column_order;
mod creation;
mod delete_atom;
mod delete_typing_range;
mod enable_typing_history;
mod exit_code_block;
mod flow_parent;
mod history_cursors;
mod history_keys;
mod history_metadata;
mod initialize;
mod inline_format_state;
mod insert_hard_break;
mod insert_paragraph_adjacent;
mod insert_plain_text;
mod insert_typing_text;
mod list_structure;
mod list_targets;
mod materialize;
mod merges;
mod model;
mod navigate_flow;
mod navigate_grid;
mod observation;
mod paragraphs;
mod paste_flow_at_text;
mod patch_inline_format_properties;
mod placement;
mod planning;
mod presence;
mod profile;
mod projection_cache;
mod protocol;
mod range_plan;
mod replace_atom_plain_text;
mod replace_atom_typing_text;
mod replace_plain_text_range;
mod replay_projections;
pub mod selection;
mod selection_coverage;
mod selection_formats;
mod session;
mod set_pending_formats;
mod set_read_only;
mod set_selection;
mod structural_text;
mod target_kinds;
mod target_validation;
mod text;
pub mod text_flow;
mod typing_checkpoint;
mod typing_history;
mod ui_state;
mod update_frame;
mod view;
mod writer_transport;

pub use actions::Command;
/// Private shared projection revision; incompatible causal interpretations must reject old frames.
pub const MODEL_VERSION: u32 = 11;
pub use clipboard::{ClipboardContent, PasteTarget};
pub use clipboard_namespace::ClipboardNamespace;
pub use navigate_grid::GridNavigationResult;
pub use observation::SharedObservation;
pub use presence::PresenceResolution;
pub use profile::SharedRichProfile;
pub use session::RichReplica;
pub use ui_state::{PendingFormatsUpdate, SelectionUpdate};
pub use writer_transport::{
    PreparedWriterGroup, WriterClock, WriterDependency, WriterGroupPreparation, WriterReceipt,
};
