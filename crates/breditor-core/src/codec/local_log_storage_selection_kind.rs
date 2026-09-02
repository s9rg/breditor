use std::fmt;

/// Persisted shape of one selected local-log storage value.
///
/// The kind is an immutable cross-link between the scope-control record, the
/// transaction identity record, and the strictly decoded selection JSON. It is
/// inspection metadata only and carries no storage or writer authority.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectionKind {
    /// The first authoritative selection in one storage-scope incarnation.
    Root,
    /// An ordinary selection that replaces one exact predecessor head.
    Rotation,
}

impl LocalLogStorageSelectionKind {
    /// Returns the exact storage-profile spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Root => "root",
            Self::Rotation => "rotation",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectionKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::LocalLogStorageSelectionKind;

    #[test]
    fn kinds_have_stable_profile_spellings() {
        assert_eq!(LocalLogStorageSelectionKind::Root.as_str(), "root");
        assert_eq!(LocalLogStorageSelectionKind::Rotation.as_str(), "rotation");
        assert_eq!(LocalLogStorageSelectionKind::Rotation.to_string(), "rotation");
    }
}
