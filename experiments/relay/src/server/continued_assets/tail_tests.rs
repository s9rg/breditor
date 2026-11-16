//! Kill a real repair process after truncate and confirm the same plan can finish on retry.
use super::TestResult;
use crate::{
    log::generations::{NativeTailRepairInterruption, NativeTailRepairPoint},
    server::{
        Authentication, ContinuedRasterActivationApproval, ContinuedRasterNativeTailInspection,
        ContinuedRasterNativeTailPlan, ContinuedRasterNativeTailRepair, ContinuedRasterRestart,
        ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity,
        ContinuedRasterUploadInspection, ContinuedRasterUploadPlan, ContinuedRasterUploadRepair,
        RoomDeploymentAuthority, RoomDeploymentSelection,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};

const ROOT: &str = "BREDITOR_TEST_CONTINUED_TAIL_ROOT";

#[derive(Serialize, Deserialize)]
struct Inputs {
    capture: ContinuedRasterRoomBackupIdentity,
    approval: ContinuedRasterActivationApproval,
    epoch: RoomDeploymentSelection,
    auth: String,
    token: String,
    repair: RepairPlan,
}

#[derive(Serialize, Deserialize)]
enum RepairPlan {
    Native(ContinuedRasterNativeTailPlan),
    Joint(ContinuedRasterUploadPlan),
}

pub(super) fn check_interrupted_repair(
    root: &Path,
    capture: &ContinuedRasterRoomBackupIdentity,
    approval: &ContinuedRasterActivationApproval,
    epoch: &RoomDeploymentSelection,
    floor: &ContinuedRasterRoomBackupIdentity,
    hash: &[u8; 32],
    token: &str,
) -> TestResult {
    let target = root.join("relocated");
    let wal = target.join("native").join(crate::log::generations::test_wal_name("relocated"));
    let accepted = fs::read(&wal)?;
    let suffix = b"BR!";
    append_suffix(&wal, suffix)?;

    let auth = json!({
        "format": "breditor/relay-auth", "formatVersion": 1,
        "origins": ["http://127.0.0.1:4187"],
        "accounts": [{"principal": "owner", "tokenHash": hash}],
    })
    .to_string();
    let backup = ContinuedRasterRoomBackupFiles::open(&root.join("capture"), capture, None)?;
    let authority = RoomDeploymentAuthority::open_at_least(&root.join("authority"), epoch)?;
    let restart = ContinuedRasterRestart { authority: &authority, approval, expected: epoch };
    let plan = backup.inspect_activated_native_tail(
        &target,
        &Authentication::from_json(&auth)?,
        "owner",
        token,
        &ContinuedRasterNativeTailInspection {
            restart: &restart,
            minimum: floor,
            evidence: &root.join("evidence"),
        },
    )?;
    drop(backup);

    let mut inputs = Inputs {
        capture: capture.clone(),
        approval: approval.clone(),
        epoch: epoch.clone(),
        auth,
        token: token.into(),
        repair: RepairPlan::Native(plan),
    };
    kill_after_truncate(root, &inputs)?;
    assert_eq!(fs::read(&wal)?, accepted);
    assert_eq!(authority.current_selection()?, *epoch);
    assert_eq!(apply(root, &inputs, NativeTailRepairInterruption::default())?, "alreadyComplete");
    assert_eq!(fs::read(root.join("evidence/suffix.bin"))?, suffix);
    assert_eq!(authority.current_selection()?, *epoch);

    let active = target.join("rasters/active");
    let published = fs::read_dir(&active)?
        .collect::<std::io::Result<Vec<_>>>()?
        .into_iter()
        .map(|entry| entry.path())
        .find(|path| path.extension().is_some_and(|ext| ext == "asset"))
        .ok_or("missing published raster")?;
    let bytes = fs::read(&published)?;
    let stage = active.join(format!(".pending-{}", "a".repeat(64)));
    fs::hard_link(&published, &stage)?;
    append_suffix(&wal, suffix)?;
    let backup = ContinuedRasterRoomBackupFiles::open(&root.join("capture"), capture, None)?;
    inputs.repair = RepairPlan::Joint(backup.inspect_activated_raster_upload(
        &target,
        &Authentication::from_json(&inputs.auth)?,
        "owner",
        token,
        &ContinuedRasterUploadInspection {
            restart: &restart,
            minimum: floor,
            evidence: &root.join("joint"),
        },
    )?);
    drop(backup);
    kill_after_truncate(root, &inputs)?;
    assert_eq!(fs::read(&wal)?, accepted);
    assert_eq!(fs::read(&stage)?, bytes);
    assert_eq!(authority.current_selection()?, *epoch);
    assert_eq!(apply(root, &inputs, NativeTailRepairInterruption::default())?, "repaired");
    assert_eq!(apply(root, &inputs, NativeTailRepairInterruption::default())?, "alreadyComplete");
    assert!(!stage.exists());
    assert_eq!(fs::read(&published)?, bytes);
    assert_eq!(fs::read(root.join("joint/raster.bin"))?, bytes);
    assert_eq!(fs::read(root.join("joint/suffix.bin"))?, suffix);
    assert_eq!(authority.current_selection()?, *epoch);
    Ok(())
}

fn append_suffix(wal: &Path, suffix: &[u8]) -> TestResult {
    let mut file = OpenOptions::new().append(true).open(wal)?;
    file.write_all(suffix)?;
    file.sync_all()?;
    Ok(())
}

fn kill_after_truncate(root: &Path, inputs: &Inputs) -> TestResult {
    let mut plan_file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(root.join("worker.json"))?;
    serde_json::to_writer(&mut plan_file, inputs)?;
    plan_file.sync_all()?;
    drop(plan_file);
    let mut child = Command::new(std::env::current_exe()?)
        .args([
            "--exact",
            "server::continued_assets::tests::activation_tests::tail_tests::native_tail_worker",
            "--ignored",
            "--nocapture",
        ])
        .env(ROOT, root)
        .stdout(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take().ok_or("missing repair worker stdout")?;
    let (send, notify) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(std::result::Result::ok) {
            if line.contains("BREDITOR_NATIVE_TAIL_REPAIR_HELD truncated") {
                let _ = send.send(());
                break;
            }
        }
    });
    let reached = notify.recv_timeout(Duration::from_secs(30));
    let kill = child.kill();
    let status = child.wait()?;
    reader.join().map_err(|_| "repair worker reader panicked")?;
    reached?;
    kill?;
    assert!(!status.success());
    Ok(())
}

