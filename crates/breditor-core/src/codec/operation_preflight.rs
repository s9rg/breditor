use std::fmt;

use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;

use crate::{identity::MAX_QUALIFIED_NAME_BYTES, position::MAX_PATH_DEPTH, state::EditorContext};

pub(crate) fn preflight_operation_payload(
    json: &str,
    context: &EditorContext,
) -> Result<(), serde_json::Error> {
    let mut budget = PreflightBudget::new(context, 1);
    let mut deserializer = serde_json::Deserializer::from_str(json);
    ValueSeed { budget: &mut budget, context: ValueContext::Generic }
        .deserialize(&mut deserializer)?;
    deserializer.end()
}

/// Preflights a direct nullable pending-format array outside an operation.
pub(crate) fn preflight_pending_formats_payload(
    json: &str,
    context: &EditorContext,
) -> Result<(), serde_json::Error> {
    let mut budget = PreflightBudget::new(context, 1);
    let mut deserializer = serde_json::Deserializer::from_str(json);
    ValueSeed { budget: &mut budget, context: ValueContext::Formats }
        .deserialize(&mut deserializer)?;
    deserializer.end()
}

/// Preflights one raw JSON array of transaction operation payloads.
///
/// The returned count uses a fixed width and no operation record is
/// materialized. Payloads within the configured semantic operation limit pass
/// through the same allocation preflight as a singular operation. Exactly one
/// excess array item is admitted, without inspecting its payload fields, so a
/// transaction decoder can report its typed operation-limit error. Any further
/// item is rejected here as a structural allocation-preflight failure.
pub(crate) fn preflight_operation_payloads(
    json: &str,
    context: &EditorContext,
) -> Result<u64, serde_json::Error> {
    let raw_bytes = as_u64(context.limits().max_json_bytes());
    let semantic_maximum = u64::from(context.max_operations_per_transaction());
    let structural_maximum = bounded_successor(semantic_maximum, raw_bytes);
    let operation_slots = semantic_maximum.min(raw_bytes);
    let mut budget = PreflightBudget::new(context, operation_slots);
    let mut deserializer = serde_json::Deserializer::from_str(json);
    let count = OperationPayloadsSeed {
        context,
        budget: &mut budget,
        semantic_maximum,
        structural_maximum,
    }
    .deserialize(&mut deserializer)?;
    deserializer.end()?;
    Ok(count)
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
    QualifiedName,
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
    qualified_name_bytes: u64,
}

