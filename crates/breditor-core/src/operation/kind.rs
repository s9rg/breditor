use thiserror::Error;

use crate::{
    document::Document,
    operation::{TextChange, TextSplice, TextSpliceApplyError, TextSpliceMap},
    state::EditorContext,
};

/// One closed deterministic document-operation value.
///
/// New variants receive their own versioned contracts and source files rather
/// than sharing an untyped command payload.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Operation {
    /// Replace one paragraph-local UTF-16 range with formatted text.
    TextSplice(TextSplice),
}

impl From<TextSplice> for Operation {
    fn from(value: TextSplice) -> Self {
        Self::TextSplice(value)
    }
}

impl Operation {
    // Transaction execution supplies a document proved by this exact context.
    // Individual operations still guard schema identity; document publication
    // additionally checks the private runtime validation-profile stamp.
    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, OperationApplyError> {
        match self {
            Self::TextSplice(operation) => operation.apply(context, document).map_err(Into::into),
        }
    }
}

pub(crate) enum AppliedOperation {
    Unchanged,
    Changed(Box<AppliedChange>),
}

pub(crate) struct AppliedChange {
    pub(crate) document: Document,
    pub(crate) inverse: Operation,
    pub(crate) relocation: TextSpliceMap,
    pub(crate) change: TextChange,
}

/// Why a document operation could not be applied atomically.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum OperationApplyError {
    /// A text-splice contract or application rule failed.
    #[error(transparent)]
    TextSplice(#[from] TextSpliceApplyError),
}
