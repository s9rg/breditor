//! Reacquire a sealed successor after the original Native process has exited.
use super::{TestProtected, crashed_root, persist};
use crate::{
    OperationalLogGenerationServerRoom, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomRecovery,
    server::{
        Authentication, LogGenerationHandoverStatus, NativeGenerationActivationCheckpointStatus,
        NativeGenerationActivationPrepareOptions, NativeRoomPublicationBinding,
        NativeRoomPublicationRequest, PreparedLogGenerationHandover,
        PreparedLogGenerationHandoverIdentity, PreparedLogGenerationRecoveryHost,
        PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
        RoomDeploymentAuthority, ServerLogGenerationHandoverDeliveryPathOptions,
        ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationHandoverDeliveryPath,
        VerifiedServerLogGenerationRecoveryState,
        generation_backup::durable::{Interruption, Point},
        generation_recovery::tests::{
            durable_native_activation::prepare,
            durable_native_activation_control::operators,
            native_activation::{Setup, advance_target},
            operator_network::{Network, Request},
            publication_socket::Socket,
            source::{POLICY, TestResult, authentication},
        },
        prepare_durable_native_activation_control, prepare_log_generation_recovery_host,
        prepare_native_room_publication,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, sync::Arc};

#[derive(Serialize, Deserialize)]
struct Retained {
    source: PreparedLogGenerationHandoverIdentity,
    checkpoint: PreparedNativeGenerationActivationIdentity,
    earlier: Vec<ServerLogGenerationRoomBackupIdentity>,
    path: Value,
    protected: TestProtected,
}

fn copy(archive: &ServerLogGenerationRoomBackup) -> crate::Result<ServerLogGenerationRoomBackup> {
    ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)
}

async fn verify_current(
    host: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    protected: &TestProtected,
) -> TestResult<Arc<VerifiedServerLogGenerationRecoveryState>> {
    let capture = host.capture_recovery_state("owner", owner).await?;
    let identity = capture.identity()?;
    let (_, inventory) = capture.into_parts();
    let credentials = TestProtected {
        documents: protected.documents.clone(),
        reviews: protected.reviews.clone(),
    };
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state("owner", owner, identity, inventory, credentials.admit())
        .await?
    else {
        return Err("all protected registrations must be restored".into());
    };
    Ok(Arc::new(proof))
}

async fn verify_path(
    host: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    proof: Arc<VerifiedServerLogGenerationRecoveryState>,
    handover: Arc<PreparedLogGenerationHandover>,
    authority: RoomDeploymentAuthority,
    earlier: Vec<ServerLogGenerationRoomBackup>,
    expected_earlier: Vec<ServerLogGenerationRoomBackupIdentity>,
) -> TestResult<VerifiedServerLogGenerationHandoverDeliveryPath> {
    let path = host
        .verify_delivery_path(
            "owner",
            owner,
            vec![copy(handover.source_backup())?],
            std::slice::from_ref(handover.identity().source()),
            proof,
        )
        .await?;
    let verified = host
        .verify_handover_delivery_path(
            "owner",
            owner,
            Arc::new(path),
            ServerLogGenerationHandoverDeliveryPathOptions {
                expected_handover: handover.identity().clone(),
                handover,
                authority,
                earlier,
                expected_earlier,
            },
        )
        .await?;
    Ok(verified)
}

async fn seal_initial_target(
    setup: &Setup,
) -> TestResult<(Arc<PreparedLogGenerationHandover>, ServerLogGenerationRoomBackup)> {
    let root = &setup.source.directory.0;
    let initial = setup.proof().await?;
    let first = prepare(setup, "first-checkpoint", &initial).await?;
    let first_choice = first.identity().clone();
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            first,
            initial,
            first_choice,
        )
        .await?;
    advance_target(setup, true).await?;
    let earlier = setup.handle.capture_recovery_state("owner", &setup.owner).await?.into_parts().0;
    setup
        .handle
        .host
        .transaction(|room| {
            room.grant("owner", "accepted-before-sealed-crash", Some(crate::Role::Reader))?;
            room.rotate_log_generation("owner", "retained-before-sealed-crash")
        })
        .await?;
    let selected = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    let handover = Arc::new(
        active
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &root.join("sealed-source"),
                selected.server.clone(),
            )
            .await?,
    );
    active.seal_next_handover("owner", &setup.owner, &handover, handover.identity()).await?;
    Ok((handover, earlier))
}

