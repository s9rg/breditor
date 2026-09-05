use breditor_core::action::{
    ActionId, ActionInputContract,
    builtins::{
        insert_plain_text_action_id, insert_plain_text_input_contract, insert_text_action_id,
        insert_text_input_contract,
    },
};

pub(super) fn supports_string_input(action: &ActionId, contract: &ActionInputContract) -> bool {
    (action == &insert_text_action_id() && contract == &insert_text_input_contract())
        || (action == &insert_plain_text_action_id()
            && contract == &insert_plain_text_input_contract())
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use breditor_core::{
        action::{ActionId, ActionInputContract, ActionInputVersion, builtins::*},
        identity::QualifiedName,
    };

    use super::supports_string_input;

    #[test]
    fn string_input_routing_is_an_exact_action_and_contract_allowlist() -> Result<(), Box<dyn Error>>
    {
        let text_action = insert_text_action_id();
        let text_contract = insert_text_input_contract();
        let plain_action = insert_plain_text_action_id();
        let plain_contract = insert_plain_text_input_contract();
        assert!(supports_string_input(&text_action, &text_contract));
        assert!(supports_string_input(&plain_action, &plain_contract));
        assert!(!supports_string_input(&text_action, &plain_contract));
        assert!(!supports_string_input(&plain_action, &text_contract));

        let future_action = ActionId::try_new("test/future-string-action")?;
        assert!(!supports_string_input(&future_action, &text_contract));
        let future_contract = ActionInputContract::new(
            QualifiedName::try_new(INSERT_TEXT_INPUT_CONTRACT_NAME)?,
            ActionInputVersion::try_new(INSERT_TEXT_INPUT_VERSION.get() + 1)?,
        );
        assert!(!supports_string_input(&text_action, &future_contract));
        Ok(())
    }
}
