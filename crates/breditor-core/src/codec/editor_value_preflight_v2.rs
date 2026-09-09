//! Allocation preflight for property-preserving pending editor values.

use std::fmt;

use serde::de::{self, DeserializeSeed, Deserializer, Error as _, MapAccess, SeqAccess, Visitor};

use crate::{
    document::{MAX_PROPERTY_OBJECT_KEY_BYTES, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER},
    identity::{MAX_QUALIFIED_NAME_BYTES, QualifiedName},
    state::EditorContext,
};

/// Scans a nullable V2 pending-format array before owned reconstruction.
///
/// The scan enforces every allocation-sensitive deterministic-value ceiling
/// and rejects hostile keys without copying them into diagnostics.
pub(crate) fn preflight_pending_format_records_v2(
    json: &str,
    context: &EditorContext,
) -> Result<(), serde_json::Error> {
    let mut budget = PendingFormatBudget::new(context);
    let mut deserializer = serde_json::Deserializer::from_str(json);
    PendingFormatsSeed { budget: &mut budget }.deserialize(&mut deserializer)?;
    deserializer.end()
}

struct PendingFormatBudget {
    max_formats: u64,
    max_properties_per_format: u64,
    max_property_depth: u64,
    max_property_values: u64,
    max_property_string_bytes: u64,
    max_total_property_string_bytes: u64,
    property_values: u64,
    property_string_bytes: u64,
}

impl PendingFormatBudget {
    fn new(context: &EditorContext) -> Self {
        let limits = context.limits();
        Self {
            max_formats: as_u64(limits.max_formats_per_text()),
            max_properties_per_format: as_u64(limits.max_properties_per_owner()),
            max_property_depth: as_u64(limits.max_property_depth()),
            max_property_values: as_u64(limits.max_property_values()),
            max_property_string_bytes: as_u64(limits.max_property_string_bytes()),
            max_total_property_string_bytes: as_u64(limits.max_total_property_string_bytes()),
            property_values: 0,
            property_string_bytes: 0,
        }
    }

    fn enter_property_value<E>(&mut self, depth: u64) -> Result<(), E>
    where
        E: de::Error,
    {
        require_limit("pending-format property depth", depth, self.max_property_depth)
            .map_err(E::custom)?;
        self.property_values = self.property_values.saturating_add(1);
        require_limit(
            "pending-format property values",
            self.property_values,
            self.max_property_values,
        )
        .map_err(E::custom)
    }

    fn note_property_string<E>(&mut self, value: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        let bytes = as_u64(value.len());
        require_limit(
            "bytes in one pending-format property string",
            bytes,
            self.max_property_string_bytes,
        )
        .map_err(E::custom)?;
        self.property_string_bytes = self.property_string_bytes.saturating_add(bytes);
        require_limit(
            "aggregate pending-format property-string bytes",
            self.property_string_bytes,
            self.max_total_property_string_bytes,
        )
        .map_err(E::custom)
    }
}

struct PendingFormatsSeed<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> DeserializeSeed<'de> for PendingFormatsSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_option(PendingFormatsVisitor { budget: self.budget })
    }
}

struct PendingFormatsVisitor<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> Visitor<'de> for PendingFormatsVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("null or a bounded canonical pending-format array")
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(PendingFormatSequenceVisitor { budget: self.budget })
    }
}

struct PendingFormatSequenceVisitor<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> Visitor<'de> for PendingFormatSequenceVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded canonical pending-format array")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut format_count = 0_u64;
        let mut previous = None;
        while let Some(format_type) =
            sequence.next_element_seed(PendingFormatSeed { budget: &mut *self.budget })?
        {
            format_count = format_count.saturating_add(1);
            require_limit("pending formats", format_count, self.budget.max_formats)
                .map_err(A::Error::custom)?;
            require_canonical_order(
                previous.as_deref(),
                &format_type,
                "pending-format types must be unique and in ascending order",
            )
            .map_err(A::Error::custom)?;
            previous = Some(format_type);
        }
        Ok(())
    }
}

struct PendingFormatSeed<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> DeserializeSeed<'de> for PendingFormatSeed<'_> {
    type Value = String;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(PendingFormatVisitor { budget: self.budget })
    }
}

struct PendingFormatVisitor<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> Visitor<'de> for PendingFormatVisitor<'_> {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a strict pending-format object")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut format_type = None;
        let mut saw_properties = false;
        while let Some(field) = map.next_key_seed(PendingFormatFieldSeed)? {
            match field {
                PendingFormatField::Type => {
                    if format_type.is_some() {
                        return Err(A::Error::custom("pending format has a duplicate type field"));
                    }
                    format_type = Some(map.next_value_seed(QualifiedNameSeed)?);
                }
                PendingFormatField::Properties => {
                    if saw_properties {
                        return Err(A::Error::custom(
                            "pending format has a duplicate properties field",
                        ));
                    }
                    saw_properties = true;
                    map.next_value_seed(PropertyMapSeed { budget: &mut *self.budget })?;
                }
                PendingFormatField::Unknown => {
                    return Err(A::Error::custom("pending format has an unknown field"));
                }
            }
        }
        if !saw_properties {
            return Err(A::Error::custom("pending format is missing its properties field"));
        }
        format_type.ok_or_else(|| A::Error::custom("pending format is missing its type field"))
    }
}

