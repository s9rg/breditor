use crate::{
    action::{ActionStateId, routing::IntentId},
    identity::QualifiedName,
};

/// UI-neutral identity of one generated property-aware inline-format surface.
///
/// This descriptor lets a host correlate a format, its typed semantic intent,
/// and its observable presence state without exposing the generated action,
/// binding, property values, presentation metadata, or executable behavior.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileInlineFormatSetDescriptor {
    format_kind: QualifiedName,
    intent_id: IntentId,
    action_state_id: ActionStateId,
}

impl CompiledProfileInlineFormatSetDescriptor {
    pub(super) const fn new(
        format_kind: QualifiedName,
        intent_id: IntentId,
        action_state_id: ActionStateId,
    ) -> Self {
        Self { format_kind, intent_id, action_state_id }
    }

    /// Returns the typed inline-format kind targeted by this set surface.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }

    /// Returns the typed semantic intent accepting set/remove input.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the observable format-presence state identity.
    #[must_use]
    pub const fn action_state_id(&self) -> &ActionStateId {
        &self.action_state_id
    }
}
