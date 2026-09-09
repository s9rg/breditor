use super::{
    ExtensionId, ExtensionManifestError, InlineFormatPropertyContractV1, InlineFormatSpecV1,
    InlineFormatToggleSpecV1, MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
    MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
    MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
    MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST, MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
};

/// Canonical data-only declaration of one extension's relationships and sealed
/// schema contributions.
///
/// Dependencies and conflicts are exact [`ExtensionId`] values: ranges,
/// optional dependencies, feature negotiation, and implicit compatibility are
/// deliberately absent. Both lists are immutable, unique, and canonically
/// ordered by qualified-name ASCII bytes followed by numeric extension version.
/// Its V1 inline-format and optional typed-property declarations are data, and
/// its V1 toggle declarations contain identities but no behavior. A manifest carries no node
/// registrations, action handlers, renderer callbacks, executable code, custom
/// codecs, or persistence proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtensionManifest {
    id: ExtensionId,
    dependencies: Box<[ExtensionId]>,
    conflicts: Box<[ExtensionId]>,
    inline_formats: Box<[InlineFormatSpecV1]>,
    inline_format_property_contracts: Box<[InlineFormatPropertyContractV1]>,
    inline_format_toggles: Box<[InlineFormatToggleSpecV1]>,
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
        dependencies: Vec<ExtensionId>,
        conflicts: Vec<ExtensionId>,
    ) -> Result<Self, ExtensionManifestError> {
        Self::try_new_with_inline_format_declarations(
            id,
            dependencies,
            conflicts,
            Vec::new(),
            Vec::new(),
            Vec::new(),
        )
    }

    /// Validates and canonicalizes one manifest with sealed inline-format declarations.
    ///
    /// Validation phases are dependency count, conflict count, inline-format
    /// count, duplicate dependencies, duplicate conflicts, duplicate format
    /// kinds, exact self-dependency, exact self-conflict, and
    /// dependency/conflict overlap. All collections are sorted before identity
    /// validation, so caller order cannot select a diagnostic.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionManifestError`] for a fixed resource overflow,
    /// duplicate relation or format kind, exact self-reference, or an identity
    /// declared in both relation sets. No partial manifest is returned.
    pub fn try_new_with_inline_formats(
        id: ExtensionId,
        dependencies: Vec<ExtensionId>,
        conflicts: Vec<ExtensionId>,
        inline_formats: Vec<InlineFormatSpecV1>,
    ) -> Result<Self, ExtensionManifestError> {
        Self::try_new_with_inline_format_declarations(
            id,
            dependencies,
            conflicts,
            inline_formats,
            Vec::new(),
            Vec::new(),
        )
    }

    /// Validates one manifest with formats and typed property contracts.
    ///
    /// Each contract must target a format declared by this same manifest.
    /// Collections are canonicalized before deterministic identity checks.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionManifestError`] for a resource overflow, duplicate
    /// declaration, unowned contract target, invalid relation, or self-reference.
    pub fn try_new_with_inline_formats_and_property_contracts(
        id: ExtensionId,
        dependencies: Vec<ExtensionId>,
        conflicts: Vec<ExtensionId>,
        inline_formats: Vec<InlineFormatSpecV1>,
        inline_format_property_contracts: Vec<InlineFormatPropertyContractV1>,
    ) -> Result<Self, ExtensionManifestError> {
        Self::try_new_with_inline_format_declarations(
            id,
            dependencies,
            conflicts,
            inline_formats,
            inline_format_property_contracts,
            Vec::new(),
        )
    }

    /// Validates and canonicalizes one manifest with sealed inline-format and
    /// toggle declarations.
    ///
    /// Validation phases are dependency count, conflict count, inline-format
    /// count, inline-format toggle count, duplicate dependencies, duplicate
    /// conflicts, duplicate format kinds, duplicate toggle targets, duplicate
    /// toggle action IDs, duplicate toggle intent IDs, duplicate toggle binding
    /// IDs, duplicate toggle action-state IDs, exact self-dependency, exact
    /// self-conflict, and dependency/conflict overlap. All collections are
    /// canonicalized before identity validation, so caller order cannot select
    /// a diagnostic.
    ///
    /// This constructor records behavior-free toggle identities only. It does
    /// not prove that a target format is present, generate registrations, or
    /// install executable behavior; those are later compilation concerns.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionManifestError`] for a fixed resource overflow,
    /// duplicate relation, format kind, or toggle identity, exact
    /// self-reference, or an identity declared in both relation sets. No
    /// partial manifest is returned.
    pub fn try_new_with_inline_formats_and_toggles(
        id: ExtensionId,
        dependencies: Vec<ExtensionId>,
        conflicts: Vec<ExtensionId>,
        inline_formats: Vec<InlineFormatSpecV1>,
        inline_format_toggles: Vec<InlineFormatToggleSpecV1>,
    ) -> Result<Self, ExtensionManifestError> {
        Self::try_new_with_inline_format_declarations(
            id,
            dependencies,
            conflicts,
            inline_formats,
            Vec::new(),
            inline_format_toggles,
        )
    }

    /// Validates all V1 inline-format declarations owned by one manifest.
    ///
    /// This is the complete constructor for formats, their optional typed
    /// property contracts, and optional property-free toggle identities. Older
    /// constructors remain exact shorthand for an empty property-contract set.
    /// A property-bearing toggle target is retained here and rejected later by
    /// profile compilation, where action semantics are assembled.
    ///
    /// # Errors
    ///
    /// Returns [`ExtensionManifestError`] for a fixed resource overflow,
    /// duplicate identity, property contract targeting a format not owned by
    /// this manifest, exact self-reference, or relation overlap.
    pub fn try_new_with_inline_format_declarations(
        id: ExtensionId,
        mut dependencies: Vec<ExtensionId>,
        mut conflicts: Vec<ExtensionId>,
        mut inline_formats: Vec<InlineFormatSpecV1>,
        mut inline_format_property_contracts: Vec<InlineFormatPropertyContractV1>,
        mut inline_format_toggles: Vec<InlineFormatToggleSpecV1>,
    ) -> Result<Self, ExtensionManifestError> {
        validate_resource_counts(
            &id,
            &dependencies,
            &conflicts,
            &inline_formats,
            &inline_format_property_contracts,
            &inline_format_toggles,
        )?;
        canonicalize_collections(
            &mut dependencies,
            &mut conflicts,
            &mut inline_formats,
            &mut inline_format_property_contracts,
            &mut inline_format_toggles,
        );
        validate_relation_and_format_duplicates(&id, &dependencies, &conflicts, &inline_formats)?;
        validate_property_contracts(&id, &inline_formats, &inline_format_property_contracts)?;
        validate_toggle_duplicates(&id, &inline_format_toggles)?;

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
            inline_formats: inline_formats.into_boxed_slice(),
            inline_format_property_contracts: inline_format_property_contracts.into_boxed_slice(),
            inline_format_toggles: inline_format_toggles.into_boxed_slice(),
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

    /// Returns inline-format declarations in canonical kind order.
    #[must_use]
    pub const fn inline_formats(&self) -> &[InlineFormatSpecV1] {
        &self.inline_formats
    }

    /// Returns typed property contracts in canonical target-kind order.
    #[must_use]
    pub const fn inline_format_property_contracts(&self) -> &[InlineFormatPropertyContractV1] {
        &self.inline_format_property_contracts
    }

    /// Returns inline-format toggle declarations in canonical target and ID order.
    #[must_use]
    pub const fn inline_format_toggles(&self) -> &[InlineFormatToggleSpecV1] {
        &self.inline_format_toggles
    }
}

