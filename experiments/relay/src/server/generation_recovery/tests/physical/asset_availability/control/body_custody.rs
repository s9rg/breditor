//! An admitted incomplete HTTP body must not own native history before native work starts.
use super::super::super::{
    super::source::{POLICY, TestResult},
    history::continue_history,
};
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use crate::OperationalLogGenerationServerRoom;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dropping_control_releases_native_custody_while_admitted_bodies_remain_incomplete()
-> TestResult {
    Box::pin(workflow(false)).await
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn asset_read_incomplete_bodies_share_the_quota_without_retaining_native_custody()
-> TestResult {
    Box::pin(workflow(true)).await
}
async fn workflow(assets: bool) -> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let mut read = Request::check(&setup.token);
    if assets {
        read.path = "/recovery/physical/v1/assets/check";
    }
    let first = server.unfinished_request(&read).await?;
    let second = server.unfinished(&setup.token).await?;
    let body = if assets {
        serde_json::to_vec(
            &serde_json::json!({"format":"breditor/physical-room-recovery-asset-requirements","formatVersion":1,"selection":setup.selection(),"references":[],"uploads":[]}),
        )?
    } else {
        serde_json::to_vec(&setup.selection())?
    };
    assert_eq!(
        server.request(&read, &body).await?.status,
        503,
        "Two actual Continue handshakes precede the quota assertion"
    );
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    setup.fixture.stop();
    drop(setup.control.take());
    let early = OperationalLogGenerationServerRoom::resume(
        &setup.fixture.destination,
        &setup.fixture.source.local,
        &setup.fixture.source.local.info()?.identity,
        POLICY,
        "owner",
    );
    let released_before_body_completion = early.is_ok();
    // Always drain this test's actual sockets before asserting the regression, including RED.
    assert_eq!(server.request(&read, &body).await?.status, 503);
    assert_eq!(Network::finish_unfinished(first).await?.status, 503);
    assert_eq!(Network::finish_unfinished(second).await?.status, 503);
    server.stop().await?;
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, calls);
    let mut operation = match early {
        Ok(operation) => operation,
        Err(_) => OperationalLogGenerationServerRoom::resume(
            &setup.fixture.destination,
            &setup.fixture.source.local,
            &setup.fixture.source.local.info()?.identity,
            POLICY,
            "owner",
        )?,
    };
    continue_history(
        &mut operation,
        &setup.fixture.source.local,
        &setup.fixture.source.source,
        true,
    )?;
    assert!(
        released_before_body_completion,
        "An incomplete HTTP body with no native worker must not retain native history custody"
    );
    Ok(())
}
