use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use crate::identity::QualifiedName;

use super::{ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSetError};

/// Immutable resolved catalog of behavior-free extension manifests.
///
/// The catalog owns manifests in canonical extension-ID order: qualified-name
/// ASCII byte order first, then numeric [`super::ExtensionVersion`] for equal
/// names. It separately exposes a canonical dependency-first topological order.
/// At every topological step, the smallest currently-ready ID under that same
/// ordering wins. This makes the result independent of caller registration
/// order without using installation order as hidden priority.
///
/// Resolution proves only that the bounded manifest graph is internally
/// consistent. It neither installs nor authorizes schema nodes, formats,
/// actions, renderers, codecs, callbacks, or executable code. It also carries
/// no implementation fingerprint and proves no document, checkpoint, replay,
/// or persistence compatibility. Changing a manifest set must be handled by a
/// later host/compiler generation boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtensionSet {
    manifests: Arc<BTreeMap<ExtensionId, ExtensionManifest>>,
    resolution_order: Arc<[ExtensionId]>,
}

impl ExtensionSet {
    /// Validates and resolves a complete immutable manifest graph.
    ///
    /// Validation phases are manifest count, duplicate exact IDs, multiple
    /// versions of one name, per-manifest dependency counts, per-manifest
    /// conflict counts, aggregate dependency count, aggregate conflict count,
    /// exact dependency availability, installed explicit conflicts, and
    /// dependency cycles. Manifests and their already-canonical relations are
    /// traversed by qualified-name ASCII bytes and then numeric extension
    /// version in every identity-bearing phase.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionSetError`] when the selected resource profile is
    /// exceeded, identities are ambiguous, an exact dependency is unavailable,
    /// an explicit exact conflict is installed, or dependencies contain a
    /// cycle. No partial set or partial order is returned.
    pub fn try_new(
        mut manifests: Vec<ExtensionManifest>,
        limits: ExtensionLimits,
    ) -> Result<Self, ExtensionSetError> {
        let manifest_count = fixed_count(manifests.len());
        if manifest_count > limits.max_extensions() {
            return Err(ExtensionSetError::TooManyExtensions {
                actual: manifest_count,
                maximum: limits.max_extensions(),
            });
        }

        manifests.sort_by(|left, right| left.id().cmp(right.id()));
        if let Some(pair) = manifests.windows(2).find(|pair| pair[0].id() == pair[1].id()) {
            return Err(ExtensionSetError::DuplicateExtensionId { id: pair[0].id().clone() });
        }
        if let Some(pair) =
            manifests.windows(2).find(|pair| pair[0].id().name() == pair[1].id().name())
        {
            return Err(ExtensionSetError::MultipleVersionsForName {
                name: pair[0].id().name().clone(),
                first: pair[0].id().version(),
                second: pair[1].id().version(),
            });
        }

        validate_relation_limits(&manifests, limits)?;

        let manifests = manifests
            .into_iter()
            .map(|manifest| (manifest.id().clone(), manifest))
            .collect::<BTreeMap<_, _>>();
        validate_dependencies(&manifests)?;
        validate_conflicts(&manifests)?;
        let resolution_order = resolve_dependency_order(&manifests)?;

        Ok(Self { manifests: Arc::new(manifests), resolution_order: Arc::from(resolution_order) })
    }

    /// Returns the number of resolved manifests.
    #[must_use]
    pub fn len(&self) -> usize {
        self.manifests.len()
    }