fn validate_resource_counts(
    extension: &ExtensionId,
    dependencies: &[ExtensionId],
    conflicts: &[ExtensionId],
    inline_formats: &[InlineFormatSpecV1],
    inline_format_property_contracts: &[InlineFormatPropertyContractV1],
    inline_format_toggles: &[InlineFormatToggleSpecV1],
) -> Result<(), ExtensionManifestError> {
    let dependency_count = fixed_count(dependencies.len());
    if dependency_count > MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST {
        return Err(ExtensionManifestError::TooManyDependencies {
            extension: extension.clone(),
            actual: dependency_count,
            maximum: MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
        });
    }
    let conflict_count = fixed_count(conflicts.len());
    if conflict_count > MAX_EXTENSION_CONFLICTS_PER_MANIFEST {
        return Err(ExtensionManifestError::TooManyConflicts {
            extension: extension.clone(),
            actual: conflict_count,
            maximum: MAX_EXTENSION_CONFLICTS_PER_MANIFEST,
        });
    }
    let inline_format_count = fixed_count(inline_formats.len());
    if inline_format_count > MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST {
        return Err(ExtensionManifestError::TooManyInlineFormats {
            extension: extension.clone(),
            actual: inline_format_count,
            maximum: MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
        });
    }
    let property_contract_count = fixed_count(inline_format_property_contracts.len());
    if property_contract_count > MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST {
        return Err(ExtensionManifestError::TooManyInlineFormatPropertyContracts {
            extension: extension.clone(),
            actual: property_contract_count,
            maximum: MAX_EXTENSION_INLINE_FORMAT_PROPERTY_CONTRACTS_PER_MANIFEST,
        });
    }
    let inline_format_toggle_count = fixed_count(inline_format_toggles.len());
    if inline_format_toggle_count > MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST {
        return Err(ExtensionManifestError::TooManyInlineFormatToggles {
            extension: extension.clone(),
            actual: inline_format_toggle_count,
            maximum: MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST,
        });
    }
    Ok(())
}

