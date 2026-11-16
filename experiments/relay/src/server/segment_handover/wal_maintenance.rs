//! Exact checkpoint capture and sealed WAL reclamation under the serving lease.
use crate::{
    RelayCheckpoint, Result, ServerSealedWalArchive, ServerSealedWalPacking,
    server::ServerBackupHandle,
};
use std::sync::Arc;

impl ServerBackupHandle {
    /// Materialize the current room at an empty active WAL as its authenticated owner.
    /// Store the returned bytes privately and retain their expected identity separately.
    /// # Errors
    /// Refuses unfenced or stale hosts, invalid credentials, a nonempty active WAL,
    /// changed storage custody and over-budget state.
    pub async fn materialize_relay_checkpoint(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<RelayCheckpoint> {
        self.maintain(principal, token, |_, room, principal| {
            room.materialize_relay_checkpoint(principal)
        })
        .await
    }

    /// Pack a selected sealed WAL if its compressed representation uses fewer bytes.
    /// A started operation can finish after its waiter is cancelled.
    /// # Errors
    /// Refuses unfenced or stale hosts, invalid credentials, active or unknown WALs,
    /// invalid staging space and uncertain storage.
    pub async fn pack_sealed_wal(
        &self,
        principal: &str,
        token: &str,
        generation: &str,
    ) -> Result<ServerSealedWalPacking> {
        let generation = generation.to_owned();
        self.maintain(principal, token, move |_, room, principal| {
            room.pack_sealed_wal(principal, &generation)
        })
        .await
    }

    /// Move a sealed WAL covered by the retained checkpoint into its selected archive.
    /// An exact retry recognizes an already selected archive. A started operation can
    /// finish after its waiter is cancelled.
    /// # Errors
    /// Refuses unfenced or stale hosts, invalid credentials, unrelated checkpoints,
    /// a WAL outside the selected cut and uncertain storage.
    pub async fn archive_sealed_wal(
        &self,
        principal: &str,
        token: &str,
        checkpoint: Arc<RelayCheckpoint>,
        generation: &str,
    ) -> Result<ServerSealedWalArchive> {
        let generation = generation.to_owned();
        self.maintain(principal, token, move |_, room, principal| {
            room.archive_sealed_wal(principal, &checkpoint, &generation)
        })
        .await
    }
}
