use crate::{
    action::{ActionId, ActionStateId, routing::BindingId, routing::IntentId},
    identity::QualifiedName,
};

/// A sealed declaration connecting one typed inline format to its set surface.
///
/// The containing [`super::ExtensionManifest`] owns this behavior-free value.
/// Version `V1` names the checked Rust declaration contract, not a persistence
/// or wire format. It identifies the generic property-aware set action, its
/// typed semantic intent and binding, and the observable presence state
/// published for host controls. Actual commands provide a dynamic set/remove
/// input; the generated action-state entry uses a fixed remove query so its
/// activation answers whether the configured format is currently present.
///
/// The declaration contains no property value, handler, callback, label, icon,
/// key binding, toolbar placement, or executable behavior.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InlineFormatSetSpecV1 {
    format_kind: QualifiedName,
    action_id: ActionId,
    intent_id: IntentId,
    binding_id: BindingId,
    action_state_id: ActionStateId,
}

impl InlineFormatSetSpecV1 {
    /// Creates one property-aware set declaration from checked identities.
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

    /// Returns the typed inline-format kind targeted by this declaration.
    #[must_use]
    pub const fn format_kind(&self) -> &QualifiedName {
        &self.format_kind
    }

    /// Returns the identity assigned to the generated property-aware action.
    #[must_use]
    pub const fn action_id(&self) -> &ActionId {
        &self.action_id
    }

    /// Returns the typed semantic intent published for the generated action.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        &self.intent_id
    }

    /// Returns the identity of the typed intent-to-action binding.
    #[must_use]
    pub const fn binding_id(&self) -> &BindingId {
        &self.binding_id
    }

    /// Returns the observable format-presence state identity for host controls.
    ///
    /// This state does not retain a caller's last property input. It evaluates
    /// the generated action with a fixed remove query, so activation is active
    /// when all selected content has the format, mixed when only some does, and
    /// inactive when none does.
    #[must_use]
    pub const fn action_state_id(&self) -> &ActionStateId {
        &self.action_state_id
    }
}