fn canonicalize_collections(
    dependencies: &mut [ExtensionId],
    conflicts: &mut [ExtensionId],
    inline_formats: &mut [InlineFormatSpecV1],
    inline_format_property_contracts: &mut [InlineFormatPropertyContractV1],
    inline_format_toggles: &mut [InlineFormatToggleSpecV1],
) {
    dependencies.sort();
    conflicts.sort();
    inline_formats.sort_by(|left, right| left.kind().cmp(right.kind()));
    inline_format_property_contracts
        .sort_by(|left, right| left.format_kind().cmp(right.format_kind()));
    inline_format_toggles.sort_by(|left, right| {
        left.format_kind()
            .cmp(right.format_kind())
            .then_with(|| left.action_id().cmp(right.action_id()))
            .then_with(|| left.intent_id().cmp(right.intent_id()))
            .then_with(|| left.binding_id().cmp(right.binding_id()))
            .then_with(|| left.action_state_id().cmp(right.action_state_id()))
    });
}

fn validate_property_contracts(
    extension: &ExtensionId,
    inline_formats: &[InlineFormatSpecV1],
    contracts: &[InlineFormatPropertyContractV1],
) -> Result<(), ExtensionManifestError> {
    if let Some(pair) =
        contracts.windows(2).find(|pair| pair[0].format_kind() == pair[1].format_kind())
    {
        return Err(ExtensionManifestError::DuplicateInlineFormatPropertyContract {
            extension: extension.clone(),
            format_kind: pair[0].format_kind().clone(),
        });
    }
    if let Some(contract) = contracts.iter().find(|contract| {
        inline_formats.binary_search_by(|format| format.kind().cmp(contract.format_kind())).is_err()
    }) {
        return Err(ExtensionManifestError::InlineFormatPropertyContractTargetNotOwned {
            extension: extension.clone(),
            format_kind: contract.format_kind().clone(),
        });
    }
    Ok(())
}

fn validate_relation_and_format_duplicates(
    extension: &ExtensionId,
    dependencies: &[ExtensionId],
    conflicts: &[ExtensionId],
    inline_formats: &[InlineFormatSpecV1],
) -> Result<(), ExtensionManifestError> {
    if let Some(pair) = dependencies.windows(2).find(|pair| pair[0] == pair[1]) {
        return Err(ExtensionManifestError::DuplicateDependency {
            extension: extension.clone(),
            dependency: pair[0].clone(),
        });
    }
    if let Some(pair) = conflicts.windows(2).find(|pair| pair[0] == pair[1]) {
        return Err(ExtensionManifestError::DuplicateConflict {
            extension: extension.clone(),
            conflict: pair[0].clone(),
        });
    }
    if let Some(pair) = inline_formats.windows(2).find(|pair| pair[0].kind() == pair[1].kind()) {
        return Err(ExtensionManifestError::DuplicateInlineFormat {
            extension: extension.clone(),
            kind: pair[0].kind().clone(),
        });
    }
    Ok(())
}

