//! Deterministic immutable operations and their replay artifacts.

mod change_set;
mod kind;
mod paragraph_join;
mod paragraph_split;
mod paragraph_support;
mod relocation;
mod root_text_range;
mod root_text_replace;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_kind_change;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_splice;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod text_block_splice_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use text_block_splice::{TextBlockSplice, TextBlockSpliceError};
mod text_range;
mod text_splice;
mod validation;
#[cfg(feature = "experimental-structural-properties")]
pub(crate) use text_block_kind_change::block_kind;
#[cfg(feature = "experimental-structural-properties")]
pub use text_block_kind_change::{TextBlockKindChange, TextBlockKindChangeError};
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod text_block_kind_change_tests;

pub use change_set::{Change, ChangeSet, ChildRange, ChildrenChange, TextChange};
pub use kind::{Operation, OperationApplyError, OperationKind};
pub use paragraph_join::{
    ParagraphJoin, ParagraphJoinApplyError, ParagraphJoinError, ParagraphJoinSide,
};
pub use paragraph_split::{ParagraphSplit, ParagraphSplitApplyError, ParagraphSplitError};
pub use paragraph_support::{ParagraphStructureInvariantRule, ParagraphTargetRule};
pub use relocation::{
    DeletedPointPolicy, PointRelocation, RelocationError, RelocationMap, SelectionRelocationError,
    SelectionRelocationPolicy,
};
pub use root_text_range::{
    RootTextBoundary, RootTextBoundaryError, RootTextRange, RootTextRangeError,
};
pub use root_text_replace::{
    RootTextFragmentRole, RootTextRangeBoundary, RootTextReplace, RootTextReplaceApplyError,
    RootTextReplaceError,
};
pub use text_range::{TextRange, TextRangeError};
pub use text_splice::{
    FragmentRole, TextSplice, TextSpliceApplyError, TextSpliceError, TextSpliceTargetRule,
    TreeInvariantRule,
};
pub use validation::{
    OperationFragmentRole, OperationFragmentSliceRole, OperationOffsetRole, OperationPathRole,
    OperationRootChildSpanRole, OperationValidationError,
};

pub(crate) use kind::{AppliedChange, AppliedOperation};
pub(crate) use relocation::{
    ParagraphJoinMap, ParagraphSplitMap, RelocationStep, RelocationStepMap, RootTextReplaceMap,
    TextSpliceMap,
};
