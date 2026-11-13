//! Exact source-selected native cuts. Never approximate retained history with a full-state import.
use super::ServerNativeHistoryLane;
use crate::{Error, Result, Room};
use breditor_collab_feasibility::{
    review::ReviewSession,
    rich_replica::{PreparedWriterGroup, RichReplica},
};
use sha2::{Digest, Sha256};

pub(in crate::room) fn document_checkpoint(owner: &RichReplica) -> Result<String> {
    Ok(if owner.continued_history_enabled() {
        owner.continued_history_checkpoint()?
    } else if owner.segmented_history_enabled() {
        owner.segmented_checkpoint()?
    } else if owner.document_selection_enabled() {
        owner.document_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}

pub(super) fn review_checkpoint(owner: &ReviewSession) -> Result<String> {
    Ok(if owner.has_continued_history() {
        owner.continued_checkpoint_json()?
    } else if owner.has_segmented_history() {
        owner.segmented_checkpoint_json()?
    } else {
        owner.checkpoint_json()?
    })
}

pub(super) fn digest(
    lane: ServerNativeHistoryLane,
    checkpoint: &str,
    effect: Option<&str>,
) -> [u8; 32] {
    let mut sha = Sha256::new();
    sha.update(b"breditor/relay-native-history-boundary/1\0");
    sha.update([match lane {
        ServerNativeHistoryLane::Document => 0,
        ServerNativeHistoryLane::Review => 1,
    }]);
    for part in [Some(checkpoint), effect] {
        sha.update([u8::from(part.is_some())]);
        if let Some(part) = part {
            sha.update((part.len() as u64).to_be_bytes());
            sha.update(part.as_bytes());
        }
    }
    sha.finalize().into()
}

impl Room {
    pub(in crate::room) fn check_prepared_document_history(
        &self,
        prepared: &PreparedWriterGroup,
    ) -> Result<()> {
        if self.replica.continued_history_enabled() {
            prepared.continued_history_checkpoint()?;
        } else if self.replica.segmented_history_enabled() {
            prepared.segmented_checkpoint()?;
        } else {
            prepared.checkpoint()?;
        }
        Ok(())
    }

    /// Read exact server-native recovery input for an authenticated owner-side archival tool.
    /// This excludes the private effect-author cut, external assets and all client offline stores;
    /// use the complete room backup for durable server recovery. No saved grant is returned.
    /// # Errors
    /// Non-owner access, disabled comments, uncertain storage and native archive limits refuse.
    pub fn native_history_checkpoint(
        &self,
        principal: &str,
        lane: ServerNativeHistoryLane,
    ) -> Result<String> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        match lane {
            ServerNativeHistoryLane::Document => document_checkpoint(&self.replica),
            ServerNativeHistoryLane::Review => review_checkpoint(
                &self.review.as_ref().ok_or(Error::Contract("review V1 not enabled"))?.session,
            ),
        }
    }
}
