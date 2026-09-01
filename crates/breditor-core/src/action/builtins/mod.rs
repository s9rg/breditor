//! Built-in semantic actions for the exact Breditor base schema.

mod delete_backward;
mod insert_paragraph_break;
mod support;
mod toggle_strong;

pub use delete_backward::{DeleteBackwardAction, delete_backward_action_id};
pub use insert_paragraph_break::{InsertParagraphBreakAction, insert_paragraph_break_action_id};
pub use toggle_strong::{ToggleStrongAction, toggle_strong_action_id};

use crate::action::{ActionRegistration, ActionRegistry, ActionRegistryError};

/// Returns all base action registrations without freezing a registry.
///
/// Hosts can append extension registrations and then call
/// [`ActionRegistry::try_new`]. Duplicate action identities reject the complete
/// registry instead of silently overriding a built-in.
#[must_use]
pub fn base_action_registrations() -> Vec<ActionRegistration> {
    vec![
        ActionRegistration::new(delete_backward_action_id(), DeleteBackwardAction),
        ActionRegistration::new(insert_paragraph_break_action_id(), InsertParagraphBreakAction),
        ActionRegistration::new(toggle_strong_action_id(), ToggleStrongAction),
    ]
}

/// Builds the immutable registry containing Breditor's base actions.
///
/// # Errors
///
/// Returns [`ActionRegistryError`] if the built-in catalog ever contains a
/// conflicting identity. This is returned, rather than hidden behind a panic,
/// so registry construction keeps the same fail-closed contract as extensions.
pub fn base_action_registry() -> Result<ActionRegistry, ActionRegistryError> {
    ActionRegistry::try_new(base_action_registrations())
}
