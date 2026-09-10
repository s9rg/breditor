use std::fmt;

use thiserror::Error;

use crate::{
    action::{
        ActionFault, ActionId, ActionInputError, ActionPrepareError, InvalidActionPlan,
        routing::{BindingId, IntentId, IntentRouteError},
    },
    identity::QualifiedName,
    operation::{
        OperationApplyError, ParagraphJoinApplyError, ParagraphSplitApplyError, RelocationError,
        RootTextReplaceApplyError, SelectionRelocationError, TextSpliceApplyError,
    },
    selection::{RangeEndpoint, SelectionError},
    session::HistoryReplayError,
    state::{EditorStateError, PendingFormatError, RevisionError},
    transaction::{CommitReplayError, ReplayDirection, TransactionApplyError},
};

use super::{ActionStateDomains, ActionStateResourceError, ActionStateValidationError};

/// Bounded projection of one action preparation failure.
///
/// Input, observable-state, and handler faults are already bounded and remain
/// exact. Transaction failures are deliberately reduced to typed categories so
/// document fragments and validation reports cannot enter an observation batch.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateActionFault {
    /// The frozen registry unexpectedly lacked the invoked action.
    #[error("action is not registered")]
    UnknownAction,
    /// The invocation failed its exact input contract.
    #[error("action input is invalid: {0}")]
    InvalidInput(ActionInputError),
    /// The action reported an exact bounded handler fault.
    #[error("action handler failed: {0}")]
    Handler(ActionFault),
    /// The action returned an exact bounded observable-state shape error.
    #[error("action observable state is invalid: {0}")]
    InvalidState(ActionStateValidationError),
    /// The enabled action returned an invalid plan.
    #[error("action plan is invalid: {0}")]
    InvalidPlan(ActionStatePlanFault),
}

/// Bounded projection of an invalid enabled action plan.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStatePlanFault {
    /// Exact transaction preflight failed; only bounded categories are retained.
    #[error("transaction preflight failed: {0}")]
    Transaction(ActionStateTransactionFault),
    /// The action called an unchanged transaction enabled.
    #[error("enabled action plan was unchanged")]
    Unchanged,
    /// Preflight changed domains outside the frozen declaration.
    #[error("action changed {actual:?}, outside declared writes {declared:?}")]
    UndeclaredWrites {
        /// Frozen domains the action advertised as possible writes.
        declared: ActionStateDomains,
        /// Domains actually changed by preflight.
        actual: ActionStateDomains,
    },
}

/// Bounded projection of one semantic routing failure.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateRouteFault {
    /// The frozen router unexpectedly lacked the invoked intent.
    #[error("intent is not declared")]
    UnknownIntent,
    /// The invocation failed its exact shared input contract.
    #[error("intent input is invalid: {0}")]
    InvalidInput(ActionInputError),
    /// One visited binding failed terminally during action preparation.
    #[error("binding {binding} action {action} failed: {source}")]
    Action {
        /// Binding being evaluated.
        binding: BindingId,
        /// Action targeted by that binding.
        action: ActionId,
        /// Bounded action failure projection.
        source: ActionStateActionFault,
    },
}

/// Bounded projection of one available history entry's replay failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateHistoryFault {
    /// The current state no longer matched the retained replay boundary.
    #[error("history boundary is invalid: {0}")]
    Boundary(ActionStateHistoryBoundaryFault),
    /// Applying the replay transaction failed.
    #[error("history transaction failed: {0}")]
    Transaction(ActionStateTransactionFault),
    /// A retained content entry unexpectedly produced no state change.
    #[error("history transaction was unexpectedly unchanged")]
    UnexpectedUnchanged,
    /// Applied operations did not restore the retained opposite boundary.
    #[error("history result did not match its retained boundary")]
    ResultMismatch,
}

/// Bounded category for a history boundary mismatch.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateHistoryBoundaryFault {
    /// Replay attempted to cross editor lineages.
    #[error("lineage mismatch")]
    LineageMismatch,
    /// Current document content no longer matched the retained boundary.
    #[error("document mismatch")]
    DocumentMismatch,
}

/// Bounded category projection of a transaction application failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateTransactionFault {
    /// Transaction and execution context used different schemas.
    #[error("context schema mismatch")]
    ContextSchemaMismatch,
    /// Equal schema identities hid different execution configuration.
    #[error("context configuration mismatch")]
    ContextConfigurationMismatch,
    /// The transaction was authored for another snapshot.
    #[error("stale snapshot")]
    StaleSnapshot,
    /// The exact snapshot identity was reused for unequal state.
    #[error("base state mismatch")]
    BaseStateMismatch,
    /// The transaction exceeded its configured atomic operation budget.
    #[error("operation-count limit")]
    OperationLimit,
    /// One operation failed at a fixed-width index.
    #[error("operation {operation_index} failed: {source}")]
    Operation {
        /// Zero-based operation index, saturated only on an unrepresentable host index.
        operation_index: u64,
        /// Bounded operation failure category.
        source: ActionStateOperationFault,
    },
    /// Automatic selection relocation failed.
    #[error("selection relocation failed: {0}")]
    SelectionRelocation(ActionStateSelectionRelocationFault),
    /// The complete candidate state failed publication validation.
    #[error("result state is invalid: {0}")]
    InvalidResultState(ActionStateResultFault),
    /// The lineage-local revision could not advance.
    #[error("revision overflow")]
    RevisionOverflow,
}

