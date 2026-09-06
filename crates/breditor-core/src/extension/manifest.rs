use super::{
    ExtensionId, ExtensionManifestError, MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
    MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
};

/// Canonical behavior-free declaration of one extension's relationships.
///
/// Dependencies and conflicts are exact [`ExtensionId`] values: ranges,
/// optional dependencies, feature negotiation, and implicit compatibility are
/// deliberately absent. Both lists are immutable, unique, and canonically
/// ordered by qualified-name ASCII bytes followed by numeric extension version.
/// A manifest carries no schema registrations, action handlers, renderer
/// callbacks, executable code, or persistence proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtensionManifest {
    id: ExtensionId,
    dependencies: Box<[ExtensionId]>,
    conflicts: Box<[ExtensionId]>,
}

impl ExtensionManifest {
    /// Validates and canonicalizes one behavior-free manifest.
    ///
    /// Validation phases are dependency count, conflict count, duplicate
    /// dependencies, duplicate conflicts, exact self-dependency, exact
    /// self-conflict, and dependency/conflict overlap. Relations are sorted
    /// before identity validation, making every identity diagnostic independent
    /// of caller order.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionManifestError`] for a fixed resource overflow,
    /// duplicate relation, exact self-reference, or an identity declared in
    /// both relation sets. No partial manifest is returned.
    pub fn try_new(
        id: ExtensionId,
        mut dependencies: Vec<ExtensionId>,
        mut conflicts: Vec<ExtensionId>,
    ) -> Result<Self, ExtensionManifestError> {
        let dependency_count = fixed_count(dependencies.len());
        if dependency_count > MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST {
            return Err(ExtensionManifestError::TooManyDependencies {
                extension: id,
                actual: dependency_count,
                maximum: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
            });
        }
        let conflict_count = fixed_count(conflicts.len());
        if conflict_count > MAX_EXTENSION_CONFLICTS_PER_MANIFEST {
            return Err(ExtensionManifestError::TooManyConflicts {
                extension: id,
                actual: conflict_count,
                maximum: MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
            });
        }

        dependencies.sort();
        conflicts.sort();

        if let Some(pair) = dependencies.windows(2).find(|pair| pair[0] == pair[1]) {
            return Err(ExtensionManifestError::DuplicateDependency {
                extension: id,
                dependency: pair[0].clone(),
            });
        }
        if let Some(pair) = conflicts.windows(2).find(|pair| pair[0] == pair[1]) {
            return Err(ExtensionManifestError::DuplicateConflict {
                extension: id,
                conflict: pair[0].clone(),
            });
        }
        if dependencies.binary_search(&id).is_ok() {
            return Err(ExtensionManifestError::SelfDependency { extension: id });
        }
        if conflicts.binary_search(&id).is_ok() {
            return Err(ExtensionManifestError::SelfConflict { extension: id });
        }
        if let Some(related) = first_intersection(&dependencies, &conflicts) {
            return Err(ExtensionManifestError::DependencyConflict {
                extension: id,
                related: related.clone(),
            });
        }

        Ok(Self {
            id,
            dependencies: dependencies.into_boxed_slice(),
            conflicts: conflicts.into_boxed_slice(),
        })
    }

    /// Returns the exact extension identity.
    #[must_use]
    pub const fn id(&self) -> &ExtensionId {
        &self.id
    }

    /// Returns exact dependencies ordered by qualified-name ASCII bytes and
    /// then numeric extension version.
    #[must_use]
    pub const fn dependencies(&self) -> &[ExtensionId] {
        &self.dependencies
    }

    /// Returns explicit exact-version conflicts ordered by qualified-name ASCII
    /// bytes and then numeric extension version.
    #[must_use]
    pub const fn conflicts(&self) -> &[ExtensionId] {
        &self.conflicts
    }
}

