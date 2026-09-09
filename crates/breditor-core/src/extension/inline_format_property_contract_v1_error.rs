use thiserror::Error;

use crate::identity::QualifiedName;

/// Why an inline-format property contract could not be constructed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum InlineFormatPropertyContractV1Error {
    /// A typed contract must declare at least one property.
    #[error("inline-format property contract for {format_kind} is empty")]
    Empty {
        /// Target inline-format kind.
        format_kind: QualifiedName,
    },
    /// The declaration count exceeds the fixed per-format ceiling.
    #[error(
        "inline-format property contract for {format_kind} has {actual} properties; the maximum is {maximum}"
    )]
    TooManyProperties {
        /// Target inline-format kind.
        format_kind: QualifiedName,
        /// Rejected fixed-width declaration count.
        actual: u32,
        /// Fixed declaration ceiling.
        maximum: u32,
    },
    /// One qualified property name occurs more than once.
    #[error("inline-format property contract for {format_kind} declares {name} more than once")]
    DuplicateProperty {
        /// Target inline-format kind.
        format_kind: QualifiedName,
        /// First duplicated name in canonical order.
        name: QualifiedName,
    },
    /// Extension property declarations may not claim the core namespace.
    #[error("inline-format property contract for {format_kind} uses reserved property name {name}")]
    ReservedPropertyName {
        /// Target inline-format kind.
        format_kind: QualifiedName,
        /// Rejected property name.
        name: QualifiedName,
    },
}
