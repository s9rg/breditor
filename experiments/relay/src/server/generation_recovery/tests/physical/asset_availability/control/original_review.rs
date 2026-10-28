//! Real authenticated historical rights at exact physical/native/provider cuts.
use super::super::super::super::source::TestResult;
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use crate::{ReviewOriginalAuthorizationRange, assets::asset_id};
use breditor_collab_feasibility::review::ReviewPrincipalId;
use serde_json::{Value, json};

pub(super) async fn body(setup: &Setup) -> TestResult<Value> {
    let (_, inventory) = setup
        .fixture
        .host()
        .capture_recovery_state("owner", &setup.fixture.owner)
        .await?
        .into_parts();
    let metadata = inventory.metadata().native;
    let review = metadata.review.as_ref().ok_or("review lane")?;
    let mut ranges = review
        .writers
        .iter()
        .filter(|row| row.clock.through != "0")
        .map(|row| {
            Ok(ReviewOriginalAuthorizationRange {
                actor: row.clock.actor.clone(),
                principal: ReviewPrincipalId::try_new(&row.principal)?,
                from: "1".into(),
                through: row.clock.through.clone(),
            })
        })
        .collect::<TestResult<Vec<_>>>()?;
    ranges.sort_by(|a, b| a.actor.cmp(&b.actor));
    assert!(!ranges.is_empty());
    Ok(
        json!({"format":"breditor/physical-room-review-original-authorizations-request","formatVersion":1,"selection":setup.selection(),"binding":review.binding,"ranges":ranges}),
    )
}
fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/physical/v1/review/authorizations/read", ..Request::check(token) }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_profile_reads_complete_original_rights_without_changing_native_or_provider_bytes()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let setup = Box::pin(Setup::new(profile, atomic)).await?;
            let before =
                setup.fixture.host().capture_recovery_state("owner", &setup.fixture.owner).await?;
            let expected = before.identity()?;
            let (_, inventory) = before.into_parts();
            let metadata = inventory.metadata().native;
            let input = serde_json::to_vec(&body(&setup).await?)?;
            let server = Network::start(setup.router.clone()).await?;
            let response = server.request(&request(&setup.token), &input).await?;
            assert_eq!(response.status, 200);
            let read: Value = serde_json::from_slice(&response.body)?;
            assert_eq!(
                read["format"],
                "breditor/physical-room-review-original-authorizations-read"
            );
            assert_eq!(read["selection"], serde_json::to_value(setup.selection())?);
            assert_eq!(
                read["requestSha256"],
                asset_id(&input).strip_prefix("sha256:").ok_or("digest")?
            );
            assert_eq!(read["scope"], "selected-server-original-review-acceptance");
            let rights = &read["authorizations"];
            assert_eq!(rights["kind"], "covered");
            assert_eq!(rights["pending"], json!([]));
            for row in metadata
                .review
                .as_ref()
                .ok_or("review")?
                .writers
                .iter()
                .filter(|row| row.clock.through != "0")
            {
                let windows = rights["windows"]
                    .as_array()
                    .ok_or("windows")?
                    .iter()
                    .filter(|w| w["source"]["actor"] == row.clock.actor.as_str())
                    .collect::<Vec<_>>();
                assert_eq!(windows.first().ok_or("first")?["from"], "1");
                let last = windows.last().ok_or("last")?;
                assert_eq!(last["source"]["principal"], row.principal);
                assert_eq!(last["through"], row.clock.through);
                assert_eq!(last["prefixDigest"], row.clock.prefix_digest);
            }
            let text = std::str::from_utf8(&response.body)?;
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!text.contains(secret));
            }
            assert_eq!(
                setup
                    .fixture
                    .host()
                    .capture_recovery_state("owner", &setup.fixture.owner)
                    .await?
                    .identity()?,
                expected
            );
            server.stop().await?;
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn malformed_or_foreign_requests_refuse_before_any_provider_callback() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let original = body(&setup).await?;
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    let server = Network::start(setup.router.clone()).await?;
    for how in [
        "family",
        "version",
        "field",
        "instance",
        "zero",
        "leading-zero",
        "overflow",
        "number",
        "overlap",
        "missing-ranges",
        "unknown-range-field",
        "range-role",
        "bad-binding",
    ] {
        let mut value = original.clone();
        match how {
            "family" => value["format"] = json!("other"),
            "version" => value["formatVersion"] = json!(2),
            "field" => value["verified"] = json!(true),
            "instance" => value["selection"]["instance"] = json!("0".repeat(64)),
            "zero" => value["ranges"][0]["from"] = json!("0"),
            "leading-zero" => value["ranges"][0]["from"] = json!("01"),
            "overflow" => value["ranges"][0]["through"] = json!("18446744073709551616"),
            "number" => value["ranges"][0]["from"] = json!(1),
            "overlap" => {
                let row = value["ranges"][0].clone();
                value["ranges"].as_array_mut().ok_or("ranges")?.insert(0, row);
            }
            "missing-ranges" => {
                value.as_object_mut().ok_or("request")?.remove("ranges");
            }
            "unknown-range-field" => value["ranges"][0]["verified"] = json!(true),
            "range-role" => value["ranges"][0]["role"] = json!("moderator"),
            _ => value["binding"] = json!("A".repeat(64)),
        }
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&value)?).await?.status,
            400,
            "{how}"
        );
    }
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, calls);
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn rights_stay_pending_for_offline_suffixes_and_require_current_operator_origin_provider_and_control()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let mut input = body(&setup).await?;
    input["ranges"][0]["through"] = json!("18446744073709551615");
    let server = Network::start(setup.router.clone()).await?;
    let mut empty = input.clone();
    empty["ranges"] = json!([]);
    let result = server.request(&request(&setup.token), &serde_json::to_vec(&empty)?).await?;
    assert_eq!(result.status, 200);
    let result: Value = serde_json::from_slice(&result.body)?;
    assert_eq!(result["authorizations"]["kind"], "covered");
    assert_eq!(result["authorizations"]["windows"], json!([]));
    let bytes = serde_json::to_vec(&input)?;
    let response = server.request(&request(&setup.token), &bytes).await?;
    assert_eq!(response.status, 200);
    let read: Value = serde_json::from_slice(&response.body)?;
    assert_eq!(read["authorizations"]["kind"], "pending");
    assert_eq!(read["authorizations"]["windows"], json!([]));
    assert_eq!(read["authorizations"]["pending"][0]["reason"], "unaccepted");
    let mut native = request(&setup.fixture.owner);
    native.principal = "owner";
    assert_eq!(server.request(&native, &bytes).await?.status, 403);
    let mut origin = request(&setup.token);
    origin.origin = "http://localhost:4187";
    assert_eq!(server.request(&origin, &bytes).await?.status, 403);
    setup.mapping.lock().map_err(|_| "mapping")?.epoch += 1;
    assert_ne!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 503);
    server.stop().await?;
    Ok(())
}
