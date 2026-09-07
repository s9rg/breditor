use std::{fmt, sync::Arc};

use crate::{
    identity::QualifiedName,
    profile::CompiledProfileGeneration,
    session::EditorSession,
    state::{EditorState, EditorStateField},
};

use super::{
    ActionStateBatch, ActionStateCacheUpdate, ActionStateCatalog, ActionStateDelta,
    ActionStateDeriveError, ActionStateDomains, ActionStateEntry, ActionStateFault,
    ActionStateObservation, ActionStateObservationId, ActionStateOutcome,
    batch::{ActionStateBatchBuilder, normalize_entry},
};

/// Single-observation synchronous cache for one frozen action-state catalog.
///
/// The cache retains at most one immutable observation. It never retains an
/// executable preparation, commit, routed command, callback, subscriber, or
/// delivery queue. Refresh is transactional: a batch-wide resource error leaves
/// the prior observation and its identity untouched.
pub struct ActionStateCache {
    catalog: ActionStateCatalog,
    profile_generation: Option<CompiledProfileGeneration>,
    source_leaders: Box<[usize]>,
    leader_has_followers: Box<[bool]>,
    current: Option<ActionStateObservation>,
}

impl ActionStateCache {
    /// Creates an empty cache over one exact frozen catalog generation.
    #[must_use]
    pub fn new(catalog: ActionStateCatalog) -> Self {
        let source_leaders = source_leaders(&catalog);
        let mut leader_has_followers = vec![false; source_leaders.len()];
        for (index, leader) in source_leaders.iter().copied().enumerate() {
            if leader < index {
                leader_has_followers[leader] = true;
            }
        }
        Self {
            catalog,
            profile_generation: None,
            source_leaders,
            leader_has_followers: leader_has_followers.into_boxed_slice(),
            current: None,
        }
    }

    /// Creates a cache bound to one exact compiled-profile generation.
    pub(crate) fn with_profile_generation(
        catalog: ActionStateCatalog,
        profile_generation: CompiledProfileGeneration,
    ) -> Self {
        let mut cache = Self::new(catalog);
        cache.profile_generation = Some(profile_generation);
        cache
    }

    /// Returns the expected compiled-profile generation, when this cache is bound.
    #[must_use]
    pub const fn profile_generation(&self) -> Option<&CompiledProfileGeneration> {
        self.profile_generation.as_ref()
    }

    /// Returns the exact catalog authority evaluated by this cache.
    #[must_use]
    pub const fn catalog(&self) -> &ActionStateCatalog {
        &self.catalog
    }

    /// Returns the currently retained observation, when one exists.
    #[must_use]
    pub const fn current(&self) -> Option<&ActionStateObservation> {
        self.current.as_ref()
    }

    /// Drops the retained observation without changing the catalog.
    ///
    /// The next successful refresh returns a full update with a fresh opaque
    /// observation identity.
    pub fn clear(&mut self) -> bool {
        self.current.take().is_some()
    }

    /// Refreshes the cache against one exact current session instant.
    ///
    /// An exact complete state-and-history hit performs no action evaluation and
    /// returns the existing observation identity. A changed basis reevaluates
    /// only source groups whose declared reads intersect the changed domains;
    /// exact duplicate sources evaluate once. The returned delta is a local
    /// rerender hint paired with the complete new observation, never a wire
    /// patch or executable command.
    ///
    /// # Errors
    ///
    /// Returns [`ActionStateDeriveError`] when the supplied session belongs to a
    /// different compiled-profile generation or the staged complete batch
    /// exceeds a batch-wide retained payload bound. The previous observation
    /// remains installed and no partial update is returned.
    pub fn refresh(
        &mut self,
        session: &EditorSession,
    ) -> Result<ActionStateCacheUpdate, ActionStateDeriveError> {
        if let Some(expected) = self.profile_generation.as_ref()
            && session.state().context().profile_generation() != Some(expected)
        {
            return Err(ActionStateDeriveError::ProfileGenerationMismatch);
        }
        let base = session.state().clone();
        let history = session.history_status();
        let previous = self.current.clone();

        if let Some(observation) = &previous
            && observation.batch().base_state() == &base
            && observation.batch().history_status() == &history
        {
            return Ok(ActionStateCacheUpdate::unchanged(observation.clone()));
        }

        let changed_domains = previous.as_ref().map_or(ActionStateDomains::ALL, |observation| {
            changed_basis(observation.batch(), &base, &history)
        });
        let batch =
            self.derive_batch(session, base, history, previous.as_ref(), changed_domains)?;
        let id = ActionStateObservationId::new();
        let observation = ActionStateObservation::new(
            self.profile_generation.clone(),
            id.clone(),
            Arc::new(batch),
        );
        let update = previous.as_ref().map_or_else(
            || ActionStateCacheUpdate::full(observation.clone()),
            |prior| {
                let changed_ids = changed_entry_ids(prior.batch(), observation.batch());
                let delta =
                    ActionStateDelta::new(prior.id().clone(), id, changed_domains, changed_ids);
                ActionStateCacheUpdate::from_delta(observation.clone(), delta)
            },
        );
        self.current = Some(observation);
        Ok(update)
    }

