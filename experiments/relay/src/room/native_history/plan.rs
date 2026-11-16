//! Preview and select one native boundary without reserving space or changing the live cut.
use super::{
    NativeHistoryBoundary, ServerNativeHistoryCapacity, ServerNativeHistoryLane,
    prepare::PreparedNativeHistory, transaction::boundary_event,
};
use crate::{Error, Result, Room, RoomBackupIdentity};
use serde::{Deserialize, Serialize};

const FORMAT: &str = "breditor/relay-native-history-selection";

/// Exact physical cost of the typed boundary frame at the selected append cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerNativeBoundaryAppend {
    /// Bytes of the payload and its existing WAL header.
    pub framed_bytes: u64,
    /// Whether the next append would require a physical WAL rotation.
    pub rotates_wal: bool,
}

/// Host-selected intent and expected native cuts. Each apply authenticates separately.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerNativeHistorySelection {
    /// Versioned detached selection format.
    pub format: String,
    /// Selection format revision.
    pub format_version: u32,
    /// Exact room binding and logical durable log cut before the boundary.
    pub source: RoomBackupIdentity,
    /// Native lane to advance.
    pub lane: ServerNativeHistoryLane,
    /// Exact requested lifecycle intent.
    pub boundary: NativeHistoryBoundary,
    /// Selected current native cut, including the suggestion author for document boundaries.
    pub before: [u8; 32],
    /// Expected staged native cut.
    pub after: [u8; 32],
    /// Selected cost of appending the same typed boundary.
    pub append: ServerNativeBoundaryAppend,
}

/// The read-only projection an operator may use to choose a native boundary.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNativeHistoryPlan {
    /// Exact intent, cut and append cost to supply for guarded application.
    pub selection: ServerNativeHistorySelection,
    /// Live usage before the boundary.
    pub capacity_before: ServerNativeHistoryCapacity,
    /// Projected usage after the boundary and its receipt.
    pub capacity_after: ServerNativeHistoryCapacity,
}

impl Room {
    /// Stage an explicit native boundary and report its effects without writing a log record.
    /// # Errors
    /// Other principals, uncertain storage, an already durable intent or a failed native/WAL
    /// capacity check refuse the preview.
    pub fn prepare_native_history_boundary(
        &self,
        principal: &str,
        lane: ServerNativeHistoryLane,
        boundary: NativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryPlan> {
        self.recovery_inventory_owner(principal)?;
        let source = self.native_history_append_cut()?;
        let prepared = self.prepare_uncommitted_native_history(lane, &boundary)?;
        let append = self.native_boundary_append(principal, lane, &boundary, &prepared)?;
        let capacity_before = self.native_history_capacity(principal)?;
        let capacity_after = self.projected_native_history_capacity(
            capacity_before,
            &prepared.candidate,
            &boundary,
        )?;
        self.check_native_history_append_cut(&source)?;
        Ok(ServerNativeHistoryPlan {
            selection: select_boundary(source, lane, boundary, &prepared, append),
            capacity_before,
            capacity_after,
        })
    }

    pub(super) fn check_native_history_append_cut(
        &self,
        source: &RoomBackupIdentity,
    ) -> Result<()> {
        if &self.native_history_append_cut()? != source {
            return Err(Error::Contract("native history selection is stale"));
        }
        Ok(())
    }

    pub(super) fn check_native_selection(
        &self,
        principal: &str,
        selection: &ServerNativeHistorySelection,
    ) -> Result<()> {
        self.recovery_inventory_owner(principal)?;
        if selection.format != FORMAT
            || selection.format_version != 1
            || selection.source
                != self.native_identity_at(
                    selection.source.records,
                    selection.source.terminal_log_digest,
                )
        {
            return Err(Error::Contract("native history selection binding differs"));
        }
        Ok(())
    }

    pub(super) fn native_history_append_cut(&self) -> Result<RoomBackupIdentity> {
        let (records, digest) = self.log.append_cut()?;
        Ok(self.native_identity_at(records, digest))
    }

    pub(super) fn native_boundary_append(
        &self,
        principal: &str,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
        prepared: &PreparedNativeHistory,
    ) -> Result<ServerNativeBoundaryAppend> {
        let (framed_bytes, rotates_wal) =
            self.log.preview_append(boundary_event(principal, lane, boundary, prepared))?;
        Ok(ServerNativeBoundaryAppend { framed_bytes, rotates_wal })
    }

    pub(super) fn prepare_uncommitted_native_history(
        &self,
        lane: ServerNativeHistoryLane,
        boundary: &NativeHistoryBoundary,
    ) -> Result<PreparedNativeHistory> {
        if self.native_history_retry(lane, boundary)?.is_some() {
            return Err(Error::Contract("native history boundary already durable"));
        }
        self.prepare_new_native_history(lane, boundary)
    }
}

pub(super) fn select_boundary(
    source: RoomBackupIdentity,
    lane: ServerNativeHistoryLane,
    boundary: NativeHistoryBoundary,
    prepared: &PreparedNativeHistory,
    append: ServerNativeBoundaryAppend,
) -> ServerNativeHistorySelection {
    ServerNativeHistorySelection {
        format: FORMAT.into(),
        format_version: 1,
        source,
        lane,
        boundary,
        before: prepared.before,
        after: prepared.after,
        append,
    }
}
