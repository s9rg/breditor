//! The actual original physical handler must keep its shared slot after the waiter ends.
use super::super::super::super::source::{POLICY, TestResult};
use super::{
    fixture::{ORIGIN, Setup},
    network::{Network, Request},
    waiter_provider::{Release, prepare},
};
use crate::OperationalLogGenerationServerRoom;
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_abandoned_waiter_cannot_release_quota_before_actual_native_work_finishes()
-> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    setup.control.take();
    let ready = prepare(&setup).await?;
    let _release = Release(ready.gate.clone());
    let server = Network::start(ready.router).await?;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/")
        .header("Origin", ORIGIN)
        .header("X-Breditor-Principal", "operator")
        .header("Authorization", format!("Bearer {}", setup.token))
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(serde_json::to_vec(&ready.control.identity())?))?;
    ready.gate.arm();
    let actual =
        crate::server::generation_recovery::physical::request_for_test(&ready.control, request);
    let waiter = tokio::spawn(actual);
    ready.entered.await?;
    waiter.abort();
    assert!(waiter.await.expect_err("waiter was aborted").is_cancelled());
    let second = server.unfinished(&setup.token).await?;
    let status = server.admission_status(&Request::check(&setup.token)).await?;
    ready.gate.release();
    assert_eq!(Network::finish_unfinished(second).await?.status, 400);
    server.stop().await?;
    setup.fixture.stop();
    drop(ready.control);
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            if let Ok(held) = OperationalLogGenerationServerRoom::resume(
                &setup.fixture.destination,
                &setup.fixture.source.local,
                &setup.fixture.source.local.info()?.identity,
                POLICY,
                "owner",
            ) {
                drop(held);
                break Ok::<_, crate::Error>(());
            }
            tokio::task::yield_now().await;
        }
    })
    .await??;
    assert_eq!(
        status, 503,
        "Actual physical provider work lost its slot after only the waiter ended"
    );
    Ok(())
}
