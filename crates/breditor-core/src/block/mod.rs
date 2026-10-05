//! Checked semantic values for the next structural-block contract.
//!
//! These values are an experimental foundation, not schema admission or editing
//! authority. Constructing a heading or list kind does **not** enable that node
//! in an existing document, profile, operation, codec, or browser renderer.
//! The current paragraph-only grammar remains sealed until the complete
//! structural transaction and durable-history contract is implemented.
//!
//! Values carry no HTML, CSS, callbacks, node identities, or mutable state.
//! They deliberately implement no unchecked deserialization or AST conversion.

mod heading_level;
mod list_kind;
#[cfg(feature = "experimental-structural-properties")]
mod nested_list_selection;
#[cfg(feature = "experimental-structural-properties")]
pub use nested_list_selection::{NestedListItemRange, NestedListSelectionError};
mod ordered_list_start;
mod text_block_kind;
mod value_error;

pub use heading_level::HeadingLevel;
pub use list_kind::ListKind;
pub use ordered_list_start::{MAX_ORDERED_LIST_ORDINAL, OrderedListStart};
pub use text_block_kind::TextBlockKind;
pub use value_error::BlockValueError;
