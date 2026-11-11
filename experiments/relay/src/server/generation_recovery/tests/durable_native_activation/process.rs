//! Abrupt real child exits at checked, synced-before-lease and published epochs.
use super::*;
use crate::server::{
    PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity, RoomDeploymentAuthority,
};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
#[path = "process/handover.rs"]
mod handover;
#[derive(Serialize, Deserialize)]
struct TestProtected {
    documents: Vec<(String, String, String)>,
    reviews: Vec<(String, String, String)>,
}
impl TestProtected {
    fn capture(source: &Source) -> Self {
        Self {
            documents: source
                .credentials
                .documents
                .iter()
                .map(|r| (r.principal.clone(), r.writer.clone(), r.credential.clone()))
                .collect(),
            reviews: source
                .credentials
                .reviews
                .iter()
                .map(|r| (r.principal.clone(), r.actor.clone(), r.credential.clone()))
                .collect(),
        }
    }
    fn admit(self) -> crate::RecoveryRegistrationCredentials {
        crate::RecoveryRegistrationCredentials {
            documents: self
                .documents
                .into_iter()
                .map(|(principal, writer, credential)| crate::RecoveryDocumentCredential {
                    principal,
                    writer,
                    credential,
                })
                .collect(),
            reviews: self
                .reviews
                .into_iter()
                .map(|(principal, actor, credential)| crate::RecoveryReviewCredential {
                    principal,
                    actor,
                    credential,
                })
                .collect(),
        }
    }
}
fn persist(root: &Path, name: &str, bytes: &[u8]) -> TestResult {
    use std::os::unix::fs::OpenOptionsExt;
    let mut file =
        fs::OpenOptions::new().create_new(true).write(true).mode(0o600).open(root.join(name))?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::File::open(root)?.sync_all()?;
    Ok(())
}
fn owned_root(root: &Path) -> TestResult {
    if root.parent().ok_or("test root parent")?.canonicalize()?
        != std::env::temp_dir().canonicalize()?
        || !fs::symlink_metadata(root)?.is_dir()
    {
        return Err("owned native test root required".into());
    }
    let nonce = root
        .file_name()
        .and_then(|s| s.to_str())
        .and_then(|s| s.strip_prefix("breditor-prepared-generation-"))
        .ok_or("test root namespace")?;
    crate::credentials::hash(nonce)?;
    Ok(())
}
#[test]
fn crashed_durable_native_activation_worker() -> TestResult {
    let Some(parent) = std::env::var_os("BREDITOR_NATIVE_ACTIVATION_TEST_ROOT") else {
        return Ok(());
    };
    let parent = PathBuf::from(parent);
    owned_root(&parent)?;
    let phase = std::env::var("BREDITOR_NATIVE_ACTIVATION_TEST_PHASE")?;
    let point = match phase.as_str() {
        "before" | "handover-before" => {
            crate::server::generation_backup::durable::Point::SourceChecked
        }
        "written" => crate::server::generation_backup::durable::Point::EpochWritten,
        "published" | "handover-committed" => {
            crate::server::generation_backup::durable::Point::EpochSynced
        }
        _ => return Err("explicit native crash point".into()),
    };
    tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?.block_on(
        async {
            if phase.starts_with("handover-") {
                return Box::pin(handover::crash_after_sealed_handover(&parent, point)).await;
            }
            let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
            setup
                .handle
                .host
                .transaction(|room| {
                    room.grant("owner", "accepted-before-crash", Some(crate::Role::Reader))
                })
                .await?;
            let p = setup.proof().await?;
            let prepared = prepare(&setup, "checkpoint", &p).await?;
            persist(&parent, "child-root.json", &serde_json::to_vec(&setup.source.directory.0)?)?;
            persist(
                &setup.source.directory.0,
                "outside-source.json",
                &serde_json::to_vec(setup.intent.identity())?,
            )?;
            persist(
                &setup.source.directory.0,
                "outside-target.json",
                &serde_json::to_vec(prepared.identity())?,
            )?;
            persist(
                &setup.source.directory.0,
                "test-protected.json",
                &serde_json::to_vec(&TestProtected::capture(&setup.source))?,
            )?;
            crate::server::deployment_fence::activate_durable_native_generation(
                &setup.handle,
                "owner",
                &setup.authority,
                &prepared,
                &p,
                &crate::server::generation_backup::durable::Interruption {
                    stop: Some(point),
                    exit_process: true,
                    ..crate::server::generation_backup::durable::Interruption::default()
                },
            )?;
            Err("native worker did not exit".into())
        },
    )
}
#[test]
fn real_process_exits_have_exact_cold_status_and_fresh_authenticated_native_continuation()
-> TestResult {
    for (phase, committed) in [("before", false), ("written", true), ("published", true)] {
        let owned = crashed_root(phase)?;
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?
            .block_on(continue_after_crash(&owned.0, committed))?;
    }
    Ok(())
}
fn crashed_root(phase: &str) -> TestResult<super::super::source::Directory> {
    let parent = super::super::source::Directory::new()?;
    let log = fs::File::create(parent.0.join("child.log"))?;
    let mut child = Command::new(std::env::current_exe()?)
        .args([
            "--exact",
            "server::generation_recovery::tests::durable_native_activation::process::crashed_durable_native_activation_worker",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("BREDITOR_NATIVE_ACTIVATION_TEST_ROOT", &parent.0)
        .env("BREDITOR_NATIVE_ACTIVATION_TEST_PHASE", phase)
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log))
        .spawn()?;
    let deadline = Instant::now() + Duration::from_secs(45);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill()?;
            child.wait()?;
            return Err("native crash worker deadline".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(status.code(), Some(77), "{}", fs::read_to_string(parent.0.join("child.log"))?);
    let root: PathBuf = serde_json::from_slice(&fs::read(parent.0.join("child-root.json"))?)?;
    owned_root(&root)?;
    Ok(super::super::source::Directory(root))
}
async fn continue_after_crash(root: &Path, committed: bool) -> TestResult {
    let id: Identity = serde_json::from_slice(&fs::read(root.join("outside-target.json"))?)?;
    let source_id: PreparedLogGenerationHandoverIdentity =
        serde_json::from_slice(&fs::read(root.join("outside-source.json"))?)?;
    let source = Arc::new(PreparedLogGenerationHandover::open(&root.join("intent"), &source_id)?);
    let record = Arc::new(Prepared::open(&root.join("checkpoint"), &id, source.clone())?);
    let authority = RoomDeploymentAuthority::open_at_least(
        &root.join("authority"),
        if committed { id.planned_selection() } else { id.previous_selection() },
    )?;
    assert_eq!(
        record.status(&authority)?,
        if committed { Status::Committed } else { Status::Prepared }
    );
    let original = source.source_backup();
    let operation = OperationalLogGenerationServerRoom::resume(
        &root.join("target"),
        original,
        &original.info()?.identity,
        POLICY,
        "owner",
    )?;
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        operation,
        auth,
        crate::ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let current = state.identity()?;
    let (_, inventory) = state.into_parts();
    let protected: TestProtected =
        serde_json::from_slice(&fs::read(root.join("test-protected.json"))?)?;
    let ServerLogGenerationRecoveryCoverage::Verified(p) = handle
        .verify_selected_recovery_state("owner", &owner, current, inventory, protected.admit())
        .await?
    else {
        return Err("fresh credentials missing".into());
    };
    let record = if committed {
        Arc::new(
            handle
                .prepare_durable_native_restart(
                    "owner",
                    &owner,
                    record,
                    &p,
                    Options { root: root.join("next-checkpoint"), authority: authority.clone() },
                )
                .await?,
        )
    } else {
        record
    };
    let selected = record.identity().clone();
    let active = handle
        .activate_durable_native_service(
            "owner",
            &owner,
            authority.clone(),
            record,
            p,
            selected.clone(),
        )
        .await?;
    assert_eq!(active.selection(), selected.planned_selection());
    active
        .recovery_host()
        .host
        .transaction(|room| {
            assert!(room.catchup("accepted-before-crash").is_ok());
            Ok(())
        })
        .await?;
    Ok(())
}
