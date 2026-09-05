use breditor_core::{
    action::{ActionStateValue, ActionValue, ActionValueKind},
    document::PropertyInteger,
};
use serde_json::{Map, Number, Value};

use crate::{BreditorError, BreditorStringResult, error::ACTION_VALUE_ENCODING_CODE};

pub(crate) fn action_value_json(value: &ActionValue) -> BreditorStringResult {
    match serde_json::to_string(&json_value(value)) {
        Ok(json) => BreditorStringResult::from_value(json),
        Err(_) => BreditorStringResult::from_error(BreditorError::new(
            ACTION_VALUE_ENCODING_CODE,
            "an action value could not be encoded",
        )),
    }
}

pub(crate) fn state_value_status(value: &ActionStateValue) -> &'static str {
    match value {
        ActionStateValue::Unsupported => "unsupported",
        ActionStateValue::Unset { .. } => "unset",
        ActionStateValue::Uniform { .. } => "uniform",
        ActionStateValue::Mixed { .. } => "mixed",
    }
}

fn json_value(value: &ActionValue) -> Value {
    match value.kind() {
        ActionValueKind::Null => Value::Null,
        ActionValueKind::Boolean => Value::Bool(value.as_boolean().unwrap_or_default()),
        ActionValueKind::Integer => value.as_integer().map_or(Value::Null, integer_value),
        ActionValueKind::String => {
            value.as_string().map_or(Value::Null, |value| Value::String(value.to_owned()))
        }
        ActionValueKind::Array => value
            .as_array()
            .map_or(Value::Null, |values| Value::Array(values.iter().map(json_value).collect())),
        ActionValueKind::Object => value.as_object().map_or(Value::Null, |values| {
            let fields = values
                .iter()
                .map(|(key, value)| (key.to_owned(), json_value(value)))
                .collect::<Map<_, _>>();
            Value::Object(fields)
        }),
    }
}

fn integer_value(value: PropertyInteger) -> Value {
    Value::Number(Number::from(value.get()))
}
