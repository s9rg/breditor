//! Kill a real repair process while it owns the selected WAL and deployment epoch.
use super::super::super::process::{owned_root, persist};
use super::{
    ClosedTailFixture, Outcome, SUFFIX, SavedFiles, TestResult, apply, authentication,
    close_with_torn_frame, sorted_files,
};
use crate::{
    Error,
    log::generations::{NativeTailRepairInterruption, NativeTailRepairPoint as Point},
    server::{
        NativeGenerationActivationPrepareOptions, PreparedNativeGenerationActivationIdentity,
        SealedNativeRestartBootstrap, SealedNativeRestartBootstrapCoverage,
        ServerLogGenerationRecoveryStateIdentity,
        generation_recovery::repair_sealed_tail::repair_sealed_native_tail_with_interruption,
        reopen_sealed_native_restart_host,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader},
    os::unix::{fs::MetadataExt, process::ExitStatusExt},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, mpsc},
    time::Duration,
};

const WORKER_ROOT: &str = "BREDITOR_NATIVE_TAIL_CRASH_TEST_ROOT";
const WORKER_POINT: &str = "BREDITOR_NATIVE_TAIL_CRASH_TEST_POINT";
const WORKER_NAME: &str = concat!(module_path!(), "::sealed_tail_repair_crash_worker");
const NOTIFICATION: &str = "BREDITOR_NATIVE_TAIL_REPAIR_HELD ";

#[derive(Serialize, Deserialize)]
struct SelectedRepair {
    checkpoint: PreparedNativeGenerationActivationIdentity,
    current: ServerLogGenerationRecoveryStateIdentity,
}

fn saved_files(root: &Path) -> SavedFiles {
    let evidence = root.join("retained-crash-evidence");
    SavedFiles { archive: evidence.join("room.backup"), suffix: evidence.join("incomplete.wal") }
}

#[test]
fn sealed_tail_repair_crash_worker() -> TestResult {
    let Some(root) = std::env::var_os(WORKER_ROOT) else { return Ok(()) };
    let root = PathBuf::from(root);
    owned_root(&root)?;
    let name = std::env::var(WORKER_POINT)?;
    let point = [Point::BeforeTruncate, Point::Truncated, Point::Synced]
        .into_iter()
        .find(|point| point.name() == name)
        .ok_or("explicit repair crash point")?;
    let selection: SelectedRepair =
        serde_json::from_slice(&fs::read(root.join("retained-crash-evidence/selection.json"))?)?;
    let (auth, owner, _) = authentication()?;
    let bootstrap = SealedNativeRestartBootstrap {
        source_root: root.join("intent"),
        checkpoint_root: root.join("sealed-torn-inspection"),
        authority_root: root.join("authority"),
        operational_root: root.join("target"),
        expected_checkpoint: selection.checkpoint,
        expected_current: selection.current,
    };
    tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?.block_on(
        Box::pin(repair_sealed_native_tail_with_interruption(
            bootstrap,
            saved_files(&root).selection(&SUFFIX),
            auth,
            "owner",
            &owner,
            NativeTailRepairInterruption { pause: Some(point) },
        )),
    )?;
    Err("repair worker returned before its expected interruption".into())
}

struct RepairWorker(Child);

impl Drop for RepairWorker {
    fn drop(&mut self) {
        if matches!(self.0.try_wait(), Ok(None)) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

fn start_paused(root: &Path, point: Point) -> TestResult<RepairWorker> {
    let (_, name) = WORKER_NAME.split_once("::").ok_or("repair worker test name")?;
    let mut worker = RepairWorker(
        Command::new(std::env::current_exe()?)
            .args(["--exact", name, "--nocapture", "--test-threads=1"])
            .env(WORKER_ROOT, root)
            .env(WORKER_POINT, point.name())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?,
    );
    let stdout = worker.0.stdout.take().ok_or("repair worker output")?;
    let (ready, wait) = mpsc::channel();
    std::thread::spawn(move || {
        let expected = format!("{NOTIFICATION}{}", point.name());
        let mut output = String::new();
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) if line == expected => {
                    let _ = ready.send(Ok(()));
                    return;
                }
                Ok(line) => {
                    output.push_str(&line);
                    output.push('\n');
                }
                Err(error) => {
                    let _ = ready.send(Err(error.to_string()));
                    return;
                }
            }
        }
        let _ = ready.send(Err(output));
    });
    wait.recv_timeout(Duration::from_secs(45))??;
    Ok(worker)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn killed_repair_worker_preserves_evidence_and_retries_at_each_wal_boundary() -> TestResult {
    for point in [Point::BeforeTruncate, Point::Truncated, Point::Synced] {
        Box::pin(crash_then_retry(point)).await?;
    }
    Ok(())
}

