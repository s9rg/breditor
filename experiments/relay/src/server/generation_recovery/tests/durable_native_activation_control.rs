//! Actual HTTP commits, unchanged epochs on refusals and retained post-cancellation custody.
use super::operator_network as network;
use super::operator_network::ORIGIN;
use super::{native_activation::Setup, source::TestResult};
use crate::server::{
    Authentication, DurableNativeActivationControl, NativeGenerationActivationPrepareOptions,
    PreparedNativeGenerationActivation, VerifiedServerLogGenerationRecoveryState,
    prepare_durable_native_activation_control,
};
use network::{Network, Request};
use std::sync::Arc;

mod next_handover;

fn operators(token: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(
        &serde_json::json!({
            "format":"breditor/relay-auth","formatVersion":1,"origins":[ORIGIN],
            "accounts":[{"principal":"operator","tokenHash":crate::credentials::hash(token)?}]
        })
        .to_string(),
    )?)
}
async fn prepare_selected_control(
    setup: &Setup,
    proof: &Arc<VerifiedServerLogGenerationRecoveryState>,
    prepared: &Arc<PreparedNativeGenerationActivation>,
    native_token: &str,
    configured: Authentication,
) -> TestResult<(axum::Router, DurableNativeActivationControl)> {
    Ok(prepare_durable_native_activation_control(
        setup.handle.clone(),
        proof.clone(),
        prepared.clone(),
        setup.authority.clone(),
        "owner",
        native_token,
        configured,
    )
    .await?)
}
pub(super) async fn control(
    setup: &Setup,
) -> TestResult<(axum::Router, DurableNativeActivationControl, String)> {
    let proof = Arc::new(setup.proof().await?);
    let prepared = Arc::new(
        setup
            .handle
            .prepare_durable_native_activation(
                "owner",
                &setup.owner,
                setup.intent.clone(),
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: setup.source.directory.0.join("operator-checkpoint"),
                    authority: setup.authority.clone(),
                },
            )
            .await?,
    );
    let (token, _) = Authentication::issue_token()?;
    let (router, control) = prepare_durable_native_activation_control(
        setup.handle.clone(),
        proof,
        prepared,
        setup.authority.clone(),
        "owner",
        &setup.owner,
        operators(&token)?,
    )
    .await?;
    Ok((router, control, token))
}
fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/native-activation/v1/commit", ..Request::check(token) }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_commits_once_over_http_for_all_history_policy_pairs()
-> TestResult {
    for document in [false, true] {
        for review in [false, true] {
            let setup = Box::pin(Setup::new((3, true), true, (document, review), true)).await?;
            let (router, control, token) = control(&setup).await?;
            assert!(control.service_router().await.is_err());
            let choice = control.identity();
            let bytes = serde_json::to_vec(&choice)?;
            let transport = serde_json::to_value(&choice)?;
            assert!(transport.get("checkpoint").is_none());
            assert!(transport.get("root").is_none());
            assert_eq!(transport["checkpointSha256"].as_array().ok_or("digest")?.len(), 32);
            assert!(transport["previous"]["generation"].is_string());
            assert!(transport["planned"]["generation"].is_string());
            let before = setup.ledger()?;
            let network = Network::start(router).await?;
            let response = network.request(&request(&token), &bytes).await?;
            assert_eq!(response.status, 200);
            assert!(response.headers.contains("cache-control: no-store"));
            let receipt: serde_json::Value = serde_json::from_slice(&response.body)?;
            assert_eq!(receipt["selection"], serde_json::to_value(&choice)?);
            assert_eq!(receipt["scope"], "actual-held-native-service-only");
            assert_eq!(setup.ledger()?.len(), before.len() + 104);
            assert_eq!(setup.authority.current_selection()?, choice.planned);
            let service = control.service_router().await?;
            // Later accepted native work does not cause a repeated commit to
            // recreate the old checkpoint or append another serving lease.
            setup
                .handle
                .host
                .transaction(|room| {
                    room.grant("owner", "after-network-activation", Some(crate::Role::Reader))?;
                    Ok(())
                })
                .await?;
            let repeated = network.request(&request(&token), &bytes).await?;
            assert_eq!(repeated.status, 200);
            assert_eq!(repeated.body, response.body);
            assert_eq!(setup.ledger()?.len(), before.len() + 104);
            assert!(control.service_router().await.is_ok());
            drop(service);
            control.close();
            assert_eq!(network.request(&request(&token), &bytes).await?.status, 503);
            assert!(control.service_router().await.is_err());
            // Closing operator control does not revoke the actual native host.
            let current = setup.handle.capture_recovery_state("owner", &setup.owner).await?;
            let absent = setup.source.directory.0.join("closed-control-handover");
            assert!(matches!(
                control
                    .prepare_next_handover(
                        "owner",
                        &setup.owner,
                        &absent,
                        current.identity()?.server
                    )
                    .await,
                Err(crate::Error::NeedsRecovery)
            ));
            assert!(!absent.exists());
            network.stop().await?;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_refuses_auth_origin_and_choice_without_consuming_commit()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let (router, control, token) = control(&setup).await?;
    let bytes = serde_json::to_vec(&control.identity())?;
    let before = setup.ledger()?;
    let network = Network::start(router).await?;
    for bad in [
        Request { token: &setup.owner, ..request(&token) },
        Request { principal: "owner", ..request(&token) },
        Request { origin: "http://localhost:4187", ..request(&token) },
    ] {
        assert_eq!(network.request(&bad, &bytes).await?.status, 403);
    }
    for variant in 0..4 {
        let mut selected = serde_json::to_value(control.identity())?;
        match variant {
            0 => selected["instance"] = serde_json::json!("another-instance"),
            1 => selected["ready"] = serde_json::json!(true),
            2 => selected["checkpointSha256"][0] = serde_json::json!(256),
            _ => {
                let byte = selected["checkpointSha256"][0].as_u64().ok_or("digest byte")?;
                selected["checkpointSha256"][0] = serde_json::json!(byte ^ 1);
            }
        }
        assert_eq!(
            network.request(&request(&token), &serde_json::to_vec(&selected)?).await?.status,
            400
        );
    }
    assert_eq!(network.request(&request(&token), &vec![b' '; 65537]).await?.status, 413);
    assert_eq!(setup.ledger()?, before);
    assert!(control.service_router().await.is_err());
    assert_eq!(network.request(&request(&token), &bytes).await?.status, 200);
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_stale_target_is_terminal_without_an_epoch_append() -> TestResult
{
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let (router, control, token) = control(&setup).await?;
    let bytes = serde_json::to_vec(&control.identity())?;
    setup
        .handle
        .host
        .transaction(|room| {
            room.grant("owner", "stales-the-complete-cut", Some(crate::Role::Reader))?;
            Ok(())
        })
        .await?;
    let before = setup.ledger()?;
    let network = Network::start(router).await?;
    let refused = network.request(&request(&token), &bytes).await?;
    assert_ne!(refused.status, 200);
    assert_eq!(network.request(&request(&token), &bytes).await?.status, 503);
    assert_eq!(setup.ledger()?, before);
    assert!(control.service_router().await.is_err());
    setup.handle.capture_recovery_state("owner", &setup.owner).await?;
    network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_incomplete_body_holds_only_quota_and_close_refuses_commit()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let (router, control, token) = control(&setup).await?;
    let bytes = serde_json::to_vec(&control.identity())?;
    let before = setup.ledger()?;
    let network = Network::start(router).await?;
    let stream = network.unfinished_request(&request(&token)).await?;
    assert_eq!(network.request(&request(&token), &bytes).await?.status, 503);
    drop(control);
    assert_eq!(Network::finish_unfinished(stream).await?.status, 503);
    assert_eq!(network.request(&request(&token), &bytes).await?.status, 503);
    assert_eq!(setup.ledger()?, before);
    network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_cancelled_http_waiter_keeps_worker_quota_and_actual_service()
-> TestResult {
    use crate::server::generation_recovery::durable_activation_control::{
        request_for_test, worker_observation_for_test,
    };
    use std::time::Duration;
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let (_router, control, token) = control(&setup).await?;
    let before = setup.ledger()?;
    let room = setup.handle.host.room.clone();
    let (entered, waiting) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let blocking = std::thread::spawn(move || {
        let _held = room.lock().expect("actual native target exclusion");
        let _ = entered.send(());
        released.recv_timeout(Duration::from_secs(30)).expect("release native target");
    });
    waiting.await?;
    let incoming = axum::http::Request::builder()
        .method("POST")
        .uri("/recovery/native-activation/v1/commit")
        .header("origin", ORIGIN)
        .header("content-type", "application/json")
        .header("x-breditor-principal", "operator")
        .header("authorization", format!("Bearer {token}"))
        .body(axum::body::Body::from(serde_json::to_vec(&control.identity())?))?;
    let task = tokio::spawn(request_for_test(&control, incoming));
    // The actual commit mutex is held while the real worker waits for the
    // native target. No sleep, advisory state file or imagined start counts.
    tokio::time::timeout(Duration::from_secs(10), async {
        while worker_observation_for_test(&control) != (0, true) {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    task.abort();
    assert!(task.await.expect_err("HTTP waiter was cancelled").is_cancelled());
    assert_eq!(worker_observation_for_test(&control), (0, true));
    release.send(())?;
    tokio::task::spawn_blocking(move || blocking.join().expect("native blocker joins")).await?;
    tokio::time::timeout(Duration::from_secs(10), async {
        while worker_observation_for_test(&control).0 != 1 {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    assert!(control.service_router().await.is_ok());
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_activation_control_preparation_requires_independent_auth_and_fresh_real_custody()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = Arc::new(setup.proof().await?);
    let prepared = Arc::new(
        setup
            .handle
            .prepare_durable_native_activation(
                "owner",
                &setup.owner,
                setup.intent.clone(),
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: setup.source.directory.0.join("selected-checkpoint"),
                    authority: setup.authority.clone(),
                },
            )
            .await?,
    );
    let (token, _) = Authentication::issue_token()?;
    assert!(
        prepare_selected_control(&setup, &proof, &prepared, &setup.owner, operators(&setup.owner)?)
            .await
            .is_err()
    );
    assert!(
        prepare_selected_control(&setup, &proof, &prepared, &setup.reader, operators(&token)?)
            .await
            .is_err()
    );
    let (first_router, first) =
        prepare_selected_control(&setup, &proof, &prepared, &setup.owner, operators(&token)?)
            .await?;
    let (other_router, second) =
        prepare_selected_control(&setup, &proof, &prepared, &setup.owner, operators(&token)?)
            .await?;
    let before = setup.ledger()?;
    let network = Network::start(other_router).await?;
    // The other genuine instance cannot accept even a valid selected checkpoint
    // under this instance's choice. Both retain the same actual native barrier.
    assert_eq!(
        network.request(&request(&token), &serde_json::to_vec(&first.identity())?).await?.status,
        400
    );
    assert_eq!(
        network.request(&request(&token), &serde_json::to_vec(&second.identity())?).await?.status,
        200
    );
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    assert!(
        prepare_selected_control(&setup, &proof, &prepared, &setup.owner, operators(&token)?)
            .await
            .is_err()
    );
    let original_network = Network::start(first_router).await?;
    assert_ne!(
        original_network
            .request(&request(&token), &serde_json::to_vec(&first.identity())?)
            .await?
            .status,
        200
    );
    assert_eq!(setup.ledger()?.len(), before.len() + 104);
    original_network.stop().await?;
    assert!(first.service_router().await.is_err());
    assert!(second.service_router().await.is_ok());
    network.stop().await?;
    Ok(())
}
