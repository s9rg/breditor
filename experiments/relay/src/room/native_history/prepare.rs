//! Replayed, unpublished native candidates. Complete cut hashes also bind the private effect author.
use super::{NativeHistoryBoundary, ServerNativeHistoryLane, checkpoint};
use crate::{Error, Result, Room};
use breditor_collab_feasibility::{review::ReviewSession, rich_replica::RichReplica};
use sha2::{Digest, Sha256};
use std::fmt::Write;

pub(super) enum NativeHistoryCandidate {
    Document { receiver: Box<RichReplica>, effect: Option<Box<RichReplica>> },
    Review(Box<ReviewSession>),
}
pub(super) struct PreparedNativeHistory {
    pub candidate: NativeHistoryCandidate,
    pub before: [u8; 32],
    pub after: [u8; 32],
}

fn effect_generation(id: &str) -> String {
    let mut sha = Sha256::new();
    sha.update(b"breditor/relay-effect-history-generation/1\0");
    sha.update(id.as_bytes());
    let bytes: [u8; 32] = sha.finalize().into();
    let mut value = String::with_capacity(71);
    value.push_str("effect-");
    for byte in bytes {
        let _ = write!(value, "{byte:02x}");
    }
    value
}

impl Room {
    fn restore_history_candidate(&self, owner: &RichReplica, before: &str) -> Result<RichReplica> {
        let candidate = if owner.segmented_history_enabled() {
            self.profile.restore_segmented(owner.document_id(), before)?
        } else if owner.document_selection_enabled() {
            self.profile.restore_document(owner.document_id(), before)?
        } else {
            self.profile.restore(owner.document_id(), before)?
        };
        if checkpoint::document_checkpoint(&candidate)? != before {
            return Err(Error::Contract("server native history candidate differs"));
        }
        Ok(candidate)
    }

    pub(in crate::room) fn configure_effect_history(&self, owner: &mut RichReplica) -> Result<()> {
        if let Some(info) = self.replica.segmented_history_info() {
            owner.enable_segmented_history_guarded(
                &owner.observe()?,
                effect_generation(&info.root_generation),
                effect_generation(&info.active_generation),
            )?;
        }
        Ok(())
    }

    pub(super) fn prepare_native_history(
        &self,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
    ) -> Result<PreparedNativeHistory> {
        self.log.ready()?;
        match lane {
            ServerNativeHistoryLane::Document => {
                let before = checkpoint::document_checkpoint(&self.replica)?;
                let effect_before = self
                    .suggestions
                    .as_ref()
                    .map(|state| checkpoint::document_checkpoint(&state.effect_owner))
                    .transpose()?;
                let mut receiver = self.restore_history_candidate(&self.replica, &before)?;
                let mut effect = self
                    .suggestions
                    .as_ref()
                    .zip(effect_before.as_ref())
                    .map(|(state, json)| self.restore_history_candidate(&state.effect_owner, json))
                    .transpose()?;
                match boundary {
                    NativeHistoryBoundary::Enable { root, active } => {
                        receiver.enable_segmented_history_guarded(
                            &receiver.observe()?,
                            root.clone(),
                            active.clone(),
                        )?;
                        if let Some(owner) = &mut effect {
                            owner.enable_segmented_history_guarded(
                                &owner.observe()?,
                                effect_generation(root),
                                effect_generation(active),
                            )?;
                        }
                    }
                    NativeHistoryBoundary::Seal { next } => {
                        receiver
                            .seal_history_segment_guarded(&receiver.observe()?, next.clone())?;
                        if let Some(owner) = &mut effect {
                            let info = owner
                                .segmented_history_info()
                                .ok_or(Error::Contract("server effect history family differs"))?;
                            // An idle effect author keeps its existing empty active file. No invented input or empty seal.
                            if info.active_entries != 0 {
                                owner.seal_history_segment_guarded(
                                    &owner.observe()?,
                                    effect_generation(next),
                                )?;
                            }
                        }
                    }
                }
                let after = checkpoint::document_checkpoint(&receiver)?;
                let effect_after =
                    effect.as_ref().map(checkpoint::document_checkpoint).transpose()?;
                Ok(PreparedNativeHistory {
                    before: checkpoint::digest(lane, &before, effect_before.as_deref()),
                    after: checkpoint::digest(lane, &after, effect_after.as_deref()),
                    candidate: NativeHistoryCandidate::Document {
                        receiver: Box::new(receiver),
                        effect: effect.map(Box::new),
                    },
                })
            }
            ServerNativeHistoryLane::Review => self.prepare_review_native_history(boundary),
        }
    }

    pub(super) fn publish_native_history(
        &mut self,
        candidate: NativeHistoryCandidate,
    ) -> Result<()> {
        match candidate {
            NativeHistoryCandidate::Document { receiver, effect } => {
                if effect.is_some() != self.suggestions.is_some() {
                    return Err(Error::Contract("server effect history custody differs"));
                }
                self.replica = *receiver;
                if let Some(owner) = effect {
                    self.suggestions.as_mut().ok_or(Error::NeedsRecovery)?.effect_owner = *owner;
                }
            }
            NativeHistoryCandidate::Review(candidate) => {
                self.review.as_mut().ok_or(Error::NeedsRecovery)?.session = *candidate;
            }
        }
        Ok(())
    }
}
