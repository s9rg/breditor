//! Deterministic immutable operations and their replay artifacts.

mod change_set;
mod kind;
mod relocation;
mod text_range;
mod text_splice;

pub use change_set::{ChangeSet, ChildRange, TextChange};
pub use kind::{Operation, OperationApplyError};
pub use relocation::{
    DeletedPointPolicy, PointRelocation, RelocationError, RelocationMap, SelectionRelocationError,
    SelectionRelocationPolicy,
};
pub use text_range::{TextRange, TextRangeError};
pub use text_splice::{
    FragmentRole, TextSplice, TextSpliceApplyError, TextSpliceError, TextSpliceTargetRule,
    TreeInvariantRule,
};

pub(crate) use kind::{AppliedChange, AppliedOperation};
pub(crate) use relocation::{RelocationStep, TextSpliceMap};
