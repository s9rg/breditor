//! Keep the fixture operator's latest approved selection independently of the authority ledger.
use super::{Result, deployment, read, storage};
use breditor_collab_relay::server::{
    RelaySegmentHandoverApproval, RoomDeploymentAuthority, RoomDeploymentSelection,
};
use std::{fs, path::Path};

pub(super) fn remember(
    parent: &Path,
    approval_file: &str,
    selection: &RoomDeploymentSelection,
) -> Result {
    if selection.identity.format_version == 1 {
        return Ok(());
    }
    let path = parent.join(format!("{approval_file}.epoch"));
    let next = parent.join(format!("{approval_file}.epoch.{}.next", selection.generation));
    storage::write_new(&next, &serde_json::to_vec(selection)?)?;
    fs::rename(next, path)?;
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}

pub(super) fn open(
    parent: &Path,
    approval_file: &str,
    approval: &RelaySegmentHandoverApproval,
) -> Result<RoomDeploymentAuthority> {
    if approval.previous_selection().identity.format_version == 1 {
        return deployment(parent);
    }
    let path = parent.join(format!("{approval_file}.epoch"));
    let floor: RoomDeploymentSelection = serde_json::from_str(&read(&path, 4096)?)?;
    if floor.identity != approval.previous_selection().identity {
        return Err("restart selection names a different authority".into());
    }
    Ok(RoomDeploymentAuthority::open_at_least(&parent.join("deployment"), &floor)?)
}