/// Bounded category projection of an operation application failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateOperationFault {
    /// A text-splice value violated its construction contract.
    #[error("text-splice contract")]
    TextSpliceContract,
    /// A text splice used a different schema.
    #[error("text-splice schema mismatch")]
    TextSpliceSchemaMismatch,
    /// The active compiled schema exceeds the text-splice operation language.
    #[error("text-splice unsupported schema")]
    TextSpliceUnsupportedSchema,
    /// A text-splice target path did not resolve.
    #[error("text-splice node lookup")]
    TextSpliceNodeLookup,
    /// A text-splice target was not editable text.
    #[error("text-splice invalid target")]
    TextSpliceInvalidTarget,
    /// A text-splice range exceeded its container.
    #[error("text-splice range out of bounds")]
    TextSpliceRangeOutOfBounds,
    /// A text-splice range split a Unicode scalar.
    #[error("text-splice range splits scalar")]
    TextSpliceRangeSplitsScalar,
    /// A text-splice optimistic guard did not match source content.
    #[error("text-splice expected-removed mismatch")]
    TextSpliceExpectedRemovedMismatch,
    /// A text-splice fragment contained too many runs.
    #[error("text-splice fragment run-count limit")]
    TextSpliceFragmentRunCountLimit,
    /// A text-splice fragment exceeded the total text-byte limit.
    #[error("text-splice fragment total-text limit")]
    TextSpliceFragmentTotalTextBytesLimit,
    /// One text-splice fragment run exceeded its byte limit.
    #[error("text-splice fragment text limit")]
    TextSpliceFragmentTextBytesLimit,
    /// One text-splice fragment run contained too many formats.
    #[error("text-splice fragment format-count limit")]
    TextSpliceFragmentFormatCountLimit,
    /// A text-splice fragment used a disallowed format.
    #[error("text-splice fragment format not allowed")]
    TextSpliceFragmentFormatNotAllowed,
    /// A text-splice fragment used disallowed format properties.
    #[error("text-splice fragment format properties not allowed")]
    TextSpliceFragmentFormatPropertiesNotAllowed,
    /// A text-splice fragment carried a format instance that violated its typed contract.
    #[error("text-splice invalid format instance")]
    TextSpliceInvalidFormatInstance,
    /// A text-splice fragment exceeded the aggregate property-value ceiling.
    #[error("text-splice fragment property-value limit")]
    TextSpliceFragmentPropertyValueCountLimit,
    /// A text-splice fragment exceeded the aggregate property-string byte ceiling.
    #[error("text-splice fragment property-string limit")]
    TextSpliceFragmentPropertyStringBytesLimit,
    /// Canonical text-fragment construction failed.
    #[error("text-splice fragment")]
    TextSpliceFragment,
    /// Inverse text-range construction failed.
    #[error("text-splice text range")]
    TextSpliceTextRange,
    /// Aggregate text-offset arithmetic failed.
    #[error("text-splice text offset")]
    TextSpliceTextOffset,
    /// Checked text-splice coordinate arithmetic failed.
    #[error("text-splice coordinate overflow")]
    TextSpliceCoordinateOverflow,
    /// Persistent text-splice rebuilding violated an invariant.
    #[error("text-splice tree invariant")]
    TextSpliceTreeInvariant,
    /// A text-splice result failed authoritative validation.
    #[error("text-splice invalid result")]
    TextSpliceInvalidResult,
    /// A paragraph-split value violated its construction contract.
    #[error("paragraph-split contract")]
    ParagraphSplitContract,
    /// A paragraph split used a different schema.
    #[error("paragraph-split schema mismatch")]
    ParagraphSplitSchemaMismatch,
    /// Paragraph splitting is undefined for the active schema.
    #[error("paragraph-split unsupported schema")]
    ParagraphSplitUnsupportedSchema,
    /// A paragraph-split target path did not resolve.
    #[error("paragraph-split node lookup")]
    ParagraphSplitNodeLookup,
    /// A paragraph-split target was invalid.
    #[error("paragraph-split invalid target")]
    ParagraphSplitInvalidTarget,
    /// A paragraph-split optimistic guard did not match source content.
    #[error("paragraph-split expected mismatch")]
    ParagraphSplitExpectedMismatch,
    /// Reading or rebuilding a paragraph-split fragment failed.
    #[error("paragraph-split fragment")]
    ParagraphSplitFragment,
    /// Splitting a guarded paragraph fragment failed.
    #[error("paragraph-split fragment split")]
    ParagraphSplitFragmentSplit,
    /// Constructing the inverse paragraph join failed.
    #[error("paragraph-split inverse")]
    ParagraphSplitInverse,
    /// Checked paragraph-split coordinate arithmetic failed.
    #[error("paragraph-split coordinate overflow")]
    ParagraphSplitCoordinateOverflow,
    /// Persistent paragraph-split rebuilding violated an invariant.
    #[error("paragraph-split tree invariant")]
    ParagraphSplitTreeInvariant,
    /// A paragraph-split result failed authoritative validation.
    #[error("paragraph-split invalid result")]
    ParagraphSplitInvalidResult,
    /// A paragraph-join value violated its construction contract.
    #[error("paragraph-join contract")]
    ParagraphJoinContract,
    /// A paragraph join used a different schema.
    #[error("paragraph-join schema mismatch")]
    ParagraphJoinSchemaMismatch,
    /// Paragraph joining is undefined for the active schema.
    #[error("paragraph-join unsupported schema")]
    ParagraphJoinUnsupportedSchema,
    /// A paragraph-join target path did not resolve.
    #[error("paragraph-join node lookup")]
    ParagraphJoinNodeLookup,
    /// A paragraph-join target was invalid.
    #[error("paragraph-join invalid target")]
    ParagraphJoinInvalidTarget,
    /// A paragraph had no immediate right sibling to join.
    #[error("paragraph-join missing right sibling")]
    ParagraphJoinMissingRightSibling,
    /// A paragraph-join optimistic guard did not match source content.
    #[error("paragraph-join expected mismatch")]
    ParagraphJoinExpectedMismatch,
    /// Reading or rebuilding a paragraph-join fragment failed.
    #[error("paragraph-join fragment")]
    ParagraphJoinFragment,
    /// Constructing the inverse paragraph split failed.
    #[error("paragraph-join inverse")]
    ParagraphJoinInverse,
    /// Checked paragraph-join coordinate arithmetic failed.
    #[error("paragraph-join coordinate overflow")]
    ParagraphJoinCoordinateOverflow,
    /// Persistent paragraph-join rebuilding violated an invariant.
    #[error("paragraph-join tree invariant")]
    ParagraphJoinTreeInvariant,
    /// A paragraph-join result failed authoritative validation.
    #[error("paragraph-join invalid result")]
    ParagraphJoinInvalidResult,
    /// A root-text replacement value violated its construction contract.
    #[error("root-text replacement contract")]
    RootTextReplaceContract,
    /// A root-text replacement used a different schema.
    #[error("root-text replacement schema mismatch")]
    RootTextReplaceSchemaMismatch,
    /// Root-text replacement is undefined for the active schema.
    #[error("root-text replacement unsupported schema")]
    RootTextReplaceUnsupportedSchema,
    /// A guarded root-text paragraph path did not resolve.
    #[error("root-text replacement node lookup")]
    RootTextReplaceNodeLookup,
    /// A guarded root-text paragraph target was invalid.
    #[error("root-text replacement invalid target")]
    RootTextReplaceInvalidTarget,
    /// A complete root-text paragraph guard did not match.
    #[error("root-text replacement expected mismatch")]
    RootTextReplaceExpectedMismatch,
    /// A root-text fragment slice contained too many paragraphs.
    #[error("root-text replacement paragraph-count limit")]
    RootTextReplaceParagraphCountLimit,
    /// A root-text fragment slice exceeded the total text-byte limit.
    #[error("root-text replacement total-text limit")]
    RootTextReplaceTotalTextBytesLimit,
    /// One root-text paragraph fragment contained too many runs.
    #[error("root-text replacement fragment run-count limit")]
    RootTextReplaceFragmentRunCountLimit,
    /// One root-text fragment run exceeded its byte limit.
    #[error("root-text replacement fragment text limit")]
    RootTextReplaceFragmentTextBytesLimit,
    /// One root-text fragment run contained too many formats.
    #[error("root-text replacement fragment format-count limit")]
    RootTextReplaceFragmentFormatCountLimit,
    /// A root-text fragment used a disallowed format.
    #[error("root-text replacement fragment format not allowed")]
    RootTextReplaceFragmentFormatNotAllowed,
    /// A root-text fragment used disallowed format properties.
    #[error("root-text replacement fragment format properties not allowed")]
    RootTextReplaceFragmentFormatPropertiesNotAllowed,
    /// A root-text fragment carried a format instance that violated its typed contract.
    #[error("root-text replacement invalid format instance")]
    RootTextReplaceInvalidFormatInstance,
    /// A root-text fragment slice exceeded the aggregate property-value ceiling.
    #[error("root-text replacement property-value limit")]
    RootTextReplacePropertyValueCountLimit,
    /// A root-text fragment slice exceeded the aggregate property-string byte ceiling.
    #[error("root-text replacement property-string limit")]
    RootTextReplacePropertyStringBytesLimit,
    /// Reading or rebuilding a root-text fragment failed.
    #[error("root-text replacement fragment")]
    RootTextReplaceFragment,
    /// Constructing the exact root-text inverse failed.
    #[error("root-text replacement inverse")]
    RootTextReplaceInverse,
    /// Checked root-text coordinate arithmetic failed.
    #[error("root-text replacement coordinate overflow")]
    RootTextReplaceCoordinateOverflow,
    /// Persistent root-text rebuilding violated an invariant.
    #[error("root-text replacement tree invariant")]
    RootTextReplaceTreeInvariant,
    /// A root-text replacement result failed authoritative validation.
    #[error("root-text replacement invalid result")]
    RootTextReplaceInvalidResult,
}