pub(super) async fn crash_after_sealed_handover(parent: &Path, point: Point) -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let root = &setup.source.directory.0;
    let (handover, earlier) = Box::pin(seal_initial_target(&setup)).await?;
    let origin = handover.source_backup();
    let selected = handover.identity().source();
    let operation = ServerLogGenerationRoomRecovery::begin(
        &root.join("sealed-target"),
        origin,
        selected,
        POLICY,
    )?
    .finish(origin)?
    .begin_operation(origin, selected, POLICY, "owner")?;
    let (auth, owner, _) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        copy(origin)?,
        selected,
        "owner",
        &owner,
    ))
    .await?;
    let protected = TestProtected::capture(&setup.source);
    let proof = verify_current(&host, &owner, &protected).await?;
    let earlier_pins = vec![setup.source.original.info()?.identity, earlier.info()?.identity];
    let verified = Box::pin(verify_path(
        &host,
        &owner,
        proof.clone(),
        handover.clone(),
        setup.authority.clone(),
        vec![copy(&setup.source.original)?, copy(&earlier)?],
        earlier_pins.clone(),
    ))
    .await?;
    let checkpoint = Arc::new(
        host.prepare_durable_native_activation(
            "owner",
            &owner,
            handover.clone(),
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: root.join("sealed-checkpoint"),
                authority: setup.authority.clone(),
            },
        )
        .await?,
    );
    let retained = Retained {
        source: handover.identity().clone(),
        checkpoint: checkpoint.identity().clone(),
        earlier: earlier_pins,
        path: serde_json::to_value(verified.identity())?,
        protected,
    };
    persist(root, "earlier-first.backup", &setup.source.original.to_bytes()?)?;
    persist(root, "earlier-later.backup", &earlier.to_bytes()?)?;
    persist(root, "sealed-restart.json", &serde_json::to_vec(&retained)?)?;
    persist(parent, "child-root.json", &serde_json::to_vec(root)?)?;
    crate::server::deployment_fence::activate_durable_native_generation(
        &host,
        "owner",
        &setup.authority,
        &checkpoint,
        &proof,
        &Interruption { stop: Some(point), exit_process: true, ..Interruption::default() },
    )?;
    Err("sealed Native worker did not exit".into())
}

#[test]
fn sealed_successor_process_exits_preserve_handover_and_require_fresh_publication() -> TestResult {
    for (phase, committed) in [("handover-before", false), ("handover-committed", true)] {
        let root = crashed_root(phase)?;
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?
            .block_on(Box::pin(recover(&root.0, committed)))?;
    }
    Ok(())
}

async fn recover(root: &Path, committed: bool) -> TestResult {
    let retained: Retained = serde_json::from_slice(&fs::read(root.join("sealed-restart.json"))?)?;
    let handover = Arc::new(PreparedLogGenerationHandover::open(
        &root.join("sealed-source"),
        &retained.source,
    )?);
    let checkpoint = Arc::new(PreparedNativeGenerationActivation::open(
        &root.join("sealed-checkpoint"),
        &retained.checkpoint,
        handover.clone(),
    )?);
    let floor = if committed {
        retained.checkpoint.planned_selection()
    } else {
        retained.checkpoint.previous_selection()
    };
    let authority = RoomDeploymentAuthority::open_at_least(&root.join("authority"), floor)?;
    assert_eq!(authority.current_selection()?, *floor);
    assert_eq!(handover.status(&authority)?, LogGenerationHandoverStatus::Sealed);
    let expected_status = if committed {
        NativeGenerationActivationCheckpointStatus::Committed
    } else {
        NativeGenerationActivationCheckpointStatus::Prepared
    };
    assert_eq!(checkpoint.status(&authority)?, expected_status);
    let origin = handover.source_backup();
    let origin_identity = origin.info()?.identity;
    let operation = OperationalLogGenerationServerRoom::resume(
        &root.join("sealed-target"),
        origin,
        &origin_identity,
        POLICY,
        "owner",
    )?;
    let (auth, owner, _) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        copy(origin)?,
        &origin_identity,
        "owner",
        &owner,
    ))
    .await?;
    let proof = verify_current(&host, &owner, &retained.protected).await?;
    assert_eq!(proof.identity(), *retained.checkpoint.current());
    let earlier = ["earlier-first.backup", "earlier-later.backup"]
        .into_iter()
        .map(|name| ServerLogGenerationRoomBackup::from_owned_bytes(fs::read(root.join(name))?))
        .collect::<crate::Result<Vec<_>>>()?;
    let verified = Box::pin(verify_path(
        &host,
        &owner,
        proof.clone(),
        handover.clone(),
        authority.clone(),
        earlier,
        retained.earlier,
    ))
    .await?;
    assert_eq!(serde_json::to_value(verified.identity())?, retained.path);

    let resumed =
        resume_selected_checkpoint(root, &host, &owner, &authority, &proof, checkpoint, committed)
            .await?;
    let planned = resumed.identity().planned_selection().clone();
    Box::pin(confirm_and_publish(
        &host,
        &owner,
        authority.clone(),
        proof,
        resumed,
        &retained.path,
        &retained.protected,
    ))
    .await?;
    assert_eq!(authority.current_selection()?, planned);
    assert_eq!(handover.status(&authority)?, LogGenerationHandoverStatus::Sealed);
    Ok(())
}

