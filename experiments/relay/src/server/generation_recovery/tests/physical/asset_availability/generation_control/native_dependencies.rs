//! Actual Native complete-source HTTP reads across every original profile/transport.
//! These results cannot acknowledge clients, update their heads or activate a room.
use super::super::super::super::source::TestResult;
use super::{
    fixture::Setup,
    metadata_receipts::seeded,
    network::{Network, Request},
};
use crate::{assets::asset_id, room::metadata_receipts::test_fixture};
use serde_json::{Value, json};

fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/generations/v1/native-dependencies/read", ..Request::check(token) }
}
fn body(setup: &Setup) -> Value {
    json!({"format":"breditor/server-log-generation-recovery-native-dependencies-request","formatVersion":1,"selection":setup.selection()})
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_dependencies_all_ten_profiles_are_the_exact_complete_native_inventory() -> TestResult
{
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let setup = Box::pin(seeded(profile, atomic, 2)).await?;
            let expected = setup
                .fixture
                .local()
                .capture_asset_recovery_state("owner", &setup.fixture.owner)
                .await?;
            let before = expected.current;
            let server = Network::start(setup.router.clone()).await?;
            let bytes = serde_json::to_vec(&body(&setup))?;
            let result = server.request(&request(&setup.token), &bytes).await?;
            assert_eq!(result.status, 200);
            let read: Value = serde_json::from_slice(&result.body)?;
            assert_eq!(
                read["format"],
                "breditor/server-log-generation-recovery-native-dependencies-read"
            );
            assert_eq!(
                read["scope"],
                "selected-server-native-causal-and-complete-physical-packet-dependencies"
            );
            assert_eq!(read["selection"], serde_json::to_value(setup.selection())?);
            assert_eq!(
                read["requestSha256"],
                asset_id(&bytes).strip_prefix("sha256:").ok_or("digest")?
            );
            assert_eq!(read["native"], serde_json::to_value(expected.references)?);
            assert_eq!(read["native"]["source"], read["selection"]["source"]["server"]["native"]);
            assert_eq!(read["native"]["outcome"]["kind"], "ready");
            assert!(read["native"]["sources"].as_array().ok_or("sources")?.len() >= 2);
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!std::str::from_utf8(&result.body)?.contains(secret));
            }
            assert_eq!(
                setup
                    .fixture
                    .local()
                    .capture_recovery_state("owner", &setup.fixture.owner)
                    .await?
                    .identity()?,
                before
            );
            server.stop().await?;
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_dependencies_closed_requests_authentication_and_metadata_only_staleness_refuse()
-> TestResult {
    let setup = Box::pin(seeded((3, true), true, 1)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let original = body(&setup);
    let bytes = serde_json::to_vec(&original)?;
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for how in ["family", "version", "instance", "field", "claimed-native"] {
        let mut input = original.clone();
        match how {
            "family" => input["format"] = json!("other"),
            "version" => input["formatVersion"] = json!(2),
            "instance" => input["selection"]["instance"] = json!("0".repeat(64)),
            "field" => input["verified"] = json!(true),
            _ => input["native"] = json!({"outcome":{"kind":"ready","references":[]}}),
        }
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?.status,
            400,
            "{how}"
        );
        assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, calls);
    }
    for req in [
        request(&setup.fixture.owner),
        Request { origin: "https://unselected.example", ..request(&setup.token) },
        Request { principal: "owner", ..request(&setup.token) },
    ] {
        assert_ne!(server.request(&req, &bytes).await?.status, 200);
    }
    setup
        .fixture
        .local()
        .host
        .transaction(|room| {
            test_fixture::publish_version(room, "Only original metadata changes the source")
        })
        .await?;
    assert_ne!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 503);
    server.stop().await?;
    Ok(())
}