fn validate_toggle_duplicates(
    extension: &ExtensionId,
    inline_format_toggles: &[InlineFormatToggleSpecV1],
) -> Result<(), ExtensionManifestError> {
    if let Some(kind) = first_duplicate(
        inline_format_toggles.iter().map(|toggle| toggle.format_kind().clone()).collect(),
    ) {
        return Err(ExtensionManifestError::DuplicateInlineFormatToggleTarget {
            extension: extension.clone(),
            kind,
        });
    }
    if let Some(action_id) = first_duplicate(
        inline_format_toggles.iter().map(|toggle| toggle.action_id().clone()).collect(),
    ) {
        return Err(ExtensionManifestError::DuplicateInlineFormatToggleActionId {
            extension: extension.clone(),
            action_id,
        });
    }
    if let Some(intent_id) = first_duplicate(
        inline_format_toggles.iter().map(|toggle| toggle.intent_id().clone()).collect(),
    ) {
        return Err(ExtensionManifestError::DuplicateInlineFormatToggleIntentId {
            extension: extension.clone(),
            intent_id,
        });
    }
    if let Some(binding_id) = first_duplicate(
        inline_format_toggles.iter().map(|toggle| toggle.binding_id().clone()).collect(),
    ) {
        return Err(ExtensionManifestError::DuplicateInlineFormatToggleBindingId {
            extension: extension.clone(),
            binding_id,
        });
    }
    if let Some(action_state_id) = first_duplicate(
        inline_format_toggles.iter().map(|toggle| toggle.action_state_id().clone()).collect(),
    ) {
        return Err(ExtensionManifestError::DuplicateInlineFormatToggleActionStateId {
            extension: extension.clone(),
            action_state_id,
        });
    }
    Ok(())
}

