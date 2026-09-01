//! Allocation admission for one borrowed document V1 root.

use std::fmt;

use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};

use crate::{
    document::MAX_PROPERTY_OBJECT_KEY_BYTES,
    identity::{MAX_ENTITY_ID_BYTES, MAX_QUALIFIED_NAME_BYTES},
    position::MAX_PATH_DEPTH,
    schema::DocumentLimits,
};

/// Scans one document root without materializing record vectors, strings, or maps.
///
/// Every semantic ceiling admits exactly one excess unit so the owned decoder
/// and authoritative validator can return their precise typed error. A larger
/// value is rejected before its payload is traversed by the typed seed that
/// owns that count or depth.
pub(crate) fn preflight_document_root(
    json: &str,
    limits: &DocumentLimits,
) -> Result<(), serde_json::Error> {
    let mut budget = DocumentBudget::new(limits, as_u64(json.len()));
    let mut deserializer = serde_json::Deserializer::from_str(json);
    NodeSeed { budget: &mut budget, depth: 0 }.deserialize(&mut deserializer)?;
    deserializer.end()
}

#[derive(Clone, Copy)]
struct PreflightLimits {
    node_depth: u64,
    nodes: u64,
    children_per_element: u64,
    text_bytes: u64,
    text_utf16_units: u64,
    total_text_bytes: u64,
    formats_per_text: u64,
    properties_per_owner: u64,
    property_depth: u64,
    property_values: u64,
    qualified_name_bytes: u64,
    entity_id_bytes: u64,
    property_object_key_bytes: u64,
}

impl PreflightLimits {
    fn new(limits: &DocumentLimits, raw_bytes: u64) -> Self {
        let effective_node_depth = as_u64(limits.max_node_depth()).min(as_u64(MAX_PATH_DEPTH));
        let effective_child_count =
            as_u64(limits.max_children_per_element()).min(u64::from(u32::MAX));
        Self {
            node_depth: admitted_excess(effective_node_depth, raw_bytes),
            nodes: admitted_excess(as_u64(limits.max_nodes()), raw_bytes),
            children_per_element: admitted_excess(effective_child_count, raw_bytes),
            text_bytes: admitted_excess(as_u64(limits.max_text_bytes()), raw_bytes),
            text_utf16_units: admitted_excess(u64::from(u32::MAX), raw_bytes),
            total_text_bytes: admitted_excess(as_u64(limits.max_total_text_bytes()), raw_bytes),
            formats_per_text: admitted_excess(as_u64(limits.max_formats_per_text()), raw_bytes),
            properties_per_owner: admitted_excess(
                as_u64(limits.max_properties_per_owner()),
                raw_bytes,
            ),
            property_depth: admitted_excess(as_u64(limits.max_property_depth()), raw_bytes),
            property_values: admitted_excess(as_u64(limits.max_property_values()), raw_bytes),
            qualified_name_bytes: admitted_excess(as_u64(MAX_QUALIFIED_NAME_BYTES), raw_bytes),
            entity_id_bytes: admitted_excess(as_u64(MAX_ENTITY_ID_BYTES), raw_bytes),
            property_object_key_bytes: admitted_excess(
                as_u64(MAX_PROPERTY_OBJECT_KEY_BYTES),
                raw_bytes,
            ),
        }
    }
}

fn admitted_excess(maximum: u64, raw_bytes: u64) -> u64 {
    maximum.saturating_add(1).min(raw_bytes)
}

fn as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

struct DocumentBudget {
    limits: PreflightLimits,
    nodes: u64,
    total_text_bytes: u64,
    property_values: u64,
}

impl DocumentBudget {
    fn new(limits: &DocumentLimits, raw_bytes: u64) -> Self {
        Self {
            limits: PreflightLimits::new(limits, raw_bytes),
            nodes: 0,
            total_text_bytes: 0,
            property_values: 0,
        }
    }

    fn enter_node(&mut self, depth: u64) -> Result<(), PreflightLimit> {
        check_limit("node depth", depth, self.limits.node_depth)?;
        increment_and_check(&mut self.nodes, self.limits.nodes, "document nodes")
    }

    fn note_text(&mut self, value: &str) -> Result<(), PreflightLimit> {
        let bytes = as_u64(value.len());
        check_limit("bytes in one text leaf", bytes, self.limits.text_bytes)?;
        let utf16_units = as_u64(value.encode_utf16().count());
        check_limit("UTF-16 units in one text leaf", utf16_units, self.limits.text_utf16_units)?;
        self.total_text_bytes = self.total_text_bytes.saturating_add(bytes);
        check_limit(
            "aggregate document text bytes",
            self.total_text_bytes,
            self.limits.total_text_bytes,
        )
    }

