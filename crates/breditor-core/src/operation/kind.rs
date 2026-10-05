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
/// four paragraph-operation variants, the operation V1 wire tag. The experimental
/// structural kinds have no V1–V3 wire tag; operation V4 admits block-kind
/// changes only and V5 admits text-block splices and replacements. Flat-list
/// reframing and flat-list text edits are admitted by V6. Nested-list reframing
/// is admitted separately by V7.
/// Adding a runtime kind is an
/// additive Rust API change, but does not silently extend the closed V1 wire
/// union; admitting a new tag requires an explicit format-version decision.
/// Callers should retain a fallback when matching this non-exhaustive enum.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum OperationKind {
    /// Experimental text edit inside a nested list document.
    #[cfg(feature = "experimental-structural-properties")]
    NestedListTextSplice,
    /// Experimental nested container edit, admitted only by V7 and later formats.
    #[cfg(feature = "experimental-structural-properties")]
    NestedListReframe,
    /// Experimental text replacement with explicit flat-list result structure.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListTextReplace,
    /// Experimental text editing within a bare block or flat-list item.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListTextSplice,
    /// Experimental flat-list container edit preserving every text block.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListReframe,
    /// Experimental structural text replacement with explicit paragraph/heading kinds.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockReplace,
    /// Experimental text edit inside a guarded paragraph or heading.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockSplice,
    /// A paragraph-local text splice.
    TextSplice,
    /// A direct-root paragraph split.
    ParagraphSplit,
    /// A join of adjacent direct-root paragraphs.
    ParagraphJoin,
    /// A guarded replacement across direct-root paragraphs.
    RootTextReplace,
    /// Experimental same-count paragraph/heading kind replacement.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockKindChange,
}

impl OperationKind {
    /// Returns the stable lower-camel-case kind name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListTextSplice => "nestedListTextSplice",
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListReframe => "nestedListReframe",
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextReplace => "flatListTextReplace",
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextSplice => "flatListTextSplice",
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListReframe => "flatListReframe",
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockReplace => "textBlockReplace",
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockSplice => "textBlockSplice",
            Self::TextSplice => "textSplice",
            Self::ParagraphSplit => "paragraphSplit",
            Self::ParagraphJoin => "paragraphJoin",
            Self::RootTextReplace => "rootTextReplace",
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockKindChange => "textBlockKindChange",
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
    /// Experimental nested text edit with a complete root guard.
    #[cfg(feature = "experimental-structural-properties")]
    NestedListTextSplice(super::NestedListTextSplice),
    /// Experimental nested container edit preserving depth-first block order.
    #[cfg(feature = "experimental-structural-properties")]
    NestedListReframe(super::NestedListReframe),
    /// Experimental cross-block text edit and flat-list layout change.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListTextReplace(super::FlatListTextReplace),
    /// Experimental flat-list text edit with a complete containing-root guard.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListTextSplice(super::FlatListTextSplice),
    /// Experimental flat-list container edit with exact source guards.
    #[cfg(feature = "experimental-structural-properties")]
    FlatListReframe(super::FlatListReframe),
    /// Experimental structural edit preserving complete source kind guards.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockReplace(super::TextBlockReplace),
    /// Experimental text edit preserving the guarded block kind and rank.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockSplice(super::TextBlockSplice),
    /// Replace one paragraph-local UTF-16 range with formatted text.
    TextSplice(TextSplice),
    /// Split one direct-root base paragraph into two paragraphs.
    ParagraphSplit(ParagraphSplit),
    /// Join two adjacent direct-root base paragraphs.
    ParagraphJoin(ParagraphJoin),
    /// Replace one guarded text range across direct-root base paragraphs.
    RootTextReplace(RootTextReplace),
    /// Experimental same-count paragraph/heading kind replacement.
    #[cfg(feature = "experimental-structural-properties")]
    TextBlockKindChange(super::TextBlockKindChange),
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
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListTextSplice(_) => OperationKind::NestedListTextSplice,
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListReframe(_) => OperationKind::NestedListReframe,
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextReplace(_) => OperationKind::FlatListTextReplace,
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextSplice(_) => OperationKind::FlatListTextSplice,
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListReframe(_) => OperationKind::FlatListReframe,
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockReplace(_) => OperationKind::TextBlockReplace,
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockSplice(_) => OperationKind::TextBlockSplice,
            Self::TextSplice(_) => OperationKind::TextSplice,
            Self::ParagraphSplit(_) => OperationKind::ParagraphSplit,
            Self::ParagraphJoin(_) => OperationKind::ParagraphJoin,
            Self::RootTextReplace(_) => OperationKind::RootTextReplace,
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockKindChange(_) => OperationKind::TextBlockKindChange,
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
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListTextSplice(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::NestedListReframe(operation) => {
                operation.apply_operation(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextReplace(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListTextSplice(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::FlatListReframe(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockReplace(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockSplice(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
            #[cfg(feature = "experimental-structural-properties")]
            Self::TextBlockKindChange(operation) => {
                operation.apply(context, document).map_err(Into::into)
            }
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
    /// A nested text edit failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    NestedListTextSplice(#[from] super::NestedListTextSpliceError),
    /// A nested list container edit failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    NestedListReframe(#[from] super::NestedListReframeError),
    /// An experimental structural flat-list text edit failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    FlatListTextReplace(#[from] super::FlatListTextReplaceError),
    /// An experimental flat-list text edit failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    FlatListTextSplice(#[from] super::FlatListTextSpliceError),
    /// An experimental list-container edit failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    FlatListReframe(#[from] super::FlatListReframeError),
    /// An experimental structural text-block replacement failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    TextBlockReplace(#[from] super::TextBlockReplaceError),
    /// An experimental text-block splice failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    TextBlockSplice(#[from] super::TextBlockSpliceError),
    /// An experimental block-kind change failed.
    #[cfg(feature = "experimental-structural-properties")]
    #[error(transparent)]
    TextBlockKindChange(#[from] super::TextBlockKindChangeError),
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
