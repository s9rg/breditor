//! A previously recovered serving host hands over without shedding original custody.
use super::{Setup, advance_target, authentication};
use crate::server::generation_recovery::tests::{
    operator_network::Network,
    publication_history::continue_original_history,
    publication_socket::Socket,
    source::{POLICY, TestResult, insert},
};
use crate::{
    Admission, Error, RecoveryDocumentCredential, Role, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery,
    server::{
        LogGenerationHandoverStatus, NativeGenerationActivationCheckpointStatus,
        NativeGenerationActivationPrepareOptions, PreparedLogGenerationHandover,
        ServerLogGenerationRecoveryCoverage, prepare_log_generation_recovery_host,
    },
};
use serde_json::{Value, json};
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recovered_serving_host_can_handover_again_and_preserve_original_client_histories()
-> TestResult {
    Box::pin(handover(false)).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn durable_recovered_serving_host_can_handover_again_and_preserve_original_client_histories()
-> TestResult {
    Box::pin(handover(true)).await
}

async fn handover(durable: bool) -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let root = &setup.source.directory.0;
    let (active, checkpoint) = if durable {
        let checkpoint = Arc::new(
            setup
                .handle
                .prepare_durable_native_activation(
                    "owner",
                    &setup.owner,
                    setup.intent.clone(),
                    &proof,
                    NativeGenerationActivationPrepareOptions {
                        root: root.join("first-activation"),
                        authority: setup.authority.clone(),
                    },
                )
                .await?,
        );
        let active = setup
            .handle
            .activate_durable_native_service(
                "owner",
                &setup.owner,
                setup.authority.clone(),
                checkpoint.clone(),
                proof,
                checkpoint.identity().clone(),
            )
            .await?;
        (active, Some(checkpoint))
    } else {
        let choice = setup.choice(&proof).await?;
        let active = setup
            .handle
            .activate_native_service(
                "owner",
                &setup.owner,
                setup.authority.clone(),
                setup.intent.clone(),
                proof,
                choice,
            )
            .await?;
        (active, None)
    };
    let before = setup.ledger()?;
    let initial = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    let wrong_account = root.join("wrong-account");
    assert!(
        active
            .prepare_next_handover("owner", &setup.reader, &wrong_account, initial.server.clone())
            .await
            .is_err()
    );
    assert!(!wrong_account.exists());
    let stale = Arc::new(
        active
            .prepare_next_handover("owner", &setup.owner, &root.join("stale-next"), initial.server)
            .await?,
    );
    assert_eq!(stale.identity().previous_selection(), active.selection());
    assert_eq!(stale.status(&setup.authority)?, LogGenerationHandoverStatus::Prepared);
    assert_eq!(setup.ledger()?, before);

    let peer = setup.handle.host.transaction(|room| room.register("owner")).await?;
    let frame = setup.handle.host.transaction(|room| room.catchup("owner")).await?;
    let mut peer_document =
        setup.source.profile.join_frame("room".into(), peer.lease.writer.clone(), &frame)?;
    insert(&mut peer_document, "First recovered host accepted ")?;
    let groups: Value = serde_json::from_str(
        &peer_document.writer_groups_v2_guarded(&peer_document.observe()?, "0")?,
    )?;
    let groups = groups["groups"].as_array().ok_or("peer groups")?.clone();
    let lease = peer.lease.clone();
    setup
        .handle
        .host
        .transaction(move |room| {
            for group in groups {
                assert!(matches!(
                    room.admit("owner", &lease, group.as_str().expect("native frame"))?,
                    Admission::Durable(_)
                ));
            }
            Ok(())
        })
        .await?;
    advance_target(&setup, false).await?;
    advance_target(&setup, true).await?;
    let stale_root = root.join("stale-cut-after-edits");
    assert!(matches!(
        active
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &stale_root,
                stale.identity().source().clone()
            )
            .await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert!(!stale_root.exists());
    assert!(matches!(
        active.seal_next_handover("owner", &setup.owner, &stale, stale.identity()).await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert_eq!(setup.ledger()?, before);
    setup
        .handle
        .host
        .transaction(|room| room.grant("owner", "next-reader", Some(Role::Reader)))
        .await?;
    let current = setup.handle.capture_recovery_state("owner", &setup.owner).await?;
    let current_identity = current.identity()?;
    let current_bytes = current.into_parts().0.to_bytes()?;
    let next = Arc::new(
        active
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &root.join("next-handover"),
                current_identity.server.clone(),
            )
            .await?,
    );
    assert_eq!(next.source_backup().to_bytes()?, current_bytes);
    assert!(
        active.seal_next_handover("owner", &setup.owner, &next, stale.identity()).await.is_err()
    );
    assert_eq!(setup.ledger()?, before);
    active.seal_next_handover("owner", &setup.owner, &next, next.identity()).await?;
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    assert_eq!(next.status(&setup.authority)?, LogGenerationHandoverStatus::Sealed);
    assert_eq!(stale.status(&setup.authority)?, LogGenerationHandoverStatus::Superseded);
    assert!(matches!(
        setup.handle.capture_recovery_state("owner", &setup.owner).await,
        Err(Error::Lease)
    ));
    assert!(
        active.seal_next_handover("owner", &setup.owner, &next, next.identity()).await.is_err()
    );
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    if let Some(checkpoint) = checkpoint {
        assert_eq!(
            checkpoint.status(&setup.authority)?,
            NativeGenerationActivationCheckpointStatus::Committed,
        );
    }

    let next_root = next.root().to_owned();
    let next_identity = next.identity().clone();
    drop(next);
    let next = Arc::new(PreparedLogGenerationHandover::open(&next_root, &next_identity)?);
    assert_eq!(next.status(&setup.authority)?, LogGenerationHandoverStatus::Sealed);
    let backup = next.source_backup();
    assert_eq!(backup.to_bytes()?, current_bytes);
    let operational = ServerLogGenerationRoomRecovery::begin(
        &root.join("next-host"),
        backup,
        &current_identity.server,
        POLICY,
    )?
    .finish(backup)?
    .begin_operation(backup, &current_identity.server, POLICY, "owner")?;
    let (auth, token, _) = authentication()?;
    let successor = prepare_log_generation_recovery_host(
        operational,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(current_bytes)?,
        &current_identity.server,
        "owner",
        &token,
    )
    .await?;
    let state = successor.capture_recovery_state("owner", &token).await?;
    let identity = state.identity()?;
    assert_eq!(identity.server, current_identity.server);
    let (_, inventory) = state.into_parts();
    let mut registrations = setup.source.protected_records();
    registrations.documents.push(RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: peer.lease.writer,
        credential: peer.credential,
    });
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = successor
        .verify_selected_recovery_state("owner", &token, identity, inventory, registrations)
        .await?
    else {
        return Err("missing recovered registrations".into());
    };
    let decision = successor
        .preview_native_service_activation("owner", &token, &setup.authority, &next, &proof)
        .await?;
    let second = successor
        .activate_native_service(
            "owner",
            &token,
            setup.authority.clone(),
            next,
            proof,
            decision.clone(),
        )
        .await?;
    assert_eq!(second.selection(), decision.planned_selection());
    assert_eq!(setup.ledger()?.len(), before.len() + 208);

    let network = Network::start(second.router()).await?;
    let socket = Socket::open(network.address).await?;
    let (socket, response) = socket.request("auth", json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":["writerTransportV2","reviewV1"]})).await?;
    assert_eq!(response["kind"], "authenticated");
    let (socket, response) = socket.request("document", json!({"kind":"resume","writer":setup.source.author.lease.writer,"credential":setup.source.author.credential})).await?;
    assert_eq!(response["kind"], "resumed");
    let (socket, response) = socket.request("comments", json!({"kind":"reviewResume","actor":setup.source.reviewer.lease.actor,"credential":setup.source.reviewer.credential})).await?;
    assert_eq!(response["kind"], "reviewResumed");
    drop(continue_original_history(socket, &setup).await?);
    let frame = successor.host.transaction(|room| room.catchup("owner")).await?;
    let reader = setup.source.profile.join_frame("room".into(), "901".into(), &frame)?;
    assert!(reader.document_json().contains("First recovered host accepted "));
    assert!(reader.document_json().contains("Old offline "));
    Ok(())
}
