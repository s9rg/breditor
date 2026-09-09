use crate::{
    action::{Action, ActionEvaluation, ActionFault, ActionId, ActionStateSpec},
    identity::QualifiedName,
    state::EditorState,
};

use super::toggle_inline_format::{ToggleInlineFormatAction, toggle_inline_format_state_spec};

/// Compatibility action that toggles the built-in strong text format.
///
/// The behavior delegates to [`ToggleInlineFormatAction`] while retaining the
/// original built-in identity, state/effect contract, disabled reasons, and
/// strong-specific fault codes.
#[derive(Clone, Copy, Debug, Default)]
pub struct ToggleStrongAction;

/// Returns the stable built-in strong-format action identity.
#[must_use]
pub fn toggle_strong_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static("breditor/toggle-strong"))
}

impl Action for ToggleStrongAction {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        toggle_inline_format_state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        (): &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        let action = ToggleInlineFormatAction::new(state.context().schema().strong_kind().clone());
        action.evaluate(state, &()).map_err(map_compatibility_fault)
    }
}

fn map_compatibility_fault(source: ActionFault) -> ActionFault {
    let code = match source.code().as_str() {
        "breditor/toggle-inline-format-range-fault" => "breditor/toggle-strong-range-fault",
        "breditor/toggle-inline-format-splice-fault" => "breditor/toggle-strong-splice-fault",
        "breditor/toggle-inline-format-root-replace-fault" => {
            "breditor/toggle-strong-root-replace-fault"
        }
        "breditor/toggle-inline-format-cross-span-fault" => {
            "breditor/toggle-strong-cross-span-fault"
        }
        "breditor/toggle-inline-format-root-range-fault" => {
            "breditor/toggle-strong-root-range-fault"
        }
        "breditor/toggle-inline-format-cross-source-fault" => {
            "breditor/toggle-strong-cross-source-fault"
        }
        "breditor/toggle-inline-format-group-fault" => "breditor/toggle-strong-group-fault",
        "breditor/toggle-inline-format-run-fault" => "breditor/toggle-strong-run-fault",
        "breditor/toggle-inline-format-fold-fault" => "breditor/toggle-strong-fold-fault",
        "breditor/toggle-inline-format-format-count-fault" => {
            "breditor/toggle-strong-format-count-fault"
        }
        "breditor/toggle-inline-format-format-set-fault" => {
            "breditor/toggle-strong-format-set-fault"
        }
        "breditor/toggle-inline-format-result-fold-fault" => {
            "breditor/toggle-strong-result-fold-fault"
        }
        "breditor/toggle-inline-format-cross-result-fault" => {
            "breditor/toggle-strong-cross-result-fault"
        }
        "breditor/toggle-inline-format-property-validation-fault" => {
            "breditor/toggle-strong-property-validation-fault"
        }
        "breditor/toggle-inline-format-property-budget-fault" => {
            "breditor/toggle-strong-property-budget-fault"
        }
        "breditor/toggle-inline-format-selection-order-fault" => {
            "breditor/toggle-strong-selection-order-fault"
        }
        "breditor/toggle-inline-format-selection-fault" => "breditor/toggle-strong-selection-fault",
        _ => return source,
    };
    ActionFault::new(QualifiedName::from_known_static(code), source.detail().cloned())
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{action::ActionFault, identity::QualifiedName};

    use super::map_compatibility_fault;

    #[test]
    fn generic_fault_vocabulary_maps_to_every_legacy_strong_code() -> Result<(), Box<dyn Error>> {
        const SUFFIXES: &[&str] = &[
            "range-fault",
            "splice-fault",
            "root-replace-fault",
            "cross-span-fault",
            "root-range-fault",
            "cross-source-fault",
            "group-fault",
            "run-fault",
            "fold-fault",
            "format-count-fault",
            "format-set-fault",
            "result-fold-fault",
            "cross-result-fault",
            "property-validation-fault",
            "property-budget-fault",
            "selection-order-fault",
            "selection-fault",
        ];

        for suffix in SUFFIXES {
            let generic =
                QualifiedName::try_new(format!("breditor/toggle-inline-format-{suffix}"))?;
            let expected = format!("breditor/toggle-strong-{suffix}");
            let mapped = map_compatibility_fault(ActionFault::new(generic, None));
            assert_eq!(mapped.code().as_str(), expected);
        }
        Ok(())
    }

    #[test]
    fn shared_faults_are_not_rewritten() {
        let source = ActionFault::new(
            QualifiedName::from_known_static("breditor/text-position-fault"),
            None,
        );
        assert_eq!(map_compatibility_fault(source.clone()), source);
    }
}
