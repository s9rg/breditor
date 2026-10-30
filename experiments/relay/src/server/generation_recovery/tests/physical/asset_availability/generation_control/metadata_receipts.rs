//! Real HTTP, current native owners, metadata-only changes and original receipt paging.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::{
    assets::asset_id,
    room::metadata_receipts::test_fixture,
    server::{
        ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryCoverage,
        prepare_log_generation_recovery_control,
    },
};
use serde_json::{Value, json};
use std::sync::Arc;

fn body(setup: &Setup, kind: &str) -> Value {
    json!({"format":"breditor/server-log-generation-recovery-metadata-request","formatVersion":1,"selection":setup.selection(),"metadata":{"versions":{"kind":kind},"suggestions":{"kind":kind},"revisions":{"kind":kind}}})
}
fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/generations/v1/metadata/read", ..Request::check(token) }
}

pub(super) async fn seeded(
    profile: (u32, bool),
    atomic: bool,
    versions: usize,
) -> TestResult<Setup> {
    let mut setup = Box::pin(Setup::new(profile, atomic)).await?;
    drop(setup.control.take());
    setup
        .fixture
        .local()
        .host
        .transaction(move |room| test_fixture::seed(room, versions, true))
        .await?;
    let captured =
        setup.fixture.local().capture_recovery_state("owner", &setup.fixture.owner).await?;
    let expected = captured.identity()?;
    let (_, inventory) = captured.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(native) = setup
        .fixture
        .local()
        .verify_selected_recovery_state(
            "owner",
            &setup.fixture.owner,
            expected,
            inventory,
            setup.fixture.credentials(),
        )
        .await?
    else {
        return Err("fresh exact native proof".into());
    };
    let native = Arc::new(native);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = setup
        .fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &setup.fixture.owner,
            native.clone(),
            setup.provider.clone(),
        )
        .await?
    else {
        return Err("fresh actual asset proof".into());
    };
    setup.proof = Arc::new(proof);
    setup.native = native;
    let (router, control) = prepare_log_generation_recovery_control(
        setup.fixture.local().clone(),
        setup.proof.clone(),
        setup.provider.clone(),
        "owner",
        &setup.fixture.owner,
        operators(&setup.token)?,
    )
    .await?;
    setup.router = router;
    setup.control = Some(control);
    Ok(setup)
}

async fn check_original_packets(setup: &Setup, read: &Value, expected: &Value) -> TestResult {
    for lane in ["versions", "suggestions", "revisions"] {
        if expected[lane].is_null() {
            assert_eq!(read["metadata"][lane], json!({"kind":"disabled"}));
            continue;
        }
        assert_eq!(read["metadata"][lane]["kind"], "page");
        assert_eq!(read["metadata"][lane]["catalog"], expected[lane]);
        let fingerprints = read["metadata"][lane]["packets"].as_array().ok_or("packets")?.clone();
        let expected_ids: Vec<_> = match lane {
            "versions" => expected[lane]["entries"]
                .as_array()
                .ok_or("version entries")?
                .iter()
                .map(|row| row["version"]["id"].clone())
                .collect(),
            "suggestions" => expected[lane]["updates"]
                .as_array()
                .ok_or("suggestion updates")?
                .iter()
                .filter(|row| row["kind"] == "published")
                .map(|row| row["data"]["suggestion"]["id"].clone())
                .collect(),
            _ => expected[lane]["revisions"]
                .as_array()
                .ok_or("revision receipts")?
                .iter()
                .map(|row| row["revision"]["id"].clone())
                .collect(),
        };
        assert_eq!(
            fingerprints.iter().map(|row| row["id"].clone()).collect::<Vec<_>>(),
            expected_ids
        );
        let lane = lane.to_owned();
        setup
            .fixture
            .local()
            .host
            .transaction(move |room| {
                for row in fingerprints {
                    let id = row["id"].as_str().ok_or(crate::Error::Contract("packet id"))?;
                    let packet = match lane.as_str() {
                        "versions" => room.document_version_packet("owner", id)?,
                        "suggestions" => room.document_suggestion_packet("owner", id)?,
                        _ => room.document_suggestion_revision_packet("owner", id)?,
                    }
                    .ok_or(crate::Error::NeedsRecovery)?;
                    assert_eq!(row["bytes"], packet.len());
                    assert_eq!(row["sha256"], asset_id(packet.as_bytes()));
                }
                Ok(())
            })
            .await?;
    }

    if !expected["revisions"].is_null() {
        assert_eq!(
            read["metadata"]["suggestions"]["packets"].as_array().ok_or("proposal packets")?.len(),
            2
        );
        assert_eq!(
            read["metadata"]["revisions"]["packets"].as_array().ok_or("revision packets")?.len(),
            1
        );
    }

    Ok(())
}

