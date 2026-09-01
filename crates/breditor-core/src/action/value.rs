use std::{collections::BTreeMap, sync::Arc};

use crate::document::PropertyInteger;

use super::error::ActionValueError;

/// Maximum nesting depth of one action value.
pub const MAX_ACTION_VALUE_DEPTH: u16 = 16;
/// Maximum scalar and container values in one action-value tree.
pub const MAX_ACTION_VALUE_COUNT: u32 = 1_024;
/// Maximum direct entries in one action-value array or object.
pub const MAX_ACTION_VALUE_CONTAINER_ENTRIES: usize = 256;
/// Maximum aggregate UTF-8 bytes in string payloads and object keys.
pub const MAX_ACTION_VALUE_TEXT_BYTES: u64 = 65_536;
/// Maximum UTF-8 byte length of one action-value object key.
pub const MAX_ACTION_VALUE_OBJECT_KEY_BYTES: usize = 128;

/// Cached fixed-width resource measurements for one immutable action value.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ActionValueSummary {
    max_depth: u16,
    value_count: u32,
    text_bytes: u64,
}

impl ActionValueSummary {
    /// Returns the maximum container nesting depth; scalar depth is zero.
    #[must_use]
    pub const fn max_depth(self) -> u16 {
        self.max_depth
    }

    /// Returns the number of scalar and container values.
    #[must_use]
    pub const fn value_count(self) -> u32 {
        self.value_count
    }

    /// Returns aggregate UTF-8 bytes in strings and object keys.
    #[must_use]
    pub const fn text_bytes(self) -> u64 {
        self.text_bytes
    }
}

/// Structural variant stored by an [`ActionValue`].
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum ActionValueKind {
    /// JSON-compatible null.
    Null,
    /// Boolean.
    Boolean,
    /// Exactly representable JavaScript integer.
    Integer,
    /// Unicode string.
    String,
    /// Canonical immutable array.
    Array,
    /// Canonical immutable object.
    Object,
}

/// Stable bounded data shared by Rust actions and future Wasm adapters.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionValue {
    inner: ActionValueInner,
    summary: ActionValueSummary,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ActionValueInner {
    Null,
    Boolean(bool),
    Integer(PropertyInteger),
    String(Arc<str>),
    Array(Arc<[ActionValue]>),
    Object(ActionObject),
}

impl ActionValue {
    /// Creates null.
    #[must_use]
    pub const fn null() -> Self {
        Self { inner: ActionValueInner::Null, summary: scalar_summary(0) }
    }

    /// Creates a Boolean value.
    #[must_use]
    pub const fn boolean(value: bool) -> Self {
        Self { inner: ActionValueInner::Boolean(value), summary: scalar_summary(0) }
    }

    /// Creates a cross-language exact integer.
    #[must_use]
    pub const fn from_integer(value: PropertyInteger) -> Self {
        Self { inner: ActionValueInner::Integer(value), summary: scalar_summary(0) }
    }

    /// Creates a bounded Unicode string without normalization.
    ///
    /// # Errors
    ///
    /// Returns [`ActionValueError`] when the string exceeds the fixed aggregate
    /// text budget by itself.
    pub fn try_from_string(value: impl AsRef<str>) -> Result<Self, ActionValueError> {
        let value = value.as_ref();
        let text_bytes = usize_to_u64(value.len());
        ensure_text_bytes(text_bytes)?;
        Ok(Self {
            inner: ActionValueInner::String(Arc::from(value)),
            summary: scalar_summary(text_bytes),
        })
    }

    /// Creates a canonical bounded immutable array.
    ///
    /// # Errors
    ///
    /// Returns [`ActionValueError`] when the direct entry count or combined tree
    /// measurements exceed a fixed action-input limit.
    pub fn try_array(values: Vec<Self>) -> Result<Self, ActionValueError> {
        ensure_container_entries(values.len())?;
        let summary = container_summary(values.iter().map(|value| (0_u64, value.summary)))?;
        Ok(Self { inner: ActionValueInner::Array(Arc::from(values)), summary })
    }

    /// Creates a canonical bounded immutable object from unordered entries.
    ///
    /// Keys are validated and sorted lexically. Duplicate keys are rejected
    /// instead of overwriting one another.
    ///
    /// # Errors
    ///
    /// Returns [`ActionValueError`] for an invalid/duplicate key or any fixed
    /// container/tree resource-limit violation.
    pub fn try_object(mut entries: Vec<(String, Self)>) -> Result<Self, ActionValueError> {
        ensure_container_entries(entries.len())?;
        entries.sort_by(|left, right| left.0.cmp(&right.0));
        for (key, _) in &entries {
            validate_object_key(key)?;
        }
        if let Some(pair) = entries.windows(2).find(|pair| pair[0].0 == pair[1].0) {
            return Err(ActionValueError::DuplicateObjectKey { key: pair[0].0.clone() });
        }

        let summary = container_summary(
            entries.iter().map(|(key, value)| (usize_to_u64(key.len()), value.summary)),
        )?;
        let values = entries.into_iter().collect::<BTreeMap<_, _>>();
        Ok(Self { inner: ActionValueInner::Object(ActionObject(Arc::new(values))), summary })
    }

    /// Returns the stored structural variant.
    #[must_use]
    pub const fn kind(&self) -> ActionValueKind {
        match self.inner {
            ActionValueInner::Null => ActionValueKind::Null,
            ActionValueInner::Boolean(_) => ActionValueKind::Boolean,
            ActionValueInner::Integer(_) => ActionValueKind::Integer,
            ActionValueInner::String(_) => ActionValueKind::String,
            ActionValueInner::Array(_) => ActionValueKind::Array,
            ActionValueInner::Object(_) => ActionValueKind::Object,
        }
    }