impl PreflightLimits {
    fn new(context: &EditorContext, operation_slots: u64) -> Self {
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
        let paragraph_items_per_operation = children.saturating_mul(2).saturating_add(2);
        let run_items_per_operation = nodes.saturating_mul(2).saturating_add(2);
        let format_items_per_operation =
            run_items_per_operation.saturating_mul(formats.saturating_add(1)).saturating_add(1);
        let total_paragraph_items =
            paragraph_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_run_items =
            run_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_format_items =
            format_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let text_bytes = bounded_successor(text_bytes, raw_bytes);
        let text_bytes_per_operation =
            total_text_bytes.saturating_mul(2).saturating_add(text_bytes).saturating_add(1);
        let total_text_bytes =
            text_bytes_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let qualified_name_bytes = bounded_successor(as_u64(MAX_QUALIFIED_NAME_BYTES), raw_bytes);

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
            qualified_name_bytes,
        }
    }

    const fn sequence_items(&self, context: ValueContext) -> u64 {
        match context {
            ValueContext::Path => self.path_items,
            ValueContext::Paragraphs => self.paragraph_items,
            ValueContext::Runs => self.run_items,
            ValueContext::Formats => self.format_items,
            ValueContext::Generic
            | ValueContext::EmptyProperties
            | ValueContext::Text
            | ValueContext::QualifiedName => self.generic_items,
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
    fn new(context: &EditorContext, operation_slots: u64) -> Self {
        Self {
            limits: PreflightLimits::new(context, operation_slots),
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
            | ValueContext::Text
            | ValueContext::QualifiedName => return Ok(()),
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

    fn note_qualified_name(&self, value: &str) -> Result<(), PreflightLimit> {
        let actual = as_u64(value.len());
        let maximum = self.limits.qualified_name_bytes;
        if actual > maximum {
            return Err(PreflightLimit {
                description: "bytes in one qualified name",
                actual,
                maximum,
            });
        }
        Ok(())
    }

    fn absorb_operation(&mut self, operation: &Self) -> Result<(), PreflightLimit> {
        absorb_measurement(
            &mut self.paragraph_items,
            operation.paragraph_items,
            self.limits.total_paragraph_items,
            "transaction paragraph-fragment items",
        )?;
        absorb_measurement(
            &mut self.run_items,
            operation.run_items,
            self.limits.total_run_items,
            "transaction text-run items",
        )?;
        absorb_measurement(
            &mut self.format_items,
            operation.format_items,
            self.limits.total_format_items,
            "transaction format items",
        )?;
        absorb_measurement(
            &mut self.text_bytes,
            operation.text_bytes,
            self.limits.total_text_bytes,
            "aggregate transaction text bytes",
        )
    }
}

fn absorb_measurement(
    aggregate: &mut u64,
    value: u64,
    maximum: u64,
    description: &'static str,
) -> Result<(), PreflightLimit> {
    *aggregate = aggregate.saturating_add(value);
    if *aggregate > maximum {
        return Err(PreflightLimit { description, actual: *aggregate, maximum });
    }
    Ok(())
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

struct OperationPayloadsSeed<'a> {
    context: &'a EditorContext,
    budget: &'a mut PreflightBudget,
    semantic_maximum: u64,
    structural_maximum: u64,
}

impl<'de> DeserializeSeed<'de> for OperationPayloadsSeed<'_> {
    type Value = u64;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(OperationPayloadsVisitor {
            context: self.context,
            budget: self.budget,
            semantic_maximum: self.semantic_maximum,
            structural_maximum: self.structural_maximum,
        })
    }
}

struct OperationPayloadsVisitor<'a> {
    context: &'a EditorContext,
    budget: &'a mut PreflightBudget,
    semantic_maximum: u64,
    structural_maximum: u64,
}

impl<'de> Visitor<'de> for OperationPayloadsVisitor<'_> {
    type Value = u64;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded JSON array of operation payloads")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut count = 0_u64;
        while let Some(payload) = sequence.next_element::<&'de RawValue>()? {
            count = count.saturating_add(1);
            if count > self.structural_maximum {
                return Err(A::Error::custom(PreflightLimit {
                    description: "operation payloads",
                    actual: count,
                    maximum: self.structural_maximum,
                }));
            }
            if count > self.semantic_maximum {
                continue;
            }

            let mut operation_budget = PreflightBudget::new(self.context, 1);
            preflight_payload_with_budget(payload.get(), &mut operation_budget)
                .map_err(A::Error::custom)?;
            self.budget.absorb_operation(&operation_budget).map_err(A::Error::custom)?;
        }
        Ok(count)
    }
}

