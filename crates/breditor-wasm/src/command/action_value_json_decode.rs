//! Strict, allocation-bounded JSON admission for typed action values.
//!
//! This is an ABI boundary, not a generic `serde_json::Value` conversion. A
//! custom visitor preserves duplicate object keys until they can be rejected,
//! rejects every non-integer JSON number, and applies the core action-value
//! limits while the input is traversed. Only the final bounded
//! [`ActionValue`] can leave this module.

use std::fmt;

use breditor_core::{
    action::{
        ActionValue, MAX_ACTION_VALUE_CONTAINER_ENTRIES, MAX_ACTION_VALUE_COUNT,
        MAX_ACTION_VALUE_DEPTH, MAX_ACTION_VALUE_OBJECT_KEY_BYTES, MAX_ACTION_VALUE_TEXT_BYTES,
    },
    document::PropertyInteger,
};
use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};

/// Maximum UTF-8 bytes accepted for one typed-input JSON transport.
///
/// The semantic value permits 64 KiB of decoded text. 512 KiB also admits the
/// worst-case six-byte JSON escaping of that complete text budget, plus bounded
/// container and integer syntax. Whitespace is transport overhead and remains
/// inside this ceiling.
pub(crate) const MAX_ACTION_VALUE_JSON_BYTES: usize = 512 * 1024;

/// Payload-free classification used by the public command boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ActionValueJsonDecodeError {
    /// The transport or decoded value exceeded a fixed resource ceiling.
    Limit,
    /// The input was not one deterministic action-value JSON document.
    Invalid,
}

/// Decodes exactly one bounded deterministic action value.
pub(crate) fn decode_action_value_json(
    json: &str,
) -> Result<ActionValue, ActionValueJsonDecodeError> {
    if json.len() > MAX_ACTION_VALUE_JSON_BYTES {
        return Err(ActionValueJsonDecodeError::Limit);
    }

    let mut budget = ActionValueBudget::default();
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let value = ActionValueSeed { budget: &mut budget, container_depth: 0 }
        .deserialize(&mut deserializer)
        .map_err(|_| budget.failure())?;
    deserializer.end().map_err(|_| budget.failure())?;
    Ok(value)
}

/// Maps private parser detail to one fixed public boundary error.
pub(crate) const fn action_value_json_error(
    error: ActionValueJsonDecodeError,
) -> crate::BreditorError {
    match error {
        ActionValueJsonDecodeError::Limit => crate::BreditorError::new(
            crate::error::ACTION_VALUE_JSON_LIMIT_CODE,
            "the typed action input exceeds a fixed JSON or value limit",
        ),
        ActionValueJsonDecodeError::Invalid => crate::BreditorError::new(
            crate::error::INVALID_ACTION_VALUE_JSON_CODE,
            "the typed action input is not a valid deterministic JSON value",
        ),
    }
}

#[derive(Default)]
struct ActionValueBudget {
    value_count: u32,
    text_bytes: u64,
    exceeded_limit: bool,
}

impl ActionValueBudget {
    fn enter_value<E>(&mut self) -> Result<(), E>
    where
        E: de::Error,
    {
        self.value_count = self.value_count.saturating_add(1);
        if self.value_count > MAX_ACTION_VALUE_COUNT {
            return self.limit("the action-value count exceeds its limit");
        }
        Ok(())
    }

    fn enter_container<E>(&mut self, depth: u16) -> Result<(), E>
    where
        E: de::Error,
    {
        if depth > MAX_ACTION_VALUE_DEPTH {
            return self.limit("the action-value depth exceeds its limit");
        }
        Ok(())
    }

    fn note_text<E>(&mut self, value: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        self.text_bytes =
            self.text_bytes.saturating_add(u64::try_from(value.len()).unwrap_or(u64::MAX));
        if self.text_bytes > MAX_ACTION_VALUE_TEXT_BYTES {
            return self.limit("the action-value text exceeds its limit");
        }
        Ok(())
    }

