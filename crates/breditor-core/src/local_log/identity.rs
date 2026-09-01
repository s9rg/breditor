use thiserror::Error;

/// Maximum encoded length of one caller-supplied local-log identity.
pub const MAX_LOCAL_LOG_IDENTITY_BYTES: usize = 128;

/// Stable machine-readable category for [`LocalLogIdentityError`].
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogIdentityErrorCode {
    /// The identity is empty.
    Empty,
    /// The identity exceeds the byte limit.
    TooLong,
    /// The first character is outside the grammar.
    InvalidStart,
    /// A later character is outside the grammar.
    InvalidCharacter,
}

impl LocalLogIdentityErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Empty => "local_log_identity.empty",
            Self::TooLong => "local_log_identity.too_long",
            Self::InvalidStart => "local_log_identity.invalid_start",
            Self::InvalidCharacter => "local_log_identity.invalid_character",
        }
    }
}

/// Why a caller-supplied local-log identity is not portable.
///
/// All local-log identity types share the exact grammar
/// `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. The limit is measured in encoded
/// bytes; every accepted character is ASCII and therefore occupies one byte.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum LocalLogIdentityError {
    /// The identity is empty.
    #[error("a local-log identity cannot be empty")]
    Empty,
    /// The encoded identity exceeds the fixed portable limit.
    #[error("local-log identity is {actual} bytes; the limit is {maximum}")]
    TooLong {
        /// Actual encoded length.
        actual: usize,
        /// Maximum accepted encoded length.
        maximum: usize,
    },
    /// The first character is not an ASCII letter or digit.
    #[error("a local-log identity must begin with an ASCII letter or digit")]
    InvalidStart,
    /// A character is outside the portable opaque-ID grammar.
    #[error("local-log identity has invalid character `{character}` at byte {byte_index}")]
    InvalidCharacter {
        /// Byte position of the rejected character.
        byte_index: usize,
        /// Rejected character.
        character: char,
    },
}

impl LocalLogIdentityError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogIdentityErrorCode {
        match self {
            Self::Empty => LocalLogIdentityErrorCode::Empty,
            Self::TooLong { .. } => LocalLogIdentityErrorCode::TooLong,
            Self::InvalidStart => LocalLogIdentityErrorCode::InvalidStart,
            Self::InvalidCharacter { .. } => LocalLogIdentityErrorCode::InvalidCharacter,
        }
    }
}

pub(super) fn validate_local_log_identity(value: &str) -> Result<(), LocalLogIdentityError> {
    if value.is_empty() {
        return Err(LocalLogIdentityError::Empty);
    }
    if value.len() > MAX_LOCAL_LOG_IDENTITY_BYTES {
        return Err(LocalLogIdentityError::TooLong {
            actual: value.len(),
            maximum: MAX_LOCAL_LOG_IDENTITY_BYTES,
        });
    }

    let mut characters = value.char_indices();
    let Some((_, first)) = characters.next() else {
        return Err(LocalLogIdentityError::Empty);
    };
    if !first.is_ascii_alphanumeric() {
        return Err(LocalLogIdentityError::InvalidStart);
    }

    for (byte_index, character) in characters {
        if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | ':' | '-')) {
            return Err(LocalLogIdentityError::InvalidCharacter { byte_index, character });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogIdentityError, LocalLogIdentityErrorCode, MAX_LOCAL_LOG_IDENTITY_BYTES,
        validate_local_log_identity,
    };

    #[test]
    fn accepts_the_exact_portable_ascii_grammar() {
        assert_eq!(validate_local_log_identity("A0._:-z9"), Ok(()));
        assert_eq!(validate_local_log_identity(&"a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES)), Ok(()));
    }

    #[test]
    fn rejects_each_identity_contract_violation() {
        assert_eq!(validate_local_log_identity(""), Err(LocalLogIdentityError::Empty));
        assert_eq!(
            validate_local_log_identity(&"a".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1)),
            Err(LocalLogIdentityError::TooLong {
                actual: MAX_LOCAL_LOG_IDENTITY_BYTES + 1,
                maximum: MAX_LOCAL_LOG_IDENTITY_BYTES,
            })
        );
        assert_eq!(
            validate_local_log_identity("-generation"),
            Err(LocalLogIdentityError::InvalidStart)
        );
        assert_eq!(
            validate_local_log_identity("log/generation"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 3, character: '/' })
        );
        assert_eq!(
            validate_local_log_identity("log-é"),
            Err(LocalLogIdentityError::InvalidCharacter { byte_index: 4, character: 'é' })
        );
    }

    #[test]
    fn identity_error_codes_are_stable() {
        assert_eq!(LocalLogIdentityError::Empty.code(), LocalLogIdentityErrorCode::Empty);
        assert_eq!(LocalLogIdentityErrorCode::Empty.as_str(), "local_log_identity.empty");
        assert_eq!(
            LocalLogIdentityErrorCode::InvalidCharacter.as_str(),
            "local_log_identity.invalid_character"
        );
    }
}
