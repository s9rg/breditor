//! Public recovery contract: room identity, original rasters, offline work and selective history.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use breditor_collab_relay::{
    Admission, AtomicTransportProfile, Error, Lease, Role, Room, RoomBackup, RoomRecoveryPolicy,
    assets::{
        AssetRecoveryPolicy, AssetRestore, AssetStore, AssetStoreBackup, asset_id, prepare_asset,
    },
};
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use std::{fs, io::Cursor, path::PathBuf};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        // This test's new nonce-named directory, never user storage.
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn directory() -> Result<Directory> {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let root = std::env::temp_dir()
        .join(format!("breditor-public-asset-backup-{}-{nonce}", std::process::id()));
    fs::create_dir(&root)?;
    Ok(Directory(root))
}
fn raster(format: ImageFormat) -> Result<Vec<u8>> {
    let mut output = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 3).write_to(&mut output, format)?;
    Ok(output.into_inner())
}
fn source(directory: &Directory, image_asset: &str) -> Result<(SharedRichProfile, Room)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,
        "schema":{"name":"example/public-asset-backup","version":1},"extensions":[]})
    .to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let mut tree: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    tree["children"][0]["children"][0]["children"][0]["children"][1]["properties"]["breditor/asset-id"] =
        image_asset.into();
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/public-asset-backup","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree})
    .to_string();
    let mut room = Room::create_atomic_transport_v2(
        &directory.0.join("source.log"),
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    Ok((profile, room))
}
fn flush(room: &mut Room, client: &RichReplica, lease: &Lease, after: &str) -> Result<String> {
    let packet: Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, after)?)?;
    for group in packet["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit("owner", lease, group.as_str().ok_or("group")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(packet["through"].as_str().ok_or("through")?.into())
}

#[test]
fn public_asset_and_room_recovery_retains_original_images_and_future_offline_undo_redo() -> Result {
    let directory = directory()?;
    let png = raster(ImageFormat::Png)?;
    let asset = asset_id(&png);
    let (profile, mut room) = source(&directory, &asset)?;
    let mut assets = AssetStore::open(&directory.0.join("source-assets"), room.asset_binding())?;
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = raster(format)?;
        room.put_asset("owner", &mut assets, prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
    }
    let registration = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Accepted ".into(),
    })])?;
    let through = flush(&mut room, &client, &registration.lease, "0")?;
    // This client's retained journal intentionally extends beyond the accepted server cut.
    client.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Offline ".into(),
    })])?;
    let journal = client.checkpoint()?;
    let log = RoomBackup::from_bytes(&room.export_backup()?.to_bytes())?;
    let selected_room = room.backup_identity()?;
    let archive = assets.export_backup()?;
    let selected_assets = archive.info().identity;
    assert_eq!(selected_assets.binding, selected_room.asset_binding);
    let archive = AssetStoreBackup::from_bytes(&archive.to_bytes()?)?;
    drop(assets);
    drop(room);
    let restore_path = directory.0.join("restored-assets");
    drop(AssetRestore::begin(
        &restore_path,
        &archive,
        &selected_assets,
        AssetRecoveryPolicy::HostReacquired,
    )?);
    let mut assets = AssetRestore::resume(
        &restore_path,
        &archive,
        &selected_assets,
        AssetRecoveryPolicy::HostReacquired,
    )?
    .finish(&archive)?;
    let mut room = Room::restore_backup(
        &directory.0.join("restored.log"),
        &log,
        &selected_room,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(room.read_asset("reader", &assets, &asset)?.ok_or("reader raster")?.bytes, png);
    assert!(matches!(room.read_asset("unknown", &assets, &asset), Err(Error::Permission)));
    let lease = room.resume("owner", &registration.lease.writer, &registration.credential)?;
    let mut client = profile.restore("room", &journal)?;
    let mut through = flush(&mut room, &client, &lease, &through)?;
    for redo in [false, true, false, false, true, true] {
        if redo {
            assert!(client.redo()?);
        } else {
            assert!(client.undo()?);
        }
        through = flush(&mut room, &client, &lease, &through)?;
        let observer = profile.join_frame("room".into(), "900".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), client.document_json());
        assert_eq!(room.read_asset("reader", &assets, &asset)?.ok_or("history raster")?.bytes, png);
        assert_eq!(
            assets.count(),
            3,
            "Unreferenced complete assets remain retained, not garbage collected"
        );
    }
    assert!(
        room.put_asset("owner", &mut assets, prepare_asset(&asset, "image/png", png)?)?.duplicate
    );
    assert_eq!(assets.stored_bytes(), selected_assets.bytes);
    drop(assets);
    let assets = AssetStore::open(&restore_path, room.asset_binding())?;
    assert_eq!(assets.count(), 3);
    Ok(())
}
