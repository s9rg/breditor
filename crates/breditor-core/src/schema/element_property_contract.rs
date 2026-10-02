//! The first closed element-property language: one required bounded integer.
//!
//! Heading rank and ordered-list start need an exact integer, not coercion,
//! defaults, arbitrary metadata or inline-format properties. The compiler
//! checks the range and the element's property permission before publishing
//! this contract. More property shapes require an explicit later contract.

use crate::{document::PropertyInteger, identity::QualifiedName};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct RequiredIntegerProperty {
    pub(super) name: QualifiedName,
    pub(super) minimum: PropertyInteger,
    pub(super) maximum: PropertyInteger,
}