/// Bounded category projection of automatic selection relocation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateSelectionRelocationFault {
    /// One directional endpoint could not be mapped.
    #[error("{endpoint:?} point relocation failed: {source}")]
    Point {
        /// Failing directional endpoint.
        endpoint: RangeEndpoint,
        /// Bounded point-relocation category.
        source: ActionStateRelocationFault,
    },
    /// A deleted endpoint required explicit host handling.
    #[error("{endpoint:?} endpoint was deleted")]
    DeletedEndpoint {
        /// Deleted directional endpoint.
        endpoint: RangeEndpoint,
    },
}

/// Bounded category projection of point relocation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateRelocationFault {
    /// The point was supplied for another snapshot.
    #[error("stale snapshot")]
    StaleSnapshot,
    /// The source point was structurally invalid.
    #[error("invalid source point")]
    InvalidSourcePoint,
    /// The relocated result point was structurally invalid.
    #[error("invalid result point")]
    InvalidResultPoint,
    /// The source snapshot identity was reused for another document.
    #[error("source document mismatch")]
    SourceDocumentMismatch,
    /// A required path did not resolve.
    #[error("node lookup")]
    NodeLookup,
    /// A mapped path did not target a text container.
    #[error("expected text container")]
    ExpectedTextContainer,
    /// A validated text container unexpectedly held a non-text child.
    #[error("non-text child")]
    NonTextChild,
    /// A text point was outside the edited container.
    #[error("point outside container")]
    PointOutsideContainer,
    /// A mapped offset exceeded the result container.
    #[error("offset out of bounds")]
    OffsetOutOfBounds,
    /// Checked relocation coordinate arithmetic failed.
    #[error("coordinate overflow")]
    CoordinateOverflow,
    /// Aggregate text-offset arithmetic failed.
    #[error("text offset")]
    TextOffset,
}

