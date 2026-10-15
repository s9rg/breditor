//! Functional immutable raster storage, room authority and restart contracts.
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{
    Error, Role, Room,
    assets::{AssetStore, asset_id, prepare_asset},
};
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use std::{
    fs,
    io::Cursor,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Files(PathBuf);
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir().join(format!(
            "breditor-assets-{}-{nonce}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn raster(format: ImageFormat) -> Result<Vec<u8>> {
    let mut out = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 3).write_to(&mut out, format)?;
    Ok(out.into_inner())
}
fn room(files: &Files, name: &str, owner: &str) -> Result<Room> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/assets","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&config)?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/assets","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok(Room::create(&files.0.join(name), &config, &document, owner)?)
}
#[test]
fn exact_raster_bytes_and_receipts_survive_restart_without_duplicate_budget() -> Result {
    let files = Files::new()?;
    let binding = asset_id(b"test-room");
    let path = files.0.join("assets");
    let mut store = AssetStore::open(&path, &binding)?;
    let mut expected = Vec::new();
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = raster(format)?;
        let asset = asset_id(&bytes);
        let prepared = prepare_asset(&asset, mime, bytes.clone())?;
        assert_eq!((prepared.info().width, prepared.info().height), (2, 3));
        let receipt = store.put(prepared)?;
        assert!(!receipt.duplicate);
        assert_eq!(receipt.info.asset, asset);
        assert_eq!(serde_json::to_value(&receipt)?["format"], "breditor/relay-asset-receipt");
        assert_eq!(store.get(&asset)?.ok_or("missing asset")?.bytes, bytes);
        expected.push((asset, mime, bytes));
    }
    let budget = store.stored_bytes();
    assert_eq!(store.count(), 3);
    assert!(matches!(AssetStore::open(&path, &binding), Err(Error::Locked)));
    drop(store);
    let mut store = AssetStore::open(&path, &binding)?;
    for (asset, mime, bytes) in expected {
        assert_eq!(store.get(&asset)?.ok_or("missing recovered asset")?.bytes, bytes);
        assert!(store.put(prepare_asset(&asset, mime, bytes)?)?.duplicate);
    }
    assert_eq!(store.stored_bytes(), budget);
    assert_eq!(store.count(), 3);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::metadata(&path)?.permissions().mode() & 0o777, 0o700);
        for entry in fs::read_dir(&path)? {
            assert_eq!(entry?.metadata()?.permissions().mode() & 0o777, 0o600);
        }
    }
    Ok(())
}
#[test]
fn admission_checks_hash_mime_geometry_and_real_decode_before_storage() -> Result {
    let bytes = raster(ImageFormat::Png)?;
    let asset = asset_id(&bytes);
    assert!(prepare_asset(&asset, "image/jpeg", bytes.clone()).is_err());
    assert!(prepare_asset(&asset_id(b"other"), "image/png", bytes.clone()).is_err());
    assert!(prepare_asset(&asset.to_uppercase(), "image/png", bytes.clone()).is_err());
    assert!(prepare_asset(&asset, "image/svg+xml", bytes).is_err());
    for invalid in [Vec::new(), b"not an image".to_vec(), raster(ImageFormat::Png)?[..32].to_vec()]
    {
        assert!(prepare_asset(&asset_id(&invalid), "image/png", invalid).is_err());
    }
    Ok(())
}
#[test]
fn room_permission_binding_and_blob_storage_do_not_mutate_document_history() -> Result {
    let files = Files::new()?;
    let mut room = room(&files, "room.log", "owner")?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.grant("owner", "editor", Some(Role::Editor))?;
    let binding = room.asset_binding().to_owned();
    let mut store = AssetStore::open(&files.0.join("assets"), &binding)?;
    let bytes = raster(ImageFormat::Png)?;
    let asset = asset_id(&bytes);
    let before = room.catchup("owner")?;
    let log = fs::read(files.0.join("room.log"))?;
    for principal in ["reader", "unknown"] {
        assert!(matches!(
            room.put_asset(
                principal,
                &mut store,
                prepare_asset(&asset, "image/png", bytes.clone())?
            ),
            Err(Error::Permission)
        ));
    }
    room.put_asset("editor", &mut store, prepare_asset(&asset, "image/png", bytes.clone())?)?;
    assert_eq!(room.read_asset("reader", &store, &asset)?.ok_or("reader asset")?.bytes, bytes);
    assert!(matches!(room.read_asset("unknown", &store, &asset), Err(Error::Permission)));
    assert_eq!(room.catchup("owner")?, before);
    assert_eq!(fs::read(files.0.join("room.log"))?, log);
    let other = self::room(&files, "other.log", "different-owner")?;
    assert_ne!(other.asset_binding(), binding);
    assert!(other.read_asset("different-owner", &store, &asset).is_err());
    room.grant("owner", "reader", None)?;
    assert!(matches!(room.read_asset("reader", &store, &asset), Err(Error::Permission)));
    drop(room);
    let (room, _) = Room::open(&files.0.join("room.log"))?;
    assert_eq!(room.asset_binding(), binding);
    assert_eq!(room.read_asset("owner", &store, &asset)?.ok_or("recovered asset")?.bytes, bytes);
    Ok(())
}
#[test]
fn only_recognized_staging_is_recovered_after_all_complete_files_validate() -> Result {
    let files = Files::new()?;
    let path = files.0.join("assets");
    let binding = asset_id(b"room");
    let mut store = AssetStore::open(&path, &binding)?;
    let bytes = raster(ImageFormat::Png)?;
    let asset = asset_id(&bytes);
    store.put(prepare_asset(&asset, "image/png", bytes.clone())?)?;
    drop(store);
    let staging = path.join(format!(".pending-{}", "a".repeat(64)));
    fs::write(&staging, b"partial unsynced work")?;
    let unknown = path.join("host-notes.txt");
    fs::write(&unknown, b"preserve")?;
    assert!(AssetStore::open(&path, &binding).is_err());
    assert!(staging.exists());
    assert_eq!(fs::read(&unknown)?, b"preserve");
    fs::remove_file(&unknown)?;
    let store = AssetStore::open(&path, &binding)?;
    assert!(!staging.exists());
    assert_eq!(store.get(&asset)?.ok_or("complete asset")?.bytes, bytes);
    drop(store);
    assert!(AssetStore::open(&path, &asset_id(b"wrong room")).is_err());
    Ok(())
}
#[test]
fn complete_corrupt_payload_never_gets_repaired_or_acknowledged() -> Result {
    let files = Files::new()?;
    let path = files.0.join("assets");
    let binding = asset_id(b"room");
    let mut store = AssetStore::open(&path, &binding)?;
    let bytes = raster(ImageFormat::Png)?;
    let asset = asset_id(&bytes);
    store.put(prepare_asset(&asset, "image/png", bytes.clone())?)?;
    let file = path.join(format!("{}.asset", &asset[7..]));
    let mut corrupted = fs::read(&file)?;
    *corrupted.last_mut().ok_or("payload")? ^= 1;
    fs::write(&file, &corrupted)?;
    assert!(store.get(&asset).is_err());
    assert!(store.put(prepare_asset(&asset, "image/png", bytes)?).is_err());
    drop(store);
    assert!(AssetStore::open(&path, &binding).is_err());
    assert_eq!(fs::read(&file)?, corrupted);
    Ok(())
}
