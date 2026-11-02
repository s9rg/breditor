//! Actual inactive-host raster reads: exact bytes, no service activation or native mutation.
use super::super::super::super::source::TestResult;
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use crate::assets::asset_id;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

fn request(token: &str) -> Request<'_> {
    Request { path: "/recovery/generations/v1/assets/bytes/read", ..Request::check(token) }
}
fn body(setup: &Setup, asset: &str) -> Value {
    json!({"format":"breditor/server-log-generation-recovery-raster-request","formatVersion":1,"selection":setup.selection(),"asset":asset})
}
fn png() -> TestResult<Vec<u8>> {
    super::super::fixture::raster(image::ImageFormat::Png)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recovery_raster_bytes_all_history_policies_and_formats_without_serving_or_writes()
-> TestResult {
    for document in [false, true] {
        for review in [false, true] {
            let setup = Box::pin(Setup::with_histories((3, true), true, document, review)).await?;
            let before = setup
                .fixture
                .local()
                .capture_recovery_state("owner", &setup.fixture.owner)
                .await?
                .identity()?;
            let server = Network::start(setup.router.clone()).await?;
            for (format, mime) in [
                (image::ImageFormat::Png, "image/png"),
                (image::ImageFormat::Jpeg, "image/jpeg"),
                (image::ImageFormat::WebP, "image/webp"),
            ] {
                let bytes = super::super::fixture::raster(format)?;
                let asset = asset_id(&bytes);
                let input = serde_json::to_vec(&body(&setup, &asset))?;
                let response = server.request(&request(&setup.token), &input).await?;
                assert_eq!(response.status, 200);
                let value: Value = serde_json::from_slice(&response.body)?;
                assert_eq!(value["format"], "breditor/server-log-generation-recovery-raster-read");
                assert_eq!(value["formatVersion"], 1);
                assert_eq!(value["scope"], "selected-server-stored-raster-bytes");
                assert_eq!(value["selection"], serde_json::to_value(setup.selection())?);
                assert_eq!(
                    value["requestSha256"],
                    asset_id(&input).strip_prefix("sha256:").ok_or("digest")?
                );
                assert_eq!(
                    value["raster"]["info"],
                    json!({"asset":asset,"mime":mime,"bytes":bytes.len(),"width":2,"height":3})
                );
                assert_eq!(
                    STANDARD.decode(value["raster"]["base64"].as_str().ok_or("base64")?)?,
                    bytes
                );
                for secret in [&setup.token, &setup.fixture.owner, &setup.fixture.reader] {
                    assert!(!std::str::from_utf8(&response.body)?.contains(secret));
                }
                let normal =
                    Request { method: "GET", path: "/assets/anything", ..request(&setup.token) };
                assert_eq!(server.request(&normal, &[]).await?.status, 404);
            }
            let missing = server
                .request(
                    &request(&setup.token),
                    &serde_json::to_vec(&body(&setup, &format!("sha256:{}", "0".repeat(64))))?,
                )
                .await?;
            assert_eq!(missing.status, 200);
            assert_eq!(serde_json::from_slice::<Value>(&missing.body)?["raster"], Value::Null);
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
async fn recovery_raster_bytes_closed_request_operator_and_source_selection_before_reads()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let original = body(&setup, &asset_id(&png()?));
    let bytes = serde_json::to_vec(&original)?;
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for how in ["family", "version", "instance", "field", "asset", "asset-type", "oversize"] {
        let mut input = original.clone();
        match how {
            "family" => input["format"] = json!("other"),
            "version" => input["formatVersion"] = json!(2),
            "instance" => input["selection"]["instance"] = json!("0".repeat(64)),
            "field" => input["activate"] = json!(true),
            "asset" => input["asset"] = json!("opaque-provider-mapping"),
            "asset-type" => input["asset"] = json!({"url":"https://unselected.invalid"}),
            _ => input["asset"] = json!("x".repeat(65536)),
        }
        let result = server.request(&request(&setup.token), &serde_json::to_vec(&input)?).await?;
        assert!(matches!(result.status, 400 | 413), "{how}: {}", result.status);
        assert_eq!(
            setup.mapping.lock().map_err(|_| "mapping")?.calls,
            calls,
            "malformed input before native/provider reads"
        );
    }
    for selected in [
        request(&setup.fixture.owner),
        Request { principal: "owner", ..request(&setup.token) },
        Request { origin: "https://unselected.invalid", ..request(&setup.token) },
    ] {
        assert_ne!(server.request(&selected, &bytes).await?.status, 200);
    }
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup
        .fixture
        .local()
        .host
        .transaction(|room| room.rotate_log_generation("owner", "raster-new-cut").map(|_| ()))
        .await?;
    assert_ne!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recovery_raster_bytes_provider_loss_and_closed_owner_never_publish_old_bytes() -> TestResult
{
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let bytes = serde_json::to_vec(&body(&setup, &asset_id(&png()?)))?;
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.mapping.lock().map_err(|_| "mapping")?.allowed = false;
    assert_ne!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.mapping.lock().map_err(|_| "mapping")?.allowed = true;
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 200);
    setup.control.as_ref().ok_or("control")?.close();
    assert_eq!(server.request(&request(&setup.token), &bytes).await?.status, 503);
    server.stop().await?;
    Ok(())
}
