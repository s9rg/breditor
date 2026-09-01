use std::{fmt, str::FromStr, sync::Arc};

use thiserror::Error;

/// Maximum encoded length of a semantic entity identity.
pub const MAX_ENTITY_ID_BYTES: usize = 128;

/// An opaque, caller-supplied identity persisted on a semantic element.
///
/// This is not a runtime node key. The deterministic core never generates an
/// entity ID from time or randomness.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct EntityId(Arc<str>);

impl EntityId {
    /// Validates and creates an entity identity.
    ///
    /// # Errors
    ///
    /// Returns [`EntityIdError`] if `value` is empty, too large, or contains a
    /// character outside the opaque-ID grammar.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, EntityIdError> {
        let value = value.as_ref();
        validate_entity_id(value)?;
        Ok(Self(Arc::from(value)))
    }

    /// Returns the encoded identity.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for EntityId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for EntityId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("EntityId").field(&self.as_str()).finish()
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for EntityId {
    type Err = EntityIdError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for EntityId {
    type Error = EntityIdError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_entity_id(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

/// Why a string could not become an [`EntityId`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum EntityIdError {
    /// The identity is empty.
    #[error("an entity ID cannot be empty")]
    Empty,
    /// The encoded identity exceeds the protocol limit.
    #[error("entity ID is {actual} bytes; the limit is {maximum}")]
    TooLong {
        /// Actual encoded length.
        actual: usize,
        /// Maximum accepted encoded length.
        maximum: usize,
    },
    /// The first character is not ASCII alphanumeric.
    #[error("an entity ID must begin with an ASCII letter or digit")]
    InvalidStart,
    /// The identity contains an unsupported character.
    #[error("entity ID has invalid character `{character}` at byte {byte_index}")]
    InvalidCharacter {
        /// Byte index within the identity.
        byte_index: usize,
        /// The unsupported character.
        character: char,
    },
}

fn validate_entity_id(value: &str) -> Result<(), EntityIdError> {
    if value.is_empty() {
        return Err(EntityIdError::Empty);
    }
    if value.len() > MAX_ENTITY_ID_BYTES {
        return Err(EntityIdError::TooLong { actual: value.len(), maximum: MAX_ENTITY_ID_BYTES });
    }

    let mut characters = value.char_indices();
    let Some((_, first)) = characters.next() else {
        return Err(EntityIdError::Empty);
    };
    if !first.is_ascii_alphanumeric() {
        return Err(EntityIdError::InvalidStart);
    }
    for (byte_index, character) in characters {
        if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | ':' | '-')) {
            return Err(EntityIdError::InvalidCharacter { byte_index, character });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{EntityId, EntityIdError};

    #[test]
    fn accepts_opaque_caller_ids() -> Result<(), EntityIdError> {
        let identity = EntityId::try_new("upload:01JX_test-value")?;
        assert_eq!(identity.as_str(), "upload:01JX_test-value");
        Ok(())
    }

    #[test]
    fn rejects_whitespace() {
        assert!(matches!(
            EntityId::try_new("image 1"),
            Err(EntityIdError::InvalidCharacter { .. })
        ));
    }
}
