use crate::{
    action::{ActionId, ActionStateId, routing::BindingId, routing::IntentId},
    identity::QualifiedName,
};

/// A sealed declaration connecting one inline format to its toggle surface.
///
/// The containing [`super::ExtensionManifest`] owns this behavior-free value.
/// Version `V1` names the checked Rust declaration contract, not a persistence
/// or wire format. It identifies the generic inline-format toggle action, its
/// semantic intent and binding, and the observable state published for host
/// controls. It contains no handler, callback, label, icon, key binding, or
/// toolbar placement.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InlineFormatToggleSpecV1 {
    format_kind: QualifiedName,
    action_id: ActionId,
    intent_id: IntentId,
    binding_id: BindingId,
    action_state_id: ActionStateId,
}

impl InlineFormatToggleSpecV1 {
    /// Creates one toggle declaration from independently checked identities.
    #[must_use]
    pub const fn new(
        format_kind: QualifiedName,
        action_id: ActionId,
        intent_id: IntentId,
        binding_id: BindingId,
        action_state_id: ActionStateId,
    ) -> Self {
        Self { format_kind, action_id, intent_id, binding_id, action_state_id }
    }

    /// Returns the inline-format kind targeted by this toggle.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }

    /// Returns the identity assigned to the generated toggle action.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        &self.action_id
    }

    /// Returns the semantic intent published for the toggle action.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the identity of the intent-to-action binding.
    #[must_use]
    pub const fn binding_id(&self) -> &BindingId {
        &self.binding_id
    }

    /// Returns the observable action-state identity for host controls.
    #[must_use]
    pub const fn action_state_id(&self) -> &ActionStateId {
        &self.action_state_id
    }
}