fn preflight_payload_with_budget(
    json: &str,
    budget: &mut PreflightBudget,
) -> Result<(), serde_json::Error> {
    let mut deserializer = serde_json::Deserializer::from_str(json);
    ValueSeed { budget, context: ValueContext::Generic }.deserialize(&mut deserializer)?;
    deserializer.end()
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
        match self.context {
            ValueContext::Text => self.budget.note_text(value).map_err(E::custom)?,
            ValueContext::QualifiedName => {
                self.budget.note_qualified_name(value).map_err(E::custom)?;
            }
            ValueContext::Generic
            | ValueContext::Path
            | ValueContext::Paragraphs
            | ValueContext::Runs
            | ValueContext::Formats
            | ValueContext::EmptyProperties => {}
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
        ValueContext::Generic
        | ValueContext::EmptyProperties
        | ValueContext::Text
        | ValueContext::QualifiedName => "items in one JSON array",
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
        "containerPath" | "paragraphPath" | "leftPath" | "textPath" | "parentPath" => {
            ValueContext::Path
        }
        "expectedParagraphs" | "replacementParagraphs" => ValueContext::Paragraphs,
        "runs" => ValueContext::Runs,
        "formats" => ValueContext::Formats,
        "properties" => ValueContext::EmptyProperties,
        "text" => ValueContext::Text,
        "type" | "action" | "group" => ValueContext::QualifiedName,
        _ => ValueContext::Generic,
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        codec::operation_preflight::{preflight_operation_payload, preflight_operation_payloads},
        identity::MAX_QUALIFIED_NAME_BYTES,
        position::MAX_PATH_DEPTH,
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
    fn every_operation_path_field_uses_the_fixed_protocol_ceiling() -> Result<(), serde_json::Error>
    {
        let context = EditorContext::default();
        let first_excess = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 1])?;
        let larger = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 2])?;
        for field in ["containerPath", "paragraphPath", "leftPath"] {
            let first_excess = format!(r#"{{"{field}":{first_excess}}}"#);
            let larger = format!(r#"{{"{field}":{larger}}}"#);
            assert!(preflight_operation_payload(&first_excess, &context).is_ok());
            assert!(preflight_operation_payload(&larger, &context).is_err());
        }
        Ok(())
    }

    #[test]
    fn state_point_paths_use_the_fixed_protocol_ceiling() -> Result<(), serde_json::Error> {
        let context = EditorContext::default();
        let first_excess = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 1])?;
        let larger = serde_json::to_string(&vec![0_u32; MAX_PATH_DEPTH + 2])?;
        for field in ["textPath", "parentPath"] {
            let first_excess = format!(r#"{{"{field}":{first_excess}}}"#);
            let larger = format!(r#"{{"{field}":{larger}}}"#);
            assert!(preflight_operation_payload(&first_excess, &context).is_ok());
            assert!(preflight_operation_payload(&larger, &context).is_err());
        }
        Ok(())
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

    #[test]
    fn qualified_names_allow_only_the_first_protocol_excess() {
        let context = EditorContext::default();
        let first_excess = "a".repeat(MAX_QUALIFIED_NAME_BYTES + 1);
        let larger = "a".repeat(MAX_QUALIFIED_NAME_BYTES + 2);
        for field in ["type", "action", "group"] {
            let first_excess = format!(r#"{{"{field}":"{first_excess}"}}"#);
            let larger = format!(r#"{{"{field}":"{larger}"}}"#);
            assert!(preflight_operation_payload(&first_excess, &context).is_ok());
            assert!(preflight_operation_payload(&larger, &context).is_err());
        }
    }

    #[test]
    fn operation_array_returns_fixed_width_count_and_one_semantic_excess() {
        let context = EditorContext::default().with_max_operations_per_transaction(1);

        assert!(matches!(preflight_operation_payloads("[]", &context), Ok(0_u64)));
        assert!(matches!(preflight_operation_payloads("[{}]", &context), Ok(1_u64)));
        assert!(matches!(preflight_operation_payloads("[{},{}]", &context), Ok(2_u64)));
        assert!(preflight_operation_payloads("[{},{},{}]", &context).is_err());
    }

    #[test]
    fn first_operation_excess_is_not_field_preflighted() {
        let limits = DocumentLimits::default().with_max_text_bytes(0);
        let context = context(limits).with_max_operations_per_transaction(0);

        assert!(matches!(
            preflight_operation_payloads(
                r#"[{"text":"hostile but structurally skipped"}]"#,
                &context
            ),
            Ok(1_u64)
        ));
        assert!(
            preflight_operation_payloads(
                r#"[{"text":"first excess"},{"text":"larger structural excess"}]"#,
                &context,
            )
            .is_err()
        );
    }

    #[test]
    fn aggregate_payload_budgets_scale_by_admitted_operation_slots() {
        let limits = DocumentLimits::default().with_max_text_bytes(0).with_max_total_text_bytes(0);
        let context = context(limits).with_max_operations_per_transaction(3);

        assert!(matches!(
            preflight_operation_payloads(r#"[{"text":"a"},{"text":"b"},{"text":"c"}]"#, &context,),
            Ok(3_u64)
        ));
    }

    #[test]
    fn raw_byte_ceiling_dominates_operation_slots() {
        let limits = DocumentLimits::default().with_max_json_bytes(3);
        let context = context(limits).with_max_operations_per_transaction(100);

        assert!(matches!(preflight_operation_payloads("[0,0,0]", &context), Ok(3_u64)));
        assert!(preflight_operation_payloads("[0,0,0,0]", &context).is_err());
    }
}