fn first_intersection<'a>(
    dependencies: &'a [ExtensionId],
    conflicts: &'a [ExtensionId],
) -> Option<&'a ExtensionId> {
    let mut dependency_index = 0;
    let mut conflict_index = 0;
    while dependency_index < dependencies.len() && conflict_index < conflicts.len() {
        match dependencies[dependency_index].cmp(&conflicts[conflict_index]) {
            std::cmp::Ordering::Less => dependency_index += 1,
            std::cmp::Ordering::Greater => conflict_index += 1,
            std::cmp::Ordering::Equal => return dependencies.get(dependency_index),
        }
    }
    None
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::identity::QualifiedName;

    use crate::extension::ExtensionVersion;

    use super::{
        ExtensionId, ExtensionManifest, ExtensionManifestError,
        MAX_EXTENSION_CONFLICTS_PER_MANIFEST, MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
    };

    fn id(name: &str, version: u32) -> Result<ExtensionId, Box<dyn Error>> {
        Ok(ExtensionId::new(QualifiedName::try_new(name)?, ExtensionVersion::try_new(version)?))
    }

    fn numbered_ids(prefix: &str, count: u32) -> Result<Vec<ExtensionId>, Box<dyn Error>> {
        (0..count)
            .map(|index| id(&format!("example/{prefix}-{index}"), 1))
            .collect::<Result<Vec<_>, _>>()
    }

    #[test]
    fn canonicalizes_both_relation_lists() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 2)?;
        let gamma = id("example/gamma", 3)?;
        let manifest = ExtensionManifest::try_new(
            owner,
            vec![beta.clone(), alpha.clone()],
            vec![gamma.clone()],
        )?;

        assert_eq!(manifest.dependencies(), &[alpha, beta]);
        assert_eq!(manifest.conflicts(), &[gamma]);
        Ok(())
    }

    #[test]
    fn duplicate_diagnostics_are_canonical() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;

        let left = ExtensionManifest::try_new(
            owner.clone(),
            vec![beta.clone(), alpha.clone(), beta.clone(), alpha.clone()],
            Vec::new(),
        );
        let right = ExtensionManifest::try_new(
            owner.clone(),
            vec![alpha.clone(), beta.clone(), alpha.clone(), beta],
            Vec::new(),
        );

        assert_eq!(left, right);
        assert_eq!(
            left,
            Err(ExtensionManifestError::DuplicateDependency {
                extension: owner,
                dependency: alpha,
            })
        );
        Ok(())
    }

    #[test]
    fn duplicate_conflict_diagnostics_are_canonical() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let left = ExtensionManifest::try_new(
            owner.clone(),
            Vec::new(),
            vec![beta.clone(), alpha.clone(), beta.clone(), alpha.clone()],
        );
        let right = ExtensionManifest::try_new(
            owner.clone(),
            Vec::new(),
            vec![alpha.clone(), beta.clone(), alpha.clone(), beta],
        );

        assert_eq!(left, right);
        assert_eq!(
            left,
            Err(ExtensionManifestError::DuplicateConflict { extension: owner, conflict: alpha })
        );
        Ok(())
    }

    #[test]
    fn rejects_exact_self_relations() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;

        assert_eq!(
            ExtensionManifest::try_new(owner.clone(), vec![owner.clone()], Vec::new()),
            Err(ExtensionManifestError::SelfDependency { extension: owner.clone() })
        );
        assert_eq!(
            ExtensionManifest::try_new(owner.clone(), Vec::new(), vec![owner.clone()]),
            Err(ExtensionManifestError::SelfConflict { extension: owner })
        );
        Ok(())
    }

    #[test]
    fn rejects_the_first_dependency_conflict_overlap() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;

        assert_eq!(
            ExtensionManifest::try_new(
                owner.clone(),
                vec![beta.clone(), alpha.clone()],
                vec![beta, alpha.clone()],
            ),
            Err(ExtensionManifestError::DependencyConflict { extension: owner, related: alpha })
        );
        Ok(())
    }

    #[test]
    fn dependency_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let exact = numbered_ids("dependency", MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST)?;
        let accepted = ExtensionManifest::try_new(owner.clone(), exact, Vec::new())?;

        assert_eq!(
            u32::try_from(accepted.dependencies().len())?,
            MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST
        );
        let too_many =
            numbered_ids("dependency-overflow", MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST + 1)?;

        assert_eq!(
            ExtensionManifest::try_new(owner.clone(), too_many, Vec::new()),
            Err(ExtensionManifestError::TooManyDependencies {
                extension: owner,
                actual: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST + 1,
                maximum: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
            })
        );
        Ok(())
    }

    #[test]
    fn conflict_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let exact = numbered_ids("conflict", MAX_EXTENSION_CONFLICTS_PER_MANIFEST)?;
        let accepted = ExtensionManifest::try_new(owner.clone(), Vec::new(), exact)?;

        assert_eq!(
            u32::try_from(accepted.conflicts().len())?,
            MAX_EXTENSION_CONFLICTS_PER_MANIFEST
        );
        let too_many = numbered_ids("conflict-overflow", MAX_EXTENSION_CONFLICTS_PER_MANIFEST + 1)?;

        assert_eq!(
            ExtensionManifest::try_new(owner.clone(), Vec::new(), too_many),
            Err(ExtensionManifestError::TooManyConflicts {
                extension: owner,
                actual: MAX_EXTENSION_CONFLICTS_PER_MANIFEST + 1,
                maximum: MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
            })
        );
        Ok(())
    }
}
