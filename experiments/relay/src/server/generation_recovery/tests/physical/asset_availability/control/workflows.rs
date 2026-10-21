//! Native state remains genuinely owned by the explicit guard, not serialized receipts or routers.
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
async fn actual_operator_control_checks_all_ten_native_modes_and_weak_router_releases_b_origin()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let mut setup = Box::pin(Setup::new(profile, atomic)).await?;
            let selection = setup.selection();
            assert_eq!(selection.source, setup.fixture.expected);
            assert_eq!(selection.instance.len(), 64);
            let bytes = serde_json::to_vec(&selection)?;
            let server = Network::start(setup.router.clone()).await?;
            let response = server.request(&Request::check(&setup.token), &bytes).await?;
            assert_eq!(response.status, 200);
            let read: serde_json::Value = serde_json::from_slice(&response.body)?;
            assert_eq!(read["format"], "breditor/physical-room-recovery-control-read");
            assert_eq!(read["scope"], "native-physical-and-server-provider");
            assert_eq!(read["selection"], serde_json::to_value(&selection)?);
            assert_eq!(read.as_object().ok_or("read")?.len(), 4);
            assert!(response.headers.to_ascii_lowercase().contains("cache-control: no-store"));
            assert!(
                response
                    .headers
                    .to_ascii_lowercase()
                    .contains("access-control-allow-origin: http://127.0.0.1:4187")
            );
            let text = std::str::from_utf8(&response.body)?;
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!text.contains(secret));
            }
            for path in ["/ws", "/assets/private", "/backup", "/activate", "/health"] {
                let mut request = Request::check(&setup.token);
                request.method = "GET";
                request.path = path;
                assert_eq!(server.request(&request, &[]).await?.status, 404);
            }
            setup.fixture.stop();
            assert!(
                OperationalLogGenerationServerRoom::resume(
                    &setup.fixture.destination,
                    &setup.fixture.source.local,
                    &setup.fixture.source.local.info()?.identity,
                    POLICY,
                    "owner"
                )
                .is_err(),
                "The explicit control guard still retains actual native ownership"
            );
            drop(setup.control.take());
            assert_eq!(server.request(&Request::check(&setup.token), &bytes).await?.status, 503);
            let mut operation = OperationalLogGenerationServerRoom::resume(
                &setup.fixture.destination,
                &setup.fixture.source.local,
                &setup.fixture.source.local.info()?.identity,
                POLICY,
                "owner",
            )?;
            continue_history(
                &mut operation,
                &setup.fixture.source.local,
                &setup.fixture.source.source,
                atomic,
            )?;
            operation.check_live_source(&setup.fixture.source.local, "owner")?;
            server.stop().await?;
        }
    }
    Ok(())
}
