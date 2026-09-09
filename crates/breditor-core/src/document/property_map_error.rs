use thiserror::Error;

use crate::identity::QualifiedName;

/// Why a public canonical [`super::PropertyMap`] could not be constructed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum PropertyMapError {
    /// Two adjacent entries use the same qualified property name.
    #[error("property {name} occurs more than once")]
    DuplicateProperty {
        /// Duplicated property name.
        name: QualifiedName,
    },
    /// Caller input is not in strict ascending qualified-name order.
    #[error("property {current} follows {previous}, but canonical order must be ascending")]
    NonCanonicalOrder {
        /// Earlier property name.
        previous: QualifiedName,
        /// Out-of-order property name.
        current: QualifiedName,
    },
}
