use super::ExtensionLimitsError;

/// Maximum manifests accepted by one extension set.
pub const MAX_EXTENSION_SET_ENTRIES: u32 = 1_024;
/// Maximum exact dependencies accepted by one manifest.
pub const MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST: u32 = 256;
/// Maximum explicit conflicts accepted by one manifest.
pub const MAX_EXTENSION_CONFLICTS_PER_MANIFEST: u32 = 256;
/// Maximum property-free inline-format declarations accepted by one manifest.
pub const MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST: u32 = 255;
/// Maximum aggregate exact dependency edges accepted by one extension set.
pub const MAX_EXTENSION_SET_DEPENDENCIES: u32 = 16_384;
/// Maximum aggregate explicit conflict edges accepted by one extension set.
pub const MAX_EXTENSION_SET_CONFLICTS: u32 = 16_384;

/// Immutable resource limits for extension-set resolution.
///
/// The default uses every fixed implementation ceiling. Hosts may construct a
/// tighter profile, including zero-valued limits, but cannot raise a field
/// beyond its ceiling. Limits bound manifest graph metadata only; they do not
/// bound or authorize extension code because this module contains no behavior.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(clippy::struct_field_names)]
pub struct ExtensionLimits {
    max_extensions: u32,
    max_dependencies_per_manifest: u32,
    max_conflicts_per_manifest: u32,
    max_dependencies: u32,
    max_conflicts: u32,
}

impl ExtensionLimits {
    /// Creates a caller-tightened extension resolution profile.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionLimitsError`] when any requested value exceeds its
    /// fixed implementation ceiling. Validation follows argument order.
    pub const fn try_new(
        max_extensions: u32,
        max_dependencies_per_manifest: u32,
        max_conflicts_per_manifest: u32,
        max_dependencies: u32,
        max_conflicts: u32,
    ) -> Result<Self, ExtensionLimitsError> {
        if max_extensions > MAX_EXTENSION_SET_ENTRIES {
            return Err(ExtensionLimitsError::TooManyExtensions {
                actual: max_extensions,
                maximum: MAX_EXTENSION_SET_ENTRIES,
            });
        }
        if max_dependencies_per_manifest > MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST {
            return Err(ExtensionLimitsError::TooManyDependenciesPerManifest {
                actual: max_dependencies_per_manifest,
                maximum: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
            });
        }
        if max_conflicts_per_manifest > MAX_EXTENSION_CONFLICTS_PER_MANIFEST {
            return Err(ExtensionLimitsError::TooManyConflictsPerManifest {
                actual: max_conflicts_per_manifest,
                maximum: MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
            });
        }
        if max_dependencies > MAX_EXTENSION_SET_DEPENDENCIES {
            return Err(ExtensionLimitsError::TooManyDependencies {
                actual: max_dependencies,
                maximum: MAX_EXTENSION_SET_DEPENDENCIES,
            });
        }
        if max_conflicts > MAX_EXTENSION_SET_CONFLICTS {
            return Err(ExtensionLimitsError::TooManyConflicts {
                actual: max_conflicts,
                maximum: MAX_EXTENSION_SET_CONFLICTS,
            });
        }
        Ok(Self {
            max_extensions,
            max_dependencies_per_manifest,
            max_conflicts_per_manifest,
            max_dependencies,
            max_conflicts,
        })
    }

    /// Returns the maximum manifest count.
    #[must_use]
    pub const fn max_extensions(self) -> u32 {
        self.max_extensions
    }

    /// Returns the maximum dependencies on one manifest.
    #[must_use]
    pub const fn max_dependencies_per_manifest(self) -> u32 {
        self.max_dependencies_per_manifest
    }

    /// Returns the maximum conflicts on one manifest.
    #[must_use]
    pub const fn max_conflicts_per_manifest(self) -> u32 {
        self.max_conflicts_per_manifest
    }

    /// Returns the maximum aggregate dependency edge count.
    #[must_use]
    pub const fn max_dependencies(self) -> u32 {
        self.max_dependencies
    }

