//! Shared public-API fixture; the actual Rust owners and original native grammar are retained.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, actions::InsertText,
};
use breditor_collab_relay::{
    Admission, AtomicTransportProfile, Lease, Role, Room,
    assets::{AssetStore, asset_id, prepare_asset},
};
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use std::{fs, io::Cursor, path::PathBuf};
pub type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
pub struct Directory(pub PathBuf);
impl Directory {
    pub fn new() -> Result<Self> {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        Self::at_stamp(stamp)
    }
    fn at_stamp(stamp: u128) -> Result<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let unique = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "breditor-public-server-recovery-{}-{stamp}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
}
#[test]
fn same_clock_tick_keeps_independent_fixture_directories() -> Result {
    let first = Directory::at_stamp(0)?;
    let second = Directory::at_stamp(0)?;
    assert_ne!(first.0, second.0);
    Ok(())
}
#[test]
fn simultaneous_fixture_reservations_keep_distinct_owners_at_the_same_clock_tick() -> Result {
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(16));
    let threads: Vec<_> = (0..16)
        .map(|_| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                Directory::at_stamp(0).map_err(|error| error.to_string())
            })
        })
        .collect();
    let mut directories = Vec::new();
    for thread in threads {
        directories.push(thread.join().map_err(|_| "fixture reservation panicked")??);
    }
    let distinct: std::collections::BTreeSet<_> =
        directories.iter().map(|directory| &directory.0).collect();
    assert_eq!(distinct.len(), 16);
    Ok(())
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
pub fn raster(format: ImageFormat) -> Result<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
}
pub fn source(directory: &Directory) -> Result<(SharedRichProfile, Room, AssetStore)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/public-server-recovery","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let mut tree: Value = serde_json::from_str(include_str!(
        "../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    tree["children"][0]["children"][0]["children"][0]["children"][1]["properties"]["breditor/asset-id"] =
        asset_id(&raster(ImageFormat::Png)?).into();
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/public-server-recovery","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let mut room = Room::create_atomic_transport_v2(
        &directory.0.join("source.log"),
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let assets = AssetStore::open(&directory.0.join("source-assets"), room.asset_binding())?;
    Ok((profile, room, assets))
}
pub fn fill(room: &Room, assets: &mut AssetStore) -> Result {
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = raster(format)?;
        room.put_asset("owner", assets, prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
    }
    Ok(())
}
pub fn insert(client: &mut RichReplica, block: &str, text: &str) -> Result {
    client.apply(vec![Command::InsertText(InsertText {
        block: block.into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
pub fn flush(
    room: &mut Room,
    client: &RichReplica,
    principal: &str,
    lease: &Lease,
    after: &str,
) -> Result<String> {
    let groups: Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, after)?)?;
    for group in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit(principal, lease, group.as_str().ok_or("group")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("through")?.into())
}
