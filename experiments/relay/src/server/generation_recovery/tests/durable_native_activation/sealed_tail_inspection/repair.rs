//! Repair only after exact independent retention, then serve the restarted room normally.
use super::super::super::{
    durable_native_activation_control::operators,
    operator_network::{Network, Request},
    publication_history::continue_original_history,
    publication_socket::Socket,
};
use super::{
    ClosedTailFixture, SUFFIX, TestResult, authentication, close_with_torn_frame, sorted_files,
};
use crate::Error;
use crate::server::{
    Authentication, NativeGenerationActivationPrepareOptions, NativeRoomPublicationBinding,
    NativeRoomPublicationReceipt, NativeRoomPublicationRequest,
    SealedNativeRestartBootstrapCoverage, SealedNativeTailRepairFiles,
    SealedNativeTailRepairOutcome as Outcome, ServerLogGenerationRecoveryStateIdentity,
    inspect_sealed_native_tail, prepare_durable_native_activation_control,
    prepare_native_room_publication, reopen_sealed_native_restart_host, repair_sealed_native_tail,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::Arc,
};

mod process;

struct SavedFiles {
    archive: PathBuf,
    suffix: PathBuf,
}

impl SavedFiles {
    fn selection(&self, suffix: &[u8]) -> SealedNativeTailRepairFiles {
        SealedNativeTailRepairFiles {
            archive: self.archive.clone(),
            suffix: self.suffix.clone(),
            incomplete_bytes: suffix.len() as u64,
            incomplete_sha256: Sha256::digest(suffix).into(),
        }
    }
}

