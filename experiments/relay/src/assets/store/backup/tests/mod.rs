//! Real encoded rasters, exact original files, refused collisions and interrupted owned copies.
use super::{
    ArchivedAsset, AssetRecoveryPolicy, AssetRestore, AssetStore, AssetStoreBackup, format,
    restore_files,
};
use crate::assets::{AssetInfo, asset_id, prepare_asset};
use image::{DynamicImage, ImageFormat};
use std::{collections::BTreeMap, fs, io::Cursor, path::PathBuf};
mod admission;
mod filesystem;
mod resumable;
mod roundtrip;
mod source;

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: AssetRecoveryPolicy = AssetRecoveryPolicy::HostReacquired;
struct Directory(PathBuf);
impl Directory {
    fn new() -> TestResult<Self> {
        let root = std::env::temp_dir()
            .join(format!("breditor-server-asset-backup-{}", crate::credentials::issue()?));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        // Only the nonce-named directory created by this test; never an adopted destination.
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn raster(format: ImageFormat, width: u32, height: u32) -> TestResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(width, height).write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
}
fn source(directory: &Directory) -> TestResult<AssetStore> {
    let mut store = AssetStore::open(&directory.path("source"), &asset_id(b"selected-room"))?;
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = raster(format, 2, 3)?;
        store.put(prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
    }
    Ok(store)
}
fn snapshot(root: &std::path::Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    fs::read_dir(root)?
        .map(|entry| {
            let entry = entry?;
            Ok((entry.file_name().into_string().map_err(|_| "filename")?, fs::read(entry.path())?))
        })
        .collect()
}
fn begin(directory: &Directory, backup: &AssetStoreBackup) -> TestResult<AssetRestore> {
    Ok(AssetRestore::begin(&directory.path("restore"), backup, &backup.info().identity, POLICY)?)
}
fn resume(directory: &Directory, backup: &AssetStoreBackup) -> TestResult<AssetRestore> {
    Ok(AssetRestore::resume(&directory.path("restore"), backup, &backup.info().identity, POLICY)?)
}
fn record_name(asset: &ArchivedAsset) -> String {
    format!("{}.asset", &asset.info.asset[7..])
}
fn original_record(info: &AssetInfo, bytes: &[u8], pretty: bool) -> TestResult<Vec<u8>> {
    let metadata =
        if pretty { serde_json::to_vec_pretty(info)? } else { serde_json::to_vec(info)? };
    let mut encoded = b"BRASSET1".to_vec();
    encoded.extend_from_slice(&u32::try_from(metadata.len())?.to_be_bytes());
    encoded.extend_from_slice(&format::sha(&metadata));
    encoded.extend_from_slice(&metadata);
    encoded.extend_from_slice(bytes);
    Ok(encoded)
}
fn frame(header: &[u8], body: &[u8]) -> TestResult<Vec<u8>> {
    let mut encoded = format::prefix(header)?;
    encoded.extend_from_slice(header);
    encoded.extend_from_slice(body);
    Ok(encoded)
}
fn body(backup: &AssetStoreBackup) -> Vec<u8> {
    let mut bytes = backup.manifest.clone();
    for record in &backup.records {
        bytes.extend_from_slice(&record.encoded);
    }
    bytes
}
// Recompute every envelope checksum/range after deliberately changing original record bytes.
// Native admission must reject invalid image meaning, not merely stale outer hashes.
fn reframed(backup: &AssetStoreBackup) -> TestResult<Vec<u8>> {
    let mut header = backup.header.clone();
    header.manifest.bytes = backup.manifest.len() as u64;
    header.manifest.sha256 = format::sha(&backup.manifest);
    let mut offset = header.manifest.bytes;
    header.bytes = 0;
    for (entry, record) in header.records.iter_mut().zip(&backup.records) {
        entry.info = record.info.clone();
        entry.record = format::Section {
            bytes: record.encoded.len() as u64,
            offset,
            sha256: format::sha(&record.encoded),
        };
        offset += entry.record.bytes;
        header.bytes += entry.info.bytes;
    }
    frame(&serde_json::to_vec(&header)?, &body(backup))
}
