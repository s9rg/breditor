//! Commit before listening, then resume the approved target with an independent epoch pin.
use super::{Result, configured_auth, continued_reconcile, read, storage};
use breditor_collab_relay::server::{
    Authentication, ContentAddressedServerAssets, ContinuedAssetServerHandle,
    ContinuedRasterActivation, ContinuedRasterActivationApproval, ContinuedRasterRestart,
    ContinuedRasterRoomBackupFiles, RoomDeploymentAuthority, RoomDeploymentSelection,
};
use std::{fs::File, path::Path};

fn inputs(
    parent: &Path,
) -> Result<(ContinuedRasterRoomBackupFiles, ContinuedRasterActivationApproval)> {
    let capture = serde_json::from_str(&read(&parent.join("capture-selection.json"), 32 * 1024)?)?;
    let backup = ContinuedRasterRoomBackupFiles::open(&parent.join("capture"), &capture, None)?;
    let approval = serde_json::from_str(&read(&parent.join("approval.json"), 32 * 1024)?)?;
    Ok((backup, approval))
}

pub(super) fn commit(
    parent: &Path,
    source: &ContinuedAssetServerHandle,
    principal: &str,
    token: &str,
) -> Result<RoomDeploymentSelection> {
    let path = parent.join("activation");
    let (backup, approval) = inputs(&path)?;
    let target = backup.reopen(&path.join("prepared"), approval.target())?;
    let credentials = continued_reconcile::read_protected(&path)?.credentials();
    // Drop the successor router and handle before binding a port.
    let (_, _, selected) = source.activate_recovered_room(
        configured_auth(parent)?,
        principal,
        token,
        target,
        &ContinuedRasterActivation {
            approval: &approval,
            credentials: &credentials,
            provider: &ContentAddressedServerAssets,
        },
    )?;
    assert_eq!(selected, approval.planned_selection()?);
    Ok(selected)
}

pub(super) fn restart(parent: &Path, authentication: Authentication) -> Result<axum::Router> {
    let path = parent.join("activation");
    let (backup, approval) = inputs(&path)?;
    let expected: RoomDeploymentSelection =
        serde_json::from_str(&read(&path.join("expected.json"), 4096)?)?;
    let authority = RoomDeploymentAuthority::open_at_least(&parent.join("authority"), &expected)?;
    let protected = continued_reconcile::read_protected(&path)?;
    let (router, _, selection) = backup.restart_activated_room(
        &path.join("prepared"),
        authentication,
        "owner",
        &protected.token,
        &ContinuedRasterRestart { authority: &authority, approval: &approval, expected: &expected },
    )?;
    storage::write_new(
        &path.join(format!("started-after-{}.json", expected.generation)),
        &serde_json::to_vec(&selection)?,
    )?;
    File::open(&path)?.sync_all()?;
    Ok(router)
}
