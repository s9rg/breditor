//! Restore only a separately selected checkpoint, then replay the original suffix.
use super::{
    Checkpoint, RelayCheckpoint, RelayCheckpointIdentity, sequence,
    state::{ReplicaCheckpoint, ReplicaFamily},
};
use crate::{Error, Result, Room, RoomBackupIdentity, access, log::Log};
use breditor_collab_feasibility::rich_replica::{RichReplica, SharedRichProfile};
use std::{collections::BTreeMap, path::Path};

impl ReplicaCheckpoint {
    pub(in crate::room) fn restore(
        self,
        profile: &SharedRichProfile,
        document: &str,
        writer: &str,
    ) -> Result<RichReplica> {
        let replica = match self.family {
            ReplicaFamily::Original => profile.restore(document, &self.journal)?,
            ReplicaFamily::Selection => profile.restore_document(document, &self.journal)?,
            ReplicaFamily::Segmented => profile.restore_segmented(document, &self.journal)?,
            ReplicaFamily::Continued => {
                profile.restore_continued_history(document, &self.journal)?
            }
        };
        if replica.writer() != writer {
            return Err(Error::Contract("relay checkpoint writer differs"));
        }
        Ok(replica)
    }
}

impl Room {
    /// Cold-open a complete generation room using a separately pinned materialized checkpoint.
    /// The relay verifies the retained prefix's original bytes, restores native state, and
    /// semantically replays the original suffix. Old connections require fresh authentication.
    /// # Errors
    /// Refuses the wrong source, an incomplete tail, pending rotation or invalid restore.
    /// Use ordinary recovery for a source that needs repair.
    pub fn open_log_generations_with_checkpoint(
        path: &Path,
        checkpoint: &RelayCheckpoint,
    ) -> Result<Self> {
        let (log, recovery) = Log::open_generations(path)?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("relay checkpoint requires a complete active log"));
        }
        let selected = checkpoint.identity();
        log.check_materialized_checkpoint_cut(
            selected.manifest,
            selected.source.records,
            selected.source.terminal_log_digest,
        )?;
        let replay = log.open_generation_replay()?;
        let state: Checkpoint = serde_json::from_slice(checkpoint.bytes())?;
        let mut room = state.restore(log, selected)?;
        // A Commit at the start of the suffix without its Prepare is rejected
        // by the same replay handler used for ordinary opens.
        replay.visit_suffix(selected.source.records, |record| room.replay(record))?;
        room.log.check_generation_replay()?;
        room.abandon_suggestion_revision_preparation();
        Ok(room.finish_replay(recovery, false)?.0)
    }
}

impl Checkpoint {
    pub(in crate::room) fn restore(
        self,
        log: Log,
        identity: &RelayCheckpointIdentity,
    ) -> Result<Room> {
        let RoomBackupIdentity {
            document,
            owner,
            asset_binding,
            profile,
            writer_transport_version,
            records,
            ..
        } = self.source;
        access::principal(&owner)?;
        if !matches!(writer_transport_version, 1 | 2)
            || self.writers.len() > super::super::MAX_WRITERS
            || self.roles.len() > super::super::MAX_PRINCIPALS
            || self.receipts.len() as u64 >= records
        {
            return Err(Error::Contract("relay checkpoint room bounds"));
        }
        let profile_seed = profile.seed();
        let profile = profile.compile(&self.configuration)?;
        let replica = self.document.restore(&profile, &document, "1")?;
        let mut room = Room {
            atomic_transport_v2: writer_transport_version == 2,
            profile_seed,
            configuration: self.configuration,
            log,
            owner,
            profile,
            replica,
            asset_binding,
            roles: self.roles,
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            receipts: BTreeMap::new(),
            presence: crate::presence::Presence::default(),
            review: None,
            versions: None,
            suggestions: None,
            seed_writer_through: self.seed_writer_through,
            native_history_boundaries: BTreeMap::new(),
        };
        if room.native_identity_at(records, identity.source.terminal_log_digest) != identity.source
            || room.roles.contains_key(&room.owner)
        {
            return Err(Error::Contract("relay checkpoint room identity differs"));
        }
        for principal in room.roles.keys() {
            access::principal(principal)?;
        }
        let mut writers = self.writers;
        writers.sort_unstable_by_key(|entry| entry.writer.parse::<u64>().unwrap_or(0));
        for entry in writers {
            access::principal(&entry.principal)?;
            if room.next_writer()? != entry.writer {
                return Err(Error::Contract("relay checkpoint writer order differs"));
            }
            room.writers.insert(
                entry.writer,
                super::super::Writer {
                    principal: entry.principal,
                    resume_hash: entry.resume_hash,
                    observer: entry.observer,
                },
            );
        }
        if let Some(checkpoint) = self.review {
            checkpoint.restore(&mut room, records)?;
        }
        room.versions = self.versions.map(|value| value.restore(records)).transpose()?;
        room.suggestions =
            self.suggestions.map(|value| value.restore(&room, records)).transpose()?;
        for ack in self.receipts {
            sequence(&ack.sequence, records)?;
            if ack.duplicate
                || room.writers.get(&ack.receipt.writer).is_none_or(|writer| writer.observer)
                    && !room.has_checkpoint_effect_receipt(&ack)
                || room.receipts.insert(Room::key(&ack.receipt), ack).is_some()
            {
                return Err(Error::Contract("relay checkpoint document receipt differs"));
            }
        }
        for boundary in self.boundaries {
            room.remember_native_history(
                sequence(&boundary.sequence, records)?,
                boundary.lane,
                boundary.boundary,
                boundary.before,
                boundary.after,
            )?;
        }
        Ok(room)
    }
}
