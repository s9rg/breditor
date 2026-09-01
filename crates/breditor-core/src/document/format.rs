use std::sync::Arc;

use crate::{
    document::{LocalInvariantError, PropertyMap},
    identity::QualifiedName,
};
use thiserror::Error;

/// One semantic text format and its validated properties.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Format {
    kind: QualifiedName,
    properties: PropertyMap,
}

impl Format {
    /// Creates a semantic format candidate.
    ///
    /// A compiled schema still decides whether the kind and properties are
    /// permitted when the format is inserted into an editor state.
    #[must_use]
    pub const fn new(kind: QualifiedName, properties: PropertyMap) -> Self {
        Self { kind, properties }
    }

    /// Returns the qualified format kind.
    #[must_use]
    pub fn kind(&self) -> &QualifiedName {
        &self.kind
    }

    /// Returns the immutable format properties.
    #[must_use]
    pub fn properties(&self) -> &PropertyMap {
        &self.properties
    }
}

/// A canonical format collection sorted by kind with no duplicate kind.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FormatSet(Arc<[Format]>);

impl FormatSet {
    /// Returns the number of formats.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether the set has no formats.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Looks up a format by qualified kind.
    #[must_use]
    pub fn get(&self, kind: &QualifiedName) -> Option<&Format> {
        self.0.binary_search_by(|format| format.kind().cmp(kind)).ok().map(|index| &self.0[index])
    }

    /// Iterates over formats in canonical ascending kind order.
    #[must_use]
    pub fn iter(&self) -> FormatSetIter<'_> {
        FormatSetIter(self.0.iter())
    }

    /// Creates an immutable format set from formats already ordered by kind.
    ///
    /// Requiring canonical input avoids silently changing persisted or replayed
    /// operation records at the construction boundary.
    ///
    /// # Errors
    ///
    /// Returns [`FormatSetError`] when a kind is duplicated or appears out of
    /// ascending order.
    pub fn try_from_formats(formats: Vec<Format>) -> Result<Self, FormatSetError> {
        Self::try_from_sorted(formats).map_err(FormatSetError::from)
    }

    pub(crate) fn try_from_sorted(formats: Vec<Format>) -> Result<Self, LocalInvariantError> {
        for (index, pair) in formats.windows(2).enumerate() {
            if pair[0].kind() == pair[1].kind() {
                return Err(LocalInvariantError::DuplicateFormat { index: index + 1 });
            }
            if pair[0].kind() > pair[1].kind() {
                return Err(LocalInvariantError::NonCanonicalFormatOrder { index: index + 1 });
            }
        }
        Ok(Self(Arc::from(formats)))
    }
}

/// Why a sequence cannot be published as a canonical [`FormatSet`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum FormatSetError {
    /// A format repeats the preceding kind.
    #[error("format {index} duplicates the preceding format kind")]
    DuplicateFormat {
        /// Index of the duplicate format.
        index: usize,
    },
    /// A format is not in ascending kind order.
    #[error("format {index} is not in ascending kind order")]
    NonCanonicalOrder {
        /// Index of the out-of-order format.
        index: usize,
    },
}

impl From<LocalInvariantError> for FormatSetError {
    fn from(value: LocalInvariantError) -> Self {
        match value {
            LocalInvariantError::DuplicateFormat { index } => Self::DuplicateFormat { index },
            LocalInvariantError::NonCanonicalFormatOrder { index } => {
                Self::NonCanonicalOrder { index }
            }
            _ => unreachable!("format-set construction only checks format ordering"),
        }
    }
}

/// An iterator over a canonical [`FormatSet`].
pub struct FormatSetIter<'a>(std::slice::Iter<'a, Format>);

impl<'a> Iterator for FormatSetIter<'a> {
    type Item = &'a Format;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl DoubleEndedIterator for FormatSetIter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.0.next_back()
    }
}

impl ExactSizeIterator for FormatSetIter<'_> {}
impl std::iter::FusedIterator for FormatSetIter<'_> {}

impl<'a> IntoIterator for &'a FormatSet {
    type Item = &'a Format;
    type IntoIter = FormatSetIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