/// Bounded category projection of complete result-state validation failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ActionStateResultFault {
    /// Result document and context used different schemas.
    #[error("schema mismatch")]
    SchemaMismatch,
    /// The result document failed authoritative validation.
    #[error("invalid document")]
    InvalidDocument,
    /// One result selection endpoint was structurally invalid.
    #[error("{endpoint:?} selection point is invalid")]
    InvalidSelectionPoint {
        /// Failing directional endpoint.
        endpoint: RangeEndpoint,
    },
    /// One result selection endpoint violated a schema rule.
    #[error("{endpoint:?} selection endpoint is not allowed")]
    SelectionEndpointNotAllowed {
        /// Failing directional endpoint.
        endpoint: RangeEndpoint,
    },
    /// Result selection endpoints could not be ordered.
    #[error("selection comparison failed")]
    SelectionComparison,
    /// Pending formats were attached to a non-collapsed selection.
    #[error("pending formats require a collapsed range")]
    PendingFormatsRequireCollapsedRange,
    /// The result contained too many pending formats.
    #[error("pending-format count limit")]
    PendingFormatCountLimit,
    /// The result used an unknown pending format.
    #[error("pending format is unknown")]
    PendingFormatUnknownKind,
    /// The result used a registered property-bearing format unsupported by pending state.
    #[error("pending property-bearing format is unsupported")]
    PendingFormatPropertyBearingKindUnsupported,
    /// The result used properties on a pending format that forbids them.
    #[error("pending-format properties are not allowed")]
    PendingFormatPropertiesNotAllowed,
    /// A pending format violated its compiled typed-property contract.
    #[error("pending format instance is invalid")]
    PendingFormatInvalidInstance,
    /// Pending-format property-value accounting overflowed.
    #[error("pending-format property-value accounting overflow")]
    PendingFormatPropertyValueCountOverflow,
    /// Pending formats exceeded the aggregate property-value ceiling.
    #[error("pending-format property-value limit")]
    PendingFormatPropertyValueCountLimit,
    /// Pending-format property-string accounting overflowed.
    #[error("pending-format property-string accounting overflow")]
    PendingFormatPropertyStringBytesOverflow,
    /// Pending formats exceeded the aggregate property-string byte ceiling.
    #[error("pending-format property-string limit")]
    PendingFormatPropertyStringBytesLimit,
}

/// Entry-local failure observed while deriving an immutable action-state batch.
///
/// The public projection retains stable action, intent, binding, and history
/// provenance plus exact bounded input/state/handler faults. Potentially large
/// transaction, operation, selection, and result-validation errors are
/// represented by typed categories. This deliberate loss prevents document
/// fragments or whole validation reports from bypassing batch resource limits.
/// Native handlers are still trusted code, so this isolation cannot catch a
/// panic, infinite loop, or process failure. Fault and projection enums are
/// non-exhaustive so future reducer categories do not break downstream code.
#[non_exhaustive]
#[derive(Clone, Eq, Error, PartialEq)]
pub enum ActionStateFault {
    /// A direct action could not be evaluated or preflighted.
    #[error("direct action {action} state evaluation failed: {source}")]
    Direct {
        /// Evaluated action identity.
        action: ActionId,
        /// Bounded preparation failure.
        source: ActionStateActionFault,
    },
    /// A semantic intent could not be routed.
    #[error("routed intent {intent} state evaluation failed: {source}")]
    Routed {
        /// Evaluated semantic intent.
        intent: IntentId,
        /// Bounded routing failure.
        source: ActionStateRouteFault,
    },
    /// An available history entry could not be proven replayable.
    #[error("{direction:?} action-state preflight failed: {source}")]
    History {
        /// Attempted history direction.
        direction: ReplayDirection,
        /// Bounded history preflight failure.
        source: ActionStateHistoryFault,
    },
    /// A private catalog invariant was violated without invoking a source.
    #[error("action-state catalog invariant {code} was violated")]
    Invariant {
        /// Stable redacted invariant code.
        code: QualifiedName,
    },
    /// One otherwise derived entry exceeded its local dynamic payload bound.
    #[error(transparent)]
    Resource(#[from] ActionStateResourceError),
}

impl ActionStateFault {
    pub(crate) fn direct(error: ActionPrepareError) -> Self {
        let (action, source) = project_action_error(error);
        Self::Direct { action, source }
    }

    pub(crate) fn routed(error: IntentRouteError) -> Self {
        match error {
            IntentRouteError::UnknownIntent { intent } => {
                Self::Routed { intent, source: ActionStateRouteFault::UnknownIntent }
            }
            IntentRouteError::InvalidInput { intent, source } => {
                Self::Routed { intent, source: ActionStateRouteFault::InvalidInput(source) }
            }
            IntentRouteError::Action { intent, binding, action, source } => {
                let (reported_action, source) = project_action_error(*source);
                if reported_action != action {
                    return Self::Invariant {
                        code: QualifiedName::from_known_static(
                            "breditor/action-state-route-action-mismatch",
                        ),
                    };
                }
                Self::Routed {
                    intent,
                    source: ActionStateRouteFault::Action { binding, action, source },
                }
            }
        }
    }

