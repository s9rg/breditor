//! Deterministic immutable operations and their replay artifacts.

mod change_set;
#[cfg(feature = "experimental-structural-properties")]
mod nested_list_reframe;
#[cfg(feature = "experimental-structural-properties")]
pub use nested_list_reframe::{NestedListReframe, NestedListReframeEdit, NestedListReframeError};
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_layout;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_text_range;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_text_replace;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_text_replace_map;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod flat_list_text_replace_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use flat_list_layout::FlatListRootShape;
#[cfg(feature = "experimental-structural-properties")]
pub use flat_list_text_range::{FlatListTextRange, FlatListTextRangeError};
#[cfg(feature = "experimental-structural-properties")]
pub use flat_list_text_replace::{FlatListTextReplace, FlatListTextReplaceError};
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_reframe;
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_text_splice;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod flat_list_text_splice_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use flat_list_text_splice::{FlatListTextSplice, FlatListTextSpliceError};
#[cfg(feature = "experimental-structural-properties")]
mod flat_list_reframe_map;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod flat_list_reframe_tests;
#[cfg(feature = "experimental-structural-properties")]
pub use flat_list_reframe::{FlatListReframe, FlatListReframeError};
mod kind;
mod paragraph_join;
mod paragraph_split;
mod paragraph_support;
mod relocation;
mod root_text_range;
mod root_text_replace;
#[cfg(feature = "experimental-structural-properties")]
mod text_block_replace;
#[cfg(feature = "experimental-structural-properties")]
pub use text_block_replace::{TextBlockReplace, TextBlockReplaceError};
#[cfg(feature = "experimental-structural-properties")]
mod text_block_kind_change;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod text_block_replace_relocation_tests;
#[cfg(all(test, feature = "experimental-structural-properties"))]
mod text_block_replace_tests;
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