    fn enter_property_value(&mut self, depth: u64) -> Result<(), PreflightLimit> {
        check_limit("property-value depth", depth, self.limits.property_depth)?;
        increment_and_check(
            &mut self.property_values,
            self.limits.property_values,
            "document property values",
        )
    }
}

fn increment_and_check(
    value: &mut u64,
    maximum: u64,
    description: &'static str,
) -> Result<(), PreflightLimit> {
    *value = value.saturating_add(1);
    check_limit(description, *value, maximum)
}

const fn check_limit(
    description: &'static str,
    actual: u64,
    maximum: u64,
) -> Result<(), PreflightLimit> {
    if actual > maximum { Err(PreflightLimit { description, actual, maximum }) } else { Ok(()) }
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
            "document allocation preflight rejected {} {}; ceiling is {}",
            self.description, self.actual, self.maximum
        )
    }
}

struct NodeSeed<'a> {
    budget: &'a mut DocumentBudget,
    depth: u64,
}

impl<'de> DeserializeSeed<'de> for NodeSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.enter_node(self.depth).map_err(D::Error::custom)?;
        deserializer.deserialize_map(NodeVisitor { budget: self.budget, depth: self.depth })
    }
}

struct NodeVisitor<'a> {
    budget: &'a mut DocumentBudget,
    depth: u64,
}

impl<'de> Visitor<'de> for NodeVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded document node object")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut seen = 0_u8;
        let mut kind = None;
        while let Some(field) = map.next_key_seed(NodeFieldSeed)? {
            let bit = field.bit();
            if seen & bit != 0 {
                return Err(A::Error::custom("duplicate document node field"));
            }
            seen |= bit;
            match field {
                NodeField::Kind => kind = Some(map.next_value_seed(NodeKindSeed)?),
                NodeField::Type => {
                    map.next_value_seed(BoundedStringSeed::new(
                        self.budget.limits.qualified_name_bytes,
                        "bytes in one qualified name",
                    ))?;
                }
                NodeField::EntityId => {
                    map.next_value_seed(OptionalBoundedStringSeed::new(
                        self.budget.limits.entity_id_bytes,
                        "bytes in one entity ID",
                    ))?;
                }
                NodeField::Properties => {
                    map.next_value_seed(PropertyMapSeed { budget: &mut *self.budget })?;
                }
                NodeField::Children => {
                    map.next_value_seed(ChildrenSeed {
                        budget: &mut *self.budget,
                        child_depth: self.depth.saturating_add(1),
                    })?;
                }
                NodeField::Text => {
                    map.next_value_seed(TextSeed { budget: &mut *self.budget })?;
                }
                NodeField::Formats => {
                    map.next_value_seed(FormatsSeed { budget: &mut *self.budget })?;
                }
                NodeField::Unknown => {
                    return Err(A::Error::custom("unknown document node field"));
                }
            }
        }

        let Some(kind) = kind else {
            return Err(A::Error::missing_field("kind"));
        };
        let expected = match kind {
            NodeKind::Element => ELEMENT_NODE_FIELDS,
            NodeKind::Text => TEXT_NODE_FIELDS,
        };
        if seen != expected {
            return Err(A::Error::custom("document node fields do not match its kind"));
        }
        Ok(())
    }
}

const NODE_FIELD_KIND: u8 = 1 << 0;
const NODE_FIELD_TYPE: u8 = 1 << 1;
const NODE_FIELD_ENTITY_ID: u8 = 1 << 2;
const NODE_FIELD_PROPERTIES: u8 = 1 << 3;
const NODE_FIELD_CHILDREN: u8 = 1 << 4;
const NODE_FIELD_TEXT: u8 = 1 << 5;
const NODE_FIELD_FORMATS: u8 = 1 << 6;
const ELEMENT_NODE_FIELDS: u8 = NODE_FIELD_KIND
    | NODE_FIELD_TYPE
    | NODE_FIELD_ENTITY_ID
    | NODE_FIELD_PROPERTIES
    | NODE_FIELD_CHILDREN;
const TEXT_NODE_FIELDS: u8 = NODE_FIELD_KIND | NODE_FIELD_TEXT | NODE_FIELD_FORMATS;

