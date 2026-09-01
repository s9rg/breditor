use thiserror::Error;

use crate::{
    document::Document,
    operation::{
        Change, ParagraphJoin, ParagraphJoinApplyError, ParagraphSplit, ParagraphSplitApplyError,
        RelocationStepMap, RootTextReplace, RootTextReplaceApplyError, TextSplice,
        TextSpliceApplyError,
    },
    state::EditorContext,
};

use super::OperationValidationError;

/// Stable discriminator for one built-in operation contract.
///
/// The returned string is the lower-camel-case diagnostic name and, for these
/// four variants, the operation V1 wire tag. Adding a runtime kind is an
/// additive Rust API change, but does not silently extend the closed V1 wire
/// union; admitting a new tag requires an explicit format-version decision.
/// Callers should retain a fallback when matching this non-exhaustive enum.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum OperationKind {
    /// A paragraph-local text splice.
    TextSplice,
    /// A direct-root paragraph split.
    ParagraphSplit,
    /// A join of adjacent direct-root paragraphs.
    ParagraphJoin,
    /// A guarded replacement across direct-root paragraphs.
    RootTextReplace,
}

impl OperationKind {
    /// Returns the stable lower-camel-case kind name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TextSplice => "textSplice",
            Self::ParagraphSplit => "paragraphSplit",
            Self::ParagraphJoin => "paragraphJoin",
            Self::RootTextReplace => "rootTextReplace",
        }
    }
}

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
    /// Replace one guarded text range across direct-root base paragraphs.
    RootTextReplace(RootTextReplace),
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

impl From<RootTextReplace> for Operation {
    fn from(value: RootTextReplace) -> Self {
        Self::RootTextReplace(value)
    }
}

impl Operation {
    /// Returns the stable kind discriminator for this operation.
    #[must_use]
    pub const fn kind(&self) -> OperationKind {
        match self {
            Self::TextSplice(_) => OperationKind::TextSplice,
            Self::ParagraphSplit(_) => OperationKind::ParagraphSplit,
            Self::ParagraphJoin(_) => OperationKind::ParagraphJoin,
            Self::RootTextReplace(_) => OperationKind::RootTextReplace,
        }
    }

    /// Validates document-independent operation data against one editor context.
    ///
    /// This is the document-independent validation phase used by the durable
    /// record boundary. It proves active schema support, coordinates, fragment
    /// semantics, and resource limits without consulting a document snapshot.
    /// It deliberately cannot prove that paths resolve or
    /// optimistic source guards still match; atomic transaction application
    /// performs those snapshot-dependent checks.
    ///
    /// # Errors
    ///
    /// Returns [`OperationValidationError`] for the first deterministic
    /// context-static contract violation.
    pub fn validate(&self, context: &EditorContext) -> Result<(), OperationValidationError> {
        super::validation::validate_operation(self, context)
    }

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
            Self::RootTextReplace(operation) => {
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
    /// A root-text replacement contract or application rule failed.
    #[error(transparent)]
    RootTextReplace(#[from] RootTextReplaceApplyError),
}
