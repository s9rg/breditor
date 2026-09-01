use std::fmt;

use super::{
    ActionStateDomains, ActionStateId, ActionStateObservationId, MAX_ACTION_STATE_ENTRIES,
};

/// Immutable description of observable changes between two cached observations.
///
/// Changed IDs are retained in strictly increasing lexical order and contain
/// no duplicates. Their count cannot exceed [`MAX_ACTION_STATE_ENTRIES`]. The
/// changed basis domains describe which exact cache inputs changed; they do not
/// claim that every changed entry reads every listed domain.
#[derive(Clone, Eq, PartialEq)]
pub struct ActionStateDelta {
    prior_id: ActionStateObservationId,
    new_id: ActionStateObservationId,
    changed_basis_domains: ActionStateDomains,
    changed_ids: Box<[ActionStateId]>,
}

impl ActionStateDelta {
    /// Creates a delta from cache-proved canonical inputs.
    ///
    /// The cache must supply distinct observation identities, a nonempty changed
    /// basis, and a bounded, strictly increasing lexical ID list derived from
    /// its frozen catalog.
    pub(crate) fn new(
        prior_id: ActionStateObservationId,
        new_id: ActionStateObservationId,
        changed_basis_domains: ActionStateDomains,
        changed_ids: Vec<ActionStateId>,
    ) -> Self {
        debug_assert_ne!(prior_id, new_id);
        debug_assert!(!changed_basis_domains.is_empty());
        debug_assert!(
            u32::try_from(changed_ids.len()).is_ok_and(|count| count <= MAX_ACTION_STATE_ENTRIES)
        );
        debug_assert!(changed_ids.windows(2).all(|pair| pair[0] < pair[1]));

        Self {
            prior_id,
            new_id,
            changed_basis_domains,
            changed_ids: changed_ids.into_boxed_slice(),
        }
    }

    /// Returns the identity of the observation being advanced from.
    #[must_use]
    pub const fn prior_id(&self) -> &ActionStateObservationId {
        &self.prior_id
    }

    /// Returns the identity of the newly published observation.
    #[must_use]
    pub const fn new_id(&self) -> &ActionStateObservationId {
        &self.new_id
    }

    /// Returns exact cache-basis domains that changed between observations.
    #[must_use]
    pub const fn changed_basis_domains(&self) -> ActionStateDomains {
        self.changed_basis_domains
    }

    /// Returns changed observable IDs in strictly increasing lexical order.
    #[must_use]
    pub const fn changed_ids(&self) -> &[ActionStateId] {
        &self.changed_ids
    }
}

impl fmt::Debug for ActionStateDelta {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ActionStateDelta")
            .field("prior_id", &self.prior_id)
            .field("new_id", &self.new_id)
            .field("changed_basis_domains", &self.changed_basis_domains)
            .field("changed_id_count", &self.changed_ids.len())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delta_retains_canonical_ids_and_redacts_them_from_debug()
    -> Result<(), Box<dyn std::error::Error>> {
        let prior_id = ActionStateObservationId::new();
        let new_id = ActionStateObservationId::new();
        let first = ActionStateId::try_new("test/first")?;
        let second = ActionStateId::try_new("test/second")?;
        let delta = ActionStateDelta::new(
            prior_id.clone(),
            new_id.clone(),
            ActionStateDomains::DOCUMENT.union(ActionStateDomains::SELECTION),
            vec![first.clone(), second.clone()],
        );

        assert_eq!(delta.prior_id(), &prior_id);
        assert_eq!(delta.new_id(), &new_id);
        assert_eq!(delta.changed_ids(), &[first, second]);
        assert!(delta.changed_basis_domains().contains(ActionStateDomains::DOCUMENT));
        assert!(delta.changed_basis_domains().contains(ActionStateDomains::SELECTION));
        let debug = format!("{delta:?}");
        assert!(!debug.contains("test/first"));
        assert!(!debug.contains("test/second"));
        Ok(())
    }
}
