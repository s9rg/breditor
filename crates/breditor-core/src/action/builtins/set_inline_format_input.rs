use std::{collections::BTreeMap, fmt};

use crate::{
    action::{
        ActionInput, ActionInputContract, ActionInputError, ActionInputVersion, ActionValue,
        DecodeActionInput, TypedActionInput,
    },
    document::{PropertyMap, PropertyObject, PropertyValue},
    identity::QualifiedName,
};

/// Stable qualified name of the property-aware inline-format input contract.
pub const SET_INLINE_FORMAT_INPUT_CONTRACT_NAME: &str = "breditor/set-inline-format-input";

/// Version of [`set_inline_format_input_contract`].
pub const SET_INLINE_FORMAT_INPUT_VERSION: ActionInputVersion = ActionInputVersion::one();

/// Stable code used when the top-level input is not an object.
pub const SET_INLINE_FORMAT_INPUT_NOT_OBJECT_CODE: &str =
    "breditor/set-inline-format-input-not-object";

/// Stable code used when an object has missing, extra, or mismatched fields.
pub const SET_INLINE_FORMAT_INPUT_SHAPE_CODE: &str = "breditor/set-inline-format-input-shape";

/// Stable code used when `operation` is not exactly `set` or `remove`.
pub const SET_INLINE_FORMAT_INPUT_OPERATION_CODE: &str =
    "breditor/set-inline-format-input-operation";

/// Stable code used when a property name is not a valid qualified name.
pub const SET_INLINE_FORMAT_INPUT_PROPERTY_NAME_CODE: &str =
    "breditor/set-inline-format-input-property-name";

/// Stable code used when property entries are duplicated or not canonically ordered.
pub const SET_INLINE_FORMAT_INPUT_PROPERTY_ORDER_CODE: &str =
    "breditor/set-inline-format-input-property-order";

/// Exact input to a property-aware inline-format action.
///
/// Contract version 1 has two closed wire shapes:
///
/// - `{ "operation": "remove" }`
/// - `{ "operation": "set", "properties": [{ "name": QualifiedName, "value": Value }] }`
///
/// Property entries must already be in strict lexical name order. The list
/// representation is intentional: qualified names contain `/`, while action
/// object keys use a smaller identifier grammar. `Set` replaces the complete
/// property map for the configured format; it never patches an existing map.
#[derive(Clone, Eq, PartialEq)]
pub enum SetInlineFormatInput {
    /// Apply the configured format with this exact complete property map.
    Set(PropertyMap),
    /// Remove the configured format, regardless of its current properties.
    Remove,
}

impl SetInlineFormatInput {
    /// Creates a complete property-map replacement.
    #[must_use]
    pub const fn set(properties: PropertyMap) -> Self {
        Self::Set(properties)
    }

    /// Creates a format-removal request.
    #[must_use]
    pub const fn remove() -> Self {
        Self::Remove
    }

    /// Returns the complete property map for `Set`, or `None` for `Remove`.
    #[must_use]
    pub const fn properties(&self) -> Option<&PropertyMap> {
        match self {
            Self::Set(properties) => Some(properties),
            Self::Remove => None,
        }
    }

    /// Returns whether this input removes the configured format.
    #[must_use]
    pub const fn is_remove(&self) -> bool {
        matches!(self, Self::Remove)
    }
}

impl fmt::Debug for SetInlineFormatInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Set(properties) => formatter
                .debug_struct("Set")
                .field("property_count", &properties.len())
                .field("properties", &"<redacted>")
                .finish(),
            Self::Remove => formatter.write_str("Remove"),
        }
    }
}

impl DecodeActionInput for SetInlineFormatInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let Some(registered) = registered_contract else {
            return Err(ActionInputError::MissingRegisteredContract);
        };
        let expected = set_inline_format_input_contract();
        if registered != &expected {
            return Err(ActionInputError::ContractMismatch {
                expected,
                actual: registered.clone(),
            });
        }
        let value = input.require_typed(registered)?;
        decode_value(value)
    }
}

impl TypedActionInput for SetInlineFormatInput {}

/// Returns the exact typed-input contract accepted by
/// [`super::SetInlineFormatAction`].
#[must_use]
pub fn set_inline_format_input_contract() -> ActionInputContract {
    ActionInputContract::new(
        QualifiedName::from_known_static(SET_INLINE_FORMAT_INPUT_CONTRACT_NAME),
        SET_INLINE_FORMAT_INPUT_VERSION,
    )
}

