//! Opt-in synchronous rich owner; default editor factories and ABI remain unchanged.
//!
//! Commands own no DOM/storage/network. An opaque exact observation accompanies
//! every publication. Read/encoding failures are separate from committed mutations.

mod clipboard;
mod command;
mod editor;
mod error;
mod observation;
mod profile;
mod result;
mod selection;
mod view;

pub use editor::BreditorRichEditor;
pub use observation::BreditorRichObservation;
pub use profile::BreditorRichProfile;
pub use result::{BreditorRichCommandResult, BreditorRichEditorResult, BreditorRichProfileResult};

/// Separate rich browser boundary revision; default Wasm ABI 5 is not reinterpreted.
pub const BREDITOR_RICH_ABI_VERSION: u32 = 1;