async fn refuse_skipped_lanes(
    setup: &Setup,
    server: &Network,
    query: &Value,
    read: &Value,
) -> TestResult {
    for lane in ["versions", "suggestions", "revisions"] {
        if read["metadata"][lane]["kind"] == "page" {
            let mut skipped = query.clone();
            skipped["metadata"][lane] = json!({"kind":"disabled"});
            assert_eq!(
                server
                    .request(&request(&setup.token), &serde_json::to_vec(&skipped)?)
                    .await?
                    .status,
                400
            );
        }
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn metadata_receipts_all_ten_profiles_exact_packets_original_receipts_and_frozen_continuations()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let versions = if profile == (3, true) && atomic { 66 } else { 2 };
            let setup = Box::pin(seeded(profile, atomic, versions)).await?;
            let before = setup
                .fixture
                .local()
                .capture_recovery_state("owner", &setup.fixture.owner)
                .await?
                .identity()?;
            let expected=setup.fixture.local().host.transaction(move|room|Ok(json!({"versions":room.document_versions_page("owner",None)?,"suggestions":if atomic {Some(room.document_suggestions_page("owner",None)?)} else {None},"revisions":if atomic {Some(room.document_suggestion_revisions_page("owner",None)?)} else {None}}))).await?;
            let server = Network::start(setup.router.clone()).await?;
            let mut query = body(&setup, "start");
            if !atomic {
                for lane in ["suggestions", "revisions"] {
                    query["metadata"][lane] = json!({"kind":"disabled"});
                }
            }
            let input = serde_json::to_vec(&query)?;
            let response = server.request(&request(&setup.token), &input).await?;
            assert_eq!(response.status, 200);
            let read: Value = serde_json::from_slice(&response.body)?;
            assert_eq!(read["format"], "breditor/server-log-generation-recovery-metadata-read");
            assert_eq!(read["selection"], serde_json::to_value(setup.selection())?);
            assert_eq!(
                read["scope"],
                "selected-server-original-metadata-receipts-and-packet-fingerprints-page"
            );
            assert_eq!(
                read["requestSha256"],
                asset_id(&input).strip_prefix("sha256:").ok_or("digest")?
            );
            check_original_packets(&setup, &read, &expected).await?;
            refuse_skipped_lanes(&setup, &server, &query, &read).await?;
            let mut next = body(&setup, "start");
            for lane in ["versions", "suggestions", "revisions"] {
                if read["metadata"][lane]["kind"] == "disabled" {
                    next["metadata"][lane] = json!({"kind":"disabled"});
                    continue;
                }
                next["metadata"][lane] =
                    json!({"kind":"after","cursor":read["metadata"][lane]["catalog"]["cursor"]});
            }
            let response =
                server.request(&request(&setup.token), &serde_json::to_vec(&next)?).await?;
            assert_eq!(response.status, 200);
            let next: Value = serde_json::from_slice(&response.body)?;
            for lane in ["versions", "suggestions", "revisions"] {
                if next["metadata"][lane]["kind"] == "disabled" {
                    continue;
                }
                assert_eq!(
                    next["metadata"][lane]["catalog"]["cursor"]["through"],
                    read["metadata"][lane]["catalog"]["cursor"]["through"]
                );
                assert_eq!(next["metadata"][lane]["catalog"]["more"], false);
            }
            assert_eq!(
                next["metadata"]["versions"]["packets"].as_array().ok_or("next versions")?.len(),
                if versions == 66 { 2 } else { 0 }
            );
            for lane in ["suggestions", "revisions"] {
                if atomic {
                    assert_eq!(next["metadata"][lane]["packets"], json!([]));
                } else {
                    assert_eq!(next["metadata"][lane], json!({"kind":"disabled"}));
                }
            }
            let text = std::str::from_utf8(&response.body)?;
            for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                assert!(!text.contains(secret));
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
async fn metadata_receipts_closed_explicit_lanes_and_operator_authentication() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let original = body(&setup, "disabled");
    let response = server.request(&request(&setup.token), &serde_json::to_vec(&original)?).await?;
    assert_eq!(response.status, 200);
    let read: Value = serde_json::from_slice(&response.body)?;
    for lane in ["versions", "suggestions", "revisions"] {
        assert_eq!(read["metadata"][lane], json!({"kind":"disabled"}));
    }
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for how in [
        "family",
        "version",
        "instance",
        "field",
        "missing",
        "lane-field",
        "cursor-leading-zero",
        "cursor-overflow",
        "cursor-uppercase",
        "cursor-field",
    ] {
        let mut input = original.clone();
        match how {
            "family" => input["format"] = json!("other"),
            "version" => input["formatVersion"] = json!(2),
            "instance" => input["selection"]["instance"] = json!("0".repeat(64)),
            "field" => input["verified"] = json!(true),
            "missing" => {
                input["metadata"].as_object_mut().ok_or("lanes")?.remove("revisions");
            }
            "lane-field" => input["metadata"]["versions"]["verified"] = json!(true),
            _ => {
                input["metadata"]["versions"] = json!({"kind":"after","cursor":{"binding":"a".repeat(64),"after":"0","through":"0"}});
                match how {
                    "cursor-leading-zero" => {
                        input["metadata"]["versions"]["cursor"]["after"] = json!("00");
                    }
                    "cursor-overflow" => {
                        input["metadata"]["versions"]["cursor"]["through"] =
                            json!("18446744073709551616");
                    }
                    "cursor-uppercase" => {
                        input["metadata"]["versions"]["cursor"]["binding"] = json!("A".repeat(64));
                    }
                    _ => input["metadata"]["versions"]["cursor"]["verified"] = json!(true),
                }
            }
        }
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?.status,
            400,
            "{how}"
        );
        assert_eq!(
            setup.mapping.lock().map_err(|_| "mapping")?.calls,
            calls,
            "{how} before provider work"
        );
    }
    for lane in ["versions", "suggestions", "revisions"] {
        let mut input = original.clone();
        input["metadata"][lane] = json!({"kind":"start"});
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?.status,
            400
        );
    }
    let bytes = serde_json::to_vec(&original)?;
    for req in [
        request(&setup.fixture.owner),
        Request { origin: "https://unselected.example", ..request(&setup.token) },
        Request { principal: "owner", ..request(&setup.token) },
    ] {
        assert_ne!(server.request(&req, &bytes).await?.status, 200);
    }
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 503);
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn metadata_receipts_metadata_only_publication_invalidates_old_selection_with_identical_native_heads()
-> TestResult {
    let setup = Box::pin(seeded((3, true), true, 2)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let bytes = serde_json::to_vec(&body(&setup, "start"))?;
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup
        .fixture
        .local()
        .host
        .transaction(|room| {
            let document = room.catchup("owner")?;
            let review = serde_json::to_value(room.review_catchup("owner", None)?)?;
            test_fixture::publish_version(room, "Later server-only metadata 🙂")?;
            assert_eq!(room.catchup("owner")?, document);
            assert_eq!(serde_json::to_value(room.review_catchup("owner", None)?)?, review);
            Ok(())
        })
        .await?;
    let response = server.request(&request(&setup.token), &bytes).await?;
    assert!([400, 503].contains(&response.status));
    server.stop().await?;
    Ok(())
}
