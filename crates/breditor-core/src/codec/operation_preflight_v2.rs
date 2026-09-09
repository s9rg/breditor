//! Allocation preflight for property-preserving operation payloads.

use std::fmt;

use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;

use crate::{
    document::{MAX_PROPERTY_OBJECT_KEY_BYTES, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER},
    identity::{MAX_QUALIFIED_NAME_BYTES, QualifiedName},
    position::MAX_PATH_DEPTH,
    state::EditorContext,
};

/// Scans one property-preserving operation payload before owned record
/// reconstruction. This is intentionally separate from the permanently
/// property-free V1 preflight.
pub(crate) fn preflight_operation_payload_v2(
    json: &str,
    context: &EditorContext,
) -> Result<(), serde_json::Error> {
    let mut budget = PreflightBudget::new(context, 1);
    preflight_payload_with_budget(json, &mut budget)
}

/// Preflights one raw JSON array of property-preserving operation payloads.
///
/// Aggregate budgets scale with the operations the context can admit. Exactly
/// one semantic count excess is retained only as a raw value so the caller can
/// return its typed operation-limit failure without materializing that payload.
pub(crate) fn preflight_operation_payloads_v2(
    json: &str,
    context: &EditorContext,
) -> Result<u64, serde_json::Error> {
    let raw_bytes = as_u64(context.limits().max_json_bytes());
    let semantic_maximum = u64::from(context.max_operations_per_transaction());
    let structural_maximum = admitted_excess(semantic_maximum, raw_bytes);
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
    Properties,
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
    properties_per_owner: u64,
    property_depth: u64,
    total_property_values: u64,
    property_string_bytes: u64,
    total_property_string_bytes: u64,
    qualified_name_bytes: u64,
    property_object_key_bytes: u64,
}

impl PreflightLimits {
    fn new(context: &EditorContext, operation_slots: u64) -> Self {
        let limits = context.limits();
        let raw_bytes = as_u64(limits.max_json_bytes());
        let point_children = u64::from(u32::MAX);
        let children = as_u64(limits.max_children_per_element()).min(point_children);
        let nodes = as_u64(limits.max_nodes());
        let formats = as_u64(limits.max_formats_per_text());
        let text_bytes = as_u64(limits.max_text_bytes());
        let total_text_bytes = as_u64(limits.max_total_text_bytes());
        let fragment_slots = children.saturating_mul(2).saturating_add(2);

        let path_items = admitted_excess(as_u64(MAX_PATH_DEPTH), raw_bytes);
        let paragraph_items = admitted_excess(children, raw_bytes);
        let run_items = admitted_excess(children, raw_bytes);
        let format_items = admitted_excess(formats, raw_bytes);
        let generic_items =
            path_items.max(paragraph_items).max(run_items).max(format_items).min(raw_bytes);
        let paragraph_items_per_operation = fragment_slots;
        let run_items_per_operation = nodes.saturating_mul(2).saturating_add(2);
        let format_items_per_operation =
            run_items_per_operation.saturating_mul(formats.saturating_add(1)).saturating_add(1);
        let text_bytes_per_operation =
            total_text_bytes.saturating_mul(2).saturating_add(text_bytes).saturating_add(1);
        let property_values_per_operation =
            as_u64(limits.max_property_values()).saturating_mul(fragment_slots).min(raw_bytes);
        let property_string_bytes_per_operation = as_u64(limits.max_total_property_string_bytes())
            .saturating_mul(fragment_slots)
            .min(raw_bytes);
        let total_paragraph_items =
            paragraph_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_run_items =
            run_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_format_items =
            format_items_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_text_bytes =
            text_bytes_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_property_values =
            property_values_per_operation.saturating_mul(operation_slots).min(raw_bytes);
        let total_property_string_bytes =
            property_string_bytes_per_operation.saturating_mul(operation_slots).min(raw_bytes);

        Self {
            path_items,
            paragraph_items,
            run_items,
            format_items,
            generic_items,
            total_paragraph_items,
            total_run_items,
            total_format_items,
            text_bytes: admitted_excess(text_bytes, raw_bytes),
            total_text_bytes,
            properties_per_owner: admitted_excess(
                as_u64(limits.max_properties_per_owner()),
                raw_bytes,
            ),
            property_depth: admitted_excess(as_u64(limits.max_property_depth()), raw_bytes),
            total_property_values: admitted_excess(total_property_values, raw_bytes),
            property_string_bytes: admitted_excess(
                as_u64(limits.max_property_string_bytes()),
                raw_bytes,
            ),
            total_property_string_bytes: admitted_excess(total_property_string_bytes, raw_bytes),
            qualified_name_bytes: admitted_excess(as_u64(MAX_QUALIFIED_NAME_BYTES), raw_bytes),
            property_object_key_bytes: admitted_excess(
                as_u64(MAX_PROPERTY_OBJECT_KEY_BYTES),
                raw_bytes,
            ),
        }
    }

