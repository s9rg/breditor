//! Replay every actual native operation across exact linked segments; no AST replacement.
use super::super::{RichReplica, SharedRichProfile, session::MAX_JOURNAL_BYTES};
use super::{
    archive::Archive,
    binding::Family,
    segment::Sealed,
    state::{Root, SegmentedHistory},
};
use crate::Error;
use std::sync::Arc;

impl SharedRichProfile {
    /// Restore ONLY the separately requested segmented-history/v1 family. The host must first
    /// reacquire this writer's exclusive lease; archived IDs/phase metadata grant no authority.
    /// The original root is admitted by its exact original factory; every later input/effect,
    /// scope, grouping boundary, native history item and causal reference is then replayed.
    /// # Errors
    /// Wrong room/profile, unknown/noncanonical shape, altered links or original inputs,
    /// divergent effects/grouping, ID reuse, missing segments and resource bounds reject before
    /// exposing an owner. This does not repair a truncated chain, merge a fork or reset history.
    pub fn restore_segmented(&self, room: &str, input: &str) -> Result<RichReplica, Error> {
        let archive = Archive::read(input)?;
        if archive.root_checkpoint.len() > MAX_JOURNAL_BYTES {
            return Err(Error::Limit("segmented original checkpoint bytes"));
        }
        let original = archive.family.restore(self, room, &archive.root_checkpoint)?;
        if Family::of(&original).checkpoint(&original)? != archive.root_checkpoint {
            return Err(Error::Contract("segmented canonical original checkpoint differs"));
        }
        let retained_root = Root::capture(&original, archive.root_generation)?;
        let sealed = archive
            .sealed
            .0
            .iter()
            .map(|json| Sealed::read(json).map(Arc::new))
            .collect::<Result<Vec<_>, _>>()?;
        let active = Sealed::read(&archive.active)?;
        let state = SegmentedHistory {
            root: Arc::new(retained_root),
            sealed,
            active_generation: active.record.generation.clone(),
        };
        let (parent, hash) = state.parent();
        if active.record.parent_generation != parent
            || active.record.parent_sha256 != hash
            || usize::try_from(active.record.start).ok() != Some(state.start())
        {
            return Err(Error::Contract("segmented active native link differs"));
        }
        let mut journal = original.journal.clone();
        let mut joins = original.typing.as_ref().map(|h| h.joins.clone());
        for segment in state.sealed.iter().map(|s| &s.record).chain(std::iter::once(&active.record))
        {
            journal.entries.extend_from_slice(&segment.entries);
            if let Some(joins) = &mut joins {
                joins.extend_from_slice(&segment.joins);
            } else if !segment.joins.is_empty() {
                return Err(Error::Contract("segmented ordinary history has typing joins"));
            }
        }
        journal.ui = active.record.ui;
        journal.publication = active.record.publication;
        RichReplica::from_segmented_journal_cached(
            self.codec.clone(),
            journal,
            joins,
            false,
            archive.family.capabilities(),
            None,
            Some(state),
        )
    }
}