    /// Returns whether the resolved set contains no manifests.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.manifests.is_empty()
    }

    /// Returns whether one exact extension identity is installed.
    #[must_use]
    pub fn contains(&self, id: &ExtensionId) -> bool {
        self.manifests.contains_key(id)
    }

    /// Looks up one manifest by exact name and version.
    #[must_use]
    pub fn manifest(&self, id: &ExtensionId) -> Option<&ExtensionManifest> {
        self.manifests.get(id)
    }

    /// Iterates manifests by qualified-name ASCII bytes and then numeric
    /// extension version.
    ///
    /// Use [`Self::resolution_order`] when dependency-first ordering is needed.
    #[must_use]
    pub fn manifests(&self) -> impl ExactSizeIterator<Item = &ExtensionManifest> {
        self.manifests.values()
    }

    /// Returns canonical dependency-first exact IDs.
    ///
    /// Every dependency precedes its dependent. Among all extensions whose
    /// dependencies have already appeared, the smallest ID by qualified-name
    /// ASCII bytes and then numeric extension version appears next.
    #[must_use]
    pub fn resolution_order(&self) -> &[ExtensionId] {
        &self.resolution_order
    }

    /// Iterates manifests in canonical dependency-first resolution order.
    #[must_use]
    pub fn resolved_manifests(&self) -> impl ExactSizeIterator<Item = &ExtensionManifest> {
        self.resolution_order.iter().map(|id| &self.manifests[id])
    }
}

fn validate_relation_limits(
    manifests: &[ExtensionManifest],
    limits: ExtensionLimits,
) -> Result<(), ExtensionSetError> {
    for manifest in manifests {
        let actual = fixed_count(manifest.dependencies().len());
        if actual > limits.max_dependencies_per_manifest() {
            return Err(ExtensionSetError::TooManyDependenciesForExtension {
                extension: manifest.id().clone(),
                actual,
                maximum: limits.max_dependencies_per_manifest(),
            });
        }
    }
    for manifest in manifests {
        let actual = fixed_count(manifest.conflicts().len());
        if actual > limits.max_conflicts_per_manifest() {
            return Err(ExtensionSetError::TooManyConflictsForExtension {
                extension: manifest.id().clone(),
                actual,
                maximum: limits.max_conflicts_per_manifest(),
            });
        }
    }

    let dependencies = manifests.iter().fold(0_u32, |total, manifest| {
        total.saturating_add(fixed_count(manifest.dependencies().len()))
    });
    if dependencies > limits.max_dependencies() {
        return Err(ExtensionSetError::TooManyDependencies {
            actual: dependencies,
            maximum: limits.max_dependencies(),
        });
    }
    let conflicts = manifests.iter().fold(0_u32, |total, manifest| {
        total.saturating_add(fixed_count(manifest.conflicts().len()))
    });
    if conflicts > limits.max_conflicts() {
        return Err(ExtensionSetError::TooManyConflicts {
            actual: conflicts,
            maximum: limits.max_conflicts(),
        });
    }
    Ok(())
}

fn validate_dependencies(
    manifests: &BTreeMap<ExtensionId, ExtensionManifest>,
) -> Result<(), ExtensionSetError> {
    let names = manifests
        .keys()
        .map(|id| (id.name().clone(), id.clone()))
        .collect::<BTreeMap<QualifiedName, ExtensionId>>();
    for manifest in manifests.values() {
        for dependency in manifest.dependencies() {
            if manifests.contains_key(dependency) {
                continue;
            }
            if let Some(installed) = names.get(dependency.name()) {
                return Err(ExtensionSetError::DependencyVersionMismatch {
                    extension: manifest.id().clone(),
                    dependency: dependency.clone(),
                    installed: installed.clone(),
                });
            }
            return Err(ExtensionSetError::MissingDependency {
                extension: manifest.id().clone(),
                dependency: dependency.clone(),
            });
        }
    }
    Ok(())
}

fn validate_conflicts(
    manifests: &BTreeMap<ExtensionId, ExtensionManifest>,
) -> Result<(), ExtensionSetError> {
    for manifest in manifests.values() {
        for conflict in manifest.conflicts() {
            if manifests.contains_key(conflict) {
                return Err(ExtensionSetError::InstalledConflict {
                    extension: manifest.id().clone(),
                    conflict: conflict.clone(),
                });
            }
        }
    }
    Ok(())
}