    const fn sequence_items(&self, context: ValueContext) -> u64 {
        match context {
            ValueContext::Path => self.path_items,
            ValueContext::Paragraphs => self.paragraph_items,
            ValueContext::Runs => self.run_items,
            ValueContext::Formats => self.format_items,
            ValueContext::Generic
            | ValueContext::Properties
            | ValueContext::Text
            | ValueContext::QualifiedName => self.generic_items,
        }
    }
}

struct PreflightBudget {
    limits: PreflightLimits,
    paragraph_items: u64,
    run_items: u64,
    format_items: u64,
    text_bytes: u64,
    property_values: u64,
    property_string_bytes: u64,
}

impl PreflightBudget {
    fn new(context: &EditorContext, operation_slots: u64) -> Self {
        Self {
            limits: PreflightLimits::new(context, operation_slots),
            paragraph_items: 0,
            run_items: 0,
            format_items: 0,
            text_bytes: 0,
            property_values: 0,
            property_string_bytes: 0,
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
            | ValueContext::Properties
            | ValueContext::Text
            | ValueContext::QualifiedName => return Ok(()),
        };
        check_limit(description, actual, maximum)
    }

    fn note_text(&mut self, value: &str) -> Result<(), PreflightLimit> {
        let actual = as_u64(value.len());
        check_limit("bytes in one text run", actual, self.limits.text_bytes)?;
        self.text_bytes = self.text_bytes.saturating_add(actual);
        check_limit("aggregate operation text bytes", self.text_bytes, self.limits.total_text_bytes)
    }

    fn enter_property_value(&mut self, depth: u64) -> Result<(), PreflightLimit> {
        check_limit("property-value depth", depth, self.limits.property_depth)?;
        self.property_values = self.property_values.saturating_add(1);
        check_limit(
            "operation property values",
            self.property_values,
            self.limits.total_property_values,
        )
    }

    fn note_property_string(&mut self, value: &str) -> Result<(), PreflightLimit> {
        let actual = as_u64(value.len());
        check_limit("bytes in one property string", actual, self.limits.property_string_bytes)?;
        self.property_string_bytes = self.property_string_bytes.saturating_add(actual);
        check_limit(
            "aggregate operation property-string bytes",
            self.property_string_bytes,
            self.limits.total_property_string_bytes,
        )
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
        )?;
        absorb_measurement(
            &mut self.property_values,
            operation.property_values,
            self.limits.total_property_values,
            "aggregate transaction property values",
        )?;
        absorb_measurement(
            &mut self.property_string_bytes,
            operation.property_string_bytes,
            self.limits.total_property_string_bytes,
            "aggregate transaction property-string bytes",
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
    check_limit(description, *aggregate, maximum)
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
        formatter.write_str("a bounded JSON array of property-preserving operation payloads")
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
        formatter.write_str("a bounded property-preserving operation JSON value")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
    }

    fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
    }

    fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.reject_non_object_properties()
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
        if self.context == ValueContext::Properties {
            return Err(A::Error::custom("operation format properties must be a JSON object"));
        }
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
        if self.context == ValueContext::Properties {
            let mut count = 0_u64;
            let mut previous = None;
            while let Some(key) = map.next_key_seed(CanonicalKeySeed::qualified_property(
                self.budget.limits.qualified_name_bytes,
            ))? {
                require_canonical_key_order(
                    previous.as_deref(),
                    &key,
                    "operation property names must be unique and in ascending order",
                )
                .map_err(A::Error::custom)?;
                previous = Some(key);
                count = count.saturating_add(1);
                check_limit(
                    "properties on one operation format",
                    count,
                    self.budget.limits.properties_per_owner,
                )
                .map_err(A::Error::custom)?;
                map.next_value_seed(PropertyValueSeed { budget: &mut *self.budget, depth: 0 })?;
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
    fn reject_non_object_properties<E>(&self) -> Result<(), E>
    where
        E: de::Error,
    {
        if self.context == ValueContext::Properties {
            Err(E::custom("operation format properties must be a JSON object"))
        } else {
            Ok(())
        }
    }

    fn visit_text<E>(self, value: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        match self.context {
            ValueContext::Text => self.budget.note_text(value).map_err(E::custom)?,
            ValueContext::QualifiedName => check_limit(
                "bytes in one qualified name",
                as_u64(value.len()),
                self.budget.limits.qualified_name_bytes,
            )
            .map_err(E::custom)?,
            ValueContext::Generic
            | ValueContext::Path
            | ValueContext::Paragraphs
            | ValueContext::Runs
            | ValueContext::Formats => {}
            ValueContext::Properties => {
                return Err(E::custom("operation format properties must be a JSON object"));
            }
        }
        Ok(())
    }
}

struct PropertyValueSeed<'a> {
    budget: &'a mut PreflightBudget,
    depth: u64,
}