#[derive(Clone, Copy)]
enum NodeField {
    Kind,
    Type,
    EntityId,
    Properties,
    Children,
    Text,
    Formats,
    Unknown,
}

impl NodeField {
    const fn bit(self) -> u8 {
        match self {
            Self::Kind => NODE_FIELD_KIND,
            Self::Type => NODE_FIELD_TYPE,
            Self::EntityId => NODE_FIELD_ENTITY_ID,
            Self::Properties => NODE_FIELD_PROPERTIES,
            Self::Children => NODE_FIELD_CHILDREN,
            Self::Text => NODE_FIELD_TEXT,
            Self::Formats => NODE_FIELD_FORMATS,
            Self::Unknown => 0,
        }
    }
}

struct NodeFieldSeed;

impl<'de> DeserializeSeed<'de> for NodeFieldSeed {
    type Value = NodeField;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_identifier(NodeFieldVisitor)
    }
}

struct NodeFieldVisitor;

impl Visitor<'_> for NodeFieldVisitor {
    type Value = NodeField;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a document node field")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(node_field(value))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(node_field(value))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(node_field(&value))
    }
}

const fn node_field(value: &str) -> NodeField {
    match value.as_bytes() {
        b"kind" => NodeField::Kind,
        b"type" => NodeField::Type,
        b"entityId" => NodeField::EntityId,
        b"properties" => NodeField::Properties,
        b"children" => NodeField::Children,
        b"text" => NodeField::Text,
        b"formats" => NodeField::Formats,
        _ => NodeField::Unknown,
    }
}

#[derive(Clone, Copy)]
enum NodeKind {
    Element,
    Text,
}

struct NodeKindSeed;

impl<'de> DeserializeSeed<'de> for NodeKindSeed {
    type Value = NodeKind;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(NodeKindVisitor)
    }
}

struct NodeKindVisitor;

impl Visitor<'_> for NodeKindVisitor {
    type Value = NodeKind;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("`element` or `text`")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        node_kind(value).ok_or_else(|| E::custom("unsupported document node kind"))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        node_kind(value).ok_or_else(|| E::custom("unsupported document node kind"))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        node_kind(&value).ok_or_else(|| E::custom("unsupported document node kind"))
    }
}

const fn node_kind(value: &str) -> Option<NodeKind> {
    match value.as_bytes() {
        b"element" => Some(NodeKind::Element),
        b"text" => Some(NodeKind::Text),
        _ => None,
    }
}

struct ChildrenSeed<'a> {
    budget: &'a mut DocumentBudget,
    child_depth: u64,
}

impl<'de> DeserializeSeed<'de> for ChildrenSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer
            .deserialize_seq(ChildrenVisitor { budget: self.budget, child_depth: self.child_depth })
    }
}

struct ChildrenVisitor<'a> {
    budget: &'a mut DocumentBudget,
    child_depth: u64,
}

impl<'de> Visitor<'de> for ChildrenVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded array of document child nodes")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut child_count = 0_u64;
        while sequence
            .next_element_seed(ChildSeed {
                budget: &mut *self.budget,
                child_depth: self.child_depth,
                child_count: &mut child_count,
            })?
            .is_some()
        {}
        Ok(())
    }
}

struct ChildSeed<'a> {
    budget: &'a mut DocumentBudget,
    child_depth: u64,
    child_count: &'a mut u64,
}

impl<'de> DeserializeSeed<'de> for ChildSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        increment_and_check(
            self.child_count,
            self.budget.limits.children_per_element,
            "children in one element",
        )
        .map_err(D::Error::custom)?;
        NodeSeed { budget: self.budget, depth: self.child_depth }.deserialize(deserializer)
    }
}

struct FormatsSeed<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> DeserializeSeed<'de> for FormatsSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(FormatsVisitor { budget: self.budget })
    }
}

struct FormatsVisitor<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> Visitor<'de> for FormatsVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded array of document text formats")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut format_count = 0_u64;
        while sequence
            .next_element_seed(CountedFormatSeed {
                budget: &mut *self.budget,
                format_count: &mut format_count,
            })?
            .is_some()
        {}
        Ok(())
    }
}

struct CountedFormatSeed<'a> {
    budget: &'a mut DocumentBudget,
    format_count: &'a mut u64,
}

impl<'de> DeserializeSeed<'de> for CountedFormatSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        increment_and_check(
            self.format_count,
            self.budget.limits.formats_per_text,
            "formats on one text leaf",
        )
        .map_err(D::Error::custom)?;
        FormatSeed { budget: self.budget }.deserialize(deserializer)
    }
}

