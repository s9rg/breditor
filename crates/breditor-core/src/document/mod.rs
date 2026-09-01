//! Immutable, structurally shared runtime document values.

mod children;
mod element;
mod format;
mod local_invariant;
mod node_ref;
mod property;
mod text;
mod text_fragment;
mod text_run;
mod validated_document;

pub use children::{Children, ChildrenIter};
pub use element::ElementNode;
pub use format::{Format, FormatSet, FormatSetError, FormatSetIter};
pub(crate) use local_invariant::LocalInvariantError;
pub use node_ref::{NodeKind, NodeRef};
pub(crate) use property::PropertyValueInner;
pub use property::{
    MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, PropertyInteger, PropertyIntegerError, PropertyMap,
    PropertyMapIter, PropertyObject, PropertyObjectIter, PropertyValue, PropertyValueKind,
};
pub use text::TextNode;
pub(crate) use text::Utf16BoundaryError;
pub use text_fragment::{TextFragment, TextFragmentError, TextFragmentIter};
pub use text_run::{TextRun, TextRunError};
pub use validated_document::{Document, NodeLookupError};
