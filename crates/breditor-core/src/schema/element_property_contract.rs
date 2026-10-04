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
    /// Also require `value + child_count - 1 <= maximum` for nonempty elements.
    /// Empty-child rejection belongs to the independently compiled grammar.
    pub(super) child_ordinals: bool,
}

pub(super) fn child_ordinals_fit(start: i64, count: usize, maximum: i64) -> bool {
    let Some(last_index) = count.checked_sub(1) else { return true };
    i64::try_from(last_index)
        .ok()
        .and_then(|offset| start.checked_add(offset))
        .is_some_and(|last| last <= maximum)
}