struct FormatSeed<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> DeserializeSeed<'de> for FormatSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(FormatVisitor { budget: self.budget })
    }
}

struct FormatVisitor<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> Visitor<'de> for FormatVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded document format object")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut seen = 0_u8;
        while let Some(field) = map.next_key_seed(FormatFieldSeed)? {
            let bit = field.bit();
            if seen & bit != 0 {
                return Err(A::Error::custom("duplicate document format field"));
            }
            seen |= bit;
            match field {
                FormatField::Type => {
                    map.next_value_seed(BoundedStringSeed::new(
                        self.budget.limits.qualified_name_bytes,
                        "bytes in one qualified name",
                    ))?;
                }
                FormatField::Properties => {
                    map.next_value_seed(PropertyMapSeed { budget: &mut *self.budget })?;
                }
                FormatField::Unknown => {
                    return Err(A::Error::custom("unknown document format field"));
                }
            }
        }
        if seen != FORMAT_FIELDS {
            return Err(A::Error::custom("document format fields are incomplete"));
        }
        Ok(())
    }
}

const FORMAT_FIELD_TYPE: u8 = 1 << 0;
const FORMAT_FIELD_PROPERTIES: u8 = 1 << 1;
const FORMAT_FIELDS: u8 = FORMAT_FIELD_TYPE | FORMAT_FIELD_PROPERTIES;

#[derive(Clone, Copy)]
enum FormatField {
    Type,
    Properties,
    Unknown,
}

impl FormatField {
    const fn bit(self) -> u8 {
        match self {
            Self::Type => FORMAT_FIELD_TYPE,
            Self::Properties => FORMAT_FIELD_PROPERTIES,
            Self::Unknown => 0,
        }
    }
}

struct FormatFieldSeed;

impl<'de> DeserializeSeed<'de> for FormatFieldSeed {
    type Value = FormatField;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_identifier(FormatFieldVisitor)
    }
}

struct FormatFieldVisitor;

impl Visitor<'_> for FormatFieldVisitor {
    type Value = FormatField;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a document format field")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(format_field(value))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(format_field(value))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(format_field(&value))
    }
}

const fn format_field(value: &str) -> FormatField {
    match value.as_bytes() {
        b"type" => FormatField::Type,
        b"properties" => FormatField::Properties,
        _ => FormatField::Unknown,
    }
}

struct PropertyMapSeed<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> DeserializeSeed<'de> for PropertyMapSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(PropertyMapVisitor { budget: self.budget })
    }
}

struct PropertyMapVisitor<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> Visitor<'de> for PropertyMapVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded document property map")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut property_count = 0_u64;
        while map
            .next_key_seed(BoundedStringSeed::new(
                self.budget.limits.qualified_name_bytes,
                "bytes in one qualified name",
            ))?
            .is_some()
        {
            increment_and_check(
                &mut property_count,
                self.budget.limits.properties_per_owner,
                "properties on one document owner",
            )
            .map_err(A::Error::custom)?;
            map.next_value_seed(PropertyValueSeed { budget: &mut *self.budget, depth: 0 })?;
        }
        Ok(())
    }
}

struct PropertyValueSeed<'a> {
    budget: &'a mut DocumentBudget,
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
    budget: &'a mut DocumentBudget,
    depth: u64,
}

impl<'de> Visitor<'de> for PropertyValueVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded document property value")
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
        deserializer.deserialize_any(Self { budget: self.budget, depth: self.depth })
    }

    fn visit_borrowed_str<E>(self, _value: &str) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_str<E>(self, _value: &str) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_string<E>(self, _value: String) -> Result<Self::Value, E> {
        Ok(())
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
        while map
            .next_key_seed(BoundedStringSeed::new(
                self.budget.limits.property_object_key_bytes,
                "bytes in one property-object key",
            ))?
            .is_some()
        {
            map.next_value_seed(PropertyValueSeed {
                budget: &mut *self.budget,
                depth: child_depth,
            })?;
        }
        Ok(())
    }
}

struct TextSeed<'a> {
    budget: &'a mut DocumentBudget,
}

impl<'de> DeserializeSeed<'de> for TextSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(TextVisitor { budget: self.budget })
    }
}

struct TextVisitor<'a> {
    budget: &'a mut DocumentBudget,
}

impl Visitor<'_> for TextVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded document text string")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_text(value).map_err(E::custom)
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_text(value).map_err(E::custom)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_text(&value).map_err(E::custom)
    }
}

