use thiserror::Error;

use crate::{
    document::Document,
    operation::{
        Change, ParagraphJoin, ParagraphJoinApplyError, ParagraphSplit, ParagraphSplitApplyError,
        RelocationStepMap, TextSplice, TextSpliceApplyError,
    },
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
    /// Split one direct-root base paragraph into two paragraphs.
    ParagraphSplit(ParagraphSplit),
    /// Join two adjacent direct-root base paragraphs.
    ParagraphJoin(ParagraphJoin),
}

impl From<TextSplice> for Operation {
    fn from(value: TextSplice) -> Self {
        Self::TextSplice(value)
    }
}

impl From<ParagraphSplit> for Operation {
    fn from(value: ParagraphSplit) -> Self {
        Self::ParagraphSplit(value)
    }
}

impl From<ParagraphJoin> for Operation {
    fn from(value: ParagraphJoin) -> Self {
        Self::ParagraphJoin(value)
    }
}

impl Operation {
    // Transaction execution supplies a document proved by this exact context.
    // Individual operations still guard schema identity; publication either
    // consumes a matching private proof profile or runs complete validation.
    pub(crate) fn apply(
        &self,
        context: &EditorContext,
        document: &Document,
    ) -> Result<AppliedOperation, OperationApplyError> {
        match self {
            Self::TextSplice(operation) => operation.apply(context, document).map_err(Into::into),
            Self::ParagraphSplit(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            Self::ParagraphJoin(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
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
    pub(crate) relocation: RelocationStepMap,
    pub(crate) change: Change,
}

/// Why a document operation could not be applied atomically.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum OperationApplyError {
    /// A text-splice contract or application rule failed.
    #[error(transparent)]
    TextSplice(#[from] TextSpliceApplyError),
    /// A paragraph-split contract or application rule failed.
    #[error(transparent)]
    ParagraphSplit(#[from] ParagraphSplitApplyError),
    /// A paragraph-join contract or application rule failed.
    #[error(transparent)]
    ParagraphJoin(#[from] ParagraphJoinApplyError),
}
