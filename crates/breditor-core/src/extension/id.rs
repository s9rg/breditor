use std::fmt;

use crate::identity::QualifiedName;

use super::ExtensionVersion;

/// Exact identity of one behavior-free extension manifest.
///
/// The qualified name and numeric version are both significant. This identity
/// is not a digest of an implementation and does not prove schema, action,
/// replay, or persistence compatibility. Its canonical ordering compares the
/// qualified name in ASCII byte order first and, for equal names, compares the
/// [`ExtensionVersion`] numerically. It does not compare the rendered
/// `name@version` string.
#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ExtensionId {
    name: QualifiedName,
    version: ExtensionVersion,
}

impl ExtensionId {
    /// Creates an exact extension identity from validated components.
    #[must_use]
    pub const fn new(name: QualifiedName, version: ExtensionVersion) -> Self {
        Self { name, version }
    }

    /// Returns the qualified extension name.
    #[must_use]
    pub const fn name(&self) -> &QualifiedName {
        &self.name
    }

    /// Returns the exact extension version.
    #[must_use]
    pub const fn version(&self) -> ExtensionVersion {
        self.version
    }
}

impl fmt::Debug for ExtensionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("ExtensionId").field(&self.to_string()).finish()
    }
}

impl fmt::Display for ExtensionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}@{}", self.name, self.version)
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::identity::QualifiedName;

    use super::{ExtensionId, ExtensionVersion};

    #[test]
    fn display_includes_the_exact_version() -> Result<(), Box<dyn Error>> {
        let id = ExtensionId::new(
            QualifiedName::try_new("example/tables")?,
            ExtensionVersion::try_new(3)?,
        );

        assert_eq!(id.to_string(), "example/tables@3");
        assert_eq!(id.name().as_str(), "example/tables");
        assert_eq!(id.version().get(), 3);
        Ok(())
    }

    #[test]
    fn ordering_compares_numeric_versions_after_equal_names() -> Result<(), Box<dyn Error>> {
        let name = QualifiedName::try_new("example/tables")?;
        let version_two = ExtensionId::new(name.clone(), ExtensionVersion::try_new(2)?);
        let version_ten = ExtensionId::new(name, ExtensionVersion::try_new(10)?);

        assert!(version_two < version_ten);
        assert!(version_two.to_string() > version_ten.to_string());
        Ok(())
    }
}