impl<'de> DeserializeSeed<'de> for PropertyValueSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.enter_property_value(self.depth).map_err(D::Error::custom)?;
        deserializer
            .deserialize_any(PropertyValueVisitor { budget: self.budget, depth: self.depth })
    }
}

struct PropertyValueVisitor<'a> {
    budget: &'a mut PreflightBudget,
    depth: u64,
}

impl<'de> Visitor<'de> for PropertyValueVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded deterministic operation property value")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value < MIN_SAFE_INTEGER {
            Err(E::custom("operation property integer is below the minimum safe integer"))
        } else {
            Ok(())
        }
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value > MAX_SAFE_INTEGER as u64 {
            Err(E::custom("operation property integer exceeds the maximum safe integer"))
        } else {
            Ok(())
        }
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("fractional operation property numbers are not supported"))
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_property_string(value).map_err(E::custom)
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_property_string(value).map_err(E::custom)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_property_string(&value).map_err(E::custom)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let child_depth = self.depth.saturating_add(1);
        while sequence
            .next_element_seed(PropertyValueSeed { budget: &mut *self.budget, depth: child_depth })?
            .is_some()
        {}
        Ok(())
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let child_depth = self.depth.saturating_add(1);
        let mut previous = None;
        while let Some(key) = map.next_key_seed(CanonicalKeySeed::property_object(
            self.budget.limits.property_object_key_bytes,
        ))? {
            require_canonical_key_order(
                previous.as_deref(),
                &key,
                "operation property-object keys must be unique and in ascending order",
            )
            .map_err(A::Error::custom)?;
            previous = Some(key);
            map.next_value_seed(PropertyValueSeed {
                budget: &mut *self.budget,
                depth: child_depth,
            })?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum CanonicalKeyKind {
    QualifiedProperty,
    PropertyObject,
}

#[derive(Clone, Copy)]
struct CanonicalKeySeed {
    maximum: u64,
    kind: CanonicalKeyKind,
}

impl CanonicalKeySeed {
    const fn qualified_property(maximum: u64) -> Self {
        Self { maximum, kind: CanonicalKeyKind::QualifiedProperty }
    }

    const fn property_object(maximum: u64) -> Self {
        Self { maximum, kind: CanonicalKeyKind::PropertyObject }
    }
}

impl<'de> DeserializeSeed<'de> for CanonicalKeySeed {
    type Value = String;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(CanonicalKeyVisitor { maximum: self.maximum, kind: self.kind })
    }
}

struct CanonicalKeyVisitor {
    maximum: u64,
    kind: CanonicalKeyKind,
}

impl Visitor<'_> for CanonicalKeyVisitor {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded canonical operation property key")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check(value).map_err(E::custom)?;
        Ok(value.to_owned())
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_borrowed_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check(&value).map_err(E::custom)?;
        Ok(value)
    }
}

impl CanonicalKeyVisitor {
    fn check(&self, value: &str) -> Result<(), CanonicalKeyError> {
        if as_u64(value.len()) > self.maximum {
            return Err(CanonicalKeyError::TooLong);
        }
        let valid = match self.kind {
            CanonicalKeyKind::QualifiedProperty => QualifiedName::try_new(value).is_ok(),
            CanonicalKeyKind::PropertyObject => is_valid_property_object_key(value),
        };
        if valid { Ok(()) } else { Err(CanonicalKeyError::Invalid(self.kind)) }
    }
}

#[derive(Clone, Copy)]
enum CanonicalKeyError {
    TooLong,
    Invalid(CanonicalKeyKind),
}

impl fmt::Display for CanonicalKeyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::TooLong => "operation property key exceeds its byte limit",
            Self::Invalid(CanonicalKeyKind::QualifiedProperty) => {
                "operation property name violates the qualified-name grammar"
            }
            Self::Invalid(CanonicalKeyKind::PropertyObject) => {
                "operation property-object key violates its grammar"
            }
        })
    }
}

