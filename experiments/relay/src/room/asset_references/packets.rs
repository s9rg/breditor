//! Walk typed complete log events, retaining inert Prepare dependencies without publishing them.
use super::{
    MAX_SERVER_ASSET_REFERENCE_PAIRS, ServerAssetReferencePending, ServerAssetReferenceSource,
    packet_history::{PacketEvent, PacketRecord},
};
use crate::{Error, Result, Room, log::Record};
use breditor_collab_feasibility::rich_replica::{
    PacketAssetIdentity, PacketAssetOutcome, PacketAssetReferences, RichReplica, SharedObservation,
    VersionAssetReference,
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub(super) struct References {
    pub pairs: BTreeSet<VersionAssetReference>,
    pub sources: Vec<ServerAssetReferenceSource>,
    pub pending: Vec<ServerAssetReferencePending>,
    pending_ends: usize,
}
impl References {
    pub fn add(&mut self, pairs: impl IntoIterator<Item = VersionAssetReference>) -> Result<()> {
        for pair in pairs {
            self.pairs.insert(pair);
            if self.pairs.len() > MAX_SERVER_ASSET_REFERENCE_PAIRS {
                return Err(Error::Contract("server asset reference complete pair budget"));
            }
        }
        Ok(())
    }
    fn packet(
        &mut self,
        sequence: u64,
        read: PacketAssetReferences,
    ) -> Result<PacketAssetIdentity> {
        let source =
            ServerAssetReferenceSource { sequence: sequence.to_string(), packet: read.packet };
        match read.outcome {
            PacketAssetOutcome::Ready { references } => self.add(references)?,
            PacketAssetOutcome::Pending { missing } => {
                self.pending_ends = self
                    .pending_ends
                    .checked_add(missing.len())
                    .ok_or(Error::Contract("server asset pending source budget"))?;
                if self.pending_ends > MAX_SERVER_ASSET_REFERENCE_PAIRS {
                    return Err(Error::Contract("server asset pending source budget"));
                }
                self.pending.push(ServerAssetReferencePending { source: source.clone(), missing });
            }
        }
        let identity = source.packet.clone();
        self.sources.push(source);
        Ok(identity)
    }
}
pub(super) fn collect(room: &Room, records: Vec<Record>, output: &mut References) -> Result<()> {
    let observed = room.replica.observe()?;
    let mut scanner = PacketScanner::default();
    for record in records {
        scanner.accept(&room.replica, &observed, record, output)?;
    }
    room.replica.check(&observed)?;
    Ok(())
}

/// State spans physical files, including a Prepare at one file's end and its following Commit.
/// No native publication occurs here; the caller discards all state on any traversal error.
#[derive(Default)]
pub(super) struct PacketScanner {
    proposals: BTreeMap<String, String>,
    prepared: Option<(u64, String, String, String)>,
}
impl PacketScanner {
    pub fn accept(
        &mut self,
        replica: &RichReplica,
        observed: &SharedObservation,
        record: Record,
        output: &mut References,
    ) -> Result<()> {
        if let Some(packet) = PacketRecord::from_log(record) {
            self.accept_packet(replica, observed, packet, output)?;
        } else {
            self.prepared = None;
        }
        Ok(())
    }

    pub fn accept_packet(
        &mut self,
        replica: &RichReplica,
        observed: &SharedObservation,
        record: PacketRecord,
        output: &mut References,
    ) -> Result<()> {
        let previous = self.prepared.take();
        match record.event {
            PacketEvent::Version { packet } => {
                output.packet(
                    record.sequence,
                    replica.document_version_asset_references_guarded(observed, &packet)?,
                )?;
            }
            PacketEvent::Suggestion { packet } => {
                let PacketAssetIdentity::Suggestion { id } = output.packet(
                    record.sequence,
                    replica.document_suggestion_asset_references_guarded(observed, &packet)?,
                )?
                else {
                    return Err(Error::Contract("server asset proposal identity differs"));
                };
                if self.proposals.insert(id, packet).is_some() {
                    return Err(Error::Contract("server asset duplicate proposal record"));
                }
            }
            PacketEvent::RevisionPrepare { previous, packet } => {
                let parent = self
                    .proposals
                    .get(&previous)
                    .ok_or(Error::Contract("server asset revision predecessor absent"))?;
                let PacketAssetIdentity::SuggestionRevision { id, suggestion_id, .. } = output
                    .packet(
                        record.sequence,
                        replica.document_suggestion_revision_asset_references_guarded(
                            observed, parent, &packet,
                        )?,
                    )?
                else {
                    return Err(Error::Contract("server asset revision identity differs"));
                };
                let child = replica.document_suggestion_revision_packet(parent, &packet)?;
                self.prepared = Some((record.sequence, id, suggestion_id, child));
            }
            PacketEvent::RevisionCommit { prepared_at, revision_id } => {
                let (at, id, child_id, child) = previous
                    .ok_or(Error::Contract("server asset revision commit has no preparation"))?;
                if prepared_at != at.to_string()
                    || at.checked_add(1) != Some(record.sequence)
                    || revision_id != id
                    || self.proposals.insert(child_id, child).is_some()
                {
                    return Err(Error::Contract("server asset revision commit differs"));
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use breditor_collab_feasibility::rich_replica::WriterDependency;
    #[test]
    fn complete_pending_source_budget_rejects_without_truncating_missing_ends() {
        let mut output = References::default();
        let read = || PacketAssetReferences {
            packet: PacketAssetIdentity::Suggestion { id: format!("sha256:{}", "a".repeat(64)) },
            outcome: PacketAssetOutcome::Pending {
                missing: vec![WriterDependency { writer: "2".into(), counter: "1".into() }; 1001],
            },
        };
        for at in 0..99 {
            output.packet(at, read()).expect("within complete pending budget");
        }
        assert!(output.packet(99, read()).is_err());
        assert_eq!(output.pending.len(), 99);
        assert_eq!(output.sources.len(), 99);
    }
}
