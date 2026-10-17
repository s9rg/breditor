//! Bounded ordered authenticated catchup; no unbounded full-metadata socket snapshot.
use super::{MAX_PAGE_BYTES, ReviewCatchup, ReviewCursor, Room};
use crate::{Error, Result};
use breditor_collab_feasibility::review::{ReviewActorId, ReviewPrincipalId, ReviewWriterClock};

impl Room {
    /// Read one ordered review page. Cursor binding and sequence must refer to this exact log.
    /// The client persists applied paired native state BEFORE advancing this cursor.
    /// No active authoring lease is needed to read, but current document-read rights are mandatory.
    /// # Errors
    /// Rejects missing read permission, foreign/future/noncanonical cursors and storage failures.
    pub fn review_catchup(
        &self,
        principal: &str,
        cursor: Option<&ReviewCursor>,
    ) -> Result<ReviewCatchup> {
        let descriptor = self.review_descriptor(principal)?;
        let state = self.review_state()?;
        let after = if let Some(cursor) = cursor {
            let after =
                cursor.after.parse::<u64>().map_err(|_| Error::Contract("review cursor"))?;
            if cursor.binding != state.binding
                || after.to_string() != cursor.after
                || (after != state.enabled_at
                    && !state.batches.iter().any(|b| b.sequence == cursor.after))
            {
                return Err(Error::Contract("review cursor binding or sequence"));
            }
            after
        } else {
            state.enabled_at
        };
        let mut page = ReviewCatchup {
            descriptor,
            cursor: ReviewCursor { binding: state.binding.clone(), after: after.to_string() },
            more: false,
            batches: vec![],
        };
        for batch in &state.batches {
            let sequence = batch
                .sequence
                .parse::<u64>()
                .map_err(|_| Error::Contract("stored review sequence"))?;
            if sequence <= after {
                continue;
            }
            page.batches.push(batch.clone());
            if serde_json::to_vec(&page)?.len() > MAX_PAGE_BYTES {
                page.batches.pop();
                if page.batches.is_empty() {
                    return Err(Error::Contract("review page budget"));
                }
                page.more = true;
                break;
            }
            page.cursor.after.clone_from(&batch.sequence);
        }
        // Budget includes cursor and final `more`; unlike raw frame size, outer escaping counts.
        if serde_json::to_vec(&page)?.len() > MAX_PAGE_BYTES {
            return Err(Error::Contract("review page budget"));
        }
        Ok(page)
    }
    /// Read a registered actor's canonical accepted prefix, including its bound empty stream.
    /// This is a lineage witness, not permission to author or import an unknown own-writer suffix.
    /// # Errors
    /// Rejects missing read permission, unknown writer and unavailable storage.
    pub fn review_writer_clock(
        &self,
        principal: &str,
        actor: &ReviewActorId,
    ) -> Result<ReviewWriterClock> {
        self.reader(principal)?;
        let state = self.review_state()?;
        let writer = state.writers.get(actor).ok_or(Error::Lease)?;
        Ok(state.session.writer_clock(actor, &ReviewPrincipalId::try_new(&writer.principal)?)?)
    }
}
