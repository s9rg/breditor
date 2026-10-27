//! Separate compatible-branch proof. The existing exact journal-prefix contract is unchanged.
use super::{RichReplica, SharedObservation, session::Entry};
use crate::Error;
use loro::{IdSpan, LoroDoc};

pub(super) fn compatible_local_prefix(
    current: &RichReplica,
    source: &RichReplica,
) -> Result<(), Error> {
    if current.protocol != source.protocol
        || current.codec.schema().fingerprint() != source.codec.schema().fingerprint()
        || current.replay_contract != source.replay_contract
        || current.search_contract != source.search_contract
        || current.reviewed_contract != source.reviewed_contract
        || current.typing.is_some() != source.typing.is_some()
        || current.document_id() != source.document_id()
        || current.writer() != source.writer()
        || current.journal.format != source.journal.format
        || current.journal.version != source.journal.version
        || serde_json::to_vec(&current.journal.origin)?
            != serde_json::to_vec(&source.journal.origin)?
    {
        return Err(Error::Contract("retained branch native identity differs"));
    }
    current.verify_retained_branch_generations(source)?;
    let current_entries = contributions(current);
    let source_entries = contributions(source);
    if current_entries.len() < source_entries.len() {
        return Err(Error::Contract("retained branch own history is ahead"));
    }
    for ((left, joined_left), (right, joined_right)) in source_entries.iter().zip(current_entries) {
        // Compare the entire native command/Undo/Redo/owned-effect entry, not
        // just visible text, actor counters, group depths or command labels.
        if joined_left != &joined_right || serde_json::to_vec(left)? != serde_json::to_vec(right)? {
            return Err(Error::Contract("retained branch own contribution differs"));
        }
    }
    Ok(())
}

fn contributions(owner: &RichReplica) -> Vec<(&Entry, bool)> {
    owner
        .journal
        .entries
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            if matches!(entry, Entry::Remote { .. }) {
                None
            } else {
                let joined = owner.typing.as_ref().is_some_and(|history| {
                    u32::try_from(index)
                        .is_ok_and(|index| history.joins.binary_search(&index).is_ok())
                });
                Some((entry, joined))
            }
        })
        .collect()
}

pub(super) fn same_causal_prefix(
    current: &RichReplica,
    source: &RichReplica,
    peer: u64,
    through: i32,
) -> Result<(), Error> {
    if current.doc.oplog_vv().get(&peer).copied().unwrap_or(0) < through
        || serde_json::to_vec(
            &current
                .doc
                .export_json_in_id_span(IdSpan::new(peer, 0, through)),
        )? != serde_json::to_vec(
            &source
                .doc
                .export_json_in_id_span(IdSpan::new(peer, 0, through)),
        )?
    {
        return Err(Error::Contract("retained branch causal prefix differs"));
    }
    Ok(())
}

/// Source-pending input is an independent retained obligation. A different
/// owner's counters do not prove what immutable bytes that source held.
pub(super) fn pending_in_source(source: &RichReplica, bytes: &[u8]) -> Result<bool, Error> {
    let applied = source.doc.state_vv();
    let metadata = LoroDoc::decode_import_blob_meta(bytes, true)?;
    Ok(metadata
        .partial_end_vv
        .iter()
        .any(|(peer, through)| applied.get(peer).copied().unwrap_or(0) < *through))
}

impl RichReplica {
    /// Verify compatible same-writer history coverage with independently arrived peer inputs.
    /// Every source non-Remote entry and original typing partition must be an exact prefix
    /// of this owner's contributions, in order. Every source causal operation is compared
    /// natively. Inputs pending in the SOURCE must also remain as exact retained bytes,
    /// even if this owner already knows those counters from a different input. This does
    /// not claim that still-pending operations have been applied or acknowledged.
    /// This is NOT the original exact-entry recovery-origin proof, an AST comparison,
    /// a lease, account permission or a serving-generation grant. Neither owner changes.
    ///
    /// # Errors
    /// Stale observations, foreign identity, incomparable own history, generation forks,
    /// missing/forked peer operations or missing causally pending input reject.
    pub fn verify_retained_branch_guarded(
        &self,
        observed: &SharedObservation,
        source: &Self,
        source_observed: &SharedObservation,
    ) -> Result<(), Error> {
        self.check(observed)?;
        source.check(source_observed)?;
        compatible_local_prefix(self, source)?;
        for (peer, through) in source.doc.oplog_vv().iter() {
            same_causal_prefix(self, source, *peer, *through)?;
        }
        for bytes in source.journal.retained_updates() {
            if pending_in_source(source, bytes)?
                && !self
                    .journal
                    .retained_updates()
                    .any(|current| current == bytes)
            {
                return Err(Error::Contract("retained branch pending input is absent"));
            }
        }
        Ok(())
    }
}