async fn crash_then_retry(point: Point) -> TestResult {
    let (fixture, accepted) = Box::pin(close_with_torn_frame()).await?;
    let root = &fixture.source.directory.0;
    let current = accepted.identity()?;
    let (archive, _) = accepted.into_parts();
    let archive_bytes = archive.to_bytes()?;
    let evidence_root = root.join("retained-crash-evidence");
    fs::create_dir(&evidence_root)?;
    persist(&evidence_root, "room.backup", &archive_bytes)?;
    persist(&evidence_root, "incomplete.wal", &SUFFIX)?;
    let selected = serde_json::to_vec(&SelectedRepair {
        checkpoint: fixture.selected.expected_checkpoint.clone(),
        current: current.clone(),
    })?;
    persist(&evidence_root, "selection.json", &selected)?;
    fs::File::open(root)?.sync_all()?;

    let torn = sorted_files(&fixture.selected.operational_root)?;
    let repaired = repaired_files(torn.clone(), &fixture.active_wal)?;
    let source = sorted_files(&fixture.selected.source_root)?;
    let checkpoint = sorted_files(&fixture.selected.checkpoint_root)?;
    let ledger = sorted_files(&fixture.selected.authority_root)?;
    let active_inode = fs::metadata(&fixture.active_wal)?.ino();
    let epoch = fixture.authority.current_selection()?;

    let mut worker = start_paused(root, point)?;
    // The paused process still holds its shared epoch permit through the actual mutation.
    assert!(matches!(fixture.authority.claim(&epoch), Err(Error::Locked)));
    worker.0.kill()?;
    assert_eq!(worker.0.wait()?.signal(), Some(9));

    let before_truncate = point == Point::BeforeTruncate;
    let expected = if before_truncate { &torn } else { &repaired };
    assert_eq!(&sorted_files(&fixture.selected.operational_root)?, expected);
    let saved = saved_files(root);
    let retry = Box::pin(apply(&fixture, current.clone(), saved.selection(&SUFFIX))).await?;
    assert_eq!(retry, if before_truncate { Outcome::Repaired } else { Outcome::AlreadyComplete });
    assert_eq!(sorted_files(&fixture.selected.operational_root)?, repaired);
    assert_eq!(fs::metadata(&fixture.active_wal)?.ino(), active_inode);
    assert_eq!(sorted_files(&fixture.selected.source_root)?, source);
    assert_eq!(sorted_files(&fixture.selected.checkpoint_root)?, checkpoint);
    assert_eq!(sorted_files(&fixture.selected.authority_root)?, ledger);
    assert_eq!(fs::read(&saved.archive)?, archive_bytes);
    assert_eq!(fs::read(&saved.suffix)?, SUFFIX);
    assert_eq!(fs::read(evidence_root.join("selection.json"))?, selected);

    Box::pin(restart(&fixture, current)).await
}

fn repaired_files(
    mut torn: Vec<(PathBuf, Vec<u8>)>,
    active_wal: &Path,
) -> TestResult<Vec<(PathBuf, Vec<u8>)>> {
    let (_, active) =
        torn.iter_mut().find(|(path, _)| path == active_wal).ok_or("selected active WAL")?;
    assert!(active.ends_with(&SUFFIX));
    active.truncate(active.len() - SUFFIX.len());
    Ok(torn)
}

async fn restart(
    fixture: &ClosedTailFixture,
    current: ServerLogGenerationRecoveryStateIdentity,
) -> TestResult {
    let (auth, owner, _) = authentication()?;
    let SealedNativeRestartBootstrapCoverage::Verified(reopened) =
        Box::pin(reopen_sealed_native_restart_host(
            fixture.bootstrap(current.clone()),
            auth,
            "owner",
            &owner,
            fixture.source.protected_records(),
        ))
        .await?
    else {
        return Err("all protected streams supplied".into());
    };
    assert_eq!(reopened.proof.identity(), current);
    let child = Arc::new(
        Box::pin(reopened.host.prepare_durable_native_restart(
            "owner",
            &owner,
            reopened.checkpoint,
            &reopened.proof,
            NativeGenerationActivationPrepareOptions {
                root: fixture.source.directory.0.join("crash-repair-child-checkpoint"),
                authority: reopened.authority.clone(),
            },
        ))
        .await?,
    );
    let selected = child.identity().clone();
    let active = Box::pin(reopened.host.activate_durable_native_service(
        "owner",
        &owner,
        reopened.authority,
        child,
        reopened.proof,
        selected.clone(),
    ))
    .await?;
    assert_eq!(active.selection(), selected.planned_selection());
    let current_after = active.recovery_host().capture_recovery_state("owner", &owner).await?;
    assert_eq!(current_after.identity()?, current);
    Ok(())
}
