use crate::{
    action::{ActionId, routing::IntentId},
    transaction::ReplayDirection,
};

/// Complete command/history relationship of one compiled action-state entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CompiledProfileActionStateSource {
    /// The state is evaluated directly from one action.
    Direct(ActionId),
    /// The state is evaluated through one semantic intent route.
    Routed(IntentId),
    /// The state describes availability of one history replay direction.
    History(ReplayDirection),
}
