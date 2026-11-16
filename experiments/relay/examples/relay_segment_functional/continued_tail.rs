//! Invoke inspection and repair from separate processes under the retained serving epoch.
use super::{Result, configured_auth, continued_activation, continued_reconcile, read, storage};
use breditor_collab_relay::server::{
    Authentication, ContinuedRasterNativeTailInspection, ContinuedRasterNativeTailPlan,
    ContinuedRasterNativeTailRepair, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
    ContinuedRasterRoomBackupIdentity, ContinuedRasterRotationInspection,
    ContinuedRasterRotationPlan, ContinuedRasterRotationRepair, ContinuedRasterUploadInspection,
    ContinuedRasterUploadPlan, ContinuedRasterUploadRepair, RoomDeploymentAuthority,
    RoomDeploymentSelection,
};
use serde::Serialize;
use serde_json::json;
use std::{fs::File, path::Path};

struct Recovery<'a> {
    parent: &'a Path,
    target: &'a Path,
    backup: &'a ContinuedRasterRoomBackupFiles,
    auth: &'a Authentication,
    token: &'a str,
    restart: ContinuedRasterRestart<'a>,
}

impl Recovery<'_> {
    fn minimum(&self) -> Result<ContinuedRasterRoomBackupIdentity> {
        Ok(serde_json::from_str(&read(&self.parent.join("repair-floor.json"), 32 * 1024)?)?)
    }

    fn save(&self, name: &str, value: &impl Serialize) -> Result {
        storage::write_new(&self.parent.join(name), &serde_json::to_vec(value)?)?;
        File::open(self.parent)?.sync_all()?;
        Ok(())
    }

    fn native_tail(&self, inspect: bool) -> Result {
        let evidence = self.parent.join("repair-evidence");
        let name = "repair-selection.json";
        if inspect {
            let plan = self.backup.inspect_activated_native_tail(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterNativeTailInspection {
                    restart: &self.restart,
                    minimum: &self.minimum()?,
                    evidence: &evidence,
                },
            )?;
            self.save(name, &plan)?;
            println!(
                "{}",
                json!({"nextSequence": plan.next_sequence(), "incompleteBytes": plan.incomplete_bytes()})
            );
        } else {
            let plan: ContinuedRasterNativeTailPlan =
                serde_json::from_str(&read(&self.parent.join(name), 64 * 1024)?)?;
            let outcome = self.backup.repair_activated_native_tail(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterNativeTailRepair {
                    restart: &self.restart,
                    plan: &plan,
                    suffix: &evidence.join("suffix.bin"),
                },
            )?;
            println!("{}", serde_json::to_string(&outcome)?);
        }
        Ok(())
    }

    fn rotation(&self, inspect: bool) -> Result {
        let evidence = self.parent.join("rotation-evidence");
        let name = "rotation-selection.json";
        if inspect {
            let plan = self.backup.inspect_activated_native_rotation(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterRotationInspection {
                    restart: &self.restart,
                    minimum: &self.minimum()?,
                    evidence: &evidence,
                },
            )?;
            self.save(name, &plan)?;
            println!(
                "{}",
                json!({
                    "nextSequence": plan.next_sequence(),
                    "afterManifest": plan.successor_manifest(),
                })
            );
        } else {
            let plan: ContinuedRasterRotationPlan =
                serde_json::from_str(&read(&self.parent.join(name), 64 * 1024)?)?;
            let outcome = self.backup.repair_activated_native_rotation(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterRotationRepair {
                    restart: &self.restart,
                    plan: &plan,
                    evidence: &evidence,
                },
            )?;
            println!("{}", serde_json::to_string(&outcome)?);
        }
        Ok(())
    }

    fn upload(&self, inspect: bool, kind: &str) -> Result {
        let evidence = self.parent.join(format!("{kind}-evidence"));
        let name = format!("{kind}-selection.json");
        if inspect {
            let plan = self.backup.inspect_activated_raster_upload(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterUploadInspection {
                    restart: &self.restart,
                    minimum: &self.minimum()?,
                    evidence: &evidence,
                },
            )?;
            self.save(&name, &plan)?;
            println!(
                "{}",
                json!({
                    "publishedAsset": plan.published_asset(), "incompleteNativeBytes": plan.incomplete_native_bytes(),
                })
            );
        } else {
            let plan: ContinuedRasterUploadPlan =
                serde_json::from_str(&read(&self.parent.join(&name), 64 * 1024)?)?;
            let outcome = self.backup.repair_activated_raster_upload(
                self.target,
                self.auth,
                "owner",
                self.token,
                &ContinuedRasterUploadRepair {
                    restart: &self.restart,
                    plan: &plan,
                    raster: &evidence.join("raster.bin"),
                    suffix: &evidence.join("suffix.bin"),
                },
            )?;
            println!("{}", serde_json::to_string(&outcome)?);
        }
        Ok(())
    }
}

pub(super) fn run(parent: &Path, mode: &str) -> Result {
    let path = parent.join("activation");
    let (backup, approval) = continued_activation::inputs(&path)?;
    let expected: RoomDeploymentSelection =
        serde_json::from_str(&read(&path.join("expected.json"), 4096)?)?;
    let authority = RoomDeploymentAuthority::open_at_least(&parent.join("authority"), &expected)?;
    let token = continued_reconcile::read_protected(&path)?.token;
    let auth = configured_auth(parent)?;
    let recovery = Recovery {
        parent,
        target: &path.join("prepared"),
        backup: &backup,
        auth: &auth,
        token: &token,
        restart: ContinuedRasterRestart {
            authority: &authority,
            approval: &approval,
            expected: &expected,
        },
    };
    match mode {
        "continued-raster-inspect-rotation" => recovery.rotation(true),
        "continued-raster-repair-rotation" => recovery.rotation(false),
        "continued-raster-inspect-tail" => recovery.native_tail(true),
        "continued-raster-repair-tail" => recovery.native_tail(false),
        "continued-raster-inspect-upload" => recovery.upload(true, "upload"),
        "continued-raster-repair-upload" => recovery.upload(false, "upload"),
        "continued-raster-inspect-joint" => recovery.upload(true, "joint"),
        "continued-raster-repair-joint" => recovery.upload(false, "joint"),
        _ => Err("unsupported continued repair fixture mode".into()),
    }
}