#[derive(Clone, Copy)]
enum PendingFormatField {
    Type,
    Properties,
    Unknown,
}

struct PendingFormatFieldSeed;

impl<'de> DeserializeSeed<'de> for PendingFormatFieldSeed {
    type Value = PendingFormatField;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_identifier(PendingFormatFieldVisitor)
    }
}

struct PendingFormatFieldVisitor;

impl Visitor<'_> for PendingFormatFieldVisitor {
    type Value = PendingFormatField;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a pending-format field name")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(match value {
            "type" => PendingFormatField::Type,
            "properties" => PendingFormatField::Properties,
            _ => PendingFormatField::Unknown,
        })
    }

    fn visit_borrowed_str<E>(self, value: &'_ str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(&value)
    }
}

struct QualifiedNameSeed;

impl<'de> DeserializeSeed<'de> for QualifiedNameSeed {
    type Value = String;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(QualifiedNameVisitor)
    }
}

struct QualifiedNameVisitor;

impl Visitor<'_> for QualifiedNameVisitor {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a canonical qualified pending-format name")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_qualified_name::<E>(value)?;
        Ok(value.to_owned())
    }

    fn visit_borrowed_str<E>(self, value: &'_ str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_qualified_name::<E>(&value)?;
        Ok(value)
    }
}

fn validate_qualified_name<E>(value: &str) -> Result<(), E>
where
    E: de::Error,
{
    if value.len() > MAX_QUALIFIED_NAME_BYTES {
        return Err(E::custom("pending-format qualified name exceeds its byte limit"));
    }
    QualifiedName::try_new(value)
        .map(|_| ())
        .map_err(|_| E::custom("pending-format name violates the qualified-name grammar"))
}

struct PropertyMapSeed<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> DeserializeSeed<'de> for PropertyMapSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(PropertyMapVisitor { budget: self.budget })
    }
}

struct PropertyMapVisitor<'a> {
    budget: &'a mut PendingFormatBudget,
}

impl<'de> Visitor<'de> for PropertyMapVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a canonical pending-format property object")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_str<E>(self, _value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_string<E>(self, _value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("pending format properties must be a JSON object"))
    }

    fn visit_seq<A>(self, _sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        Err(A::Error::custom("pending format properties must be a JSON object"))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut property_count = 0_u64;
        let mut previous = None;
        while let Some(key) = map.next_key_seed(CanonicalKeySeed::qualified_property())? {
            property_count = property_count.saturating_add(1);
            require_limit(
                "properties on one pending format",
                property_count,
                self.budget.max_properties_per_format,
            )
            .map_err(A::Error::custom)?;
            require_canonical_order(
                previous.as_deref(),
                &key,
                "pending-format property names must be unique and in ascending order",
            )
            .map_err(A::Error::custom)?;
            previous = Some(key);
            map.next_value_seed(PropertyValueSeed { budget: &mut *self.budget, depth: 0 })?;
        }
        Ok(())
    }
}

struct PropertyValueSeed<'a> {
    budget: &'a mut PendingFormatBudget,
    depth: u64,
}

impl<'de> DeserializeSeed<'de> for PropertyValueSeed<'_> {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.budget.enter_property_value::<D::Error>(self.depth)?;
        deserializer
            .deserialize_any(PropertyValueVisitor { budget: self.budget, depth: self.depth })
    }
}

struct PropertyValueVisitor<'a> {
    budget: &'a mut PendingFormatBudget,
    depth: u64,
}

impl<'de> Visitor<'de> for PropertyValueVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded deterministic pending-format property value")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value < MIN_SAFE_INTEGER {
            Err(E::custom("pending-format property integer is below the safe minimum"))
        } else {
            Ok(())
        }
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value > MAX_SAFE_INTEGER as u64 {
            Err(E::custom("pending-format property integer exceeds the safe maximum"))
        } else {
            Ok(())
        }
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Err(E::custom("fractional pending-format property numbers are not supported"))
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.budget.note_property_string::<E>(value)
    }

    fn visit_borrowed_str<E>(self, value: &'_ str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(&value)
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
        while let Some(key) = map.next_key_seed(CanonicalKeySeed::property_object())? {
            require_canonical_order(
                previous.as_deref(),
                &key,
                "pending-format property-object keys must be unique and in ascending order",
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

struct CanonicalKeySeed {
    kind: CanonicalKeyKind,
}

impl CanonicalKeySeed {
    const fn qualified_property() -> Self {
        Self { kind: CanonicalKeyKind::QualifiedProperty }
    }

    const fn property_object() -> Self {
        Self { kind: CanonicalKeyKind::PropertyObject }
    }
}

impl<'de> DeserializeSeed<'de> for CanonicalKeySeed {
    type Value = String;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(CanonicalKeyVisitor { kind: self.kind })
    }
}

struct CanonicalKeyVisitor {
    kind: CanonicalKeyKind,
}

impl Visitor<'_> for CanonicalKeyVisitor {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded canonical pending-format property key")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check::<E>(value)?;
        Ok(value.to_owned())
    }

    fn visit_borrowed_str<E>(self, value: &'_ str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.check::<E>(&value)?;
        Ok(value)
    }
}