    pub(crate) fn history(direction: ReplayDirection, error: HistoryReplayError) -> Self {
        let (reported_direction, source) = project_history_error(error);
        if reported_direction != direction {
            return Self::Invariant {
                code: QualifiedName::from_known_static(
                    "breditor/action-state-history-direction-mismatch",
                ),
            };
        }
        Self::History { direction, source }
    }
}

impl fmt::Debug for ActionStateFault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Direct { action, source } => formatter
                .debug_struct("Direct")
                .field("action", action)
                .field("category", &action_fault_category(source))
                .finish(),
            Self::Routed { intent, source } => match source {
                ActionStateRouteFault::UnknownIntent => formatter
                    .debug_struct("Routed")
                    .field("intent", intent)
                    .field("category", &"unknown-intent")
                    .finish(),
                ActionStateRouteFault::InvalidInput(_) => formatter
                    .debug_struct("Routed")
                    .field("intent", intent)
                    .field("category", &"invalid-input")
                    .finish(),
                ActionStateRouteFault::Action { binding, action, source } => formatter
                    .debug_struct("Routed")
                    .field("intent", intent)
                    .field("binding", binding)
                    .field("action", action)
                    .field("category", &action_fault_category(source))
                    .finish(),
            },
            Self::History { direction, source } => formatter
                .debug_struct("History")
                .field("direction", direction)
                .field("category", &history_fault_category(*source))
                .finish(),
            Self::Invariant { code } => {
                formatter.debug_struct("Invariant").field("code", code).finish()
            }
            Self::Resource(source) => formatter.debug_tuple("Resource").field(source).finish(),
        }
    }
}

fn project_action_error(error: ActionPrepareError) -> (ActionId, ActionStateActionFault) {
    match error {
        ActionPrepareError::UnknownAction { id } => (id, ActionStateActionFault::UnknownAction),
        ActionPrepareError::InvalidInput { id, source } => {
            (id, ActionStateActionFault::InvalidInput(source))
        }
        ActionPrepareError::Fault { id, source } => (id, ActionStateActionFault::Handler(source)),
        ActionPrepareError::InvalidState { id, source } => {
            (id, ActionStateActionFault::InvalidState(source))
        }
        ActionPrepareError::InvalidPlan { id, source } => {
            (id, ActionStateActionFault::InvalidPlan(project_plan_error(source)))
        }
    }
}

fn project_plan_error(error: InvalidActionPlan) -> ActionStatePlanFault {
    match error {
        InvalidActionPlan::Transaction { source } => {
            ActionStatePlanFault::Transaction(project_transaction_error(*source))
        }
        InvalidActionPlan::Unchanged => ActionStatePlanFault::Unchanged,
        InvalidActionPlan::UndeclaredWrites { declared, actual } => {
            ActionStatePlanFault::UndeclaredWrites { declared, actual }
        }
    }
}

fn project_history_error(error: HistoryReplayError) -> (ReplayDirection, ActionStateHistoryFault) {
    match error {
        HistoryReplayError::Boundary(source) => match source {
            CommitReplayError::LineageMismatch { direction } => (
                direction,
                ActionStateHistoryFault::Boundary(ActionStateHistoryBoundaryFault::LineageMismatch),
            ),
            CommitReplayError::DocumentMismatch { direction } => (
                direction,
                ActionStateHistoryFault::Boundary(
                    ActionStateHistoryBoundaryFault::DocumentMismatch,
                ),
            ),
        },
        HistoryReplayError::Transaction { direction, source } => {
            (direction, ActionStateHistoryFault::Transaction(project_transaction_error(*source)))
        }
        HistoryReplayError::UnexpectedUnchanged { direction } => {
            (direction, ActionStateHistoryFault::UnexpectedUnchanged)
        }
        HistoryReplayError::ResultMismatch { direction } => {
            (direction, ActionStateHistoryFault::ResultMismatch)
        }
    }
}

fn project_transaction_error(error: TransactionApplyError) -> ActionStateTransactionFault {
    match error {
        TransactionApplyError::ContextSchemaMismatch { .. } => {
            ActionStateTransactionFault::ContextSchemaMismatch
        }
        TransactionApplyError::ContextConfigurationMismatch => {
            ActionStateTransactionFault::ContextConfigurationMismatch
        }
        TransactionApplyError::StaleSnapshot { .. } => ActionStateTransactionFault::StaleSnapshot,
        TransactionApplyError::BaseStateMismatch { .. } => {
            ActionStateTransactionFault::BaseStateMismatch
        }
        TransactionApplyError::OperationLimit { .. } => ActionStateTransactionFault::OperationLimit,
        TransactionApplyError::Operation { operation_index, source } => {
            ActionStateTransactionFault::Operation {
                operation_index,
                source: project_operation_error(source),
            }
        }
        TransactionApplyError::SelectionRelocation(source) => {
            ActionStateTransactionFault::SelectionRelocation(project_selection_error(source))
        }
        TransactionApplyError::InvalidResultState(source) => {
            ActionStateTransactionFault::InvalidResultState(project_result_error(source))
        }
        TransactionApplyError::Revision(RevisionError::Overflow) => {
            ActionStateTransactionFault::RevisionOverflow
        }
    }
}