fn require_canonical_key_order(
    previous: Option<&str>,
    current: &str,
    diagnostic: &'static str,
) -> Result<(), &'static str> {
    if previous.is_some_and(|previous| previous >= current) { Err(diagnostic) } else { Ok(()) }
}

fn is_valid_property_object_key(key: &str) -> bool {
    if key.len() > MAX_PROPERTY_OBJECT_KEY_BYTES {
        return false;
    }
    let mut bytes = key.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == b'_')
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
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
        "containerPath" | "paragraphPath" | "leftPath" => ValueContext::Path,
        "expectedParagraphs" | "replacementParagraphs" => ValueContext::Paragraphs,
        "runs" => ValueContext::Runs,
        "formats" => ValueContext::Formats,
        "properties" => ValueContext::Properties,
        "text" => ValueContext::Text,
        "type" => ValueContext::QualifiedName,
        _ => ValueContext::Generic,
    }
}

const fn sequence_description(context: ValueContext) -> &'static str {
    match context {
        ValueContext::Path => "path items",
        ValueContext::Paragraphs => "paragraphs in one fragment slice",
        ValueContext::Runs => "runs in one text fragment",
        ValueContext::Formats => "formats in one text run",
        ValueContext::Generic
        | ValueContext::Properties
        | ValueContext::Text
        | ValueContext::QualifiedName => "items in one JSON array",
    }
}

#[derive(Clone, Copy)]
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

const fn check_limit(
    description: &'static str,
    actual: u64,
    maximum: u64,
) -> Result<(), PreflightLimit> {
    if actual > maximum { Err(PreflightLimit { description, actual, maximum }) } else { Ok(()) }
}

fn admitted_excess(maximum: u64, raw_bytes: u64) -> u64 {
    maximum.saturating_add(1).min(raw_bytes)
}

fn as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{preflight_operation_payload_v2, preflight_operation_payloads_v2};
    use crate::{
        schema::{CompiledSchema, DocumentLimits},
        state::EditorContext,
    };

    #[test]
    fn property_depth_admits_only_the_first_semantic_excess() {
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_property_depth(1),
        );
        assert!(
            preflight_operation_payload_v2(r#"{"properties":{"example/value":[true]}}"#, &context,)
                .is_ok()
        );
        assert!(
            preflight_operation_payload_v2(
                r#"{"properties":{"example/value":[[true]]}}"#,
                &context,
            )
            .is_ok()
        );
        assert!(
            preflight_operation_payload_v2(
                r#"{"properties":{"example/value":[[[true]]]}}"#,
                &context,
            )
            .is_err()
        );
    }

    #[test]
    fn property_diagnostics_do_not_echo_hostile_keys_or_values()
    -> Result<(), Box<dyn std::error::Error>> {
        let context = EditorContext::default();
        for hostile in [
            r#"{"properties":{"SECRET INVALID":true}}"#,
            r#"{"properties":{"example/value":{"SECRET INVALID":true}}}"#,
            r#"{"properties":{"example/value":9007199254740992}}"#,
            r#"{"properties":{"secret/z":true,"secret/a":false}}"#,
            r#"{"properties":{"secret/key":true,"secret/key":false}}"#,
            r#"{"properties":{"example/value":{"secret-z":true,"secret-a":false}}}"#,
        ] {
            let Err(error) = preflight_operation_payload_v2(hostile, &context) else {
                return Err("hostile property input must fail preflight".into());
            };
            let diagnostic = error.to_string();
            assert!(!diagnostic.contains("SECRET"));
            assert!(!diagnostic.contains("9007199254740992"));
            assert!(!diagnostic.contains("secret/"));
            assert!(!diagnostic.contains("secret-"));
        }
        Ok(())
    }

    #[test]
    fn aggregate_budget_scales_with_admitted_operation_slots() {
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default().with_max_children_per_element(1).with_max_property_values(1),
        )
        .with_max_operations_per_transaction(5);
        let payload = r#"{"properties":{"example/value":true}}"#;
        let sequence = format!("[{payload},{payload},{payload},{payload},{payload}]");
        assert!(matches!(preflight_operation_payloads_v2(&sequence, &context), Ok(5)));
    }

    #[test]
    fn first_count_excess_is_skipped_without_materializing_hostile_properties() {
        let context = EditorContext::default().with_max_operations_per_transaction(0);
        let hostile = r#"{"properties":{"SECRET INVALID":9007199254740992}}"#;
        assert!(matches!(
            preflight_operation_payloads_v2(&format!("[{hostile}]"), &context),
            Ok(1)
        ));
        assert!(
            preflight_operation_payloads_v2(&format!("[{hostile},{hostile}]"), &context).is_err()
        );
    }
}
