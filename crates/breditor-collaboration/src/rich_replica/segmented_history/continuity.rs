//! New cross-segment continuity uses actual native journal inputs AND immutable generation history.
use super::super::{RichReplica, SharedObservation, session::publication};
use crate::Error;
impl RichReplica {
    /// Only the new compatible-branch operation may use generation structure
    /// independently of the old exact native-entry prefix. No file is rewritten.
    pub(in crate::rich_replica) fn verify_retained_branch_generations(
        &self,
        source: &Self,
    ) -> Result<(), Error> {
        let Some(before) = &source.segmented else {
            return Ok(());
        };
        let current = self
            .segmented
            .as_ref()
            .ok_or(Error::Contract("retained segmented source cannot be downgraded"))?;
        if current.root.generation != before.root.generation
            || current.root.json != before.root.json
            || current.sealed.len() < before.sealed.len()
            || before
                .sealed
                .iter()
                .zip(&current.sealed)
                .any(|(left, right)| left.json != right.json)
        {
            return Err(Error::Contract("retained branch immutable generation differs"));
        }
        let continuation = current
            .sealed
            .get(before.sealed.len())
            .map_or(current.active_generation.as_str(), |file| file.record.generation.as_str());
        if continuation != before.active_generation {
            return Err(Error::Contract("retained branch active generation differs"));
        }
        Ok(())
    }
    /// Verify a native continuation across the explicitly selected segmented history family.
    /// A legacy origin must be within the retained original pre-migration root. A segmented
    /// origin must retain the same exact root and sealed files, plus its original active ID.
    /// Every old native command, remote input and typing join must still be an exact prefix.
    /// This read grants no current writer/account/provider authority and merges no fork.
    /// # Errors
    /// Stale/foreign guards, disabled mode, mismatched native family/source, rewritten or
    /// shortened native/generation histories reject without modifying either owner.
    pub fn verify_segmented_recovery_origin_guarded(
        &self,
        observed: &SharedObservation,
        origin: &Self,
        origin_observed: &SharedObservation,
    ) -> Result<(), Error> {
        self.verify_native_origin_prefix_guarded(observed, origin, origin_observed)?;
        let current =
            self.segmented.as_ref().ok_or(Error::Contract("segmented history required"))?;
        if let Some(before) = &origin.segmented {
            if current.root.generation != before.root.generation
                || current.root.json != before.root.json
                || current.sealed.len() < before.sealed.len()
            {
                return Err(Error::Contract("segmented recovery original root differs"));
            }
            for (a, b) in before.sealed.iter().zip(&current.sealed) {
                if a.json != b.json {
                    return Err(Error::Contract("segmented recovery sealed generation differs"));
                }
            }
            let next = current
                .sealed
                .get(before.sealed.len())
                .map_or(current.active_generation.as_str(), |s| s.record.generation.as_str());
            if next != before.active_generation {
                return Err(Error::Contract("segmented recovery active generation changed"));
            }
        } else if origin.journal.entries.len() > current.root.journal.entries.len()
            || publication(&origin.journal.publication)?
                > publication(&current.root.journal.publication)?
        {
            return Err(Error::Contract("legacy origin is not within the retained segmented root"));
        }
        Ok(())
    }
}