#[derive(Clone, Copy)]
struct BoundedStringSeed {
    maximum: u64,
    description: &'static str,
}

impl BoundedStringSeed {
    const fn new(maximum: u64, description: &'static str) -> Self {
        Self { maximum, description }
    }
}

impl<'de> DeserializeSeed<'de> for BoundedStringSeed {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(BoundedStringVisitor {
            maximum: self.maximum,
            description: self.description,
        })
    }
}

struct BoundedStringVisitor {
    maximum: u64,
    description: &'static str,
}

impl Visitor<'_> for BoundedStringVisitor {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded string")
    }

    fn visit_borrowed_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check(value).map_err(E::custom)
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check(value).map_err(E::custom)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check(&value).map_err(E::custom)
    }
}

impl BoundedStringVisitor {
    fn check(&self, value: &str) -> Result<(), PreflightLimit> {
        check_limit(self.description, as_u64(value.len()), self.maximum)
    }
}

#[derive(Clone, Copy)]
struct OptionalBoundedStringSeed(BoundedStringSeed);

impl OptionalBoundedStringSeed {
    const fn new(maximum: u64, description: &'static str) -> Self {
        Self(BoundedStringSeed::new(maximum, description))
    }
}

impl<'de> DeserializeSeed<'de> for OptionalBoundedStringSeed {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_option(OptionalBoundedStringVisitor(self.0))
    }
}

struct OptionalBoundedStringVisitor(BoundedStringSeed);