fn private_file(path: &Path, bytes: &[u8]) -> TestResult {
    fs::OpenOptions::new().create_new(true).write(true).mode(0o600).open(path)?.write_all(bytes)?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn repaired_sealed_wal_reopens_publishes_and_resumes_original_offline_history() -> TestResult
{
    let (fixture, accepted) = Box::pin(close_with_torn_frame()).await?;
    let current = accepted.identity()?;
    let (auth, owner, _) = authentication()?;
    let inspected = Box::pin(inspect_sealed_native_tail(
        fixture.bootstrap(fixture.selected.expected_current.clone()),
        None,
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(inspected.state.identity()?, current);
    let evidence = fixture.source.directory.0.join("retained-tail");
    fs::create_dir(&evidence)?;
    let saved = SavedFiles {
        archive: evidence.join("room.backup"),
        suffix: evidence.join("incomplete.wal"),
    };
    private_file(&saved.suffix, inspected.incomplete_suffix())?;
    let (archive, _) = inspected.state.into_parts();
    let expected_archive = archive.to_bytes()?;
    private_file(&saved.archive, &expected_archive)?;
    let before = sorted_files(&fixture.selected.operational_root)?;
    let inode = fs::metadata(&fixture.active_wal)?.ino();
    let ledger = sorted_files(&fixture.selected.authority_root)?;
    let checkpoint = sorted_files(&fixture.selected.checkpoint_root)?;
    let source = sorted_files(&fixture.selected.source_root)?;
    Box::pin(require_exact_retention(&fixture, &current, &saved, &expected_archive)).await?;
    assert_eq!(sorted_files(&fixture.selected.operational_root)?, before);

    assert_eq!(
        Box::pin(apply(&fixture, current.clone(), saved.selection(&SUFFIX))).await?,
        Outcome::Repaired
    );
    let mut repaired = before;
    let (_, active) = repaired
        .iter_mut()
        .find(|(path, _)| *path == fixture.active_wal)
        .ok_or("original active WAL")?;
    assert!(active.ends_with(&SUFFIX));
    active.truncate(active.len() - SUFFIX.len());
    assert_eq!(sorted_files(&fixture.selected.operational_root)?, repaired);
    assert_eq!(fs::metadata(&fixture.active_wal)?.ino(), inode);
    assert_eq!(
        Box::pin(apply(&fixture, current.clone(), saved.selection(&SUFFIX))).await?,
        Outcome::AlreadyComplete
    );
    assert_eq!(sorted_files(&fixture.selected.operational_root)?, repaired);
    assert_eq!(sorted_files(&fixture.selected.authority_root)?, ledger);
    assert_eq!(sorted_files(&fixture.selected.checkpoint_root)?, checkpoint);
    assert_eq!(sorted_files(&fixture.selected.source_root)?, source);
    assert_eq!(fs::read(&saved.archive)?, expected_archive);
    assert_eq!(fs::read(&saved.suffix)?, SUFFIX);

    Box::pin(restart_and_publish(&fixture, current)).await
}

async fn apply(
    fixture: &ClosedTailFixture,
    current: ServerLogGenerationRecoveryStateIdentity,
    evidence: SealedNativeTailRepairFiles,
) -> crate::Result<Outcome> {
    let (auth, owner, _) =
        authentication().map_err(|_| Error::Contract("test authentication setup"))?;
    Box::pin(repair_sealed_native_tail(fixture.bootstrap(current), evidence, auth, "owner", &owner))
        .await
}

async fn require_exact_retention(
    fixture: &ClosedTailFixture,
    current: &ServerLogGenerationRecoveryStateIdentity,
    saved: &SavedFiles,
    archive: &[u8],
) -> TestResult {
    let wrong_archive = saved.archive.with_file_name("wrong.backup");
    let mut changed = archive.to_vec();
    *changed.last_mut().ok_or("archive bytes")? ^= 1;
    private_file(&wrong_archive, &changed)?;
    let mut selection = saved.selection(&SUFFIX);
    selection.archive = wrong_archive;
    assert!(matches!(
        Box::pin(apply(fixture, current.clone(), selection)).await,
        Err(Error::Contract("native tail evidence archive differs from the inspected cut"))
    ));
    let wrong_suffix = saved.suffix.with_file_name("other.wal");
    let different = [3; SUFFIX.len()];
    private_file(&wrong_suffix, &different)?;
    let mut selection = saved.selection(&different);
    selection.suffix = wrong_suffix;
    assert!(matches!(
        Box::pin(apply(fixture, current.clone(), selection)).await,
        Err(Error::Contract("native tail repair current suffix differs"))
    ));
    let mut aliased = saved.selection(&SUFFIX);
    aliased.suffix = fixture.active_wal.clone();
    assert!(matches!(
        Box::pin(apply(fixture, current.clone(), aliased)).await,
        Err(Error::Contract("native tail evidence must be outside the operating directory"))
    ));
    assert!(matches!(
        Box::pin(apply(
            fixture,
            fixture.selected.expected_current.clone(),
            saved.selection(&SUFFIX),
        ))
        .await,
        Err(Error::Contract("native tail repair selected cut differs"))
    ));
    Ok(())
}

async fn restart_and_publish(
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
                root: fixture.source.directory.0.join("repaired-child-checkpoint"),
                authority: reopened.authority.clone(),
            },
        ))
        .await?,
    );
    let planned = child.identity().planned_selection().clone();
    let (operator, _) = Authentication::issue_token()?;
    let (activation_router, control) = Box::pin(prepare_durable_native_activation_control(
        reopened.host,
        Arc::new(reopened.proof),
        child,
        reopened.authority.clone(),
        "owner",
        &owner,
        operators(&operator)?,
    ))
    .await?;
    let control = Arc::new(control);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let (publication_router, publication) =
        prepare_native_room_publication(control.clone(), listener.into_std()?)?;
    let network = Network::start(activation_router.merge(publication_router)).await?;
    let commit =
        Request { path: "/recovery/native-activation/v1/commit", ..Request::check(&operator) };
    assert_eq!(
        network.request(&commit, &serde_json::to_vec(&control.identity())?).await?.status,
        200
    );
    assert_eq!(reopened.authority.current_selection()?, planned);
    let publish =
        Request { path: "/recovery/native-publication/v1/publish", ..Request::check(&operator) };
    let expected = NativeRoomPublicationRequest {
        format: "breditor/native-room-publication-request".into(),
        format_version: 1,
        selection: publication.identity(),
        joint: NativeRoomPublicationBinding { bytes: 1540, sha256: [43; 32] },
    };
    let response = network.request(&publish, &serde_json::to_vec(&expected)?).await?;
    assert_eq!(response.status, 200);
    let receipt: NativeRoomPublicationReceipt = serde_json::from_slice(&response.body)?;
    assert_eq!(receipt.selection, expected.selection);
    assert_eq!(receipt.joint, expected.joint);
    let socket = resume_original_streams(Socket::open(address).await?, fixture, &owner).await?;
    let socket = continue_original_history(socket, &fixture.source).await?;
    drop(socket);
    publication.close().await?;
    network.stop().await
}

async fn resume_original_streams(
    socket: Socket,
    fixture: &ClosedTailFixture,
    owner: &str,
) -> TestResult<Socket> {
    let (socket, response) = socket.request("auth", json!({"kind":"authenticate","principal":"owner","token":owner,"capabilities":["writerTransportV2","reviewV1"]})).await?;
    assert_eq!(response["kind"], "authenticated");
    let (socket, response) = socket.request("resume-document", json!({"kind":"resume","writer":fixture.source.author.lease.writer,"credential":fixture.source.author.credential})).await?;
    assert_eq!(response["kind"], "resumed");
    let (socket, response) = socket.request("resume-comments", json!({"kind":"reviewResume","actor":fixture.source.reviewer.lease.actor,"credential":fixture.source.reviewer.credential})).await?;
    assert_eq!(response["kind"], "reviewResumed");
    Ok(socket)
}