    /// Returns the maximum aggregate conflict edge count.
    #[must_use]
    pub const fn max_conflicts(self) -> u32 {
        self.max_conflicts
    }
}

impl Default for ExtensionLimits {
    fn default() -> Self {
        Self {
            max_extensions: MAX_EXTENSION_SET_ENTRIES,
            max_dependencies_per_manifest: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
            max_conflicts_per_manifest: MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
            max_dependencies: MAX_EXTENSION_SET_DEPENDENCIES,
            max_conflicts: MAX_EXTENSION_SET_CONFLICTS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ExtensionLimits, ExtensionLimitsError, MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
        MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST, MAX_EXTENSION_SET_CONFLICTS,
        MAX_EXTENSION_SET_DEPENDENCIES, MAX_EXTENSION_SET_ENTRIES,
    };

    #[test]
    fn defaults_pin_every_implementation_ceiling() {
        let limits = ExtensionLimits::default();

        assert_eq!(limits.max_extensions(), MAX_EXTENSION_SET_ENTRIES);
        assert_eq!(limits.max_dependencies_per_manifest(), MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST);
        assert_eq!(limits.max_conflicts_per_manifest(), MAX_EXTENSION_CONFLICTS_PER_MANIFEST);
        assert_eq!(limits.max_dependencies(), MAX_EXTENSION_SET_DEPENDENCIES);
        assert_eq!(limits.max_conflicts(), MAX_EXTENSION_SET_CONFLICTS);
    }

    #[test]
    fn accepts_zero_as_a_tight_bound() -> Result<(), ExtensionLimitsError> {
        let limits = ExtensionLimits::try_new(0, 0, 0, 0, 0)?;

        assert_eq!(limits.max_extensions(), 0);
        assert_eq!(limits.max_dependencies_per_manifest(), 0);
        assert_eq!(limits.max_conflicts_per_manifest(), 0);
        assert_eq!(limits.max_dependencies(), 0);
        assert_eq!(limits.max_conflicts(), 0);
        Ok(())
    }

    #[test]
    fn accepts_every_exact_implementation_ceiling() -> Result<(), ExtensionLimitsError> {
        let limits = ExtensionLimits::try_new(
            MAX_EXTENSION_SET_ENTRIES,
            MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
            MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
            MAX_EXTENSION_SET_DEPENDENCIES,
            MAX_EXTENSION_SET_CONFLICTS,
        )?;

        assert_eq!(limits, ExtensionLimits::default());
        Ok(())
    }

    #[test]
    fn rejects_each_value_above_its_ceiling() {
        assert_eq!(
            ExtensionLimits::try_new(MAX_EXTENSION_SET_ENTRIES + 1, 0, 0, 0, 0),
            Err(ExtensionLimitsError::TooManyExtensions {
                actual: MAX_EXTENSION_SET_ENTRIES + 1,
                maximum: MAX_EXTENSION_SET_ENTRIES,
            })
        );
        assert!(matches!(
            ExtensionLimits::try_new(0, MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST + 1, 0, 0, 0),
            Err(ExtensionLimitsError::TooManyDependenciesPerManifest { .. })
        ));
        assert!(matches!(
            ExtensionLimits::try_new(0, 0, MAX_EXTENSION_CONFLICTS_PER_MANIFEST + 1, 0, 0),
            Err(ExtensionLimitsError::TooManyConflictsPerManifest { .. })
        ));
        assert!(matches!(
            ExtensionLimits::try_new(0, 0, 0, MAX_EXTENSION_SET_DEPENDENCIES + 1, 0),
            Err(ExtensionLimitsError::TooManyDependencies { .. })
        ));
        assert!(matches!(
            ExtensionLimits::try_new(0, 0, 0, 0, MAX_EXTENSION_SET_CONFLICTS + 1),
            Err(ExtensionLimitsError::TooManyConflicts { .. })
        ));
    }
}