#[allow(clippy::too_many_lines)]
fn project_operation_error(error: OperationApplyError) -> ActionStateOperationFault {
    match error {
        OperationApplyError::TextSplice(source) => match source {
            TextSpliceApplyError::Contract(_) => ActionStateOperationFault::TextSpliceContract,
            TextSpliceApplyError::SchemaMismatch { .. }
            | TextSpliceApplyError::DocumentProofMismatch(_) => {
                ActionStateOperationFault::TextSpliceSchemaMismatch
            }
            TextSpliceApplyError::UnsupportedSchema { .. } => {
                ActionStateOperationFault::TextSpliceUnsupportedSchema
            }
            TextSpliceApplyError::NodeLookup(_) => ActionStateOperationFault::TextSpliceNodeLookup,
            TextSpliceApplyError::InvalidTarget { .. } => {
                ActionStateOperationFault::TextSpliceInvalidTarget
            }
            TextSpliceApplyError::RangeOutOfBounds { .. } => {
                ActionStateOperationFault::TextSpliceRangeOutOfBounds
            }
            TextSpliceApplyError::RangeSplitsScalar { .. } => {
                ActionStateOperationFault::TextSpliceRangeSplitsScalar
            }
            TextSpliceApplyError::ExpectedRemovedMismatch { .. } => {
                ActionStateOperationFault::TextSpliceExpectedRemovedMismatch
            }
            TextSpliceApplyError::FragmentRunCountLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentRunCountLimit
            }
            TextSpliceApplyError::FragmentTotalTextBytesLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentTotalTextBytesLimit
            }
            TextSpliceApplyError::FragmentTextBytesLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentTextBytesLimit
            }
            TextSpliceApplyError::FragmentFormatCountLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentFormatCountLimit
            }
            TextSpliceApplyError::FragmentFormatNotAllowed { .. } => {
                ActionStateOperationFault::TextSpliceFragmentFormatNotAllowed
            }
            TextSpliceApplyError::FragmentFormatPropertiesNotAllowed { .. } => {
                ActionStateOperationFault::TextSpliceFragmentFormatPropertiesNotAllowed
            }
            TextSpliceApplyError::InvalidFormatInstance { .. } => {
                ActionStateOperationFault::TextSpliceInvalidFormatInstance
            }
            TextSpliceApplyError::FragmentPropertyValueCountLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentPropertyValueCountLimit
            }
            TextSpliceApplyError::FragmentPropertyStringBytesLimit { .. } => {
                ActionStateOperationFault::TextSpliceFragmentPropertyStringBytesLimit
            }
            TextSpliceApplyError::Fragment(_) => ActionStateOperationFault::TextSpliceFragment,
            TextSpliceApplyError::TextRange(_) => ActionStateOperationFault::TextSpliceTextRange,
            TextSpliceApplyError::TextOffset(_) => ActionStateOperationFault::TextSpliceTextOffset,
            TextSpliceApplyError::CoordinateOverflow => {
                ActionStateOperationFault::TextSpliceCoordinateOverflow
            }
            TextSpliceApplyError::TreeInvariant { .. } => {
                ActionStateOperationFault::TextSpliceTreeInvariant
            }
            TextSpliceApplyError::InvalidResult(_) => {
                ActionStateOperationFault::TextSpliceInvalidResult
            }
        },
        OperationApplyError::ParagraphSplit(source) => match source {
            ParagraphSplitApplyError::Contract(_) => {
                ActionStateOperationFault::ParagraphSplitContract
            }
            ParagraphSplitApplyError::SchemaMismatch { .. }
            | ParagraphSplitApplyError::DocumentProofMismatch(_) => {
                ActionStateOperationFault::ParagraphSplitSchemaMismatch
            }
            ParagraphSplitApplyError::UnsupportedSchema { .. } => {
                ActionStateOperationFault::ParagraphSplitUnsupportedSchema
            }
            ParagraphSplitApplyError::NodeLookup(_) => {
                ActionStateOperationFault::ParagraphSplitNodeLookup
            }
            ParagraphSplitApplyError::InvalidTarget { .. } => {
                ActionStateOperationFault::ParagraphSplitInvalidTarget
            }
            ParagraphSplitApplyError::ExpectedMismatch { .. } => {
                ActionStateOperationFault::ParagraphSplitExpectedMismatch
            }
            ParagraphSplitApplyError::Fragment(_) => {
                ActionStateOperationFault::ParagraphSplitFragment
            }
            ParagraphSplitApplyError::FragmentSplit(_) => {
                ActionStateOperationFault::ParagraphSplitFragmentSplit
            }
            ParagraphSplitApplyError::Inverse(_) => {
                ActionStateOperationFault::ParagraphSplitInverse
            }
            ParagraphSplitApplyError::CoordinateOverflow => {
                ActionStateOperationFault::ParagraphSplitCoordinateOverflow
            }
            ParagraphSplitApplyError::TreeInvariant { .. } => {
                ActionStateOperationFault::ParagraphSplitTreeInvariant
            }
            ParagraphSplitApplyError::InvalidResult(_) => {
                ActionStateOperationFault::ParagraphSplitInvalidResult
            }
        },
        OperationApplyError::ParagraphJoin(source) => match source {
            ParagraphJoinApplyError::Contract(_) => {
                ActionStateOperationFault::ParagraphJoinContract
            }
            ParagraphJoinApplyError::SchemaMismatch { .. }
            | ParagraphJoinApplyError::DocumentProofMismatch(_) => {
                ActionStateOperationFault::ParagraphJoinSchemaMismatch
            }
            ParagraphJoinApplyError::UnsupportedSchema { .. } => {
                ActionStateOperationFault::ParagraphJoinUnsupportedSchema
            }
            ParagraphJoinApplyError::NodeLookup(_) => {
                ActionStateOperationFault::ParagraphJoinNodeLookup
            }
            ParagraphJoinApplyError::InvalidTarget { .. } => {
                ActionStateOperationFault::ParagraphJoinInvalidTarget
            }
            ParagraphJoinApplyError::MissingRightSibling { .. } => {
                ActionStateOperationFault::ParagraphJoinMissingRightSibling
            }
            ParagraphJoinApplyError::ExpectedMismatch { .. } => {
                ActionStateOperationFault::ParagraphJoinExpectedMismatch
            }
            ParagraphJoinApplyError::Fragment(_) => {
                ActionStateOperationFault::ParagraphJoinFragment
            }
            ParagraphJoinApplyError::Inverse(_) => ActionStateOperationFault::ParagraphJoinInverse,
            ParagraphJoinApplyError::CoordinateOverflow => {
                ActionStateOperationFault::ParagraphJoinCoordinateOverflow
            }
            ParagraphJoinApplyError::TreeInvariant { .. } => {
                ActionStateOperationFault::ParagraphJoinTreeInvariant
            }
            ParagraphJoinApplyError::InvalidResult(_) => {
                ActionStateOperationFault::ParagraphJoinInvalidResult
            }
        },
        OperationApplyError::RootTextReplace(source) => match source {
            RootTextReplaceApplyError::Contract(_) => {
                ActionStateOperationFault::RootTextReplaceContract
            }
            RootTextReplaceApplyError::SchemaMismatch { .. }
            | RootTextReplaceApplyError::DocumentProofMismatch(_) => {
                ActionStateOperationFault::RootTextReplaceSchemaMismatch
            }
            RootTextReplaceApplyError::UnsupportedSchema { .. } => {
                ActionStateOperationFault::RootTextReplaceUnsupportedSchema
            }
            RootTextReplaceApplyError::NodeLookup(_) => {
                ActionStateOperationFault::RootTextReplaceNodeLookup
            }
            RootTextReplaceApplyError::InvalidTarget { .. } => {
                ActionStateOperationFault::RootTextReplaceInvalidTarget
            }
            RootTextReplaceApplyError::ExpectedMismatch { .. } => {
                ActionStateOperationFault::RootTextReplaceExpectedMismatch
            }
            RootTextReplaceApplyError::ParagraphCountLimit { .. } => {
                ActionStateOperationFault::RootTextReplaceParagraphCountLimit
            }
            RootTextReplaceApplyError::TotalTextBytesLimit { .. } => {
                ActionStateOperationFault::RootTextReplaceTotalTextBytesLimit
            }
            RootTextReplaceApplyError::FragmentRunCountLimit { .. } => {
                ActionStateOperationFault::RootTextReplaceFragmentRunCountLimit
            }
            RootTextReplaceApplyError::FragmentTextBytesLimit { .. } => {
                ActionStateOperationFault::RootTextReplaceFragmentTextBytesLimit
            }
            RootTextReplaceApplyError::FragmentFormatCountLimit { .. } => {
                ActionStateOperationFault::RootTextReplaceFragmentFormatCountLimit
            }
            RootTextReplaceApplyError::FragmentFormatNotAllowed { .. } => {
                ActionStateOperationFault::RootTextReplaceFragmentFormatNotAllowed
            }
            RootTextReplaceApplyError::FragmentFormatPropertiesNotAllowed { .. } => {
                ActionStateOperationFault::RootTextReplaceFragmentFormatPropertiesNotAllowed
            }
            RootTextReplaceApplyError::InvalidFormatInstance { .. } => {
                ActionStateOperationFault::RootTextReplaceInvalidFormatInstance
            }
            RootTextReplaceApplyError::PropertyValueCountLimit { .. } => {
                ActionStateOperationFault::RootTextReplacePropertyValueCountLimit
            }
            RootTextReplaceApplyError::PropertyStringBytesLimit { .. } => {
                ActionStateOperationFault::RootTextReplacePropertyStringBytesLimit
            }
            RootTextReplaceApplyError::Fragment(_) => {
                ActionStateOperationFault::RootTextReplaceFragment
            }
            RootTextReplaceApplyError::Inverse(_) => {
                ActionStateOperationFault::RootTextReplaceInverse
            }
            RootTextReplaceApplyError::CoordinateOverflow => {
                ActionStateOperationFault::RootTextReplaceCoordinateOverflow
            }
            RootTextReplaceApplyError::TreeInvariant { .. } => {
                ActionStateOperationFault::RootTextReplaceTreeInvariant
            }
            RootTextReplaceApplyError::InvalidResult(_) => {
                ActionStateOperationFault::RootTextReplaceInvalidResult
            }
        },
    }
}

