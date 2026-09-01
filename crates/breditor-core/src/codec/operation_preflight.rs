use std::fmt;

use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};

use crate::{position::MAX_PATH_DEPTH, state::EditorContext};

pub(crate) fn preflight_operation_payload(
    json: &str,
    context: &EditorContext,
) -> Result<(), serde_json::Error> {
    let mut budget = PreflightBudget::new(context);
    let mut deserializer = serde_json::Deserializer::from_str(json);
    ValueSeed { budget: &mut budget, context: ValueContext::Generic }
        .deserialize(&mut deserializer)?;
    deserializer.end()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ValueContext {
    Generic,
    Path,
    Paragraphs,
    Runs,
    Formats,
    EmptyProperties,
    Text,
}

struct PreflightLimits {
    path_items: u64,
    paragraph_items: u64,
    run_items: u64,
    format_items: u64,
    generic_items: u64,
    total_paragraph_items: u64,
    total_run_items: u64,
    total_format_items: u64,
    text_bytes: u64,
    total_text_bytes: u64,
}

impl PreflightLimits {
    fn new(context: &EditorContext) -> Self {
        let raw_bytes = as_u64(context.limits().max_json_bytes());
        let point_children = u64::from(u32::MAX);
        let children = as_u64(context.limits().max_children_per_element()).min(point_children);
        let nodes = as_u64(context.limits().max_nodes());
        let formats = as_u64(context.limits().max_formats_per_text());
        let text_bytes = as_u64(context.limits().max_text_bytes());
        let total_text_bytes = as_u64(context.limits().max_total_text_bytes());

        let path_items = bounded_successor(as_u64(MAX_PATH_DEPTH), raw_bytes);
        let paragraph_items = bounded_successor(children, raw_bytes);
        let run_items = bounded_successor(children, raw_bytes);
        let format_items = bounded_successor(formats, raw_bytes);
        let generic_items =
            path_items.max(paragraph_items).max(run_items).max(format_items).min(raw_bytes);
        let total_paragraph_items = children.saturating_mul(2).saturating_add(2).min(raw_bytes);
        let total_run_items = nodes.saturating_mul(2).saturating_add(2).min(raw_bytes);
        let total_format_items = total_run_items
            .saturating_mul(formats.saturating_add(1))
            .saturating_add(1)
            .min(raw_bytes);
        let text_bytes = bounded_successor(text_bytes, raw_bytes);
        let total_text_bytes = total_text_bytes
            .saturating_mul(2)
            .saturating_add(text_bytes)
            .saturating_add(1)
            .min(raw_bytes);

        Self {
            path_items,
            paragraph_items,
            run_items,
            format_items,
            generic_items,
            total_paragraph_items,
            total_run_items,
            total_format_items,
            text_bytes,
            total_text_bytes,
        }
    }

    const fn sequence_items(&self, context: ValueContext) -> u64 {
        match context {
            ValueContext::Path => self.path_items,
            ValueContext::Paragraphs => self.paragraph_items,
            ValueContext::Runs => self.run_items,
            ValueContext::Formats => self.format_items,
            ValueContext::Generic | ValueContext::EmptyProperties | ValueContext::Text => {
                self.generic_items
            }
        }
    }
}

fn bounded_successor(value: u64, raw_bytes: u64) -> u64 {
    value.saturating_add(1).min(raw_bytes)
}

fn as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

struct PreflightBudget {
    limits: PreflightLimits,
    paragraph_items: u64,
    run_items: u64,
    format_items: u64,
    text_bytes: u64,
}

impl PreflightBudget {
    fn new(context: &EditorContext) -> Self {
        Self {
            limits: PreflightLimits::new(context),
            paragraph_items: 0,
            run_items: 0,
            format_items: 0,
            text_bytes: 0,
        }
    }

    fn note_sequence_item(&mut self, context: ValueContext) -> Result<(), PreflightLimit> {
        let (actual, maximum, description) = match context {
            ValueContext::Paragraphs => {
                self.paragraph_items = self.paragraph_items.saturating_add(1);
                (
                    self.paragraph_items,
                    self.limits.total_paragraph_items,
                    "paragraph-fragment items",
                )
            }
            ValueContext::Runs => {
                self.run_items = self.run_items.saturating_add(1);
                (self.run_items, self.limits.total_run_items, "text-run items")
            }
            ValueContext::Formats => {
                self.format_items = self.format_items.saturating_add(1);
                (self.format_items, self.limits.total_format_items, "format items")
            }
            ValueContext::Generic
            | ValueContext::Path
            | ValueContext::EmptyProperties
            | ValueContext::Text => return Ok(()),
        };
        if actual > maximum {
            return Err(PreflightLimit { description, actual, maximum });
        }
        Ok(())
    }

    fn note_text(&mut self, value: &str) -> Result<(), PreflightLimit> {
        let actual = as_u64(value.len());
        if actual > self.limits.text_bytes {
            return Err(PreflightLimit {
                description: "bytes in one text run",
                actual,
                maximum: self.limits.text_bytes,
            });
        }
        self.text_bytes = self.text_bytes.saturating_add(actual);
        if self.text_bytes > self.limits.total_text_bytes {
            return Err(PreflightLimit {
                description: "aggregate operation text bytes",
                actual: self.text_bytes,
                maximum: self.limits.total_text_bytes,
            });
        }
        Ok(())
    }
}

struct PreflightLimit {
    description: &'static str,
    actual: u64,
    maximum: u64,
}

impl fmt::Display for PreflightLimit {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "operation allocation preflight rejected {} {}; ceiling is {}",
            self.description, self.actual, self.maximum
        )
    }
}