    fn require_container_slot<E>(&mut self, existing: usize) -> Result<(), E>
    where
        E: de::Error,
    {
        if existing >= MAX_ACTION_VALUE_CONTAINER_ENTRIES {
            return self.limit("the action-value container exceeds its limit");
        }
        Ok(())
    }

    fn require_key<E>(&mut self, key: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        if key.len() > MAX_ACTION_VALUE_OBJECT_KEY_BYTES {
            return self.limit("an action-value object key exceeds its limit");
        }
        if !valid_object_key(key) {
            return Err(E::custom("an action-value object key is invalid"));
        }
        self.note_text(key)
    }

    fn limit<T, E>(&mut self, message: &'static str) -> Result<T, E>
    where
        E: de::Error,
    {
        self.exceeded_limit = true;
        Err(E::custom(message))
    }

    const fn failure(&self) -> ActionValueJsonDecodeError {
        if self.exceeded_limit {
            ActionValueJsonDecodeError::Limit
        } else {
            ActionValueJsonDecodeError::Invalid
        }
    }
}

struct ActionValueSeed<'a> {
    budget: &'a mut ActionValueBudget,
    /// Number of containers enclosing the value being decoded.
    container_depth: u16,
}

impl<'de> DeserializeSeed<'de> for ActionValueSeed<'_> {
    type Value = ActionValue;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.enter_value()?;
        deserializer.deserialize_any(ActionValueVisitor {
            budget: self.budget,
            container_depth: self.container_depth,
        })
    }
}

struct ActionValueVisitor<'a> {
    budget: &'a mut ActionValueBudget,
    container_depth: u16,
}

impl<'de> Visitor<'de> for ActionValueVisitor<'_> {
    type Value = ActionValue;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a deterministic bounded Breditor action value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(ActionValue::null())
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(ActionValue::null())
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(ActionValue::boolean(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        let value = PropertyInteger::try_new(value)
            .map_err(|_| E::custom("the action-value integer is not JavaScript-safe"))?;
        Ok(ActionValue::from_integer(value))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        let value = i64::try_from(value)
            .ok()
            .and_then(|value| PropertyInteger::try_new(value).ok())
            .ok_or_else(|| E::custom("the action-value integer is not JavaScript-safe"))?;
        Ok(ActionValue::from_integer(value))
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("fractional and exponent action-value numbers are not supported"))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.string(value)
    }

    fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.string(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.string(&value)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let depth = self.container_depth.saturating_add(1);
        self.budget.enter_container(depth)?;
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(SequenceValueSeed {
            budget: &mut *self.budget,
            container_depth: depth,
            existing: values.len(),
        })? {
            values.push(value);
        }
        ActionValue::try_array(values)
            .map_err(|_| A::Error::custom("the action-value array is invalid"))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let depth = self.container_depth.saturating_add(1);
        self.budget.enter_container(depth)?;
        let mut entries: Vec<(String, ActionValue)> = Vec::new();
        while let Some(key) =
            map.next_key_seed(ObjectKeySeed { budget: &mut *self.budget, existing: entries.len() })?
        {
            if entries.iter().any(|(existing, _)| existing == &key) {
                return Err(A::Error::custom("an action-value object key is duplicated"));
            }
            let value = map.next_value_seed(ActionValueSeed {
                budget: &mut *self.budget,
                container_depth: depth,
            })?;
            entries.push((key, value));
        }
        ActionValue::try_object(entries)
            .map_err(|_| A::Error::custom("the action-value object is invalid"))
    }
}

impl ActionValueVisitor<'_> {
    fn string<E>(self, value: &str) -> Result<ActionValue, E>
    where
        E: de::Error,
    {
        self.budget.note_text(value)?;
        ActionValue::try_from_string(value)
            .map_err(|_| E::custom("the action-value string is invalid"))
    }
}

struct SequenceValueSeed<'a> {
    budget: &'a mut ActionValueBudget,
    container_depth: u16,
    existing: usize,
}

impl<'de> DeserializeSeed<'de> for SequenceValueSeed<'_> {
    type Value = ActionValue;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.require_container_slot(self.existing)?;
        ActionValueSeed { budget: self.budget, container_depth: self.container_depth }
            .deserialize(deserializer)
    }
}