fn project_selection_error(error: SelectionRelocationError) -> ActionStateSelectionRelocationFault {
    match error {
        SelectionRelocationError::Point { endpoint, source } => {
            ActionStateSelectionRelocationFault::Point {
                endpoint,
                source: project_relocation_error(&source),
            }
        }
        SelectionRelocationError::DeletedEndpoint { endpoint } => {
            ActionStateSelectionRelocationFault::DeletedEndpoint { endpoint }
        }
    }
}

fn project_relocation_error(error: &RelocationError) -> ActionStateRelocationFault {
    match error {
        RelocationError::StaleSnapshot { .. } => ActionStateRelocationFault::StaleSnapshot,
        RelocationError::InvalidSourcePoint(_) => ActionStateRelocationFault::InvalidSourcePoint,
        RelocationError::InvalidResultPoint(_) => ActionStateRelocationFault::InvalidResultPoint,
        RelocationError::SourceDocumentMismatch => {
            ActionStateRelocationFault::SourceDocumentMismatch
        }
        RelocationError::NodeLookup(_) => ActionStateRelocationFault::NodeLookup,
        RelocationError::ExpectedTextContainer { .. } => {
            ActionStateRelocationFault::ExpectedTextContainer
        }
        RelocationError::NonTextChild { .. } => ActionStateRelocationFault::NonTextChild,
        RelocationError::PointOutsideContainer { .. } => {
            ActionStateRelocationFault::PointOutsideContainer
        }
        RelocationError::OffsetOutOfBounds { .. } => ActionStateRelocationFault::OffsetOutOfBounds,
        RelocationError::CoordinateOverflow => ActionStateRelocationFault::CoordinateOverflow,
        RelocationError::TextOffset(_) => ActionStateRelocationFault::TextOffset,
    }
}

