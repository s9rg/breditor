use std::fmt;

use breditor_core::{
    action::{
        ActionInvocation, ActionRegistry, ActionStateCatalog, ActionStateCatalogError,
        ActionStateId, ActionStateRegistration, ActionStateSource,
        builtins::toggle_strong_action_id,
    },
    transaction::ReplayDirection,
};

/// Stable observable identity of the base bold control.
pub(crate) const BOLD_STATE_ID: &str = "breditor/control-bold";
/// Stable observable identity of the base undo control.
pub(crate) const UNDO_STATE_ID: &str = "breditor/control-undo";
/// Stable observable identity of the base redo control.
pub(crate) const REDO_STATE_ID: &str = "breditor/control-redo";

/// Builds the fixed base action-state generation over the engine's exact action registry.
///
/// The bold entry evaluates the same `breditor/toggle-strong` action that a
/// click later executes. Undo and redo use session-backed replay preflight.
/// Observable identities remain distinct from command identities so hosts may
/// replace labels, icons, placement, and shortcuts without changing semantics.
pub(crate) fn base_action_state_catalog(
    actions: ActionRegistry,
) -> Result<ActionStateCatalog, BaseActionStateCatalogError> {
    let registrations = vec![
        ActionStateRegistration::new(
            state_id(BOLD_STATE_ID)?,
            ActionStateSource::direct(ActionInvocation::without_input(toggle_strong_action_id())),
        ),
        ActionStateRegistration::new(
            state_id(UNDO_STATE_ID)?,
            ActionStateSource::history(ReplayDirection::Undo),
        ),
        ActionStateRegistration::new(
            state_id(REDO_STATE_ID)?,
            ActionStateSource::history(ReplayDirection::Redo),
        ),
    ];
    ActionStateCatalog::try_new(actions, registrations)
        .map_err(BaseActionStateCatalogError::Catalog)
}

#[derive(Debug)]
/// Internal failure to construct the compiled base action-state generation.
pub(crate) enum BaseActionStateCatalogError {
    /// A compiled observable identifier violated the shared name grammar.
    InvalidId,
    /// The exact action registry could not satisfy the fixed catalog.
    Catalog(ActionStateCatalogError),
}

impl fmt::Display for BaseActionStateCatalogError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidId => formatter.write_str("compiled action-state ID is invalid"),
            Self::Catalog(source) => {
                write!(formatter, "compiled action-state catalog failed: {source}")
            }
        }
    }
}

impl std::error::Error for BaseActionStateCatalogError {}

fn state_id(value: &'static str) -> Result<ActionStateId, BaseActionStateCatalogError> {
    ActionStateId::try_new(value).map_err(|_| BaseActionStateCatalogError::InvalidId)
}

#[cfg(test)]
mod tests {
    use breditor_core::action::{
        ActionActivationContract, ActionStateSource, builtins::base_action_registry,
    };

    use super::*;

    #[test]
    fn base_catalog_is_canonical_and_binds_the_exact_semantic_sources()
    -> Result<(), Box<dyn std::error::Error>> {
        let catalog = base_action_state_catalog(base_action_registry()?)
            .map_err(|_| "base action-state catalog failed")?;
        let ids = catalog
            .descriptors()
            .iter()
            .map(|descriptor| descriptor.id().as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, [BOLD_STATE_ID, REDO_STATE_ID, UNDO_STATE_ID]);

        let bold_id = state_id(BOLD_STATE_ID).map_err(|_| "invalid bold action-state ID")?;
        let bold = catalog.descriptor(&bold_id).ok_or("missing bold action state")?;
        assert!(matches!(bold.source(), ActionStateSource::Direct(invocation)
            if invocation.id() == &toggle_strong_action_id()));
        assert_eq!(bold.contract().activation_contract(), ActionActivationContract::Tracked);

        let undo_id = state_id(UNDO_STATE_ID).map_err(|_| "invalid undo action-state ID")?;
        let undo = catalog.descriptor(&undo_id).ok_or("missing undo action state")?;
        assert!(matches!(undo.source(), ActionStateSource::History(ReplayDirection::Undo)));
        let redo_id = state_id(REDO_STATE_ID).map_err(|_| "invalid redo action-state ID")?;
        let redo = catalog.descriptor(&redo_id).ok_or("missing redo action state")?;
        assert!(matches!(redo.source(), ActionStateSource::History(ReplayDirection::Redo)));
        Ok(())
    }
}
