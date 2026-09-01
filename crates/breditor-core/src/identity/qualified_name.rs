use std::{fmt, str::FromStr, sync::Arc};

use thiserror::Error;

/// Maximum encoded length of a qualified name.
pub const MAX_QUALIFIED_NAME_BYTES: usize = 128;

/// Identifies one side of a [`QualifiedName`].
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum NamePart {
    /// The namespace before `/`.
    Namespace,
    /// The local name after `/`.
    LocalName,
}

impl fmt::Display for NamePart {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Namespace => "namespace",
            Self::LocalName => "local name",
        })
    }
}

/// A validated `namespace/local-name` identifier.
///
/// Both parts are lowercase ASCII, begin with a letter, and may continue with
/// lowercase letters, digits, `.`, `_`, or `-`.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct QualifiedName(Arc<str>);

impl QualifiedName {
    /// Validates and creates a qualified name.
    ///
    /// # Errors
    ///
    /// Returns [`QualifiedNameError`] when `value` violates the grammar or size
    /// limit.
    pub fn try_new(value: impl AsRef<str>) -> Result<Self, QualifiedNameError> {
        let value = value.as_ref();
        validate_qualified_name(value)?;
        Ok(Self(Arc::from(value)))
    }

    /// Returns the complete encoded name.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Returns the namespace before `/`.
    #[must_use]
    pub fn namespace(&self) -> &str {
        let Some((namespace, _)) = self.as_str().split_once('/') else {
            unreachable!("a QualifiedName is validated at construction")
        };
        namespace
    }

    /// Returns the local name after `/`.
    #[must_use]
    pub fn local_name(&self) -> &str {
        let Some((_, local_name)) = self.as_str().split_once('/') else {
            unreachable!("a QualifiedName is validated at construction")
        };
        local_name
    }

    pub(crate) fn from_known_static(value: &'static str) -> Self {
        debug_assert!(validate_qualified_name(value).is_ok());
        Self(Arc::from(value))
    }
}

impl AsRef<str> for QualifiedName {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Debug for QualifiedName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("QualifiedName").field(&self.as_str()).finish()
    }
}

impl fmt::Display for QualifiedName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for QualifiedName {
    type Err = QualifiedNameError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::try_new(value)
    }
}

impl TryFrom<String> for QualifiedName {
    type Error = QualifiedNameError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_qualified_name(&value)?;
        Ok(Self(Arc::from(value)))
    }
}

/// Why a string could not become a [`QualifiedName`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum QualifiedNameError {
    /// The complete name is empty.
    #[error("a qualified name cannot be empty")]
    Empty,
    /// The encoded name exceeds the protocol limit.
    #[error("qualified name is {actual} bytes; the limit is {maximum}")]
    TooLong {
        /// Actual encoded length.
        actual: usize,
        /// Maximum accepted encoded length.
        maximum: usize,
    },
    /// No namespace separator was present.
    #[error("qualified name must contain one `/` separator")]
    MissingSeparator,
    /// More than one namespace separator was present.
    #[error("qualified name must contain exactly one `/` separator")]
    MultipleSeparators,
    /// A namespace or local name was empty.
    #[error("qualified-name {part} cannot be empty")]
    EmptyPart {
        /// The invalid side of the name.
        part: NamePart,
    },
    /// A namespace or local name did not begin with an ASCII lowercase letter.
    #[error("qualified-name {part} must begin with an ASCII lowercase letter")]
    InvalidStart {
        /// The invalid side of the name.
        part: NamePart,
    },
    /// A namespace or local name contained an unsupported character.
    #[error("qualified-name {part} has invalid character `{character}` at byte {byte_index}")]
    InvalidCharacter {
        /// The invalid side of the name.
        part: NamePart,
        /// Byte index within that side of the name.
        byte_index: usize,
        /// The unsupported character.
        character: char,
    },
}

fn validate_qualified_name(value: &str) -> Result<(), QualifiedNameError> {
    if value.is_empty() {
        return Err(QualifiedNameError::Empty);
    }
    if value.len() > MAX_QUALIFIED_NAME_BYTES {
        return Err(QualifiedNameError::TooLong {
            actual: value.len(),
            maximum: MAX_QUALIFIED_NAME_BYTES,
        });
    }

    let Some((namespace, local_name)) = value.split_once('/') else {
        return Err(QualifiedNameError::MissingSeparator);
    };
    if local_name.contains('/') {
        return Err(QualifiedNameError::MultipleSeparators);
    }

    validate_part(namespace, NamePart::Namespace)?;
    validate_part(local_name, NamePart::LocalName)
}

fn validate_part(value: &str, part: NamePart) -> Result<(), QualifiedNameError> {
    let mut characters = value.char_indices();
    let Some((_, first)) = characters.next() else {
        return Err(QualifiedNameError::EmptyPart { part });
    };
    if !first.is_ascii_lowercase() {
        return Err(QualifiedNameError::InvalidStart { part });
    }

    for (byte_index, character) in characters {
        if !(character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '.' | '_' | '-'))
        {
            return Err(QualifiedNameError::InvalidCharacter { part, byte_index, character });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{QualifiedName, QualifiedNameError};

    #[test]
    fn accepts_the_protocol_grammar() -> Result<(), QualifiedNameError> {
        let name = QualifiedName::try_new("breditor/table-cell_v2")?;
        assert_eq!(name.namespace(), "breditor");
        assert_eq!(name.local_name(), "table-cell_v2");
        Ok(())
    }

    #[test]
    fn rejects_multiple_separators() {
        assert_eq!(
            QualifiedName::try_new("breditor/table/cell"),
            Err(QualifiedNameError::MultipleSeparators)
        );
    }
}
