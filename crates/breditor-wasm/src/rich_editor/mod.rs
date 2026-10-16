//! Opt-in synchronous rich owner; default editor factories and ABI remain unchanged.
//!
//! Commands own no DOM/storage/network. An opaque exact observation accompanies
//! every publication. Read/encoding failures are separate from committed mutations.

mod atom_edit;
mod clipboard;
mod close_typing_group;
mod command;
mod editor;
mod enable_typing_history;
mod error;
mod exit_code_block;
mod flow_navigation;
mod inline_format_state;
mod observation;
mod profile;
mod restore_typing_editor;
mod result;
mod selection;
mod view;

pub use editor::BreditorRichEditor;
pub use observation::BreditorRichObservation;
pub use profile::BreditorRichProfile;
pub use result::{BreditorRichCommandResult, BreditorRichEditorResult, BreditorRichProfileResult};

/// Separate rich browser boundary revision; default Wasm ABI 5 is not reinterpreted.
pub const BREDITOR_RICH_ABI_VERSION: u32 = 1;
