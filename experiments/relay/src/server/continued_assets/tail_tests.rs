//! Kill a real repair process after truncate and confirm the same plan can finish on retry.
use super::TestResult;
use crate::{
    log::generations::{NativeTailRepairInterruption, NativeTailRepairPoint},
    server::{
        Authentication, ContinuedRasterActivationApproval, ContinuedRasterNativeTailInspection,
        ContinuedRasterNativeTailOutcome, ContinuedRasterNativeTailPlan,
        ContinuedRasterNativeTailRepair, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
        ContinuedRasterRoomBackupIdentity, RoomDeploymentAuthority, RoomDeploymentSelection,
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
    repair: ContinuedRasterNativeTailPlan,
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
    let mut file = OpenOptions::new().append(true).open(&wal)?;
    let suffix = b"BR!";
    file.write_all(suffix)?;
    file.sync_all()?;
    drop(file);

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

    let inputs = Inputs {
        capture: capture.clone(),
        approval: approval.clone(),
        epoch: epoch.clone(),
        auth,
        token: token.into(),
        repair: plan,
    };
    let mut plan_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(root.join("worker.json"))?;
    serde_json::to_writer(&mut plan_file, &inputs)?;
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
    assert_eq!(fs::read(&wal)?, accepted);
    assert_eq!(authority.current_selection()?, *epoch);
    assert_eq!(
        apply(root, &inputs, NativeTailRepairInterruption::default())?,
        ContinuedRasterNativeTailOutcome::AlreadyComplete
    );
    assert_eq!(fs::read(root.join("evidence/suffix.bin"))?, suffix);
    assert_eq!(authority.current_selection()?, *epoch);
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
) -> TestResult<ContinuedRasterNativeTailOutcome> {
    let backup =
        ContinuedRasterRoomBackupFiles::open(&root.join("capture"), &inputs.capture, None)?;
    let authority = RoomDeploymentAuthority::open_at_least(&root.join("authority"), &inputs.epoch)?;
    let restart = ContinuedRasterRestart {
        authority: &authority,
        approval: &inputs.approval,
        expected: &inputs.epoch,
    };
    Ok(backup.repair_native_tail(
        &root.join("relocated"),
        &Authentication::from_json(&inputs.auth)?,
        "owner",
        &inputs.token,
        &ContinuedRasterNativeTailRepair {
            restart: &restart,
            plan: &inputs.repair,
            suffix: &root.join("evidence/suffix.bin"),
        },
        pause,
    )?)
}
