//! Public-only native activation: real authenticated sockets, not private Room access.
use super::live_handover::author;
use super::{TestResult, insert, setup};
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    server::{
        Authentication, PreparedLogGenerationRecoveryHost, RoomDeploymentAuthority,
        ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
        prepare_log_generation_recovery_host,
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use serde_json::json;
use std::fs;
#[path = "native_activation/durable.rs"]
mod durable;
#[path = "native_activation/migrated.rs"]
mod migrated;
#[path = "native_activation/traffic.rs"]
mod traffic;
// Reuse the exact bounded TCP/WebSocket test driver; it has no private relay API.
mod fixture {
    pub const ORIGIN: &str = "http://127.0.0.1:4187";
    pub type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
}
#[path = "native_activation/network.rs"]
mod network;
fn authentication() -> TestResult<(Authentication, String)> {
    let (token, hash) = Authentication::issue_token()?;
    Ok((Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"origins":[fixture::ORIGIN],"accounts":[{"principal":"owner","tokenHash":hash}]}).to_string())?,token))
}
fn credentials(author: &author::Author) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: author.document_registration.lease.writer.clone(),
            credential: author.document_registration.credential.clone(),
        }],
        reviews: vec![RecoveryReviewCredential {
            principal: "owner".into(),
            actor: author.review_registration.lease.actor.as_str().into(),
            credential: author.review_registration.credential.clone(),
        }],
    }
}
async fn workflow(version: u32, standard: bool, atomic: bool, checkpointed: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    let mut prepared = author::prepare(&mut room, &profile, &files.0.join("assets"), atomic)?;
    let authority =
        RoomDeploymentAuthority::create(&files.0.join("authority"), &room.deployment_binding()?)?;
    let old_lease = authority.claim(&authority.current_selection()?)?;
    let (auth, old_token) = authentication()?;
    let (old_router, live) = router_with_log_generation_backups_and_deployment_lease(
        room,
        auth,
        prepared.assets,
        old_lease,
        "owner",
        &old_token,
    )
    .await?;
    let original = live.capture("owner", &old_token).await?;
    let intent = live
        .prepare_handover("owner", &old_token, &files.0.join("intent"), original.info()?.identity)
        .await?;
    let id = intent.identity().clone();
    fs::write(files.0.join("source-choice.json"), serde_json::to_vec(&id)?)?;
    let intent =
        std::sync::Arc::new(live.seal_prepared_handover("owner", &old_token, intent, &id).await?);
    insert(&mut prepared.author.document, "retained offline document 🙂 ")?;
    author::comment(
        &prepared.author.document,
        &mut prepared.author.review,
        "retained offline comment",
    )?;
    let offline_document = prepared.author.document.checkpoint()?;
    let offline_review = prepared.author.review.checkpoint_json()?;
    let (host, token, proof) =
        Box::pin(prepare_target(&files.0, &original, credentials(&prepared.author))).await?;
    let active = Box::pin(durable::first(
        &host,
        &token,
        &authority,
        intent.clone(),
        proof,
        &files.0,
        checkpointed,
    ))
    .await?;
    let mut pin = active.selection().clone();
    assert_eq!(prepared.author.document.checkpoint()?, offline_document);
    assert_eq!(prepared.author.review.checkpoint_json()?, offline_review);
    let old = network::Network::start(old_router).await?;
    let service = network::Network::start(active.router()).await?;
    drop(active);
    drop(host);
    serve(
        &service,
        &old,
        &profile,
        &mut prepared.author,
        (&token, &old_token),
        (&prepared.asset, &prepared.png),
        atomic,
    )
    .await?;
    service.stop().await?;
    drop(intent);
    if checkpointed {
        insert(&mut prepared.author.document, "offline across native cold restart ")?;
        author::comment(
            &prepared.author.document,
            &mut prepared.author.review,
            "offline comment across native cold restart",
        )?;
        let (active, token) =
            Box::pin(durable::restart(&files.0, &original, &prepared.author)).await?;
        pin = active.selection().clone();
        let service = network::Network::start(active.router()).await?;
        drop(active);
        serve(
            &service,
            &old,
            &profile,
            &mut prepared.author,
            (&token, &old_token),
            (&prepared.asset, &prepared.png),
            atomic,
        )
        .await?;
        service.stop().await?;
    }
    old.stop().await?;
    drop(live);
    let cold = RoomDeploymentAuthority::open_at_least(&files.0.join("authority"), &pin)?;
    assert_eq!(cold.current_selection()?, pin);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ten_public_services_reconnect_both_offline_lanes_exact_retries_future_history_and_rasters()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            Box::pin(workflow(version, standard, atomic, false)).await?;
        }
    }
    Ok(())
}

async fn prepare_target(
    root: &std::path::Path,
    original: &ServerLogGenerationRoomBackup,
    supplied: RecoveryRegistrationCredentials,
) -> TestResult<(PreparedLogGenerationRecoveryHost, String, VerifiedServerLogGenerationRecoveryState)>
{
    let operation = ServerLogGenerationRoomRecovery::begin(
        &root.join("target"),
        original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(original)?
    .begin_operation(
        original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let (auth, token) = authentication()?;
    let host = prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &token,
    )
    .await?;
    let state = host.capture_recovery_state("owner", &token).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) =
        host.verify_selected_recovery_state("owner", &token, expected, inventory, supplied).await?
    else {
        return Err("protected records".into());
    };
    Ok((host, token, proof))
}

async fn serve(
    service: &network::Network,
    old: &network::Network,
    profile: &breditor_collab_feasibility::rich_replica::SharedRichProfile,
    author: &mut author::Author,
    tokens: (&str, &str),
    rasters: (&str, &[u8]),
    atomic: bool,
) -> TestResult {
    let mut socket = network::Socket::connect(service.address).await?;
    traffic::authenticate(&mut socket, tokens.0, atomic).await?;
    traffic::resume(&mut socket, author).await?;
    traffic::send_document(&mut socket, author, atomic, true).await?;
    traffic::send_comments(&mut socket, author, true).await?;
    traffic::history(&mut socket, author, atomic).await?;
    let catchup = socket.request(json!({"kind":"sync"})).await?;
    assert_eq!(catchup["kind"], "catchup");
    let observer = profile.join_frame(
        "room".into(),
        "99".into(),
        catchup["frame"].as_str().ok_or("catchup frame")?,
    )?;
    assert_eq!(observer.document_json(), author.document.document_json());
    let (status, bytes) =
        service.http("GET", &format!("/assets/{}", rasters.0), tokens.0, &[]).await?;
    assert_eq!(status, 200);
    assert_eq!(bytes, rasters.1);
    assert_eq!(service.http("GET", &format!("/assets/{}", rasters.0), tokens.1, &[]).await?.0, 403);
    assert_ne!(old.http("GET", &format!("/assets/{}", rasters.0), tokens.1, &[]).await?.0, 200);
    drop(socket);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ten_durable_public_native_services_cold_restart_and_keep_both_offline_lanes_future_history_and_rasters()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            Box::pin(workflow(version, standard, atomic, true)).await?;
        }
    }
    Ok(())
}