#[test]
#[ignore = "private subprocess for the interrupted continued native repair"]
fn native_tail_worker() -> TestResult {
    let Some(root) = std::env::var_os(ROOT) else { return Ok(()) };
    let root = PathBuf::from(root);
    let inputs: Inputs = serde_json::from_slice(&fs::read(root.join("worker.json"))?)?;
    apply(
        &root,
        &inputs,
        NativeTailRepairInterruption { pause: Some(NativeTailRepairPoint::Truncated) },
    )?;
    Err("repair worker passed its interruption checkpoint".into())
}

fn apply(
    root: &Path,
    inputs: &Inputs,
    pause: NativeTailRepairInterruption,
) -> TestResult<serde_json::Value> {
    let backup =
        ContinuedRasterRoomBackupFiles::open(&root.join("capture"), &inputs.capture, None)?;
    let authority = RoomDeploymentAuthority::open_at_least(&root.join("authority"), &inputs.epoch)?;
    let restart = ContinuedRasterRestart {
        authority: &authority,
        approval: &inputs.approval,
        expected: &inputs.epoch,
    };
    let auth = Authentication::from_json(&inputs.auth)?;
    let path = root.join("relocated");
    Ok(match &inputs.repair {
        RepairPlan::Native(plan) => serde_json::to_value(backup.repair_native_tail(
            &path,
            &auth,
            "owner",
            &inputs.token,
            &ContinuedRasterNativeTailRepair {
                restart: &restart,
                plan,
                suffix: &root.join("evidence/suffix.bin"),
            },
            pause,
        )?)?,
        RepairPlan::Joint(plan) => serde_json::to_value(backup.repair_raster_upload(
            &path,
            &auth,
            "owner",
            &inputs.token,
            &ContinuedRasterUploadRepair {
                restart: &restart,
                plan,
                raster: &root.join("joint/raster.bin"),
                suffix: &root.join("joint/suffix.bin"),
            },
            pause,
        )?)?,
    })
}