fn resolve_dependency_order(
    manifests: &BTreeMap<ExtensionId, ExtensionManifest>,
) -> Result<Vec<ExtensionId>, ExtensionSetError> {
    let mut in_degree = manifests
        .values()
        .map(|manifest| (manifest.id().clone(), fixed_count(manifest.dependencies().len())))
        .collect::<BTreeMap<_, _>>();
    let mut dependents =
        manifests.keys().cloned().map(|id| (id, BTreeSet::new())).collect::<BTreeMap<_, _>>();
    for manifest in manifests.values() {
        for dependency in manifest.dependencies() {
            if let Some(entries) = dependents.get_mut(dependency) {
                entries.insert(manifest.id().clone());
            }
        }
    }

    let mut ready = in_degree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| id.clone())
        .collect::<BTreeSet<_>>();
    let mut order = Vec::with_capacity(manifests.len());
    while let Some(id) = ready.pop_first() {
        order.push(id.clone());
        let Some(entries) = dependents.get(&id) else {
            continue;
        };
        for dependent in entries {
            let Some(degree) = in_degree.get_mut(dependent) else {
                continue;
            };
            if *degree == 0 {
                continue;
            }
            *degree -= 1;
            if *degree == 0 {
                ready.insert(dependent.clone());
            }
        }
    }

    if order.len() != manifests.len() {
        let blocked = in_degree
            .into_iter()
            .filter(|(_, degree)| *degree != 0)
            .map(|(id, _)| id)
            .collect::<Vec<_>>()
            .into_boxed_slice();
        return Err(ExtensionSetError::DependencyCycle { blocked });
    }
    Ok(order)
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::identity::QualifiedName;

    use crate::extension::{
        ExtensionVersion, MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
        MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST, MAX_EXTENSION_SET_CONFLICTS,
        MAX_EXTENSION_SET_DEPENDENCIES, MAX_EXTENSION_SET_ENTRIES,
    };

    use super::{ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionSetError};

    fn id(name: &str, version: u32) -> Result<ExtensionId, Box<dyn Error>> {
        Ok(ExtensionId::new(QualifiedName::try_new(name)?, ExtensionVersion::try_new(version)?))
    }

    fn manifest(
        id: ExtensionId,
        dependencies: Vec<ExtensionId>,
        conflicts: Vec<ExtensionId>,
    ) -> Result<ExtensionManifest, Box<dyn Error>> {
        Ok(ExtensionManifest::try_new(id, dependencies, conflicts)?)
    }

    fn numbered_ids(prefix: &str, count: u32) -> Result<Vec<ExtensionId>, Box<dyn Error>> {
        (0..count)
            .map(|index| id(&format!("example/{prefix}-{index}"), 1))
            .collect::<Result<Vec<_>, _>>()
    }

    fn empty_manifests(ids: &[ExtensionId]) -> Result<Vec<ExtensionManifest>, Box<dyn Error>> {
        ids.iter()
            .cloned()
            .map(|id| manifest(id, Vec::new(), Vec::new()))
            .collect::<Result<Vec<_>, _>>()
    }

    #[test]
    fn empty_set_is_valid() -> Result<(), ExtensionSetError> {
        let set = ExtensionSet::try_new(Vec::new(), ExtensionLimits::default())?;

        assert!(set.is_empty());
        assert_eq!(set.len(), 0);
        assert!(set.resolution_order().is_empty());
        Ok(())
    }

    #[test]
    fn resolves_dependencies_before_dependents_with_canonical_ready_ties()
    -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let charlie = id("example/charlie", 1)?;
        let delta = id("example/delta", 1)?;
        let set = ExtensionSet::try_new(
            vec![
                manifest(alpha.clone(), vec![delta.clone()], Vec::new())?,
                manifest(charlie.clone(), vec![delta.clone()], Vec::new())?,
                manifest(delta.clone(), Vec::new(), Vec::new())?,
                manifest(beta.clone(), Vec::new(), Vec::new())?,
            ],
            ExtensionLimits::default(),
        )?;

        assert_eq!(set.resolution_order(), &[beta, delta, alpha, charlie]);
        assert_eq!(
            set.resolved_manifests().map(ExtensionManifest::id).collect::<Vec<_>>(),
            set.resolution_order().iter().collect::<Vec<_>>()
        );
        Ok(())
    }

    #[test]
    fn registration_permutations_resolve_identically() -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let gamma = id("example/gamma", 1)?;
        let alpha_manifest = manifest(alpha.clone(), vec![gamma.clone()], Vec::new())?;
        let beta_manifest = manifest(beta, Vec::new(), Vec::new())?;
        let gamma_manifest = manifest(gamma, Vec::new(), Vec::new())?;
        let permutations = [
            vec![alpha_manifest.clone(), beta_manifest.clone(), gamma_manifest.clone()],
            vec![alpha_manifest.clone(), gamma_manifest.clone(), beta_manifest.clone()],
            vec![beta_manifest.clone(), alpha_manifest.clone(), gamma_manifest.clone()],
            vec![beta_manifest.clone(), gamma_manifest.clone(), alpha_manifest.clone()],
            vec![gamma_manifest.clone(), alpha_manifest.clone(), beta_manifest.clone()],
            vec![gamma_manifest, beta_manifest, alpha_manifest],
        ];

        let mut orders = Vec::new();
        for registrations in permutations {
            orders.push(
                ExtensionSet::try_new(registrations, ExtensionLimits::default())?
                    .resolution_order()
                    .to_vec(),
            );
        }
        assert!(orders.windows(2).all(|pair| pair[0] == pair[1]));
        Ok(())
    }

    #[test]
    fn rejects_an_exact_duplicate_before_a_name_version_ambiguity() -> Result<(), Box<dyn Error>> {
        let alpha_one = id("example/alpha", 1)?;
        let alpha_two = id("example/alpha", 2)?;
        let duplicate = manifest(alpha_one.clone(), Vec::new(), Vec::new())?;

        assert_eq!(
            ExtensionSet::try_new(
                vec![manifest(alpha_two, Vec::new(), Vec::new())?, duplicate.clone(), duplicate,],
                ExtensionLimits::default(),
            ),
            Err(ExtensionSetError::DuplicateExtensionId { id: alpha_one })
        );
        Ok(())
    }

    #[test]
    fn rejects_multiple_versions_using_numeric_version_order() -> Result<(), Box<dyn Error>> {
        let alpha_two = id("example/alpha", 2)?;
        let alpha_ten = id("example/alpha", 10)?;

        assert_eq!(
            ExtensionSet::try_new(
                vec![
                    manifest(alpha_ten, Vec::new(), Vec::new())?,
                    manifest(alpha_two, Vec::new(), Vec::new())?,
                ],
                ExtensionLimits::default(),
            ),
            Err(ExtensionSetError::MultipleVersionsForName {
                name: QualifiedName::try_new("example/alpha")?,
                first: ExtensionVersion::try_new(2)?,
                second: ExtensionVersion::try_new(10)?,
            })
        );
        Ok(())
    }

    #[test]
    fn distinguishes_missing_dependency_from_exact_version_mismatch() -> Result<(), Box<dyn Error>>
    {
        let owner = id("example/owner", 1)?;
        let required = id("example/required", 1)?;
        let installed = id("example/required", 2)?;
        let missing = id("example/missing", 1)?;

        assert_eq!(
            ExtensionSet::try_new(
                vec![manifest(owner.clone(), vec![missing.clone()], Vec::new())?],
                ExtensionLimits::default(),
            ),
            Err(ExtensionSetError::MissingDependency {
                extension: owner.clone(),
                dependency: missing,
            })
        );
        assert_eq!(
            ExtensionSet::try_new(
                vec![
                    manifest(owner.clone(), vec![required.clone()], Vec::new())?,
                    manifest(installed.clone(), Vec::new(), Vec::new())?,
                ],
                ExtensionLimits::default(),
            ),
            Err(ExtensionSetError::DependencyVersionMismatch {
                extension: owner,
                dependency: required,
                installed,
            })
        );
        Ok(())
    }

    #[test]
    fn conflicts_are_explicit_and_exact_versioned() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let forbidden_one = id("example/forbidden", 1)?;
        let installed_two = id("example/forbidden", 2)?;
        let exact_error = ExtensionSet::try_new(
            vec![
                manifest(owner.clone(), Vec::new(), vec![forbidden_one.clone()])?,
                manifest(forbidden_one.clone(), Vec::new(), Vec::new())?,
            ],
            ExtensionLimits::default(),
        );

        assert_eq!(
            exact_error,
            Err(ExtensionSetError::InstalledConflict {
                extension: owner.clone(),
                conflict: forbidden_one,
            })
        );
        let exact_other_version = ExtensionSet::try_new(
            vec![
                manifest(owner, Vec::new(), vec![id("example/forbidden", 1)?])?,
                manifest(installed_two, Vec::new(), Vec::new())?,
            ],
            ExtensionLimits::default(),
        )?;
        assert_eq!(exact_other_version.len(), 2);
        Ok(())
    }

    #[test]
    fn installed_conflict_diagnostic_uses_canonical_manifest_and_conflict_order()
    -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let owner = id("example/owner", 1)?;
        let owner_manifest =
            manifest(owner.clone(), Vec::new(), vec![beta.clone(), alpha.clone()])?;
        let alpha_manifest = manifest(alpha.clone(), Vec::new(), Vec::new())?;
        let beta_manifest = manifest(beta, Vec::new(), Vec::new())?;
        let expected = ExtensionSetError::InstalledConflict { extension: owner, conflict: alpha };

        assert_eq!(
            ExtensionSet::try_new(
                vec![owner_manifest.clone(), alpha_manifest.clone(), beta_manifest.clone()],
                ExtensionLimits::default(),
            ),
            Err(expected.clone())
        );
        assert_eq!(
            ExtensionSet::try_new(
                vec![beta_manifest, alpha_manifest, owner_manifest],
                ExtensionLimits::default(),
            ),
            Err(expected)
        );
        Ok(())
    }

    #[test]
    fn cycle_error_is_canonical_and_includes_transitively_blocked_nodes()
    -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let charlie = id("example/charlie", 1)?;
        let delta = id("example/delta", 1)?;
        let manifests = vec![
            manifest(alpha.clone(), vec![beta.clone()], Vec::new())?,
            manifest(beta.clone(), vec![alpha.clone()], Vec::new())?,
            manifest(charlie.clone(), vec![alpha.clone()], Vec::new())?,
            manifest(delta, Vec::new(), Vec::new())?,
        ];
        let reversed = manifests.iter().rev().cloned().collect::<Vec<_>>();
        let expected = ExtensionSetError::DependencyCycle {
            blocked: vec![alpha, beta, charlie].into_boxed_slice(),
        };

        assert_eq!(
            ExtensionSet::try_new(manifests, ExtensionLimits::default()),
            Err(expected.clone())
        );
        assert_eq!(ExtensionSet::try_new(reversed, ExtensionLimits::default()), Err(expected));
        Ok(())
    }

    #[test]
    fn enforces_selected_count_and_per_manifest_limits() -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let limits = ExtensionLimits::try_new(1, 0, 0, 0, 0)?;

        assert_eq!(
            ExtensionSet::try_new(
                vec![
                    manifest(alpha.clone(), Vec::new(), Vec::new())?,
                    manifest(beta.clone(), Vec::new(), Vec::new())?,
                ],
                limits,
            ),
            Err(ExtensionSetError::TooManyExtensions { actual: 2, maximum: 1 })
        );

        let dependency_limits = ExtensionLimits::try_new(2, 0, 0, 1, 0)?;
        assert_eq!(
            ExtensionSet::try_new(
                vec![
                    manifest(alpha.clone(), vec![beta.clone()], Vec::new())?,
                    manifest(beta, Vec::new(), Vec::new())?,
                ],
                dependency_limits,
            ),
            Err(ExtensionSetError::TooManyDependenciesForExtension {
                extension: alpha,
                actual: 1,
                maximum: 0,
            })
        );
        Ok(())
    }

    #[test]
    fn enforces_selected_aggregate_relation_limits() -> Result<(), Box<dyn Error>> {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let gamma = id("example/gamma", 1)?;
        let dependency_limits = ExtensionLimits::try_new(3, 2, 2, 1, 2)?;
        let dependency_error = ExtensionSet::try_new(
            vec![
                manifest(alpha.clone(), vec![gamma.clone()], Vec::new())?,
                manifest(beta.clone(), vec![gamma.clone()], Vec::new())?,
                manifest(gamma.clone(), Vec::new(), Vec::new())?,
            ],
            dependency_limits,
        );
        assert_eq!(
            dependency_error,
            Err(ExtensionSetError::TooManyDependencies { actual: 2, maximum: 1 })
        );
        let reversed_dependency_error = ExtensionSet::try_new(
            vec![
                manifest(gamma.clone(), Vec::new(), Vec::new())?,
                manifest(beta.clone(), vec![gamma.clone()], Vec::new())?,
                manifest(alpha.clone(), vec![gamma.clone()], Vec::new())?,
            ],
            dependency_limits,
        );
        assert_eq!(dependency_error, reversed_dependency_error);

        let conflict_limits = ExtensionLimits::try_new(3, 2, 2, 2, 1)?;
        let alpha_conflict = id("example/not-installed-a", 1)?;
        let beta_conflict = id("example/not-installed-b", 1)?;
        let conflict_error = ExtensionSet::try_new(
            vec![
                manifest(alpha.clone(), Vec::new(), vec![alpha_conflict.clone()])?,
                manifest(beta.clone(), Vec::new(), vec![beta_conflict.clone()])?,
                manifest(gamma.clone(), Vec::new(), Vec::new())?,
            ],
            conflict_limits,
        );
        assert_eq!(
            conflict_error,
            Err(ExtensionSetError::TooManyConflicts { actual: 2, maximum: 1 })
        );
        let reversed_conflict_error = ExtensionSet::try_new(
            vec![
                manifest(gamma, Vec::new(), Vec::new())?,
                manifest(beta, Vec::new(), vec![beta_conflict])?,
                manifest(alpha, Vec::new(), vec![alpha_conflict])?,
            ],
            conflict_limits,
        );
        assert_eq!(conflict_error, reversed_conflict_error);
        Ok(())
    }

    #[test]
    fn fixed_entry_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        let exact_ids = numbered_ids("entry", MAX_EXTENSION_SET_ENTRIES)?;
        let exact =
            ExtensionSet::try_new(empty_manifests(&exact_ids)?, ExtensionLimits::default())?;
        assert_eq!(u32::try_from(exact.len())?, MAX_EXTENSION_SET_ENTRIES);

        let too_many_ids = numbered_ids("entry-overflow", MAX_EXTENSION_SET_ENTRIES + 1)?;
        assert_eq!(
            ExtensionSet::try_new(empty_manifests(&too_many_ids)?, ExtensionLimits::default(),),
            Err(ExtensionSetError::TooManyExtensions {
                actual: MAX_EXTENSION_SET_ENTRIES + 1,
                maximum: MAX_EXTENSION_SET_ENTRIES,
            })
        );
        Ok(())
    }

    #[test]
    fn fixed_dependency_edge_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        assert_eq!(MAX_EXTENSION_SET_DEPENDENCIES % MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST, 0);
        let dependencies =
            numbered_ids("dependency-target", MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST)?;
        let mut exact_manifests = empty_manifests(&dependencies)?;
        let owner_count = MAX_EXTENSION_SET_DEPENDENCIES / MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST;
        for owner in numbered_ids("dependency-owner", owner_count)? {
            exact_manifests.push(manifest(owner, dependencies.clone(), Vec::new())?);
        }

        let exact = ExtensionSet::try_new(exact_manifests.clone(), ExtensionLimits::default())?;
        let exact_count = exact
            .manifests()
            .map(|entry| u32::try_from(entry.dependencies().len()))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .sum::<u32>();
        assert_eq!(exact_count, MAX_EXTENSION_SET_DEPENDENCIES);

        exact_manifests.push(manifest(
            id("example/dependency-overflow-owner", 1)?,
            vec![dependencies[0].clone()],
            Vec::new(),
        )?);
        assert_eq!(
            ExtensionSet::try_new(exact_manifests, ExtensionLimits::default()),
            Err(ExtensionSetError::TooManyDependencies {
                actual: MAX_EXTENSION_SET_DEPENDENCIES + 1,
                maximum: MAX_EXTENSION_SET_DEPENDENCIES,
            })
        );
        Ok(())
    }

    #[test]
    fn fixed_conflict_edge_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        assert_eq!(MAX_EXTENSION_SET_CONFLICTS % MAX_EXTENSION_CONFLICTS_PER_MANIFEST, 0);
        let conflicts = numbered_ids("absent-conflict", MAX_EXTENSION_CONFLICTS_PER_MANIFEST)?;
        let owner_count = MAX_EXTENSION_SET_CONFLICTS / MAX_EXTENSION_CONFLICTS_PER_MANIFEST;
        let mut exact_manifests = numbered_ids("conflict-owner", owner_count)?
            .into_iter()
            .map(|owner| manifest(owner, Vec::new(), conflicts.clone()))
            .collect::<Result<Vec<_>, _>>()?;

        let exact = ExtensionSet::try_new(exact_manifests.clone(), ExtensionLimits::default())?;
        let exact_count = exact
            .manifests()
            .map(|entry| u32::try_from(entry.conflicts().len()))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .sum::<u32>();
        assert_eq!(exact_count, MAX_EXTENSION_SET_CONFLICTS);

        exact_manifests.push(manifest(
            id("example/conflict-overflow-owner", 1)?,
            Vec::new(),
            vec![conflicts[0].clone()],
        )?);
        assert_eq!(
            ExtensionSet::try_new(exact_manifests, ExtensionLimits::default()),
            Err(ExtensionSetError::TooManyConflicts {
                actual: MAX_EXTENSION_SET_CONFLICTS + 1,
                maximum: MAX_EXTENSION_SET_CONFLICTS,
            })
        );
        Ok(())
    }

    #[test]
    fn lookup_is_exact_and_catalog_iteration_uses_canonical_id_order() -> Result<(), Box<dyn Error>>
    {
        let alpha = id("example/alpha", 1)?;
        let beta = id("example/beta", 1)?;
        let absent = id("example/absent", 1)?;
        let set = ExtensionSet::try_new(
            vec![
                manifest(beta.clone(), Vec::new(), Vec::new())?,
                manifest(alpha.clone(), Vec::new(), Vec::new())?,
            ],
            ExtensionLimits::default(),
        )?;

        assert!(set.contains(&alpha));
        assert!(!set.contains(&absent));
        assert_eq!(set.manifest(&beta).map(ExtensionManifest::id), Some(&beta));
        assert_eq!(
            set.manifests().map(ExtensionManifest::id).collect::<Vec<_>>(),
            vec![&alpha, &beta]
        );
        Ok(())
    }
}