fn first_duplicate<T: Ord>(mut values: Vec<T>) -> Option<T> {
    values.sort();
    let mut values = values.into_iter();
    let mut previous = values.next()?;
    for value in values {
        if value == previous {
            return Some(value);
        }
        previous = value;
    }
    None
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

    use crate::{
        action::{ActionId, ActionStateId, routing::BindingId, routing::IntentId},
        identity::QualifiedName,
        schema::PersistedTypeRevision,
    };

    use crate::extension::{ExtensionVersion, InlineFormatSpecV1, InlineFormatToggleSpecV1};

    use super::{
        ExtensionId, ExtensionManifest, ExtensionManifestError,
        MAX_EXTENSION_CONFLICTS_PER_MANIFEST, MAX_EXTENSION_DEPENDENCIES_PER_MANIFEST,
        MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST,
        MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
    };

    fn id(name: &str, version: u32) -> Result<ExtensionId, Box<dyn Error>> {
        Ok(ExtensionId::new(QualifiedName::try_new(name)?, ExtensionVersion::try_new(version)?))
    }

    fn numbered_ids(prefix: &str, count: u32) -> Result<Vec<ExtensionId>, Box<dyn Error>> {
        (0..count)
            .map(|index| id(&format!("example/{prefix}-{index}"), 1))
            .collect::<Result<Vec<_>, _>>()
    }

    fn format(kind: &str, revision: u32) -> Result<InlineFormatSpecV1, Box<dyn Error>> {
        Ok(InlineFormatSpecV1::new(
            QualifiedName::try_new(kind)?,
            PersistedTypeRevision::try_new(revision)?,
        ))
    }

    fn numbered_formats(
        prefix: &str,
        count: u32,
    ) -> Result<Vec<InlineFormatSpecV1>, Box<dyn Error>> {
        (0..count)
            .map(|index| format(&format!("example/{prefix}-{index}"), 1))
            .collect::<Result<Vec<_>, _>>()
    }

    fn toggle(
        target: &str,
        action: &str,
        intent: &str,
        binding: &str,
        state: &str,
    ) -> Result<InlineFormatToggleSpecV1, Box<dyn Error>> {
        Ok(InlineFormatToggleSpecV1::new(
            QualifiedName::try_new(target)?,
            ActionId::try_new(action)?,
            IntentId::try_new(intent)?,
            BindingId::try_new(binding)?,
            ActionStateId::try_new(state)?,
        ))
    }

    fn numbered_toggles(
        prefix: &str,
        count: u32,
    ) -> Result<Vec<InlineFormatToggleSpecV1>, Box<dyn Error>> {
        (0..count)
            .map(|index| {
                toggle(
                    &format!("example/{prefix}-format-{index}"),
                    &format!("example/{prefix}-action-{index}"),
                    &format!("example/{prefix}-intent-{index}"),
                    &format!("example/{prefix}-binding-{index}"),
                    &format!("example/{prefix}-state-{index}"),
                )
            })
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
        assert!(manifest.inline_formats().is_empty());
        assert!(manifest.inline_format_toggles().is_empty());
        Ok(())
    }

    #[test]
    fn canonicalizes_inline_formats_and_preserves_revisions() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let manifest = ExtensionManifest::try_new_with_inline_formats(
            owner,
            Vec::new(),
            Vec::new(),
            vec![format("example/zeta", 9)?, format("example/alpha", 2)?],
        )?;

        assert_eq!(manifest.inline_formats()[0].kind().as_str(), "example/alpha");
        assert_eq!(manifest.inline_formats()[0].revision().get(), 2);
        assert_eq!(manifest.inline_formats()[1].kind().as_str(), "example/zeta");
        assert_eq!(manifest.inline_formats()[1].revision().get(), 9);
        Ok(())
    }

    #[test]
    fn duplicate_inline_format_diagnostic_is_canonical() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let left = ExtensionManifest::try_new_with_inline_formats(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            vec![
                format("example/zeta", 1)?,
                format("example/alpha", 1)?,
                format("example/zeta", 2)?,
                format("example/alpha", 3)?,
            ],
        );
        let right = ExtensionManifest::try_new_with_inline_formats(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            vec![
                format("example/alpha", 3)?,
                format("example/zeta", 2)?,
                format("example/alpha", 1)?,
                format("example/zeta", 1)?,
            ],
        );

        assert_eq!(left, right);
        assert_eq!(
            left,
            Err(ExtensionManifestError::DuplicateInlineFormat {
                extension: owner,
                kind: QualifiedName::try_new("example/alpha")?,
            })
        );
        Ok(())
    }

    #[test]
    fn canonicalizes_inline_format_toggles_by_target_then_ids() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let manifest = ExtensionManifest::try_new_with_inline_formats_and_toggles(
            owner,
            Vec::new(),
            Vec::new(),
            Vec::new(),
            vec![
                toggle(
                    "example/zeta",
                    "example/zeta-action",
                    "example/zeta-intent",
                    "example/zeta-binding",
                    "example/zeta-state",
                )?,
                toggle(
                    "example/alpha",
                    "example/alpha-action",
                    "example/alpha-intent",
                    "example/alpha-binding",
                    "example/alpha-state",
                )?,
            ],
        )?;

        let toggles = manifest.inline_format_toggles();
        assert_eq!(toggles[0].format_kind().as_str(), "example/alpha");
        assert_eq!(toggles[0].action_id().as_str(), "example/alpha-action");
        assert_eq!(toggles[0].intent_id().as_str(), "example/alpha-intent");
        assert_eq!(toggles[0].binding_id().as_str(), "example/alpha-binding");
        assert_eq!(toggles[0].action_state_id().as_str(), "example/alpha-state");
        assert_eq!(toggles[1].format_kind().as_str(), "example/zeta");
        Ok(())
    }

    #[test]
    fn duplicate_inline_format_toggle_targets_are_canonical() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let alpha_first = toggle(
            "example/alpha",
            "example/action-a",
            "example/intent-a",
            "example/binding-a",
            "example/state-a",
        )?;
        let alpha_second = toggle(
            "example/alpha",
            "example/action-b",
            "example/intent-b",
            "example/binding-b",
            "example/state-b",
        )?;
        let zeta_first = toggle(
            "example/zeta",
            "example/action-c",
            "example/intent-c",
            "example/binding-c",
            "example/state-c",
        )?;
        let zeta_second = toggle(
            "example/zeta",
            "example/action-d",
            "example/intent-d",
            "example/binding-d",
            "example/state-d",
        )?;

        let left = ExtensionManifest::try_new_with_inline_formats_and_toggles(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            vec![
                zeta_first.clone(),
                alpha_second.clone(),
                zeta_second.clone(),
                alpha_first.clone(),
            ],
        );
        let right = ExtensionManifest::try_new_with_inline_formats_and_toggles(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            vec![alpha_first, zeta_second, alpha_second, zeta_first],
        );

        assert_eq!(left, right);
        assert_eq!(
            left,
            Err(ExtensionManifestError::DuplicateInlineFormatToggleTarget {
                extension: owner,
                kind: QualifiedName::try_new("example/alpha")?,
            })
        );
        Ok(())
    }

    #[test]
    fn rejects_duplicate_inline_format_toggle_action_ids() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let shared = ActionId::try_new("example/shared-action")?;

        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats_and_toggles(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
                vec![
                    toggle(
                        "example/zeta",
                        "example/shared-action",
                        "example/intent-z",
                        "example/binding-z",
                        "example/state-z",
                    )?,
                    toggle(
                        "example/alpha",
                        "example/shared-action",
                        "example/intent-a",
                        "example/binding-a",
                        "example/state-a",
                    )?,
                ],
            ),
            Err(ExtensionManifestError::DuplicateInlineFormatToggleActionId {
                extension: owner,
                action_id: shared,
            })
        );
        Ok(())
    }

    #[test]
    fn rejects_duplicate_inline_format_toggle_intent_ids() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let shared = IntentId::try_new("example/shared-intent")?;

        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats_and_toggles(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
                vec![
                    toggle(
                        "example/alpha",
                        "example/action-a",
                        "example/shared-intent",
                        "example/binding-a",
                        "example/state-a",
                    )?,
                    toggle(
                        "example/zeta",
                        "example/action-z",
                        "example/shared-intent",
                        "example/binding-z",
                        "example/state-z",
                    )?,
                ],
            ),
            Err(ExtensionManifestError::DuplicateInlineFormatToggleIntentId {
                extension: owner,
                intent_id: shared,
            })
        );
        Ok(())
    }

    #[test]
    fn rejects_duplicate_inline_format_toggle_binding_ids() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let shared = BindingId::try_new("example/shared-binding")?;

        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats_and_toggles(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
                vec![
                    toggle(
                        "example/alpha",
                        "example/action-a",
                        "example/intent-a",
                        "example/shared-binding",
                        "example/state-a",
                    )?,
                    toggle(
                        "example/zeta",
                        "example/action-z",
                        "example/intent-z",
                        "example/shared-binding",
                        "example/state-z",
                    )?,
                ],
            ),
            Err(ExtensionManifestError::DuplicateInlineFormatToggleBindingId {
                extension: owner,
                binding_id: shared,
            })
        );
        Ok(())
    }

    #[test]
    fn rejects_duplicate_inline_format_toggle_action_state_ids() -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let shared = ActionStateId::try_new("example/shared-state")?;

        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats_and_toggles(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
                vec![
                    toggle(
                        "example/alpha",
                        "example/action-a",
                        "example/intent-a",
                        "example/binding-a",
                        "example/shared-state",
                    )?,
                    toggle(
                        "example/zeta",
                        "example/action-z",
                        "example/intent-z",
                        "example/binding-z",
                        "example/shared-state",
                    )?,
                ],
            ),
            Err(ExtensionManifestError::DuplicateInlineFormatToggleActionStateId {
                extension: owner,
                action_state_id: shared,
            })
        );
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

    #[test]
    fn inline_format_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let exact = numbered_formats("format", MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST)?;
        let accepted = ExtensionManifest::try_new_with_inline_formats(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            exact,
        )?;
        assert_eq!(
            u32::try_from(accepted.inline_formats().len())?,
            MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST
        );

        let too_many =
            numbered_formats("format-overflow", MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST + 1)?;
        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                too_many,
            ),
            Err(ExtensionManifestError::TooManyInlineFormats {
                extension: owner,
                actual: MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST + 1,
                maximum: MAX_EXTENSION_INLINE_FORMATS_PER_MANIFEST,
            })
        );
        Ok(())
    }

    #[test]
    fn inline_format_toggle_ceiling_accepts_exact_limit_and_rejects_limit_plus_one()
    -> Result<(), Box<dyn Error>> {
        let owner = id("example/owner", 1)?;
        let exact = numbered_toggles("toggle", MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST)?;
        let accepted = ExtensionManifest::try_new_with_inline_formats_and_toggles(
            owner.clone(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            exact,
        )?;
        assert_eq!(
            u32::try_from(accepted.inline_format_toggles().len())?,
            MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST
        );

        let too_many = numbered_toggles(
            "toggle-overflow",
            MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST + 1,
        )?;
        assert_eq!(
            ExtensionManifest::try_new_with_inline_formats_and_toggles(
                owner.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
                too_many,
            ),
            Err(ExtensionManifestError::TooManyInlineFormatToggles {
                extension: owner,
                actual: MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST + 1,
                maximum: MAX_EXTENSION_INLINE_FORMAT_TOGGLES_PER_MANIFEST,
            })
        );
        Ok(())
    }
}
