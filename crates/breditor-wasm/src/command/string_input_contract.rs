use breditor_core::action::{
    ActionId, ActionInputContract,
    builtins::{
        insert_plain_text_action_id, insert_plain_text_input_contract, insert_text_action_id,
        insert_text_input_contract,
    },
};

pub(super) fn supports_string_input(action: &ActionId, contract: &ActionInputContract) -> bool {
    #[cfg(feature = "experimental-flat-lists")]
    {
        use breditor_core::action::builtins::{
            insert_flat_list_plain_text_action_id, insert_flat_list_text_action_id,
        };
        if (action == &insert_flat_list_text_action_id()
            && contract == &insert_text_input_contract())
            || (action == &insert_flat_list_plain_text_action_id()
                && contract == &insert_plain_text_input_contract())
        {
            return true;
        }
    }
    #[cfg(feature = "experimental-text-blocks")]
    {
        use breditor_core::action::builtins::{
            insert_text_block_plain_text_action_id, insert_text_block_text_action_id,
        };
        if (action == &insert_text_block_text_action_id()
            && contract == &insert_text_input_contract())
            || (action == &insert_text_block_plain_text_action_id()
                && contract == &insert_plain_text_input_contract())
        {
            return true;
        }
    }
    (action == &insert_text_action_id() && contract == &insert_text_input_contract())
        || (action == &insert_plain_text_action_id()
            && contract == &insert_plain_text_input_contract())
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "experimental-flat-lists")]
    #[test]
    fn list_strings_require_the_exact_registered_contract() {
        let text = insert_flat_list_text_action_id();
        let plain = insert_flat_list_plain_text_action_id();
        assert!(supports_string_input(&text, &insert_text_input_contract()));
        assert!(supports_string_input(&plain, &insert_plain_text_input_contract()));
        assert!(!supports_string_input(&text, &insert_plain_text_input_contract()));
        assert!(!supports_string_input(&plain, &insert_text_input_contract()));
    }
    use std::error::Error;

    use breditor_core::{
        action::{ActionId, ActionInputContract, ActionInputVersion, builtins::*},
        identity::QualifiedName,
    };

    use super::supports_string_input;

    #[cfg(feature = "experimental-text-blocks")]
    #[test]
    fn heading_strings_require_the_exact_registered_contract() {
        let text = insert_text_block_text_action_id();
        let plain = insert_text_block_plain_text_action_id();
        assert!(supports_string_input(&text, &insert_text_input_contract()));
        assert!(supports_string_input(&plain, &insert_plain_text_input_contract()));
        assert!(!supports_string_input(&text, &insert_plain_text_input_contract()));
        assert!(!supports_string_input(&plain, &insert_text_input_contract()));
    }

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