    fn derive_batch(
        &self,
        session: &EditorSession,
        base: EditorState,
        history: crate::session::SessionHistoryStatus,
        previous: Option<&ActionStateObservation>,
        changed_domains: ActionStateDomains,
    ) -> Result<ActionStateBatch, ActionStateDeriveError> {
        let descriptors = self.catalog.descriptors();
        let mut builder = ActionStateBatchBuilder::new(base, history, descriptors.len());
        let mut duplicate_source_outcomes =
            (0..descriptors.len()).map(|_| None).collect::<Vec<Option<ActionStateOutcome>>>();

        for (index, descriptor) in descriptors.iter().enumerate() {
            let leader = self.source_leaders.get(index).copied().unwrap_or(index);
            let outcome = if leader < index {
                duplicate_source_outcomes
                    .get(leader)
                    .and_then(Option::as_ref)
                    .cloned()
                    .unwrap_or_else(duplicate_source_invariant)
            } else if !descriptor.effects().reads().intersects(changed_domains) {
                previous
                    .and_then(|observation| observation.batch().entries().get(index))
                    .filter(|entry| entry.descriptor() == descriptor)
                    .map_or_else(
                        || self.catalog.derive_entry(session, descriptor),
                        |entry| entry.outcome().clone(),
                    )
            } else {
                self.catalog.derive_entry(session, descriptor)
            };

            let entry = normalize_entry(ActionStateEntry::new(descriptor.clone(), outcome));
            if self.leader_has_followers[index] {
                duplicate_source_outcomes[index] = Some(entry.outcome().clone());
            }
            builder.push(entry)?;
        }
        Ok(builder.finish())
    }
}

impl fmt::Debug for ActionStateCache {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let source_group_count = self
            .source_leaders
            .iter()
            .enumerate()
            .filter(|(index, leader)| index == *leader)
            .count();
        formatter
            .debug_struct("ActionStateCache")
            .field("catalog", &self.catalog)
            .field("profile_generation", &self.profile_generation)
            .field("source_group_count", &source_group_count)
            .field("has_current", &self.current.is_some())
            .finish_non_exhaustive()
    }
}

fn source_leaders(catalog: &ActionStateCatalog) -> Box<[usize]> {
    let descriptors = catalog.descriptors();
    descriptors
        .iter()
        .enumerate()
        .map(|(index, descriptor)| {
            descriptors[..index]
                .iter()
                .position(|candidate| candidate.has_same_evaluation_as(descriptor))
                .unwrap_or(index)
        })
        .collect::<Vec<_>>()
        .into_boxed_slice()
}

fn changed_basis(
    previous: &ActionStateBatch,
    current: &EditorState,
    history: &crate::session::SessionHistoryStatus,
) -> ActionStateDomains {
    let previous_state = previous.base_state();
    let mut changed = ActionStateDomains::NONE;
    for field in current.changed_fields_from(previous_state) {
        changed |= match field {
            EditorStateField::Context => ActionStateDomains::CONTEXT,
            EditorStateField::Snapshot => ActionStateDomains::SNAPSHOT,
            EditorStateField::Document => ActionStateDomains::DOCUMENT,
            EditorStateField::Selection => ActionStateDomains::SELECTION,
            EditorStateField::PendingFormats => ActionStateDomains::PENDING_FORMATS,
        };
    }
    if previous.history_status() != history {
        changed |= ActionStateDomains::HISTORY;
    }

    changed
}

fn changed_entry_ids(
    previous: &ActionStateBatch,
    current: &ActionStateBatch,
) -> Vec<super::ActionStateId> {
    current
        .entries()
        .iter()
        .filter(|entry| {
            previous.entry(entry.id()).is_none_or(|prior| prior.outcome() != entry.outcome())
        })
        .map(|entry| entry.id().clone())
        .collect()
}

fn duplicate_source_invariant() -> ActionStateOutcome {
    ActionStateOutcome::Fault(ActionStateFault::Invariant {
        code: QualifiedName::from_known_static("breditor/action-state-cache-source-group"),
    })
}
