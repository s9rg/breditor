use std::{collections::BTreeMap, sync::Arc};

use thiserror::Error;

use crate::identity::QualifiedName;

use super::PropertyMapError;

/// Largest positive integer that every JavaScript number represents exactly.
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// Smallest negative integer that every JavaScript number represents exactly.
pub const MIN_SAFE_INTEGER: i64 = -MAX_SAFE_INTEGER;

/// Maximum UTF-8 bytes in one nested property-object key.
pub(crate) const MAX_PROPERTY_OBJECT_KEY_BYTES: usize = 128;

/// An integer represented exactly by both Rust `i64` and JavaScript `number`.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PropertyInteger(i64);

impl PropertyInteger {
    /// Validates a cross-language property integer.
    ///
    /// # Errors
    ///
    /// Returns [`PropertyIntegerError`] when `value` is outside the inclusive
    /// JavaScript-safe range.
    pub const fn try_new(value: i64) -> Result<Self, PropertyIntegerError> {
        if value < MIN_SAFE_INTEGER {
            Err(PropertyIntegerError::BelowMinimum { value })
        } else if value > MAX_SAFE_INTEGER {
            Err(PropertyIntegerError::AboveMaximum { value })
        } else {
            Ok(Self(value))
        }
    }

    /// Returns the validated integer.
    #[must_use]
    pub const fn get(self) -> i64 {
        self.0
    }
}

/// Why an integer cannot be used as a deterministic property value.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum PropertyIntegerError {
    /// The integer is below [`MIN_SAFE_INTEGER`].
    #[error("property integer {value} is below the minimum safe integer {MIN_SAFE_INTEGER}")]
    BelowMinimum {
        /// Rejected integer.
        value: i64,
    },
    /// The integer exceeds [`MAX_SAFE_INTEGER`].
    #[error("property integer {value} exceeds the maximum safe integer {MAX_SAFE_INTEGER}")]
    AboveMaximum {
        /// Rejected integer.
        value: i64,
    },
}

/// A deterministic property value shared by Rust, Wasm, and TypeScript.
///
/// Numeric values are limited to exactly representable JavaScript integers.
/// Exact decimals and larger numeric domains should use schema-validated strings.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyValue(PropertyValueInner);

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum PropertyValueInner {
    Null,
    Boolean(bool),
    Integer(PropertyInteger),
    String(Arc<str>),
    Array(Arc<[PropertyValue]>),
    Object(PropertyObject),
}

/// The data variant stored by a [`PropertyValue`].
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum PropertyValueKind {
    /// JSON null.
    Null,
    /// A Boolean value.
    Boolean,
    /// A cross-language exact integer.
    Integer,
    /// A Unicode string.
    String,
    /// An immutable ordered list.
    Array,
    /// An immutable canonical object.
    Object,
}

impl PropertyValue {
    /// Creates JSON null.
    #[must_use]
    pub const fn null() -> Self {
        Self(PropertyValueInner::Null)
    }

    /// Creates a Boolean property value.
    #[must_use]
    pub const fn boolean(value: bool) -> Self {
        Self(PropertyValueInner::Boolean(value))
    }

    /// Creates an already validated integer property value.
    #[must_use]
    pub const fn from_integer(value: PropertyInteger) -> Self {
        Self(PropertyValueInner::Integer(value))
    }

    /// Creates a Unicode string property value without normalization.
    #[must_use]
    pub fn from_string(value: impl AsRef<str>) -> Self {
        Self(PropertyValueInner::String(Arc::from(value.as_ref())))
    }

    /// Returns the stored data variant.
    #[must_use]
    pub const fn kind(&self) -> PropertyValueKind {
        match self.0 {
            PropertyValueInner::Null => PropertyValueKind::Null,
            PropertyValueInner::Boolean(_) => PropertyValueKind::Boolean,
            PropertyValueInner::Integer(_) => PropertyValueKind::Integer,
            PropertyValueInner::String(_) => PropertyValueKind::String,
            PropertyValueInner::Array(_) => PropertyValueKind::Array,
            PropertyValueInner::Object(_) => PropertyValueKind::Object,
        }
    }

