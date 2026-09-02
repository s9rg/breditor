use std::{fmt, num::NonZeroU32, str::FromStr};

use thiserror::Error;

/// Stable machine-readable category for [`LocalLogStorageProfileVersionError`].
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageProfileVersionErrorCode {
    /// A textual version is not an unsigned decimal `u32`.
    InvalidDecimal,
    /// Version zero is reserved.
    Zero,
}

impl LocalLogStorageProfileVersionErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidDecimal => "local_log_storage_profile_version.invalid_decimal",
            Self::Zero => "local_log_storage_profile_version.zero",
        }
    }
}

/// Why a storage-profile version could not be constructed.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageProfileVersionError {
    /// A textual version is empty, nondecimal, signed, or exceeds `u32`.
    #[error("local-log storage-profile version must be unsigned decimal digits fitting u32")]
    InvalidDecimal,
    /// Version zero is reserved and never identifies a storage profile.
    #[error("local-log storage-profile version zero is reserved")]
    Zero,
}

impl LocalLogStorageProfileVersionError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageProfileVersionErrorCode {
        match self {
            Self::InvalidDecimal => LocalLogStorageProfileVersionErrorCode::InvalidDecimal,
            Self::Zero => LocalLogStorageProfileVersionErrorCode::Zero,
        }
    }
}

/// Nonzero version of one host-defined local-log storage profile.
///
/// This is an opaque profile-contract version, not the storage-generation,
/// checkpoint, frame, or crate version.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalLogStorageProfileVersion(NonZeroU32);

impl LocalLogStorageProfileVersion {
    /// Creates a nonzero storage-profile version.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageProfileVersionError::Zero`] when `value` is
    /// zero.
    pub fn try_new(value: u32) -> Result<Self, LocalLogStorageProfileVersionError> {
        NonZeroU32::new(value).map(Self).ok_or(LocalLogStorageProfileVersionError::Zero)
    }

    /// Returns the numeric profile version.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0.get()
    }

    /// Returns the wrapped nonzero integer.
    #[must_use]
    pub const fn as_nonzero(self) -> NonZeroU32 {
        self.0
    }
}

impl fmt::Display for LocalLogStorageProfileVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.get().fmt(formatter)
    }
}

impl From<NonZeroU32> for LocalLogStorageProfileVersion {
    fn from(value: NonZeroU32) -> Self {
        Self(value)
    }
}

impl TryFrom<u32> for LocalLogStorageProfileVersion {
    type Error = LocalLogStorageProfileVersionError;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        Self::try_new(value)
    }
}

impl FromStr for LocalLogStorageProfileVersion {
    type Err = LocalLogStorageProfileVersionError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(LocalLogStorageProfileVersionError::InvalidDecimal);
        }
        let value =
            value.parse::<u32>().map_err(|_| LocalLogStorageProfileVersionError::InvalidDecimal)?;
        Self::try_new(value)
    }
}

impl TryFrom<String> for LocalLogStorageProfileVersion {
    type Error = LocalLogStorageProfileVersionError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageProfileVersion, LocalLogStorageProfileVersionError,
        LocalLogStorageProfileVersionErrorCode,
    };

    #[test]
    fn accepts_the_complete_nonzero_u32_range() -> Result<(), LocalLogStorageProfileVersionError> {
        let first = LocalLogStorageProfileVersion::try_new(1)?;
        let last: LocalLogStorageProfileVersion = u32::MAX.to_string().try_into()?;

        assert_eq!(first.get(), 1);
        assert_eq!(first.to_string(), "1");
        assert_eq!(last.get(), u32::MAX);
        Ok(())
    }

    #[test]
    fn errors_and_codes_are_stable() {
        assert_eq!(
            LocalLogStorageProfileVersion::try_new(0),
            Err(LocalLogStorageProfileVersionError::Zero)
        );
        assert_eq!(
            "-1".parse::<LocalLogStorageProfileVersion>(),
            Err(LocalLogStorageProfileVersionError::InvalidDecimal)
        );
        assert_eq!(
            LocalLogStorageProfileVersionError::Zero.code(),
            LocalLogStorageProfileVersionErrorCode::Zero
        );
        assert_eq!(
            LocalLogStorageProfileVersionErrorCode::InvalidDecimal.as_str(),
            "local_log_storage_profile_version.invalid_decimal"
        );
    }
}
