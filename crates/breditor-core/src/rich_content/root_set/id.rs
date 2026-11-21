//! Stable root identity and bounded host metadata.

use super::RichRootSetError;
use std::collections::BTreeMap;

/// Maximum roots in one set.
pub const RICH_ROOTS_MAX: usize = 64;
/// Maximum UTF-8 bytes of a root id (and of an attribute key).
pub const RICH_ROOT_ID_MAX_BYTES: usize = 64;
/// Maximum UTF-8 bytes of a root's accessible label.
pub const RICH_ROOT_LABEL_MAX_BYTES: usize = 256;
/// Maximum attributes per root.
pub const RICH_ROOT_ATTRIBUTES_MAX: usize = 32;
/// Maximum UTF-8 bytes of one attribute value.
pub const RICH_ROOT_ATTRIBUTE_VALUE_MAX_BYTES: usize = 1024;

/// Stable, immutable root name, e.g. `header`, `content`, `sidebar`.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RichRootId(String);

impl RichRootId {
    /// Admit `[A-Za-z][A-Za-z0-9_-]{0,63}`.
    ///
    /// # Errors
    /// Rejects anything else.
    pub fn try_new(value: &str) -> Result<Self, RichRootSetError> {
        if key(value) { Ok(Self(value.to_owned())) } else { Err(RichRootSetError::InvalidRootId) }
    }
    /// The id text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub(super) fn key(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= RICH_ROOT_ID_MAX_BYTES
        && bytes[0].is_ascii_alphabetic()
        && bytes.iter().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn text(value: &str, max: usize) -> bool {
    value.len() <= max && !value.chars().any(char::is_control)
}

/// Identity plus presentation/host metadata; never part of a root document or its history.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichRootMeta {
    id: RichRootId,
    label: Option<String>,
    attributes: BTreeMap<String, String>,
}

impl RichRootMeta {
    /// Admit bounded metadata.
    ///
    /// # Errors
    /// Rejects oversized/control-character labels or values, invalid keys or too many attributes.
    pub fn try_new(
        id: RichRootId,
        label: Option<String>,
        attributes: BTreeMap<String, String>,
    ) -> Result<Self, RichRootSetError> {
        if label.as_deref().is_some_and(|label| !text(label, RICH_ROOT_LABEL_MAX_BYTES)) {
            return Err(RichRootSetError::InvalidMetadata);
        }
        check_attributes(&attributes)?;
        Ok(Self { id, label, attributes })
    }
    /// Identity only, no label or attributes.
    #[must_use]
    pub const fn bare(id: RichRootId) -> Self {
        Self { id, label: None, attributes: BTreeMap::new() }
    }
    /// Stable root id.
    #[must_use]
    pub const fn id(&self) -> &RichRootId {
        &self.id
    }
    /// Accessible surface label.
    #[must_use]
    pub fn label(&self) -> Option<&str> {
        self.label.as_deref()
    }
    /// Host attributes (e.g. `order`, `section`), persisted with the set checkpoint.
    #[must_use]
    pub const fn attributes(&self) -> &BTreeMap<String, String> {
        &self.attributes
    }
    pub(super) fn set_attributes(
        &mut self,
        attributes: BTreeMap<String, String>,
    ) -> Result<(), RichRootSetError> {
        check_attributes(&attributes)?;
        self.attributes = attributes;
        Ok(())
    }
}

fn check_attributes(attributes: &BTreeMap<String, String>) -> Result<(), RichRootSetError> {
    if attributes.len() > RICH_ROOT_ATTRIBUTES_MAX
        || attributes
            .iter()
            .any(|(name, value)| !key(name) || !text(value, RICH_ROOT_ATTRIBUTE_VALUE_MAX_BYTES))
    {
        return Err(RichRootSetError::InvalidMetadata);
    }
    Ok(())
}
