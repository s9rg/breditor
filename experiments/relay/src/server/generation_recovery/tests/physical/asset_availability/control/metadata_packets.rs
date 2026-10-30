//! Genuine current-owner HTTP packet reads and refusal without publication.
use super::super::super::super::source::TestResult;
use super::{
    fixture::Setup,
    metadata_receipts::seeded,
    network::{Network, Request},
};
use crate::{
    assets::asset_id,
    room::metadata_receipts::{MetadataPageSelection, test_fixture},
};
use serde_json::{Value, json};

fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/physical/v1/metadata/packet/read", ..Request::check(token) }
}
pub(super) async fn version_body(setup: &Setup) -> TestResult<Value> {
    let fingerprint=setup.fixture.local().host.transaction(|room|{
        let query:MetadataPageSelection=serde_json::from_value(json!({"versions":{"kind":"start"},"suggestions":{"kind":"start"},"revisions":{"kind":"start"}}))?;
        let page=serde_json::to_value(room.recovery_metadata_page("owner",&query)?)?;
        Ok(page["versions"]["packets"][0].clone())
    }).await?;
    Ok(body(setup, "version", &fingerprint))
}
fn body(setup: &Setup, kind: &str, fingerprint: &Value) -> Value {
    json!({"format":"breditor/physical-room-recovery-metadata-packet-request","formatVersion":1,"selection":setup.selection(),"packet":{"kind":kind,"expected":fingerprint}})
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn metadata_packet_all_ten_profiles_exact_original_bodies_and_source_custody() -> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let setup = Box::pin(seeded(profile, atomic, 2)).await?;
            let expected=setup.fixture.local().host.transaction(move|room|{
        let query:MetadataPageSelection=serde_json::from_value(json!({"versions":{"kind":"start"},"suggestions":{"kind":if atomic {"start"}else{"disabled"}},"revisions":{"kind":if atomic {"start"}else{"disabled"}}}))?;
        let page=serde_json::to_value(room.recovery_metadata_page("owner",&query)?)?;
        let mut result=Vec::new();
        for (kind,lane) in [("version","versions"),("suggestion","suggestions"),("revision","revisions")] {
            if let Some(rows)=page[lane]["packets"].as_array(){for row in rows{
                let id=row["id"].as_str().ok_or(crate::Error::NeedsRecovery)?;
                let text=match kind {"version"=>room.document_version_packet("owner",id)?,"suggestion"=>room.document_suggestion_packet("owner",id)?,_=>room.document_suggestion_revision_packet("owner",id)?}.ok_or(crate::Error::NeedsRecovery)?;
                result.push((kind.to_owned(),row.clone(),text));
            }}
        }
        Ok(result)
    }).await?;
            assert_eq!(expected.len(), if atomic { 5 } else { 2 });
            let before = setup
                .fixture
                .host()
                .capture_recovery_state("owner", &setup.fixture.owner)
                .await?
                .identity()?;
            let server = Network::start(setup.router.clone()).await?;
            for (kind, fingerprint, text) in expected {
                let input = serde_json::to_vec(&body(&setup, &kind, &fingerprint))?;
                let result = server.request(&request(&setup.token), &input).await?;
                assert_eq!(result.status, 200);
                let read: Value = serde_json::from_slice(&result.body)?;
                assert_eq!(read["format"], "breditor/physical-room-recovery-metadata-packet-read");
                assert_eq!(
                    read["scope"],
                    "selected-server-original-accepted-metadata-packet-bytes"
                );
                assert_eq!(read["selection"], serde_json::to_value(setup.selection())?);
                assert_eq!(
                    read["requestSha256"],
                    asset_id(&input).strip_prefix("sha256:").ok_or("digest")?
                );
                assert_eq!(
                    read["packet"],
                    json!({"kind":kind,"fingerprint":fingerprint,"text":text})
                );
                for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                    assert!(!std::str::from_utf8(&result.body)?.contains(secret));
                }
            }
            assert_eq!(
                setup
                    .fixture
                    .host()
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
async fn metadata_packet_closed_request_authentication_expected_bytes_and_stale_cut_refuse()
-> TestResult {
    let setup = Box::pin(seeded((3, true), true, 1)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let original = version_body(&setup).await?;
    let bytes = serde_json::to_vec(&original)?;
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for how in [
        "family",
        "version",
        "instance",
        "field",
        "packet-field",
        "fingerprint-field",
        "bad-size",
        "bad-kind",
    ] {
        let mut input = original.clone();
        match how {
            "family" => input["format"] = json!("other"),
            "version" => input["formatVersion"] = json!(2),
            "instance" => input["selection"]["instance"] = json!("0".repeat(64)),
            "field" => input["verified"] = json!(true),
            "packet-field" => input["packet"]["verified"] = json!(true),
            "fingerprint-field" => input["packet"]["expected"]["verified"] = json!(true),
            "bad-size" => input["packet"]["expected"]["bytes"] = json!(0),
            _ => input["packet"]["kind"] = json!("prepare"),
        }
        assert_eq!(
            server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?.status,
            400,
            "{how}"
        );
        assert_eq!(
            setup.mapping.lock().map_err(|_| "mapping")?.calls,
            calls,
            "closed request before provider callbacks"
        );
    }
    for req in [
        request(&setup.fixture.owner),
        Request { origin: "https://unselected.example", ..request(&setup.token) },
        Request { principal: "owner", ..request(&setup.token) },
    ] {
        assert_ne!(server.request(&req, &bytes).await?.status, 200);
    }
    let mut wrong = original.clone();
    wrong["packet"]["expected"]["sha256"] = json!(format!("sha256:{}", "0".repeat(64)));
    assert_eq!(
        server.request(&request(&setup.token), &serde_json::to_vec(&wrong)?).await?.status,
        400
    );
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup
        .fixture
        .local()
        .host
        .transaction(|room| test_fixture::publish_version(room, "Changed only original metadata"))
        .await?;
    assert_ne!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 503);
    server.stop().await?;
    Ok(())
}