struct ValueSeed<'a> {
    budget: &'a mut PreflightBudget,
    context: ValueContext,
}

impl<'de> DeserializeSeed<'de> for ValueSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(ValueVisitor { budget: self.budget, context: self.context })
    }
}

struct ValueVisitor<'a> {
    budget: &'a mut PreflightBudget,
    context: ValueContext,
}

impl<'de> Visitor<'de> for ValueVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded operation JSON value")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        ValueSeed { budget: self.budget, context: self.context }.deserialize(deserializer)
    }

    fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_text(value)
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_text(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_text(&value)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let maximum = self.budget.limits.sequence_items(self.context);
        let mut actual = 0_u64;
        while sequence
            .next_element_seed(ValueSeed {
                budget: &mut *self.budget,
                context: ValueContext::Generic,
            })?
            .is_some()
        {
            actual = actual.saturating_add(1);
            self.budget.note_sequence_item(self.context).map_err(A::Error::custom)?;
            if actual > maximum {
                return Err(A::Error::custom(PreflightLimit {
                    description: sequence_description(self.context),
                    actual,
                    maximum,
                }));
            }
        }
        Ok(())
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        if self.context == ValueContext::EmptyProperties {
            if map.next_key_seed(FieldSeed)?.is_some() {
                return Err(A::Error::custom(
                    "operation-format properties must be an empty object",
                ));
            }
            return Ok(());
        }

        while let Some(field_context) = map.next_key_seed(FieldSeed)? {
            map.next_value_seed(ValueSeed { budget: &mut *self.budget, context: field_context })?;
        }
        Ok(())
    }
}

impl ValueVisitor<'_> {
    fn visit_text<E>(self, value: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        if self.context == ValueContext::Text {
            self.budget.note_text(value).map_err(E::custom)?;
        }
        Ok(())
    }
}

const fn sequence_description(context: ValueContext) -> &'static str {
    match context {
        ValueContext::Path => "path items",
        ValueContext::Paragraphs => "paragraphs in one fragment slice",
        ValueContext::Runs => "runs in one text fragment",
        ValueContext::Formats => "formats in one text run",
        ValueContext::Generic | ValueContext::EmptyProperties | ValueContext::Text => {
            "items in one JSON array"
        }
    }
}

struct FieldSeed;

impl<'de> DeserializeSeed<'de> for FieldSeed {
    type Value = ValueContext;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_identifier(FieldVisitor)
    }
}

struct FieldVisitor;

impl Visitor<'_> for FieldVisitor {
    type Value = ValueContext;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an operation JSON object key")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(field_context(value))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(field_context(value))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(field_context(&value))
    }
}

fn field_context(field: &str) -> ValueContext {
    match field {
        "containerPath" | "paragraphPath" => ValueContext::Path,
        "expectedParagraphs" | "replacementParagraphs" => ValueContext::Paragraphs,
        "runs" => ValueContext::Runs,
        "formats" => ValueContext::Formats,
        "properties" => ValueContext::EmptyProperties,
        "text" => ValueContext::Text,
        _ => ValueContext::Generic,
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        codec::operation_preflight::preflight_operation_payload,
        schema::{CompiledSchema, DocumentLimits},
        state::EditorContext,
    };

    fn context(limits: DocumentLimits) -> EditorContext {
        EditorContext::new(CompiledSchema::breditor_base(), limits)
    }

    #[test]
    fn first_semantic_excess_reaches_typed_decode_but_larger_arrays_stop_early() {
        let context = context(DocumentLimits::default().with_max_children_per_element(1));
        assert!(
            preflight_operation_payload(r#"{"runs":[{"text":"a"},{"text":"b"}]}"#, &context)
                .is_ok()
        );
        assert!(
            preflight_operation_payload(
                r#"{"runs":[{"text":"a"},{"text":"b"},{"text":"c"}]}"#,
                &context,
            )
            .is_err()
        );
    }

    #[test]
    fn format_properties_stop_at_the_first_key() {
        let context = EditorContext::default();
        assert!(preflight_operation_payload(r#"{"properties":{}}"#, &context).is_ok());
        assert!(
            preflight_operation_payload(
                r#"{"properties":{"breditor/value":[[[[[true]]]]]}}"#,
                &context,
            )
            .is_err()
        );
    }

    #[test]
    fn text_limits_allow_the_first_excess_for_typed_validation() {
        let context =
            context(DocumentLimits::default().with_max_text_bytes(1).with_max_total_text_bytes(1));
        assert!(preflight_operation_payload(r#"{"text":"ab"}"#, &context).is_ok());
        assert!(preflight_operation_payload(r#"{"text":"abc"}"#, &context).is_err());
    }
}
