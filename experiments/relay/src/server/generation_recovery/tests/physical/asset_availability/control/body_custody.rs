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
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let first = server.unfinished(&setup.token).await?;
    let second = server.unfinished(&setup.token).await?;
    let body = serde_json::to_vec(&setup.selection())?;
    let mut saturated = false;
    for _ in 0..16 {
        let status = server.request(&Request::check(&setup.token), &body).await?.status;
        if status == 503 {
            saturated = true;
            break;
        }
        assert_eq!(status, 200);
        tokio::task::yield_now().await;
    }
    assert!(saturated, "Both authenticated handlers must be waiting for their actual HTTP bodies");
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
    assert_eq!(server.request(&Request::check(&setup.token), &body).await?.status, 503);
    drop(first);
    drop(second);
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