impl CanonicalKeyVisitor {
    fn check<E>(&self, value: &str) -> Result<(), E>
    where
        E: de::Error,
    {
        let valid = match self.kind {
            CanonicalKeyKind::QualifiedProperty => {
                value.len() <= MAX_QUALIFIED_NAME_BYTES && QualifiedName::try_new(value).is_ok()
            }
            CanonicalKeyKind::PropertyObject => is_valid_property_object_key(value),
        };
        if valid {
            Ok(())
        } else {
            Err(E::custom(match self.kind {
                CanonicalKeyKind::QualifiedProperty => {
                    "pending-format property name violates its bounded qualified-name grammar"
                }
                CanonicalKeyKind::PropertyObject => {
                    "pending-format property-object key violates its bounded grammar"
                }
            }))
        }
    }
}

fn is_valid_property_object_key(key: &str) -> bool {
    if key.is_empty() || key.len() > MAX_PROPERTY_OBJECT_KEY_BYTES {
        return false;
    }
    let mut bytes = key.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == b'_')
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn require_canonical_order(
    previous: Option<&str>,
    current: &str,
    diagnostic: &'static str,
) -> Result<(), &'static str> {
    if previous.is_some_and(|previous| previous >= current) { Err(diagnostic) } else { Ok(()) }
}

#[derive(Clone, Copy)]
struct PendingFormatLimit {
    description: &'static str,
    actual: u64,
    maximum: u64,
}

impl fmt::Display for PendingFormatLimit {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "pending-format allocation preflight rejected {} {}; ceiling is {}",
            self.description, self.actual, self.maximum
        )
    }
}

const fn require_limit(
    description: &'static str,
    actual: u64,
    maximum: u64,
) -> Result<(), PendingFormatLimit> {
    if actual > maximum { Err(PendingFormatLimit { description, actual, maximum }) } else { Ok(()) }
}

fn as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        schema::{CompiledSchema, DocumentLimits},
        state::EditorContext,
    };

    use super::preflight_pending_format_records_v2;

    #[test]
    fn exact_limits_are_accepted_and_first_excess_is_rejected() {
        let context = EditorContext::new(
            CompiledSchema::breditor_base(),
            DocumentLimits::default()
                .with_max_formats_per_text(1)
                .with_max_properties_per_owner(1)
                .with_max_property_depth(1)
                .with_max_property_values(2)
                .with_max_property_string_bytes(2)
                .with_max_total_property_string_bytes(2),
        );
        let exact = r#"[{"type":"example/link","properties":{"example/value":["ab"]}}]"#;
        assert!(preflight_pending_format_records_v2(exact, &context).is_ok());

        for excess in [
            r#"[{"type":"example/a","properties":{}},{"type":"example/b","properties":{}}]"#,
            r#"[{"type":"example/link","properties":{"example/a":true,"example/b":false}}]"#,
            r#"[{"type":"example/link","properties":{"example/value":[[true]]}}]"#,
            r#"[{"type":"example/link","properties":{"example/value":[true,false]}}]"#,
            r#"[{"type":"example/link","properties":{"example/value":"abc"}}]"#,
        ] {
            assert!(preflight_pending_format_records_v2(excess, &context).is_err());
        }
    }

    #[test]
    fn diagnostics_never_echo_property_names_or_values() -> Result<(), Box<dyn Error>> {
        let context = EditorContext::default();
        for hostile in [
            r#"[{"type":"example/link","properties":{"SECRET INVALID":true}}]"#,
            r#"[{"type":"example/link","properties":{"secret/z":true,"secret/a":false}}]"#,
            r#"[{"type":"example/link","properties":{"secret/key":true,"secret/key":false}}]"#,
            r#"[{"type":"example/link","properties":{"example/value":{"SECRET INVALID":true}}}]"#,
            r#"[{"type":"example/link","properties":{"example/value":9007199254740992}}]"#,
        ] {
            let error = preflight_pending_format_records_v2(hostile, &context)
                .err()
                .ok_or("hostile pending-format payload must fail preflight")?;
            let diagnostic = error.to_string();
            assert!(!diagnostic.contains("SECRET"));
            assert!(!diagnostic.contains("secret/"));
            assert!(!diagnostic.contains("9007199254740992"));
        }
        Ok(())
    }
}
