//! Actual accepted native payloads, ordered review continuations and unchanged
//! original source custody. No endpoint exposes an editing router or activation.
use super::super::super::super::source::{POLICY, TestResult};
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use crate::OperationalLogGenerationServerRoom;
use crate::assets::asset_id;
use breditor_collab_feasibility::review::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId,
};
use serde_json::{Value, json};

fn body(setup: &Setup, document: &str, review: Value) -> Value {
    let mut value = json!({"format":"breditor/server-log-generation-recovery-accepted-native-request",
        "formatVersion":1,"selection":setup.selection(),"document":document});
    value["review"] = review;
    value
}
fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/generations/v1/accepted/read", ..Request::check(token) }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_profiles_transfer_only_accepted_native_authors_and_original_review_sources()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let setup = Box::pin(Setup::new(profile, atomic)).await?;
            let before =
                setup.fixture.local().capture_recovery_state("owner", &setup.fixture.owner).await?;
            let expected = before.identity()?;
            let (_, inventory) = before.into_parts();
            let metadata = inventory.metadata().native;
            let server = Network::start(setup.router.clone()).await?;
            let input = serde_json::to_vec(&body(&setup, "include", json!({"kind":"start"})))?;
            let response = server.request(&request(&setup.token), &input).await?;
            assert_eq!(response.status, 200);
            let text = std::str::from_utf8(&response.body)?;
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!text.contains(secret));
            }
            let read: Value = serde_json::from_slice(&response.body)?;
            assert_eq!(
                read["format"],
                "breditor/server-log-generation-recovery-accepted-native-read"
            );
            assert_eq!(read["scope"], "selected-server-accepted-native-page");
            assert_eq!(read["selection"], serde_json::to_value(setup.selection())?);
            assert_eq!(
                read["requestSha256"],
                asset_id(&input).strip_prefix("sha256:").ok_or("digest")?
            );
            let document = setup.fixture.source.source.profile.join_frame(
                "room".into(),
                "900".into(),
                read["documentFrame"].as_str().ok_or("native frame")?,
            )?;
            for author in metadata
                .writers
                .iter()
                .map(|row| &row.clock)
                .chain(metadata.server_authors.iter().map(|row| &row.clock))
            {
                let clock = if atomic {
                    document.writer_clock_v2(&author.writer)?
                } else {
                    document.writer_clock(&author.writer)?
                };
                assert_eq!(serde_json::to_value(clock)?, serde_json::to_value(author)?);
            }
            let mut review = document.create_review_session(ReviewActorPolicy {
                actor: ReviewActorId::try_new("accepted.native.reader")?,
                principal: ReviewPrincipalId::try_new("owner")?,
                access: ReviewAccess::ReadOnly,
            })?;
            let page = &read["review"];
            assert_eq!(page["more"], false);
            for raw in page["batches"].as_array().ok_or("ordered review")? {
                let source: crate::ReviewSource = serde_json::from_value(raw["source"].clone())?;
                let frame = raw["frame"].as_str().ok_or("review frame")?;
                review.receive_authorized(&review.observe(), &source.policy(), frame)?;
            }
            for author in &metadata.review.as_ref().ok_or("native review")?.writers {
                assert_eq!(
                    serde_json::to_value(review.writer_clock(
                        &author.clock.actor,
                        &ReviewPrincipalId::try_new(&author.principal)?
                    )?)?,
                    serde_json::to_value(&author.clock)?
                );
            }
            let next = body(&setup, "omit", json!({"kind":"after","cursor":page["cursor"]}));
            let response =
                server.request(&request(&setup.token), &serde_json::to_vec(&next)?).await?;
            assert_eq!(response.status, 200);
            let next: Value = serde_json::from_slice(&response.body)?;
            assert_eq!(next["documentFrame"], Value::Null);
            assert_eq!(next["review"]["cursor"], page["cursor"]);
            assert_eq!(next["review"]["batches"], json!([]));
            assert_eq!(
                setup
                    .fixture
                    .local()
                    .capture_recovery_state("owner", &setup.fixture.owner)
                    .await?
                    .identity()?,
                expected
            );
            let text = std::str::from_utf8(&response.body)?;
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!text.contains(secret));
            }
            server.stop().await?;
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn closed_request_and_foreign_cut_refuse_without_provider_work() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let original = body(&setup, "include", json!({"kind":"start"}));
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for how in [
        "family",
        "version",
        "field",
        "instance",
        "document",
        "review-kind",
        "review-field",
        "cursor-field",
        "cursor-leading-zero",
        "cursor-overflow",
        "cursor-uppercase",
        "missing-review",
    ] {
        let mut input = original.clone();
        match how {
            "family" => input["format"] = json!("other"),
            "version" => input["formatVersion"] = json!(2),
            "field" => input["verified"] = json!(true),
            "instance" => input["selection"]["instance"] = json!("0".repeat(64)),
            "document" => input["document"] = json!("default"),
            "review-kind" => input["review"] = json!({"kind":"skip"}),
            "review-field" => input["review"]["verified"] = json!(true),
            "cursor-field" => {
                input["review"] = json!({"kind":"after","cursor":{"binding":"0".repeat(64),"after":"0","verified":true}});
            }
            "cursor-leading-zero" => {
                input["review"] =
                    json!({"kind":"after","cursor":{"binding":"0".repeat(64),"after":"01"}});
            }
            "cursor-overflow" => {
                input["review"] = json!({"kind":"after","cursor":{"binding":"0".repeat(64),"after":"18446744073709551616"}});
            }
            "cursor-uppercase" => {
                input["review"] =
                    json!({"kind":"after","cursor":{"binding":"A".repeat(64),"after":"0"}});
            }
            _ => {
                input.as_object_mut().ok_or("request")?.remove("review");
            }
        }
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?.status,
            400,
            "{how}"
        );
    }
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, calls);
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_enabled_review_lane_cannot_be_silently_omitted_and_foreign_cursors_refuse() -> TestResult
{
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    for review in [
        json!({"kind":"absent"}),
        json!({"kind":"after","cursor":{"binding":"0".repeat(64),"after":"0"}}),
    ] {
        assert_eq!(
            server
                .request(
                    &request(&setup.token),
                    &serde_json::to_vec(&body(&setup, "include", review))?
                )
                .await?
                .status,
            400
        );
    }
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_editor_tokens_wrong_origin_and_changed_provider_or_control_cannot_transfer()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let input = serde_json::to_vec(&body(&setup, "include", json!({"kind":"start"})))?;
    let mut native = request(&setup.fixture.owner);
    native.principal = "owner";
    assert_eq!(server.request(&native, &input).await?.status, 403);
    let mut origin = request(&setup.token);
    origin.origin = "http://localhost:4187";
    assert_eq!(server.request(&origin, &input).await?.status, 403);
    setup.mapping.lock().map_err(|_| "mapping")?.epoch += 1;
    assert_ne!(server.request(&request(&setup.token), &input).await?.status, 200);
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &input).await?.status, 503);
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn admitted_body_wait_does_not_retain_native_ownership_after_controller_closes() -> TestResult
{
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let pending = server.unfinished_request(&request(&setup.token)).await?;
    setup.fixture.stop();
    drop(setup.control.take());
    // Reacquire the actual native operation before this body finishes, not
    // merely observe that the old HTTP route now refuses a response.
    let resumed = OperationalLogGenerationServerRoom::resume(
        &setup.fixture.destination,
        &setup.fixture.source.local,
        &setup.fixture.source.local.info()?.identity,
        POLICY,
        "owner",
    );
    assert_eq!(Network::finish_unfinished(pending).await?.status, 503);
    server.stop().await?;
    assert!(resumed.is_ok(), "Incomplete accepted-read body retained native custody");
    drop(resumed?);
    Ok(())
}
