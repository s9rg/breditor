//! Actual three-format bytes, later B origin, original offline work and future selective history.
use super::super::super::super::super::{
    physical::history::continue_history,
    source::{POLICY, TestResult},
};
use super::{Network, Setup, body, query};
use crate::{OperationalLogGenerationServerRoom, assets::asset_id};
use serde_json::json;
use std::io::Cursor;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn all_ten_native_profiles_read_client_bindings_and_unreferenced_upload_bytes_without_mutation()
-> TestResult {
    for (profile, atomic) in [(1, false), (2, false), (2, true), (3, false), (3, true)]
        .into_iter()
        .flat_map(|p| [false, true].map(|a| (p, a)))
    {
        let mut setup = Box::pin(Setup::new(profile, atomic)).await?;
        let png = asset_id(&super::super::super::fixture::raster(image::ImageFormat::Png)?);
        let mut bytes = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(4, 5).write_to(&mut bytes, image::ImageFormat::Png)?;
        let unreferenced = asset_id(&bytes.into_inner());
        setup
            .mapping
            .lock()
            .map_err(|_| "mapping")?
            .pairs
            .insert(("client-only".into(), "binding".into()), png.clone());
        let server = Network::start(setup.router.clone()).await?;
        let request = body(
            &setup,
            json!([{"asset":"client-only","generation":"binding"},{"asset":png,"generation":"offline-binding"}]),
            json!([unreferenced]),
        );
        let response = query(&server, &setup, &request).await?;
        assert_eq!(response.status, 200);
        let value: serde_json::Value = serde_json::from_slice(&response.body)?;
        assert_eq!(value["format"], "breditor/physical-room-recovery-asset-read");
        assert_eq!(value["scope"], "server-and-declared-client-binding-and-upload-bytes");
        assert_eq!(value["selection"], serde_json::to_value(setup.selection())?);
        assert_eq!(
            value["requestSha256"],
            asset_id(&serde_json::to_vec(&request)?).strip_prefix("sha256:").ok_or("digest")?
        );
        assert_eq!(value["missing"], json!([]));
        assert_eq!(value["resolutions"].as_array().ok_or("resolutions")?.len(), 6);
        let assets = value["assets"].as_array().ok_or("actual assets")?;
        assert_eq!(assets.len(), 4);
        assert!(assets.iter().any(|a| a["asset"] == unreferenced));
        for mime in ["image/png", "image/jpeg", "image/webp"] {
            assert!(assets.iter().any(|a| a["mime"] == mime));
        }
        let captured =
            setup.fixture.host().capture_recovery_state("owner", &setup.fixture.owner).await?;
        assert_eq!(captured.identity()?, setup.fixture.expected);
        setup.fixture.stop();
        drop(setup.control.take());
        server.stop().await?;
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
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn missing_mapping_binding_bytes_and_unreferenced_upload_bytes_are_separate_complete_pending_reasons()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let absent = format!("sha256:{}", "0".repeat(64));
    let response=query(&server,&setup,&body(&setup,json!([{"asset":"client-missing","generation":"x"},{"asset":absent,"generation":"offline"}]),json!([absent]))).await?;
    assert_eq!(response.status, 200);
    let value: serde_json::Value = serde_json::from_slice(&response.body)?;
    assert_eq!(
        value["missing"],
        json!([{"kind":"mapping","reference":{"asset":"client-missing","generation":"x"}},{"kind":"bytes","reference":{"asset":absent,"generation":"offline"},"contentAsset":absent},{"kind":"uploadBytes","contentAsset":absent}])
    );
    assert_eq!(value["assets"].as_array().ok_or("assets")?.len(), 3);
    assert_eq!(
        setup
            .fixture
            .host()
            .capture_recovery_state("owner", &setup.fixture.owner)
            .await?
            .identity()?,
        setup.fixture.expected
    );
    server.stop().await?;
    Ok(())
}
