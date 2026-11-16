//! Invoke inspection and repair from separate processes under the retained serving epoch.
use super::{Result, configured_auth, continued_activation, continued_reconcile, read, storage};
use breditor_collab_relay::server::{
    ContinuedRasterNativeTailInspection, ContinuedRasterNativeTailPlan,
    ContinuedRasterNativeTailRepair, ContinuedRasterRestart, ContinuedRasterRoomBackupIdentity,
    RoomDeploymentAuthority, RoomDeploymentSelection,
};
use serde_json::json;
use std::{fs::File, path::Path};

pub(super) fn run(parent: &Path, inspect: bool) -> Result {
    let path = parent.join("activation");
    let (backup, approval) = continued_activation::inputs(&path)?;
    let expected: RoomDeploymentSelection =
        serde_json::from_str(&read(&path.join("expected.json"), 4096)?)?;
    let authority = RoomDeploymentAuthority::open_at_least(&parent.join("authority"), &expected)?;
    let restart =
        ContinuedRasterRestart { authority: &authority, approval: &approval, expected: &expected };
    let token = continued_reconcile::read_protected(&path)?.token;
    let auth = configured_auth(parent)?;
    let evidence = parent.join("repair-evidence");
    let plan_path = parent.join("repair-selection.json");
    if inspect {
        let minimum: ContinuedRasterRoomBackupIdentity =
            serde_json::from_str(&read(&parent.join("repair-floor.json"), 32 * 1024)?)?;
        let plan = backup.inspect_activated_native_tail(
            &path.join("prepared"),
            &auth,
            "owner",
            &token,
            &ContinuedRasterNativeTailInspection {
                restart: &restart,
                minimum: &minimum,
                evidence: &evidence,
            },
        )?;
        storage::write_new(&plan_path, &serde_json::to_vec(&plan)?)?;
        File::open(parent)?.sync_all()?;
        println!(
            "{}",
            json!({"nextSequence": plan.next_sequence(), "incompleteBytes": plan.incomplete_bytes()})
        );
    } else {
        let plan: ContinuedRasterNativeTailPlan =
            serde_json::from_str(&read(&plan_path, 64 * 1024)?)?;
        let outcome = backup.repair_activated_native_tail(
            &path.join("prepared"),
            &auth,
            "owner",
            &token,
            &ContinuedRasterNativeTailRepair {
                restart: &restart,
                plan: &plan,
                suffix: &evidence.join("suffix.bin"),
            },
        )?;
        println!("{}", serde_json::to_string(&outcome)?);
    }
    Ok(())
}
