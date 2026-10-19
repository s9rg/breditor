//! Actual native components, independent selection and explicit inactive recovery interruptions.
use super::{ServerRoomBackup, ServerRoomRecovery, files, format};
use crate::{
    AtomicTransportProfile, Room, RoomRecoveryPolicy,
    assets::{AssetRecoveryPolicy, AssetRestore, AssetStore, asset_id, prepare_asset},
};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, io::Cursor, path::PathBuf};
mod admission;
mod filesystem;
mod interruptions;
mod roundtrip;
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;
struct Directory(PathBuf);
impl Directory {
    fn new() -> TestResult<Self> {
        let root = std::env::temp_dir()
            .join(format!("breditor-server-recovery-{}", crate::credentials::issue()?));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn raster(format: ImageFormat) -> TestResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
}
fn source(
    directory: &Directory,
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(Room, AssetStore)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/server-recovery","version":1},"extensions":[]}).to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("fixture profile".into()),
    };
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/server-recovery","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let path = directory.path("source.log");
    let room = if atomic {
        Room::create_atomic_transport_v2(
            &path,
            &configuration,
            &document,
            "owner",
            match version {
                1 => AtomicTransportProfile::Original,
                2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
                _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
            },
        )?
    } else {
        match (version, standard) {
            (1, false) => Room::create(&path, &configuration, &document, "owner")?,
            (2, false) => Room::create_structural_v2(&path, &configuration, &document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(&path, &configuration, &document, "owner")?
            }
            (3, false) => Room::create_layout_v3(&path, &configuration, &document, "owner")?,
            _ => Room::create_standard_layout_v3(&path, &configuration, &document, "owner")?,
        }
    };
    let mut assets = AssetStore::open(&directory.path("source-assets"), room.asset_binding())?;
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = raster(format)?;
        assets.put(prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
    }
    Ok((room, assets))
}
fn backup(directory: &Directory) -> TestResult<ServerRoomBackup> {
    let (mut room, mut assets) = source(directory, 3, true, true)?;
    Ok(ServerRoomBackup::capture(&mut room, &mut assets)?)
}
fn begin(directory: &Directory, backup: &ServerRoomBackup) -> TestResult<ServerRoomRecovery> {
    Ok(ServerRoomRecovery::begin(&directory.path("restored"), backup, &backup.identity, POLICY)?)
}
fn resume(directory: &Directory, backup: &ServerRoomBackup) -> TestResult<ServerRoomRecovery> {
    Ok(ServerRoomRecovery::resume(&directory.path("restored"), backup, &backup.identity, POLICY)?)
}
fn snapshot(root: &std::path::Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    let mut result = BTreeMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().into_string().map_err(|_| "filename")?;
        if entry.file_type()?.is_dir() {
            for (child, bytes) in snapshot(&entry.path())? {
                result.insert(format!("{name}/{child}"), bytes);
            }
        } else {
            result.insert(name, fs::read(entry.path())?);
        }
    }
    Ok(result)
}
fn reframed(backup: &ServerRoomBackup, header: &format::Header) -> TestResult<Vec<u8>> {
    Ok(format::frame(
        &serde_json::to_vec(header)?,
        &backup.room.to_bytes(),
        &backup.assets.to_bytes()?,
    )?)
}
