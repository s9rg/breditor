//! Host-local maintenance for a currently fenced relay and its retained room data.
use crate::{
    Error, Result, Room, ServerLogGenerationReceipt, ServerNativeHistoryBoundary,
    ServerNativeHistoryCapacity, ServerNativeHistoryDescriptor, ServerNativeHistoryLane,
    ServerNativeHistoryPlan, ServerNativeHistoryReceipt, ServerNativeHistorySelection,
    ServerRoomStorageCapacity,
    server::{Host, ServerBackupHandle, deployment_fence},
};

impl ServerBackupHandle {
    /// Preview a native boundary on the currently fenced room and its actual WAL.
    /// # Errors
    /// Refuses non-owner credentials, stale service, uncertain custody or an inadmissible boundary.
    pub async fn prepare_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryPlan> {
        self.maintain(principal, token, move |_, room, principal| {
            room.prepare_native_history_boundary(principal, lane, boundary)
        })
        .await
    }

    /// Apply a selected native boundary under the current serving lease.
    /// A started operation can finish after its waiter is cancelled.
    /// # Errors
    /// Refuses non-owner credentials, stale service or selection, drifted append cost or storage.
    pub async fn apply_prepared_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        selection: ServerNativeHistorySelection,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.maintain(principal, token, move |_, room, principal| {
            room.apply_prepared_native_history_boundary(principal, selection)
        })
        .await
    }

    /// Inspect the exact durable receipt for this selected operation under the current serving lease.
    /// # Errors
    /// Refuses non-owner credentials, stale service, uncertain storage or mismatched receipts.
    pub async fn resolve_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        selection: ServerNativeHistorySelection,
    ) -> Result<Option<ServerNativeHistoryReceipt>> {
        self.maintain(principal, token, move |_, room, principal| {
            room.resolve_native_history_boundary(principal, &selection)
        })
        .await
    }

    /// Observe native journal and review capacity as the current authenticated room owner.
    /// # Errors
    /// Refuses non-owner credentials, unfenced or stale hosts, uncertain custody or an invalid cut.
    pub async fn native_history_capacity(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerNativeHistoryCapacity> {
        self.maintain(principal, token, |_, room, principal| {
            room.native_history_capacity(principal)
        })
        .await
    }

    /// Observe the actual native history families as an authenticated current room reader.
    /// # Errors
    /// Refuses missing read permission, unfenced or stale hosts and uncertain custody.
    pub async fn native_history_descriptor(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerNativeHistoryDescriptor> {
        self.maintain(principal, token, |_, room, principal| {
            room.native_history_descriptor(principal)
        })
        .await
    }

    /// Run an explicit document or review history boundary on this serving epoch.
    /// An exact retry returns the original durable receipt. A started operation can finish
    /// after its waiter is cancelled.
    /// # Errors
    /// Refuses non-owner authentication, unfenced or stale hosts, invalid intents and
    /// uncertain custody or storage.
    pub async fn apply_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.maintain(principal, token, move |_, room, principal| {
            room.commit_native_history(principal, lane, boundary)
        })
        .await
    }

    /// Observe the current physical log and bound raster capacity as the room owner.
    /// # Errors
    /// Refuses wrong credentials, unfenced or stale hosts, missing assets or uncertain storage.
    pub async fn storage_capacity(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerRoomStorageCapacity> {
        self.maintain(principal, token, |host, room, principal| {
            let assets = host
                .assets
                .as_ref()
                .ok_or(Error::Contract("relay segment assets absent"))?
                .lock()
                .map_err(|_| Error::NeedsRecovery)?;
            room.storage_capacity(&assets, principal)
        })
        .await
    }

    /// Rotate the actual physical log under the room owner's current serving lease.
    /// # Errors
    /// Refuses wrong credentials, unfenced or stale hosts, invalid rotations and uncertain storage.
    pub async fn rotate_log_generation(
        &self,
        principal: &str,
        token: &str,
        next: &str,
    ) -> Result<ServerLogGenerationReceipt> {
        let next = next.to_owned();
        self.maintain(principal, token, move |_, room, principal| {
            room.rotate_log_generation(principal, &next)
        })
        .await
    }

    pub(super) async fn maintain<T: Send + 'static>(
        &self,
        principal: &str,
        token: &str,
        work: impl FnOnce(&Host, &mut Room, &str) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            host.deployment.fenced(|lease| {
                deployment_fence::transaction(Some(lease), || {
                    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    if let Some(custody) = &host.relay_segment_custody {
                        custody.check_retained_inputs()?;
                    }
                    let result = work(&host, &mut room, &principal);
                    if let Some(custody) = &host.relay_segment_custody {
                        custody.check_retained_inputs()?;
                    }
                    result
                })
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