async fn resume_selected_checkpoint(
    root: &Path,
    host: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    authority: &RoomDeploymentAuthority,
    proof: &VerifiedServerLogGenerationRecoveryState,
    checkpoint: Arc<PreparedNativeGenerationActivation>,
    committed: bool,
) -> TestResult<Arc<PreparedNativeGenerationActivation>> {
    if !committed {
        return Ok(checkpoint);
    }
    let previous = checkpoint.identity().planned_selection().clone();
    let resumed = host
        .prepare_durable_native_restart(
            "owner",
            owner,
            checkpoint,
            proof,
            NativeGenerationActivationPrepareOptions {
                root: root.join("fresh-sealed-checkpoint"),
                authority: authority.clone(),
            },
        )
        .await?;
    assert_eq!(resumed.identity().previous_selection(), &previous);
    assert_eq!(
        resumed.identity().planned_selection().generation.parse::<u64>()?,
        previous.generation.parse::<u64>()? + 1
    );
    Ok(Arc::new(resumed))
}

async fn confirm_and_publish(
    host: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    authority: RoomDeploymentAuthority,
    proof: Arc<VerifiedServerLogGenerationRecoveryState>,
    checkpoint: Arc<PreparedNativeGenerationActivation>,
    path: &Value,
    protected: &TestProtected,
) -> TestResult {
    let (operator, _) = Authentication::issue_token()?;
    let (activation_router, activation) = prepare_durable_native_activation_control(
        host.clone(),
        proof,
        checkpoint,
        authority,
        "owner",
        owner,
        operators(&operator)?,
    )
    .await?;
    let activation = Arc::new(activation);
    let normal = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = normal.local_addr()?;
    let (publication_router, publication) =
        prepare_native_room_publication(activation.clone(), normal.into_std()?)?;
    let network = Network::start(activation_router.merge(publication_router)).await?;
    let publication_request =
        Request { path: "/recovery/native-publication/v1/publish", ..Request::check(&operator) };
    let path_bytes = serde_json::to_vec(path)?;
    let body = serde_json::to_vec(&NativeRoomPublicationRequest {
        format: "breditor/native-room-publication-request".into(),
        format_version: 1,
        selection: publication.identity(),
        joint: NativeRoomPublicationBinding {
            bytes: path_bytes.len().try_into()?,
            sha256: Sha256::digest(&path_bytes).into(),
        },
    })?;
    assert!(publication.observe().await.is_err());
    assert_eq!(network.request(&publication_request, &body).await?.status, 503);

    let commit =
        Request { path: "/recovery/native-activation/v1/commit", ..Request::check(&operator) };
    let selection = serde_json::to_vec(&activation.identity())?;
    let first = network.request(&commit, &selection).await?;
    assert_eq!(first.status, 200);
    assert_eq!(network.request(&commit, &selection).await?.body, first.body);
    assert!(publication.observe().await.is_err());

    let published = network.request(&publication_request, &body).await?;
    assert_eq!(published.status, 200);
    assert_eq!(network.request(&publication_request, &body).await?.body, published.body);
    assert_eq!(serde_json::to_vec(&publication.observe().await?)?, published.body);

    let socket = Socket::open(address).await?;
    let (socket, auth) = socket
        .request(
            "auth",
            json!({"kind":"authenticate","principal":"owner","token":owner,
          "capabilities":["writerTransportV2","reviewV1"]}),
        )
        .await?;
    assert_eq!(auth["kind"], "authenticated");
    let (_, writer, credential) =
        protected.documents.iter().find(|row| row.0 == "owner").ok_or("original writer")?;
    let (socket, document) = socket
        .request("document", json!({"kind":"resume","writer":writer,"credential":credential}))
        .await?;
    assert_eq!(document["kind"], "resumed");
    let (_, actor, credential) =
        protected.reviews.iter().find(|row| row.0 == "owner").ok_or("original review actor")?;
    let (socket, review) = socket
        .request("review", json!({"kind":"reviewResume","actor":actor,"credential":credential}))
        .await?;
    assert_eq!(review["kind"], "reviewResumed");
    drop(socket);
    publication.close().await?;
    network.stop().await?;
    Ok(())
}
