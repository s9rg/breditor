//! Real sockets and actual Native owners; receipts never stand in for custody.
use super::super::durable_activation_control::{
    publication_block_for_test, publication_closed_for_test, publication_observation_for_test,
    publication_request_for_test,
};
use super::{
    durable_native_activation_control::control,
    native_activation::Setup,
    operator_network::{Network, ORIGIN, Request},
    publication_socket::Socket,
    source::TestResult,
};
use crate::server::{
    DurableNativeActivationControl, NativeRoomPublication, NativeRoomPublicationBinding,
    NativeRoomPublicationReceipt, NativeRoomPublicationRequest, prepare_native_room_publication,
};
use serde_json::json;
use std::{net::SocketAddr, sync::Arc, time::Duration};

mod native_history;

struct ActiveSocket {
    socket: Socket,
    document: crate::Lease,
    comments: crate::ReviewLease,
}
struct Fixture {
    setup: Setup,
    native: Arc<DurableNativeActivationControl>,
    publication: Arc<NativeRoomPublication>,
    network: Network,
    token: String,
    request: NativeRoomPublicationRequest,
    address: SocketAddr,
}
fn command(token: &str) -> Request<'_> {
    Request { path: "/recovery/native-publication/v1/publish", ..Request::check(token) }
}
impl Fixture {
    async fn new(history: (bool, bool)) -> TestResult<Self> {
        let setup = Box::pin(Setup::new((3, true), true, history, true)).await?;
        let (router, native, token) = control(&setup).await?;
        let native = Arc::new(native);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let (publication_router, publication) =
            prepare_native_room_publication(native.clone(), listener.into_std()?)?;
        let request = NativeRoomPublicationRequest {
            format: "breditor/native-room-publication-request".into(),
            format_version: 1,
            selection: publication.identity(),
            joint: NativeRoomPublicationBinding { bytes: 1536, sha256: [37; 32] },
        };
        assert_eq!(request.selection.listener, address.to_string());
        let network = Network::start(router.merge(publication_router)).await?;
        Ok(Self {
            setup,
            native,
            publication: Arc::new(publication),
            network,
            token,
            request,
            address,
        })
    }
    async fn commit(&self) -> TestResult {
        let request = Request {
            path: "/recovery/native-activation/v1/commit",
            ..Request::check(&self.token)
        };
        assert_eq!(
            self.network
                .request(&request, &serde_json::to_vec(&self.native.identity())?)
                .await?
                .status,
            200
        );
        Ok(())
    }
    async fn publish(&self) -> TestResult<Vec<u8>> {
        let response = self
            .network
            .request(&command(&self.token), &serde_json::to_vec(&self.request)?)
            .await?;
        assert_eq!(response.status, 200);
        assert!(response.headers.contains("cache-control: no-store"));
        let receipt: NativeRoomPublicationReceipt = serde_json::from_slice(&response.body)?;
        assert_eq!(receipt.selection, self.request.selection);
        assert_eq!(receipt.joint, self.request.joint);
        assert_eq!(
            receipt.scope,
            "actual-held-native-service-and-bound-listener; joint-association-only"
        );
        Ok(response.body)
    }
    async fn authenticated(&self) -> TestResult<Socket> {
        let socket = Socket::open(self.address).await?;
        let (socket, response) = socket.request("auth", json!({"kind":"authenticate","principal":"owner","token":self.setup.owner,"capabilities":["writerTransportV2","reviewV1"]})).await?;
        assert_eq!(response["kind"], "authenticated");
        Ok(socket)
    }
    async fn resumed(&self) -> TestResult<ActiveSocket> {
        let socket = self.authenticated().await?;
        let (socket, response) = socket.request("document", json!({"kind":"resume","writer":self.setup.source.author.lease.writer,"credential":self.setup.source.author.credential})).await?;
        assert_eq!(response["kind"], "resumed");
        let document = crate::Lease {
            writer: self.setup.source.author.lease.writer.clone(),
            token: response["lease"]["token"].as_str().ok_or("actual document lease")?.into(),
        };
        let (socket, response) = socket.request("comments", json!({"kind":"reviewResume","actor":self.setup.source.reviewer.lease.actor,"credential":self.setup.source.reviewer.credential})).await?;
        assert_eq!(response["kind"], "reviewResumed");
        let comments = crate::ReviewLease {
            actor: self.setup.source.reviewer.lease.actor.clone(),
            token: response["lease"]["token"].as_str().ok_or("actual comment lease")?.into(),
        };
        Ok(ActiveSocket { socket, document, comments })
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_serves_original_document_and_comment_protocol_for_all_history_pairs()
-> TestResult {
    for document in [false, true] {
        for review in [false, true] {
            let fixture = Box::pin(Fixture::new((document, review))).await?;
            assert!(fixture.publication.observe().await.is_err());
            let before = fixture.setup.ledger()?;
            assert_eq!(
                fixture
                    .network
                    .request(&command(&fixture.token), &serde_json::to_vec(&fixture.request)?)
                    .await?
                    .status,
                503
            );
            assert_eq!(fixture.setup.ledger()?, before);
            fixture.commit().await?;
            assert!(fixture.publication.observe().await.is_err());
            let committed = fixture.setup.ledger()?;
            let receipt = fixture.publish().await?;
            assert_eq!(serde_json::to_vec(&fixture.publication.observe().await?)?, receipt);
            assert_eq!(fixture.publish().await?, receipt);
            assert_eq!(fixture.setup.ledger()?, committed);
            let active = fixture.resumed().await?;
            let socket = super::publication_history::continue_original_history(
                active.socket,
                &fixture.setup.source,
            )
            .await?;
            assert_eq!(fixture.publish().await?, receipt);
            // Actual upgraded futures must finish their native lease cleanup;
            // completing axum's HTTP server alone does not prove that.
            assert_eq!(publication_observation_for_test(&fixture.publication).2, 1);
            fixture.publication.close().await?;
            assert!(fixture.publication.observe().await.is_err());
            assert_eq!(publication_observation_for_test(&fixture.publication).2, 0);
            assert_eq!(fixture.setup.ledger()?, committed);
            fixture
                .setup
                .handle
                .host
                .transaction({
                    let previous_document = active.document;
                    let previous_comments = active.comments;
                    let writer = fixture.setup.source.author.lease.writer.clone();
                    let credential = fixture.setup.source.author.credential.clone();
                    let actor = fixture.setup.source.reviewer.lease.actor.clone();
                    let comment_credential = fixture.setup.source.reviewer.credential.clone();
                    move |room| {
                        assert!(matches!(
                            room.validate_lease("owner", &previous_document),
                            Err(crate::Error::Lease)
                        ));
                        assert!(matches!(
                            room.validate_review_lease("owner", &previous_comments),
                            Err(crate::Error::Lease)
                        ));
                        let writer = room.resume("owner", &writer, &credential)?;
                        let comments = room.resume_review("owner", &actor, &comment_credential)?;
                        room.release(&writer);
                        room.release_review(&comments);
                        Ok(())
                    }
                })
                .await?;
            drop(socket);
            fixture.network.stop().await?;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_refusals_leave_bound_listener_and_native_epoch_unchanged() -> TestResult
{
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    fixture.commit().await?;
    let before = fixture.setup.ledger()?;
    let bytes = serde_json::to_vec(&fixture.request)?;
    for bad in [
        Request { token: &fixture.setup.owner, ..command(&fixture.token) },
        Request { principal: "owner", ..command(&fixture.token) },
        Request { origin: "http://localhost:4187", ..command(&fixture.token) },
    ] {
        assert_eq!(fixture.network.request(&bad, &bytes).await?.status, 403);
    }
    for variant in 0..8 {
        let mut value = serde_json::to_value(&fixture.request)?;
        match variant {
            0 => value["selection"]["instance"] = json!("another-instance"),
            1 => value["selection"]["listener"] = json!("127.0.0.1:1"),
            2 => value["joint"]["bytes"] = json!(0),
            3 => value["joint"]["bytes"] = json!(1_073_741_825),
            4 => value["joint"]["sha256"][0] = json!(256),
            5 => value["formatVersion"] = json!(2),
            6 => value["ready"] = json!(true),
            _ => value = serde_json::to_value(fixture.native.identity())?,
        }
        assert_eq!(
            fixture
                .network
                .request(&command(&fixture.token), &serde_json::to_vec(&value)?)
                .await?
                .status,
            400
        );
    }
    assert_eq!(
        fixture.network.request(&command(&fixture.token), &vec![b' '; 65537]).await?.status,
        413
    );
    let options = Request {
        method: "OPTIONS",
        extra: "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: Authorization, Content-Type, X-Breditor-Principal\r\n",
        ..command(&fixture.token)
    };
    assert_eq!(fixture.network.request(&options, &[]).await?.status, 204);
    assert_eq!(fixture.network.request(&Request { extra: "Access-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: Unknown\r\n", ..options }, &[]).await?.status, 403);
    assert_eq!(fixture.setup.ledger()?, before);
    let receipt = fixture.publish().await?;
    let mut changed = fixture.request.clone();
    changed.joint.sha256[0] ^= 1;
    assert_eq!(
        fixture
            .network
            .request(&command(&fixture.token), &serde_json::to_vec(&changed)?)
            .await?
            .status,
        400
    );
    assert_eq!(fixture.publish().await?, receipt);
    assert_eq!(fixture.setup.ledger()?, before);
    fixture.publication.close().await?;
    fixture.network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_incomplete_body_retains_only_quota_and_drop_closes_actual_socket()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    let before = fixture.setup.ledger()?;
    let pending = fixture.network.unfinished_request(&command(&fixture.token)).await?;
    assert_eq!(
        fixture
            .network
            .request(&command(&fixture.token), &serde_json::to_vec(&fixture.request)?)
            .await?
            .status,
        503
    );
    drop(fixture.publication);
    // An unread body held only the semaphore, so dropping the actual owner
    // releases the real bound socket even while that body is still pending.
    let rebound = tokio::net::TcpListener::bind(fixture.address).await?;
    assert_eq!(Network::finish_unfinished(pending).await?.status, 503);
    assert_eq!(fixture.setup.ledger()?, before);
    drop(rebound);
    fixture.network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_cancelled_http_waiter_keeps_actual_installation_and_request_quota()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    fixture.commit().await?;
    let before = fixture.setup.ledger()?;
    let (entered, waiting) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let blocker = publication_block_for_test(&fixture.publication, entered, released);
    waiting.await?;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/recovery/native-publication/v1/publish")
        .header("origin", ORIGIN)
        .header("content-type", "application/json")
        .header("x-breditor-principal", "operator")
        .header("authorization", format!("Bearer {}", fixture.token))
        .body(axum::body::Body::from(serde_json::to_vec(&fixture.request)?))?;
    let waiter = tokio::spawn(publication_request_for_test(&fixture.publication, request));
    let entered = tokio::time::timeout(Duration::from_secs(10), async {
        while publication_observation_for_test(&fixture.publication) != (0, true, 0) {
            tokio::task::yield_now().await;
        }
    })
    .await;
    if entered.is_err() {
        let observation = publication_observation_for_test(&fixture.publication);
        let status = if waiter.is_finished() {
            Some(waiter.await?.status().as_u16())
        } else {
            waiter.abort();
            None
        };
        release.send(())?;
        tokio::task::spawn_blocking(move || blocker.join().expect("publication blocker joins"))
            .await?;
        return Err(format!(
            "actual publication worker not observed; probe={observation:?}; HTTP status={status:?}"
        )
        .into());
    }
    waiter.abort();
    assert!(waiter.await.expect_err("HTTP waiter cancelled").is_cancelled());
    assert_eq!(publication_observation_for_test(&fixture.publication), (0, true, 0));
    release.send(())?;
    tokio::task::spawn_blocking(move || blocker.join().expect("publication blocker joins")).await?;
    tokio::time::timeout(Duration::from_secs(10), async {
        while publication_observation_for_test(&fixture.publication).0 != 1 {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    fixture.publish().await?;
    let socket = fixture.resumed().await?;
    assert_eq!(fixture.setup.ledger()?, before);
    fixture.publication.close().await?;
    drop(socket);
    fixture.network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_cancelled_close_waiter_retains_actual_upgraded_connection_cleanup()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    fixture.commit().await?;
    fixture.publish().await?;
    let socket = fixture.resumed().await?;
    let room = fixture.setup.handle.host.room.clone();
    let (entered, waiting) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let blocker = std::thread::spawn(move || {
        let _held = room.lock().expect("real native cleanup exclusion");
        let _ = entered.send(());
        released.recv_timeout(Duration::from_secs(30)).expect("release native cleanup");
    });
    waiting.await?;
    let owner = fixture.publication.clone();
    let close = tokio::spawn(async move { owner.close().await });
    // Wait for the actual owner to close admission before sending the HTTP
    // witness. Otherwise the test itself could admit a repeat while native
    // cleanup holds the deployment transaction behind this deliberate blocker.
    tokio::time::timeout(Duration::from_secs(10), async {
        while !publication_closed_for_test(&fixture.publication) {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    assert_eq!(
        fixture
            .network
            .request(&command(&fixture.token), &serde_json::to_vec(&fixture.request)?)
            .await?
            .status,
        503
    );
    assert_eq!(publication_observation_for_test(&fixture.publication).2, 1);
    assert!(!close.is_finished());
    close.abort();
    assert!(close.await.expect_err("close waiter cancelled").is_cancelled());
    assert_eq!(publication_observation_for_test(&fixture.publication).2, 1);
    release.send(())?;
    tokio::task::spawn_blocking(move || blocker.join().expect("native blocker joins")).await?;
    fixture.publication.close().await?;
    fixture.publication.close().await?;
    assert_eq!(publication_observation_for_test(&fixture.publication).2, 0);
    drop(socket);
    fixture.network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_repeat_rechecks_current_epoch_and_never_revives_superseded_service()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    fixture.commit().await?;
    fixture.publish().await?;
    let selected = fixture.setup.authority.current_selection()?;
    fixture.setup.authority.claim(&selected)?.close();
    assert!(fixture.publication.observe().await.is_err());
    let before = fixture.setup.ledger()?;
    assert_ne!(
        fixture
            .network
            .request(&command(&fixture.token), &serde_json::to_vec(&fixture.request)?)
            .await?
            .status,
        200
    );
    let socket = Socket::open(fixture.address).await?;
    let (socket, response) = socket.request("stale", json!({"kind":"authenticate","principal":"owner","token":fixture.setup.owner,"capabilities":["writerTransportV2"]})).await?;
    assert_eq!(response["kind"], "error");
    assert_eq!(fixture.setup.ledger()?, before);
    fixture.publication.close().await?;
    drop(socket);
    fixture.network.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_publication_failed_actual_native_cleanup_stays_uncertain_after_connections_end()
-> TestResult {
    let fixture = Box::pin(Fixture::new((true, true))).await?;
    fixture.commit().await?;
    fixture.publish().await?;
    let socket = fixture.resumed().await?;
    let selected = fixture.setup.authority.current_selection()?;
    fixture.setup.authority.claim(&selected)?.close();
    let before = fixture.setup.ledger()?;
    // The old actual deployment no longer admits lease cleanup. An ended
    // upgrade future and zero connection count cannot certify that it did.
    assert!(fixture.publication.close().await.is_err());
    assert_eq!(publication_observation_for_test(&fixture.publication).2, 0);
    assert!(fixture.publication.close().await.is_err());
    assert_eq!(fixture.setup.ledger()?, before);
    drop(socket);
    fixture.network.stop().await?;
    Ok(())
}

#[test]
fn native_publication_survives_preparation_runtime_shutdown_without_false_serving_receipt()
-> TestResult {
    let first =
        tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?;
    let (setup, native, publication, router, token, address, request) = first.block_on(async {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let (router, native, token) = control(&setup).await?;
        let native = Arc::new(native);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let (publication_router, publication) =
            prepare_native_room_publication(native.clone(), listener.into_std()?)?;
        let request = NativeRoomPublicationRequest {
            format: "breditor/native-room-publication-request".into(),
            format_version: 1,
            selection: publication.identity(),
            joint: NativeRoomPublicationBinding { bytes: 3072, sha256: [41; 32] },
        };
        Ok::<_, Box<dyn std::error::Error>>((
            setup,
            native,
            Arc::new(publication),
            router.merge(publication_router),
            token,
            address,
            request,
        ))
    })?;
    // Destroy the actual preparation reactor before the operator's actual
    // serving runtime exists. A retained Handle must not certify live serving.
    drop(first);
    let second =
        tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?;
    second.block_on(async {
        let network = Network::start(router).await?;
        let fixture = Fixture { setup, native, publication, network, token, request, address };
        fixture.commit().await?;
        let before = fixture.setup.ledger()?;
        fixture.publish().await?;
        let active = fixture.resumed().await?;
        let socket = super::publication_history::continue_original_history(
            active.socket,
            &fixture.setup.source,
        )
        .await?;
        fixture.publish().await?;
        fixture.publication.close().await?;
        assert_eq!(fixture.setup.ledger()?, before);
        drop(socket);
        fixture.network.stop().await?;
        Ok(())
    })
}