struct ObjectKeySeed<'a> {
    budget: &'a mut ActionValueBudget,
    existing: usize,
}

impl<'de> DeserializeSeed<'de> for ObjectKeySeed<'_> {
    type Value = String;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.require_container_slot(self.existing)?;
        deserializer.deserialize_string(ObjectKeyVisitor { budget: self.budget })
    }
}

struct ObjectKeyVisitor<'a> {
    budget: &'a mut ActionValueBudget,
}

impl Visitor<'_> for ObjectKeyVisitor<'_> {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded Breditor action-value object key")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.require_key(value)?;
        Ok(value.to_owned())
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.require_key(&value)?;
        Ok(value)
    }
}

fn valid_object_key(key: &str) -> bool {
    let mut characters = key.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

#[cfg(test)]
mod tests {
    use breditor_core::action::ActionValueKind;

    use super::*;

    #[test]
    fn complete_value_domain_decodes_to_canonical_core_values() -> Result<(), &'static str> {
        let value = decode_action_value_json(
            r#"{"z":[null,true,-5],"a":{"nested_key":"text","safe":9007199254740991}}"#,
        )
        .map_err(|_| "valid action value was rejected")?;
        assert_eq!(value.kind(), ActionValueKind::Object);
        assert_eq!(value.summary().max_depth(), 2);
        let object = value.as_object().ok_or("decoded value was not an object")?;
        assert_eq!(object.iter().map(|(key, _)| key).collect::<Vec<_>>(), ["a", "z"]);
        let nested = object
            .get("a")
            .and_then(ActionValue::as_object)
            .ok_or("decoded nested value was not an object")?;
        assert_eq!(nested.get("nested_key").and_then(ActionValue::as_string), Some("text"));
        assert_eq!(
            nested.get("safe").and_then(ActionValue::as_integer).map(PropertyInteger::get),
            Some(9_007_199_254_740_991),
        );
        Ok(())
    }

    #[test]
    fn duplicate_keys_are_rejected_without_payload_retention() -> Result<(), &'static str> {
        let private = "private-secret-value";
        let Err(error) =
            decode_action_value_json(&format!(r#"{{"duplicate":null,"duplicate":"{private}"}}"#))
        else {
            return Err("duplicate object key was admitted");
        };
        assert_eq!(error, ActionValueJsonDecodeError::Invalid);
        assert!(!format!("{error:?}").contains(private));

        for duplicate in [
            r#"{"outer":{"key":null,"key":false}}"#,
            r#"{"escaped":null,"esc\u0061ped":false}"#,
            // The duplicate is rejected before its hostile value is decoded.
            r#"{"key":null,"key":[[[[[[[[[[[[[[[[[null]]]]]]]]]]]]]]]]]}}"#,
        ] {
            assert_eq!(
                decode_action_value_json(duplicate),
                Err(ActionValueJsonDecodeError::Invalid),
            );
        }
        Ok(())
    }

    #[test]
    fn non_integer_and_unsafe_numbers_fail_closed() {
        for json in [
            "1.0",
            "1e0",
            "-2E3",
            "-0",
            "9007199254740992",
            "-9007199254740992",
            "18446744073709551616",
        ] {
            assert_eq!(
                decode_action_value_json(json),
                Err(ActionValueJsonDecodeError::Invalid),
                "unexpected admission for {json}",
            );
        }
        for json in ["0", "9007199254740991", "-9007199254740991"] {
            assert!(decode_action_value_json(json).is_ok(), "unexpected rejection for {json}");
        }
    }

    #[test]
    fn object_key_contract_is_strict_and_payload_free() {
        for json in [r#"{"":null}"#, r#"{"9name":null}"#, r#"{"a/b":null}"#, r#"{"é":null}"#] {
            assert_eq!(decode_action_value_json(json), Err(ActionValueJsonDecodeError::Invalid),);
        }

        let exact_key = "a".repeat(MAX_ACTION_VALUE_OBJECT_KEY_BYTES);
        assert!(decode_action_value_json(&format!(r#"{{"{exact_key}":null}}"#)).is_ok());
        let excess_key = "a".repeat(MAX_ACTION_VALUE_OBJECT_KEY_BYTES + 1);
        assert_eq!(
            decode_action_value_json(&format!(r#"{{"{excess_key}":null}}"#)),
            Err(ActionValueJsonDecodeError::Limit),
        );
    }

    #[test]
    fn byte_depth_and_text_limits_are_enforced_at_the_boundary() -> Result<(), &'static str> {
        let exact_transport = format!("{}null", " ".repeat(MAX_ACTION_VALUE_JSON_BYTES - 4));
        assert!(decode_action_value_json(&exact_transport).is_ok());
        assert_eq!(
            decode_action_value_json(&format!(" {exact_transport}")),
            Err(ActionValueJsonDecodeError::Limit),
        );

        let exact_depth = nested_array_json(usize::from(MAX_ACTION_VALUE_DEPTH));
        assert!(decode_action_value_json(&exact_depth).is_ok());
        let excess_depth = nested_array_json(usize::from(MAX_ACTION_VALUE_DEPTH) + 1);
        assert_eq!(decode_action_value_json(&excess_depth), Err(ActionValueJsonDecodeError::Limit),);

        let text_limit = usize::try_from(MAX_ACTION_VALUE_TEXT_BYTES)
            .map_err(|_| "action-value text limit did not fit usize")?;
        let exact_text = format!(r#""{}""#, "x".repeat(text_limit));
        assert!(decode_action_value_json(&exact_text).is_ok());
        let excess_text = format!(r#""{}""#, "x".repeat(text_limit + 1));
        assert_eq!(decode_action_value_json(&excess_text), Err(ActionValueJsonDecodeError::Limit),);
        Ok(())
    }

    #[test]
    fn direct_container_and_complete_value_count_limits_are_exact() -> Result<(), &'static str> {
        let exact_container = json_array(&vec!["null"; MAX_ACTION_VALUE_CONTAINER_ENTRIES]);
        assert!(decode_action_value_json(&exact_container).is_ok());
        let excess_container = json_array(&vec!["null"; MAX_ACTION_VALUE_CONTAINER_ENTRIES + 1]);
        assert_eq!(
            decode_action_value_json(&excess_container),
            Err(ActionValueJsonDecodeError::Limit),
        );
        assert!(decode_action_value_json(&object_json(MAX_ACTION_VALUE_CONTAINER_ENTRIES)).is_ok());
        assert_eq!(
            decode_action_value_json(&object_json(MAX_ACTION_VALUE_CONTAINER_ENTRIES + 1)),
            Err(ActionValueJsonDecodeError::Limit),
        );

        let exact_count = value_count_json(6);
        let value = decode_action_value_json(&exact_count)
            .map_err(|_| "exact value-count boundary was rejected")?;
        assert_eq!(value.summary().value_count(), MAX_ACTION_VALUE_COUNT);
        assert_eq!(
            decode_action_value_json(&value_count_json(7)),
            Err(ActionValueJsonDecodeError::Limit),
        );
        Ok(())
    }

    #[test]
    fn syntax_trailing_documents_and_non_json_tokens_are_rejected() {
        for json in ["", "null null", "[null,]", "{unquoted:null}", "NaN", "+1"] {
            assert_eq!(decode_action_value_json(json), Err(ActionValueJsonDecodeError::Invalid),);
        }
    }

    fn nested_array_json(depth: usize) -> String {
        format!("{}null{}", "[".repeat(depth), "]".repeat(depth))
    }

    fn json_array(values: &[&str]) -> String {
        format!("[{}]", values.join(","))
    }

    fn value_count_json(final_group_values: usize) -> String {
        // root + 254 * (array + 3 nulls) + (array + N nulls)
        let mut values = vec!["[null,null,null]"; 254];
        let final_group = json_array(&vec!["null"; final_group_values]);
        values.push(&final_group);
        json_array(&values)
    }

    fn object_json(entries: usize) -> String {
        let fields = (0..entries).map(|index| format!(r#""k{index}":null"#)).collect::<Vec<_>>();
        format!("{{{}}}", fields.join(","))
    }
}
