//! Live HTTP, current-epoch refusal and exact backup for a continuation above the old count ceiling.
use super::router_with_continued_assets_and_deployment_lease;
#[path = "activation_tests.rs"]
mod activation_tests;
#[path = "restore_tests.rs"]
mod restore_tests;
use crate::{
    ContinuedAssetStore, Error, RelaySegmentBaseFile, Room,
    assets::{AssetStore, MAX_ASSETS, asset_id, prepare_asset},
    room::segment_handover_test_source,
    server::{Authentication, RoomDeploymentAuthority, deployment_fence::TestNetwork},
};
use serde_json::{Value, json};
use std::{fs::File, io::Cursor};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn image(index: usize) -> TestResult<Vec<u8>> {
    let [red, green, ..] = index.to_le_bytes();
    let mut file = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
        1,
        1,
        image::Rgba([red, green, 120, 255]),
    ))
    .write_to(&mut file, image::ImageFormat::Png)?;
    Ok(file.into_inner())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn full_predecessor_serves_http_through_replacement_and_captures_both_generations()
-> TestResult {
    let (files, room, _) = segment_handover_test_source(3, true, true)?;
    let source = files.room();
    let parent = source.parent().ok_or("fixture parent")?;
    let mut full = AssetStore::open(&parent.join("full-rasters"), room.asset_binding())?;
    for i in 0..MAX_ASSETS {
        let bytes = image(i)?;
        full.put(prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?;
    }
    let snapshot = parent.join("full.archive");
    let expected = full.write_backup(&mut File::create_new(&snapshot)?)?;
    drop(full);
    assert_eq!(expected.assets, MAX_ASSETS as u64);
    let path = parent.join("continued");
    let assets = ContinuedAssetStore::create_from_backup(&path, File::open(snapshot)?, &expected)?;
    let selection = assets.identity().clone();
    let before = room.catchup("owner")?;
    let authority =
        RoomDeploymentAuthority::create(&parent.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, hash) = Authentication::issue_token()?;
    let authentication = || {
        Authentication::from_json(&json!({
        "format": "breditor/relay-auth", "formatVersion": 1, "origins": ["http://127.0.0.1:4187"],
        "accounts": [{"principal": "owner", "tokenHash": hash}],
    }).to_string())
    };
    let (router, handle) = router_with_continued_assets_and_deployment_lease(
        room,
        authentication()?,
        assets,
        lease.clone(),
    )?;
    let network = TestNetwork::start(router).await?;
    let inherited = image(0)?;
    let new = image(MAX_ASSETS)?;
    let late = image(MAX_ASSETS + 1)?;
    let route = |bytes: &[u8]| format!("/assets/{}", asset_id(bytes));
    assert_eq!(
        network.http("GET", &route(&inherited), &token, &[]).await?,
        (200, inherited.clone())
    );
    assert_eq!(network.http("GET", &route(&inherited), "invalid-account-token", &[]).await?.0, 403);
    for (bytes, duplicate) in [(&inherited, true), (&new, false), (&new, true)] {
        let (status, body) = network.http("PUT", &route(bytes), &token, bytes).await?;
        assert_eq!(status, 200);
        let receipt: Value = serde_json::from_slice(&body)?;
        assert_eq!(receipt["format"], "breditor/relay-asset-receipt");
        assert_eq!(receipt["asset"], asset_id(bytes));
        assert_eq!(receipt["duplicate"], duplicate);
    }

    let denied = parent.join("denied-capture");
    assert!(matches!(handle.capture("owner", "invalid", &denied), Err(Error::Permission)));
    assert!(!denied.exists());
    let captured = parent.join("capture");
    let backup = handle.capture("owner", &token, &captured)?;
    assert_eq!(backup.source_epoch, lease.selection());
    assert_eq!(backup.rasters.predecessor(), &expected);
    assert_eq!(backup.rasters.active().assets, 1);
    let native = RelaySegmentBaseFile::open(
        File::open(captured.join("native.archive"))?,
        File::open(captured.join("native.checkpoint"))?,
        &backup.native,
    )?;
    assert_eq!(native.identity(), &backup.native);
    restore_tests::check_combined_restore(parent, &captured, &backup, &before, [&inherited, &new])?;
    assert_eq!(authority.current_selection()?, lease.selection());

    let in_flight = network.admitted_upload(&route(&late), &token, late.len()).await?;
    let next = authority.claim(&lease.selection())?;
    assert_eq!(TestNetwork::finish_upload(in_flight, &late).await?.0, 403);
    assert_eq!(network.http("GET", &route(&inherited), &token, &[]).await?.0, 403);
    assert!(matches!(handle.capture("owner", &token, &denied), Err(Error::Lease)));
    assert!(!denied.exists());
    network.stop().await?;
    drop(handle);

    let (room, _) = Room::open_log_generations(&source)?;
    assert_eq!(room.catchup("owner")?, before);
    let assets = ContinuedAssetStore::open(&path, &selection)?;
    let (router, _) =
        router_with_continued_assets_and_deployment_lease(room, authentication()?, assets, next)?;
    let network = TestNetwork::start(router).await?;
    assert_eq!(network.http("GET", &route(&inherited), &token, &[]).await?, (200, inherited));
    assert_eq!(network.http("GET", &route(&new), &token, &[]).await?, (200, new));
    assert_eq!(network.http("GET", &route(&late), &token, &[]).await?.0, 404);
    network.stop().await?;
    Ok(())
}
