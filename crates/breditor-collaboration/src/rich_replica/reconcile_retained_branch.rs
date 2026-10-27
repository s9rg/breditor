//! Atomic native compatible-branch union, never reconstruction of missing own Undo history.
use super::{
    RichReplica, SharedObservation,
    session::Entry,
    verify_retained_branch::{pending_in_source, same_causal_prefix},
};
use crate::Error;

#[cfg(test)]
#[path = "reconcile_retained_branch_tests.rs"]
mod tests;

impl RichReplica {
    /// Retain foreign operations from a genuine compatible same-writer native source.
    /// The current owner's complete own history is authoritative and is not reordered,
    /// replaced, regrouped or reauthored. The source must have an exact contribution prefix;
    /// an unknown own suffix or incomparable own branch rejects before any import.
    /// All original retained peer inputs, including pending dependencies, use ordinary
    /// native admission in a private candidate. A source-pending buffer is additionally
    /// retained verbatim even when normal semantic admission can omit a known transport
    /// echo. Original ordinary receive/compaction defaults are unchanged. Such retention
    /// acknowledges neither a server receipt nor that pending operations were applied.
    /// Failure leaves both original owners intact.
    /// True means one final native publication; false means nothing needed retaining.
    /// The explicit incoming-byte ceiling is checked before staging; input accounting
    /// counts unique source blobs absent from the target, including pending inputs.
    /// Read-only access is preserved; importing data never grants local editing rights.
    /// The host must separately authenticate sources, lease the actor, retain original
    /// files, coordinate durable storage and authorize any room activation.
    ///
    /// # Errors
    /// Stale/foreign observations, a native/history/generation mismatch, source own history
    /// ahead/forked, a foreign causal fork, malformed/pending admission or ordinary limits.
    pub fn reconcile_retained_branch_guarded(
        &mut self,
        observed: &SharedObservation,
        source: &Self,
        source_observed: &SharedObservation,
        maximum_incoming_bytes: usize,
    ) -> Result<bool, Error> {
        let incoming =
            self.retained_branch_input_bytes_guarded(observed, source, source_observed)?;
        if incoming > maximum_incoming_bytes {
            return Err(Error::Limit("retained branch incoming input bytes"));
        }
        let writer = self
            .writer()
            .parse::<u64>()
            .map_err(|_| Error::Contract("retained branch writer identity"))?;
        same_causal_prefix(
            self,
            source,
            writer,
            source.doc.oplog_vv().get(&writer).copied().unwrap_or(0),
        )?;
        let mut candidate = self.staged()?;
        for bytes in source.journal.retained_updates() {
            let before = candidate.journal.entries.len();
            candidate.receive(bytes.to_vec())?;
            if pending_in_source(source, bytes)?
                && !candidate.journal.retained_updates().any(|current| current == bytes)
            {
                // Only this operation's new private entry can be replaced;
                // never rewrite any current owner's previously retained entry.
                if candidate.journal.entries.len() == before {
                    candidate.journal.entries.push(Entry::Remote { bytes: bytes.to_vec() });
                } else if candidate.journal.entries.len() == before + 1 {
                    let Some(Entry::Remote { bytes: retained }) =
                        candidate.journal.entries.last_mut()
                    else {
                        return Err(Error::Contract(
                            "retained branch import changed command history",
                        ));
                    };
                    *retained = bytes.to_vec();
                } else {
                    return Err(Error::Contract("retained branch import history shape differs"));
                }
            }
        }
        candidate.verify_retained_branch_guarded(&candidate.observe()?, source, source_observed)?;
        if candidate.journal.entries.len() == self.journal.entries.len() {
            return Ok(false);
        }
        self.adopt(candidate)?;
        Ok(true)
    }
}