    /// Returns cached resource measurements.
    #[must_use]
    pub const fn summary(&self) -> ActionValueSummary {
        self.summary
    }

    /// Returns the Boolean payload, if present.
    #[must_use]
    pub const fn as_boolean(&self) -> Option<bool> {
        match self.inner {
            ActionValueInner::Boolean(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the integer payload, if present.
    #[must_use]
    pub const fn as_integer(&self) -> Option<PropertyInteger> {
        match self.inner {
            ActionValueInner::Integer(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the string payload, if present.
    #[must_use]
    pub fn as_string(&self) -> Option<&str> {
        match &self.inner {
            ActionValueInner::String(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the array payload, if present.
    #[must_use]
    pub fn as_array(&self) -> Option<&[Self]> {
        match &self.inner {
            ActionValueInner::Array(values) => Some(values),
            _ => None,
        }
    }

    /// Returns the canonical object payload, if present.
    #[must_use]
    pub const fn as_object(&self) -> Option<&ActionObject> {
        match &self.inner {
            ActionValueInner::Object(value) => Some(value),
            _ => None,
        }
    }
}

/// Immutable action-value object with canonical lexical key order.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ActionObject(Arc<BTreeMap<String, ActionValue>>);

impl ActionObject {
    /// Returns the number of direct fields.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether the object contains no fields.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Looks up one exact field name.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&ActionValue> {
        self.0.get(key)
    }

    /// Iterates fields in canonical lexical key order.
    #[must_use]
    pub fn iter(&self) -> ActionObjectIter<'_> {
        ActionObjectIter(self.0.iter())
    }
}

/// Iterator over a canonical [`ActionObject`].
pub struct ActionObjectIter<'a>(std::collections::btree_map::Iter<'a, String, ActionValue>);

impl<'a> Iterator for ActionObjectIter<'a> {
    type Item = (&'a str, &'a ActionValue);

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(key, value)| (key.as_str(), value))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl DoubleEndedIterator for ActionObjectIter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.0.next_back().map(|(key, value)| (key.as_str(), value))
    }
}

impl ExactSizeIterator for ActionObjectIter<'_> {}
impl std::iter::FusedIterator for ActionObjectIter<'_> {}

impl<'a> IntoIterator for &'a ActionObject {
    type Item = (&'a str, &'a ActionValue);
    type IntoIter = ActionObjectIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

const fn scalar_summary(text_bytes: u64) -> ActionValueSummary {
    ActionValueSummary { max_depth: 0, value_count: 1, text_bytes }
}

fn container_summary(
    children: impl Iterator<Item = (u64, ActionValueSummary)>,
) -> Result<ActionValueSummary, ActionValueError> {
    let mut summary = ActionValueSummary { max_depth: 1, value_count: 1, text_bytes: 0 };
    for (key_bytes, child) in children {
        summary.max_depth = summary.max_depth.max(child.max_depth.saturating_add(1));
        summary.value_count = summary.value_count.saturating_add(child.value_count);
        summary.text_bytes =
            summary.text_bytes.saturating_add(key_bytes).saturating_add(child.text_bytes);
    }
    if summary.max_depth > MAX_ACTION_VALUE_DEPTH {
        return Err(ActionValueError::Depth {
            actual: summary.max_depth,
            maximum: MAX_ACTION_VALUE_DEPTH,
        });
    }
    if summary.value_count > MAX_ACTION_VALUE_COUNT {
        return Err(ActionValueError::ValueCount {
            actual: summary.value_count,
            maximum: MAX_ACTION_VALUE_COUNT,
        });
    }
    ensure_text_bytes(summary.text_bytes)?;
    Ok(summary)
}

fn ensure_container_entries(actual: usize) -> Result<(), ActionValueError> {
    if actual > MAX_ACTION_VALUE_CONTAINER_ENTRIES {
        Err(ActionValueError::ContainerEntries {
            actual,
            maximum: MAX_ACTION_VALUE_CONTAINER_ENTRIES,
        })
    } else {
        Ok(())
    }
}

fn ensure_text_bytes(actual: u64) -> Result<(), ActionValueError> {
    if actual > MAX_ACTION_VALUE_TEXT_BYTES {
        Err(ActionValueError::TextBytes { actual, maximum: MAX_ACTION_VALUE_TEXT_BYTES })
    } else {
        Ok(())
    }
}

fn validate_object_key(key: &str) -> Result<(), ActionValueError> {
    if key.is_empty() {
        return Err(ActionValueError::EmptyObjectKey);
    }
    if key.len() > MAX_ACTION_VALUE_OBJECT_KEY_BYTES {
        return Err(ActionValueError::ObjectKeyTooLong {
            actual: key.len(),
            maximum: MAX_ACTION_VALUE_OBJECT_KEY_BYTES,
        });
    }
    let mut characters = key.char_indices();
    let Some((_, first)) = characters.next() else {
        return Err(ActionValueError::EmptyObjectKey);
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(ActionValueError::InvalidObjectKeyStart { key: key.to_owned() });
    }
    for (byte_index, character) in characters {
        if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')) {
            return Err(ActionValueError::InvalidObjectKeyCharacter {
                key: key.to_owned(),
                byte_index,
                character,
            });
        }
    }
    Ok(())
}

fn usize_to_u64(value: usize) -> u64 {
    let Ok(converted) = u64::try_from(value) else {
        return u64::MAX;
    };
    converted
}
