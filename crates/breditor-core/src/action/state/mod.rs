//! Frozen action observation shapes and conservative state-effect declarations.
//!
//! Action state is evaluated atomically with capability and planning. This
//! layer defines no labels, icons, toolbar ordering, subscriptions, replay
//! protocol, or host presentation policy. Its optional synchronous cache owns
//! one immutable observation and bounded local deltas, never delivery logic.
//! Ordinary actions and intents cannot read session history; only synthesized
//! session-backed history observations may declare that dependency.

mod activation;
mod batch;
mod cache;
mod cache_update;
mod catalog;
mod contract;
mod delta;
mod descriptor;
mod domains;
mod effects;
mod error;
mod evaluation;
mod fault;
mod id;
mod indicator;
mod limits;
mod observation;
mod observation_id;
mod outcome;
mod registration;
mod source;
mod spec;
mod validation_error;
mod value;
mod value_contract;
mod value_version;

pub use activation::ActionActivation;
pub use batch::{ActionStateBatch, ActionStateBatchSummary};
pub use cache::ActionStateCache;
pub use cache_update::ActionStateCacheUpdate;
pub use catalog::ActionStateCatalog;
pub use contract::{ActionActivationContract, ActionStateContract};
pub use delta::ActionStateDelta;
pub use descriptor::ActionStateDescriptor;
pub use domains::ActionStateDomains;
pub use effects::ActionEffects;
pub use error::{ActionStateCatalogError, ActionStateDeriveError, ActionStateResourceError};
pub use evaluation::ActionEvaluation;
pub use fault::{
    ActionStateActionFault, ActionStateFault, ActionStateHistoryBoundaryFault,
    ActionStateHistoryFault, ActionStateOperationFault, ActionStatePlanFault,
    ActionStateRelocationFault, ActionStateResultFault, ActionStateRouteFault,
    ActionStateSelectionRelocationFault, ActionStateTransactionFault,
};
pub use id::ActionStateId;
pub use indicator::ActionStateIndicator;
pub use limits::{
    MAX_ACTION_STATE_BATCH_FALLTHROUGHS, MAX_ACTION_STATE_BATCH_TEXT_BYTES,
    MAX_ACTION_STATE_BATCH_VALUE_COUNT, MAX_ACTION_STATE_ENTRIES,
    MAX_ACTION_STATE_ENTRY_TEXT_BYTES, MAX_ACTION_STATE_ENTRY_VALUE_COUNT,
    MAX_ACTION_STATE_INPUT_TEXT_BYTES, MAX_ACTION_STATE_INPUT_VALUE_COUNT,
};
pub use observation::ActionStateObservation;
pub use observation_id::ActionStateObservationId;
pub use outcome::{
    ActionStateEntry, ActionStateOutcome, ActionStateProvenance, ObservedAvailability,
    ResolvedActionState, UnhandledActionState,
};
pub use registration::ActionStateRegistration;
pub use source::ActionStateSource;
pub use spec::ActionStateSpec;
pub use validation_error::ActionStateValidationError;
pub use value::ActionStateValue;
pub use value_contract::ActionStateValueContract;
pub use value_version::{ActionStateValueVersion, ActionStateValueVersionError};

pub(crate) fn validate_indicator(
    contract: &ActionStateContract,
    indicator: &ActionStateIndicator,
) -> Result<(), ActionStateValidationError> {
    match (contract.supports_activation(), indicator.activation()) {
        (false, ActionActivation::Stateless)
        | (true, ActionActivation::Inactive | ActionActivation::Active | ActionActivation::Mixed) =>
            {}
        (false, actual) => return Err(ActionStateValidationError::UnexpectedActivation { actual }),
        (true, ActionActivation::Stateless) => {
            return Err(ActionStateValidationError::MissingActivation);
        }
    }

    match (contract.value_contract(), indicator.value().contract()) {
        (None, None) => Ok(()),
        (None, Some(actual)) => {
            Err(ActionStateValidationError::UnexpectedValue { actual: actual.clone() })
        }
        (Some(expected), None) => {
            Err(ActionStateValidationError::MissingValue { expected: expected.clone() })
        }
        (Some(expected), Some(actual)) if expected == actual => Ok(()),
        (Some(expected), Some(actual)) => Err(ActionStateValidationError::ValueContractMismatch {
            expected: expected.clone(),
            actual: actual.clone(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{action::ActionValue, identity::QualifiedName};

    fn value_contract(name: &'static str) -> ActionStateValueContract {
        ActionStateValueContract::new(
            QualifiedName::from_known_static(name),
            ActionStateValueVersion::one(),
        )
    }

    #[test]
    fn tracked_activation_and_all_typed_value_shapes_validate() {
        let value = value_contract("test/observable-value");
        let contract =
            ActionStateContract::new(ActionActivationContract::Tracked, Some(value.clone()));
        let indicators = [
            ActionStateIndicator::new(
                ActionActivation::Inactive,
                ActionStateValue::unset(value.clone()),
            ),
            ActionStateIndicator::new(
                ActionActivation::Active,
                ActionStateValue::uniform(value.clone(), ActionValue::null()),
            ),
            ActionStateIndicator::new(ActionActivation::Mixed, ActionStateValue::mixed(value)),
        ];

        for indicator in indicators {
            assert_eq!(validate_indicator(&contract, &indicator), Ok(()));
        }
    }

    #[test]
    fn unsupported_unset_uniform_null_and_mixed_are_distinct() {
        let contract = value_contract("test/distinct-value");
        let states = [
            ActionStateValue::Unsupported,
            ActionStateValue::unset(contract.clone()),
            ActionStateValue::uniform(contract.clone(), ActionValue::null()),
            ActionStateValue::mixed(contract),
        ];

        for (index, left) in states.iter().enumerate() {
            for (other_index, right) in states.iter().enumerate() {
                assert_eq!(left == right, index == other_index);
            }
        }
    }

    #[test]
    fn exact_output_contract_is_required_without_retaining_value_payload()
    -> Result<(), Box<dyn std::error::Error>> {
        let expected = value_contract("test/versioned-value");
        let actual = ActionStateValueContract::new(
            QualifiedName::from_known_static("test/versioned-value"),
            ActionStateValueVersion::try_new(2)?,
        );
        let contract =
            ActionStateContract::new(ActionActivationContract::Stateless, Some(expected.clone()));
        assert_eq!(
            validate_indicator(
                &contract,
                &ActionStateIndicator::new(
                    ActionActivation::Stateless,
                    ActionStateValue::Unsupported,
                ),
            ),
            Err(ActionStateValidationError::MissingValue { expected: expected.clone() })
        );
        let secret = "secret-invalid-observation";
        let indicator = ActionStateIndicator::new(
            ActionActivation::Stateless,
            ActionStateValue::uniform(actual.clone(), ActionValue::try_from_string(secret)?),
        );

        let error = validate_indicator(&contract, &indicator);
        assert_eq!(
            error,
            Err(ActionStateValidationError::ValueContractMismatch { expected, actual })
        );
        assert!(!format!("{error:?}").contains(secret));
        Ok(())
    }

    #[test]
    fn output_versions_are_independent_and_reserve_zero() -> Result<(), Box<dyn std::error::Error>>
    {
        let input = crate::action::ActionInputVersion::try_new(41)?;
        let output = ActionStateValueVersion::try_new(73)?;

        assert_eq!(input.get(), 41);
        assert_eq!(output.get(), 73);
        assert_eq!(ActionStateValueVersion::try_new(0), Err(ActionStateValueVersionError::Zero));
        Ok(())
    }
}