impl<'de> Visitor<'de> for OptionalBoundedStringVisitor {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("null or a bounded string")
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.0.deserialize(deserializer)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Map, Value, json};

    use super::{MAX_PROPERTY_OBJECT_KEY_BYTES, preflight_document_root};
    use crate::{
        identity::{MAX_ENTITY_ID_BYTES, MAX_QUALIFIED_NAME_BYTES},
        schema::DocumentLimits,
    };

    fn root(properties: serde_json::Value, children: Vec<serde_json::Value>) -> String {
        element("breditor/document", Value::Null, properties, children).to_string()
    }

    fn paragraph(children: Vec<serde_json::Value>) -> serde_json::Value {
        element("breditor/paragraph", Value::Null, Value::Object(Map::new()), children)
    }

    fn element(
        element_type: &str,
        entity_id: Value,
        properties: Value,
        children: Vec<Value>,
    ) -> Value {
        Value::Object(Map::from_iter([
            ("kind".to_owned(), Value::String("element".to_owned())),
            ("type".to_owned(), Value::String(element_type.to_owned())),
            ("entityId".to_owned(), entity_id),
            ("properties".to_owned(), properties),
            ("children".to_owned(), Value::Array(children)),
        ]))
    }

    fn text(value: &str, format_count: usize) -> serde_json::Value {
        let formats = (0..format_count)
            .map(|index| {
                json!({
                    "type": format!("test/format-{index}"),
                    "properties": {},
                })
            })
            .collect::<Vec<_>>();
        json!({"kind": "text", "text": value, "formats": formats})
    }

    #[test]
    fn node_child_and_depth_limits_admit_only_the_first_excess() {
        let node_limits = DocumentLimits::default().with_max_nodes(1);
        assert!(
            preflight_document_root(&root(json!({}), vec![paragraph(Vec::new())]), &node_limits)
                .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(Vec::new()), paragraph(Vec::new())]),
                &node_limits,
            )
            .is_err()
        );

        let child_limits = DocumentLimits::default().with_max_children_per_element(1);
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(Vec::new()), paragraph(Vec::new())]),
                &child_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(
                    json!({}),
                    vec![paragraph(Vec::new()), paragraph(Vec::new()), paragraph(Vec::new())],
                ),
                &child_limits,
            )
            .is_err()
        );

        let depth_limits = DocumentLimits::default().with_max_node_depth(0);
        assert!(
            preflight_document_root(&root(json!({}), vec![paragraph(Vec::new())]), &depth_limits)
                .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("a", 0)])]),
                &depth_limits,
            )
            .is_err()
        );
    }

    #[test]
    fn text_and_format_limits_admit_only_the_first_excess() {
        let leaf_limits = DocumentLimits::default().with_max_text_bytes(1);
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("ab", 0)])]),
                &leaf_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("abc", 0)])]),
                &leaf_limits,
            )
            .is_err()
        );

        let total_limits =
            DocumentLimits::default().with_max_text_bytes(10).with_max_total_text_bytes(1);
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("ab", 0)])]),
                &total_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("abc", 0)])]),
                &total_limits,
            )
            .is_err()
        );

        let format_limits = DocumentLimits::default().with_max_formats_per_text(1);
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("a", 2)])]),
                &format_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({}), vec![paragraph(vec![text("a", 3)])]),
                &format_limits,
            )
            .is_err()
        );
    }

    #[test]
    fn property_limits_admit_only_the_first_excess() {
        let owner_limits = DocumentLimits::default().with_max_properties_per_owner(1);
        assert!(
            preflight_document_root(
                &root(json!({"test/a": null, "test/b": null}), vec![paragraph(Vec::new())]),
                &owner_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(
                    json!({"test/a": null, "test/b": null, "test/c": null}),
                    vec![paragraph(Vec::new())],
                ),
                &owner_limits,
            )
            .is_err()
        );

        let value_limits = DocumentLimits::default().with_max_property_values(1);
        assert!(
            preflight_document_root(
                &root(json!({"test/value": [null]}), vec![paragraph(Vec::new())]),
                &value_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({"test/value": [null, null]}), vec![paragraph(Vec::new())]),
                &value_limits,
            )
            .is_err()
        );

        let depth_limits = DocumentLimits::default().with_max_property_depth(0);
        assert!(
            preflight_document_root(
                &root(json!({"test/value": [null]}), vec![paragraph(Vec::new())]),
                &depth_limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root(json!({"test/value": [[null]]}), vec![paragraph(Vec::new())]),
                &depth_limits,
            )
            .is_err()
        );
    }

    #[test]
    fn property_object_keys_never_select_document_field_contexts() {
        let limits = DocumentLimits::default()
            .with_max_children_per_element(0)
            .with_max_text_bytes(0)
            .with_max_formats_per_text(0);
        let properties = json!({
            "test/value": {
                "children": [null, null],
                "formats": [null, null],
                "properties": {"text": "still a property string"},
                "text": "not document text"
            }
        });

        assert!(
            preflight_document_root(&root(properties, vec![paragraph(Vec::new())]), &limits,)
                .is_ok()
        );
    }

    #[test]
    fn identity_and_property_key_lengths_admit_only_the_first_excess() {
        let limits = DocumentLimits::default();
        let element_with_identity = |element_type: String, entity_id: Option<String>| {
            element(
                &element_type,
                entity_id.map_or(Value::Null, Value::String),
                Value::Object(Map::new()),
                Vec::new(),
            )
            .to_string()
        };

        assert!(
            preflight_document_root(
                &element_with_identity("x".repeat(MAX_QUALIFIED_NAME_BYTES + 1), None),
                &limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &element_with_identity("x".repeat(MAX_QUALIFIED_NAME_BYTES + 2), None),
                &limits,
            )
            .is_err()
        );
        assert!(
            preflight_document_root(
                &element_with_identity(
                    "breditor/document".to_owned(),
                    Some("x".repeat(MAX_ENTITY_ID_BYTES + 1)),
                ),
                &limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &element_with_identity(
                    "breditor/document".to_owned(),
                    Some("x".repeat(MAX_ENTITY_ID_BYTES + 2)),
                ),
                &limits,
            )
            .is_err()
        );

        let root_with_property_name = |key: String| {
            let mut properties = Map::new();
            properties.insert(key, Value::Null);
            root(Value::Object(properties), Vec::new())
        };
        let root_with_object_key = |key: String| {
            let mut object = Map::new();
            object.insert(key, Value::Null);
            let mut properties = Map::new();
            properties.insert("test/value".to_owned(), Value::Object(object));
            root(Value::Object(properties), Vec::new())
        };

        assert!(
            preflight_document_root(
                &root_with_property_name("x".repeat(MAX_QUALIFIED_NAME_BYTES + 1)),
                &limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root_with_property_name("x".repeat(MAX_QUALIFIED_NAME_BYTES + 2)),
                &limits,
            )
            .is_err()
        );
        assert!(
            preflight_document_root(
                &root_with_object_key("x".repeat(MAX_PROPERTY_OBJECT_KEY_BYTES + 1)),
                &limits,
            )
            .is_ok()
        );
        assert!(
            preflight_document_root(
                &root_with_object_key("x".repeat(MAX_PROPERTY_OBJECT_KEY_BYTES + 2)),
                &limits,
            )
            .is_err()
        );
    }
}