fn project_result_error(error: EditorStateError) -> ActionStateResultFault {
    match error {
        EditorStateError::SchemaMismatch { .. } | EditorStateError::DocumentProofMismatch(_) => {
            ActionStateResultFault::SchemaMismatch
        }
        EditorStateError::InvalidDocument(_) => ActionStateResultFault::InvalidDocument,
        EditorStateError::InvalidSelection(source) => match source {
            SelectionError::DocumentProofMismatch(_) => ActionStateResultFault::SchemaMismatch,
            SelectionError::InvalidPoint { endpoint, .. } => {
                ActionStateResultFault::InvalidSelectionPoint { endpoint }
            }
            SelectionError::EndpointNotAllowed { endpoint, .. } => {
                ActionStateResultFault::SelectionEndpointNotAllowed { endpoint }
            }
            SelectionError::Comparison(_) => ActionStateResultFault::SelectionComparison,
        },
        EditorStateError::PendingFormatsRequireCollapsedRange => {
            ActionStateResultFault::PendingFormatsRequireCollapsedRange
        }
        EditorStateError::InvalidPendingFormats(source) => match source {
            PendingFormatError::TooMany { .. } => ActionStateResultFault::PendingFormatCountLimit,
            PendingFormatError::UnknownKind { .. } => {
                ActionStateResultFault::PendingFormatUnknownKind
            }
            PendingFormatError::PropertyBearingKindUnsupported { .. } => {
                ActionStateResultFault::PendingFormatPropertyBearingKindUnsupported
            }
            PendingFormatError::PropertiesNotAllowed { .. } => {
                ActionStateResultFault::PendingFormatPropertiesNotAllowed
            }
            PendingFormatError::InvalidFormatInstance { .. } => {
                ActionStateResultFault::PendingFormatInvalidInstance
            }
            PendingFormatError::PropertyValueCountOverflow => {
                ActionStateResultFault::PendingFormatPropertyValueCountOverflow
            }
            PendingFormatError::PropertyValueCountLimit { .. } => {
                ActionStateResultFault::PendingFormatPropertyValueCountLimit
            }
            PendingFormatError::PropertyStringBytesOverflow => {
                ActionStateResultFault::PendingFormatPropertyStringBytesOverflow
            }
            PendingFormatError::PropertyStringBytesLimit { .. } => {
                ActionStateResultFault::PendingFormatPropertyStringBytesLimit
            }
        },
    }
}

const fn action_fault_category(fault: &ActionStateActionFault) -> &'static str {
    match fault {
        ActionStateActionFault::UnknownAction => "unknown-action",
        ActionStateActionFault::InvalidInput(_) => "invalid-input",
        ActionStateActionFault::Handler(_) => "handler-fault",
        ActionStateActionFault::InvalidState(_) => "invalid-state",
        ActionStateActionFault::InvalidPlan(_) => "invalid-plan",
    }
}

const fn history_fault_category(fault: ActionStateHistoryFault) -> &'static str {
    match fault {
        ActionStateHistoryFault::Boundary(_) => "boundary",
        ActionStateHistoryFault::Transaction(_) => "transaction",
        ActionStateHistoryFault::UnexpectedUnchanged => "unexpected-unchanged",
        ActionStateHistoryFault::ResultMismatch => "result-mismatch",
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        document::{Format, PropertyMap, PropertyValue},
        identity::QualifiedName,
        operation::{OperationApplyError, RootTextFragmentRole, RootTextReplaceApplyError},
        schema::{CompiledSchema, DocumentLimits},
    };

    use super::{ActionStateOperationFault, project_operation_error};

    #[test]
    fn root_text_typed_property_failures_have_bounded_exhaustive_projections()
    -> Result<(), Box<dyn std::error::Error>> {
        let schema = CompiledSchema::breditor_base();
        let kind = QualifiedName::from_known_static("breditor/strong");
        let properties = PropertyMap::try_from_sorted(vec![(
            QualifiedName::from_known_static("example/value"),
            PropertyValue::from_string("secret"),
        )])?;
        let Err(report) = schema.validate_inline_format_instance(
            &DocumentLimits::default(),
            &Format::new(kind.clone(), properties),
        ) else {
            return Err(std::io::Error::other("base strong properties were accepted").into());
        };

        let cases = [
            (
                RootTextReplaceApplyError::InvalidFormatInstance {
                    role: RootTextFragmentRole::Replacement,
                    paragraph_index: 0,
                    run_index: 0,
                    format_index: 0,
                    kind,
                    source: report,
                },
                ActionStateOperationFault::RootTextReplaceInvalidFormatInstance,
            ),
            (
                RootTextReplaceApplyError::PropertyValueCountLimit {
                    role: RootTextFragmentRole::Replacement,
                    actual: 2,
                    maximum: 1,
                },
                ActionStateOperationFault::RootTextReplacePropertyValueCountLimit,
            ),
            (
                RootTextReplaceApplyError::PropertyStringBytesLimit {
                    role: RootTextFragmentRole::Replacement,
                    actual: 2,
                    maximum: 1,
                },
                ActionStateOperationFault::RootTextReplacePropertyStringBytesLimit,
            ),
        ];

        for (error, expected) in cases {
            let projected = project_operation_error(OperationApplyError::RootTextReplace(error));
            assert_eq!(projected, expected);
            assert!(!format!("{projected:?}").contains("secret"));
        }
        Ok(())
    }
}
