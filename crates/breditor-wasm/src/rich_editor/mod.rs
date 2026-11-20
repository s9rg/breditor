//! Opt-in synchronous rich owner; default editor factories and ABI remain unchanged.
//!
//! Commands own no DOM/storage/network. An opaque exact observation accompanies
//! every publication. Read/encoding failures are separate from committed mutations.

mod atom_edit;
mod block_layout;
mod clipboard;
mod clipboard_interchange;
mod clipboard_text_projection;
mod close_typing_group;
mod collapse_document_selection;
mod command;
mod document_checkpoint;
mod document_view;
mod editor;
mod enable_typing_history;
mod error;
mod exit_code_block;
mod flow_navigation;
mod general_range;
mod inline_format_state;
mod input_rules;
mod mention;
mod observation;
mod paste_document_clipboard;
mod placeholder_empty;
mod profile;
mod replace_document_plain_text;
mod replace_document_typing_text;
mod restore_typing_editor;
mod result;
mod retained_asset_references;
mod search;
mod select_document;
mod selection;
mod selection_formatting;
mod trigger_composite;
mod view;
mod writing_tools;
pub use search::{BreditorRichSearchResults, BreditorRichSearchResultsResult};

pub use editor::BreditorRichEditor;
pub use observation::BreditorRichObservation;
pub use profile::BreditorRichProfile;
pub use result::{BreditorRichCommandResult, BreditorRichEditorResult, BreditorRichProfileResult};

/// Separate rich browser boundary revision; default Wasm ABI 5 is not reinterpreted.
pub const BREDITOR_RICH_ABI_VERSION: u32 = 1;
