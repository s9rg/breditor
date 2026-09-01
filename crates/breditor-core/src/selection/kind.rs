use crate::{
    document::Document,
    schema::CompiledSchema,
    selection::{RangeSelection, ResolvedRangeSelection, SelectionError},
};

/// One active editor selection value.
///
/// Absence is represented by `Option<Selection>` in editor state. Additional
/// selection kinds will be added only when their invariants are implemented.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum Selection {
    /// A directional range selection.
    Range(RangeSelection),
}

impl Selection {
    /// Resolves this selection against one document and compiled schema.
    ///
    /// # Errors
    ///
    /// Returns [`SelectionError`] when the selection is not valid in the supplied
    /// snapshot.
    pub fn resolve<'a>(
        &self,
        schema: &CompiledSchema,
        document: &'a Document,
    ) -> Result<ResolvedSelection<'a>, SelectionError> {
        match self {
            Self::Range(selection) => {
                selection.resolve(schema, document).map(ResolvedSelection::Range)
            }
        }
    }
}

impl From<RangeSelection> for Selection {
    fn from(value: RangeSelection) -> Self {
        Self::Range(value)
    }
}

/// A selection borrowed from the document snapshot against which it was checked.
#[derive(Clone, Copy, Debug)]
pub enum ResolvedSelection<'a> {
    /// A valid directional range.
    Range(ResolvedRangeSelection<'a>),
}