    /// Returns the Boolean payload, if present.
    #[must_use]
    pub const fn as_boolean(&self) -> Option<bool> {
        match self.0 {
            PropertyValueInner::Boolean(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the exact integer payload, if present.
    #[must_use]
    pub const fn as_integer(&self) -> Option<PropertyInteger> {
        match self.0 {
            PropertyValueInner::Integer(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the string payload, if present.
    #[must_use]
    pub fn as_string(&self) -> Option<&str> {
        match &self.0 {
            PropertyValueInner::String(value) => Some(value),
            _ => None,
        }
    }

    /// Returns the array payload, if present.
    #[must_use]
    pub fn as_array(&self) -> Option<&[Self]> {
        match &self.0 {
            PropertyValueInner::Array(values) => Some(values),
            _ => None,
        }
    }

    /// Returns the object payload, if present.
    #[must_use]
    pub const fn as_object(&self) -> Option<&PropertyObject> {
        match &self.0 {
            PropertyValueInner::Object(values) => Some(values),
            _ => None,
        }
    }

    pub(crate) fn array(values: Vec<Self>) -> Self {
        Self(PropertyValueInner::Array(Arc::from(values)))
    }

    pub(crate) fn object(values: PropertyObject) -> Self {
        Self(PropertyValueInner::Object(values))
    }

    pub(crate) const fn inner(&self) -> &PropertyValueInner {
        &self.0
    }
}

/// An immutable nested property object.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PropertyObject(Arc<BTreeMap<String, PropertyValue>>);

impl PropertyObject {
    /// Returns the number of keys.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether this object contains no keys.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Looks up a value by its exact key.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&PropertyValue> {
        self.0.get(key)
    }

    /// Iterates over keys and values in canonical ascending key order.
    #[must_use]
    pub fn iter(&self) -> PropertyObjectIter<'_> {
        PropertyObjectIter(self.0.iter())
    }

    pub(crate) fn try_from_map(
        values: BTreeMap<String, PropertyValue>,
    ) -> Result<Self, crate::document::LocalInvariantError> {
        if let Some(key) = values.keys().find(|key| !is_valid_object_key(key)) {
            return Err(crate::document::LocalInvariantError::InvalidPropertyObjectKey {
                key: key.clone(),
            });
        }
        Ok(Self(Arc::new(values)))
    }
}

fn is_valid_object_key(key: &str) -> bool {
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

/// An iterator over an immutable nested property object.
pub struct PropertyObjectIter<'a>(std::collections::btree_map::Iter<'a, String, PropertyValue>);

impl<'a> Iterator for PropertyObjectIter<'a> {
    type Item = (&'a str, &'a PropertyValue);

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(key, value)| (key.as_str(), value))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl ExactSizeIterator for PropertyObjectIter<'_> {}
impl std::iter::FusedIterator for PropertyObjectIter<'_> {}

impl<'a> IntoIterator for &'a PropertyObject {
    type Item = (&'a str, &'a PropertyValue);
    type IntoIter = PropertyObjectIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Immutable namespaced properties attached to an element or format.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PropertyMap(Arc<BTreeMap<QualifiedName, PropertyValue>>);

impl PropertyMap {
    /// Constructs a map from entries already in strict canonical name order.
    ///
    /// This boundary deliberately does not sort or overwrite caller input, so
    /// a duplicate or noncanonical sequence cannot be hidden before signing,
    /// replay, or persistence code observes it.
    ///
    /// # Errors
    ///
    /// Returns [`PropertyMapError`] at the first adjacent duplicate or order
    /// inversion.
    pub fn try_from_sorted(
        values: Vec<(QualifiedName, PropertyValue)>,
    ) -> Result<Self, PropertyMapError> {
        for pair in values.windows(2) {
            match pair[0].0.cmp(&pair[1].0) {
                std::cmp::Ordering::Less => {}
                std::cmp::Ordering::Equal => {
                    return Err(PropertyMapError::DuplicateProperty { name: pair[0].0.clone() });
                }
                std::cmp::Ordering::Greater => {
                    return Err(PropertyMapError::NonCanonicalOrder {
                        previous: pair[0].0.clone(),
                        current: pair[1].0.clone(),
                    });
                }
            }
        }
        Ok(Self::from_map(values.into_iter().collect()))
    }

    /// Returns the number of properties.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether this map contains no properties.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Looks up a property by its qualified name.
    #[must_use]
    pub fn get(&self, name: &QualifiedName) -> Option<&PropertyValue> {
        self.0.get(name)
    }

    /// Iterates over properties in canonical ascending name order.
    #[must_use]
    pub fn iter(&self) -> PropertyMapIter<'_> {
        PropertyMapIter(self.0.iter())
    }

    pub(crate) fn from_map(values: BTreeMap<QualifiedName, PropertyValue>) -> Self {
        Self(Arc::new(values))
    }
}

/// An iterator over immutable namespaced properties.
pub struct PropertyMapIter<'a>(std::collections::btree_map::Iter<'a, QualifiedName, PropertyValue>);

impl<'a> Iterator for PropertyMapIter<'a> {
    type Item = (&'a QualifiedName, &'a PropertyValue);

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl ExactSizeIterator for PropertyMapIter<'_> {}
impl std::iter::FusedIterator for PropertyMapIter<'_> {}

impl<'a> IntoIterator for &'a PropertyMap {
    type Item = (&'a QualifiedName, &'a PropertyValue);
    type IntoIter = PropertyMapIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