fn decode_value(value: &ActionValue) -> Result<SetInlineFormatInput, ActionInputError> {
    let object =
        value.as_object().ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_NOT_OBJECT_CODE))?;
    let operation = object
        .get("operation")
        .and_then(ActionValue::as_string)
        .ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
    match operation {
        "remove" if object.len() == 1 => Ok(SetInlineFormatInput::Remove),
        "set" if object.len() == 2 => {
            let entries = object
                .get("properties")
                .and_then(ActionValue::as_array)
                .ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
            decode_property_map(entries).map(SetInlineFormatInput::Set)
        }
        "remove" | "set" => Err(invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE)),
        _ => Err(invalid_input(SET_INLINE_FORMAT_INPUT_OPERATION_CODE)),
    }
}

fn decode_property_map(entries: &[ActionValue]) -> Result<PropertyMap, ActionInputError> {
    let mut properties = Vec::with_capacity(entries.len());
    for entry in entries {
        let object = entry
            .as_object()
            .filter(|object| object.len() == 2)
            .ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
        let name = object
            .get("name")
            .and_then(ActionValue::as_string)
            .ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
        let name = QualifiedName::try_new(name)
            .map_err(|_| invalid_input(SET_INLINE_FORMAT_INPUT_PROPERTY_NAME_CODE))?;
        let value =
            object.get("value").ok_or_else(|| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
        properties.push((name, property_value(value)?));
    }
    PropertyMap::try_from_sorted(properties)
        .map_err(|_| invalid_input(SET_INLINE_FORMAT_INPUT_PROPERTY_ORDER_CODE))
}

fn property_value(value: &ActionValue) -> Result<PropertyValue, ActionInputError> {
    if value.kind() == crate::action::ActionValueKind::Null {
        return Ok(PropertyValue::null());
    }
    if let Some(value) = value.as_boolean() {
        return Ok(PropertyValue::boolean(value));
    }
    if let Some(value) = value.as_integer() {
        return Ok(PropertyValue::from_integer(value));
    }
    if let Some(value) = value.as_string() {
        return Ok(PropertyValue::from_string(value));
    }
    if let Some(values) = value.as_array() {
        return values
            .iter()
            .map(property_value)
            .collect::<Result<Vec<_>, _>>()
            .map(PropertyValue::array);
    }
    if let Some(values) = value.as_object() {
        let values = values
            .iter()
            .map(|(name, value)| Ok((name.to_owned(), property_value(value)?)))
            .collect::<Result<BTreeMap<_, _>, ActionInputError>>()?;
        let object = PropertyObject::try_from_map(values)
            .map_err(|_| invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))?;
        return Ok(PropertyValue::object(object));
    }
    Err(invalid_input(SET_INLINE_FORMAT_INPUT_SHAPE_CODE))
}

fn invalid_input(code: &'static str) -> ActionInputError {
    ActionInputError::InvalidValue { code: QualifiedName::from_known_static(code) }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        action::{ActionInput, ActionValue, DecodeActionInput},
        document::PropertyInteger,
    };

    use super::{SetInlineFormatInput, set_inline_format_input_contract};

    fn object(entries: Vec<(&str, ActionValue)>) -> Result<ActionValue, Box<dyn Error>> {
        ActionValue::try_object(
            entries.into_iter().map(|(name, value)| (name.to_owned(), value)).collect(),
        )
        .map_err(Into::into)
    }

    fn entry(name: &str, value: ActionValue) -> Result<ActionValue, Box<dyn Error>> {
        object(vec![("name", ActionValue::try_from_string(name)?), ("value", value)])
    }

    #[test]
    fn exact_set_shape_decodes_a_canonical_complete_map() -> Result<(), Box<dyn Error>> {
        let properties = ActionValue::try_array(vec![
            entry("example/enabled", ActionValue::boolean(true))?,
            entry("example/weight", ActionValue::from_integer(PropertyInteger::try_new(7)?))?,
        ])?;
        let value = object(vec![
            ("operation", ActionValue::try_from_string("set")?),
            ("properties", properties),
        ])?;
        let contract = set_inline_format_input_contract();
        let decoded = SetInlineFormatInput::decode(
            Some(&contract),
            &ActionInput::typed(contract.clone(), value),
        )?;
        let properties = decoded.properties().ok_or("expected set")?;
        assert_eq!(properties.len(), 2);
        assert_eq!(
            properties
                .get(&crate::identity::QualifiedName::try_new("example/weight")?)
                .and_then(crate::document::PropertyValue::as_integer)
                .map(PropertyInteger::get),
            Some(7)
        );
        assert!(!decoded.is_remove());
        Ok(())
    }

    #[test]
    fn exact_remove_shape_decodes_without_properties() -> Result<(), Box<dyn Error>> {
        let value = object(vec![("operation", ActionValue::try_from_string("remove")?)])?;
        let contract = set_inline_format_input_contract();
        let decoded = SetInlineFormatInput::decode(
            Some(&contract),
            &ActionInput::typed(contract.clone(), value),
        )?;
        assert!(decoded.is_remove());
        assert_eq!(decoded.properties(), None);
        Ok(())
    }
}
