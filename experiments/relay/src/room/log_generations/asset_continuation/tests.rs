//! Count exhaustion, exact local custody and portable backup/reopen with actual native raster files.
use super::{ACTIVE, ARCHIVE, CONTROL, ContinuedAssetStore};
use crate::{
    Error, Role,
    assets::{AssetStore, MAX_ASSETS, PreparedAsset, asset_id, prepare_asset},
    room::log_generations::tests::setup,
};
use std::{
    fs::{self, File},
    io::Cursor,
    path::Path,
};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn image(index: usize) -> TestResult<Vec<u8>> {
    let [red, green, ..] = index.to_le_bytes();
    let pixel = image::Rgba([red, green, 150, 255]);
    let mut file = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(1, 1, pixel))
        .write_to(&mut file, image::ImageFormat::Png)?;
    Ok(file.into_inner())
}

fn prepared(bytes: &[u8]) -> TestResult<PreparedAsset> {
    Ok(prepare_asset(&asset_id(bytes), "image/png", bytes.to_vec())?)
}

fn ancestor(path: &Path) -> TestResult<File> {
    Ok(fs::OpenOptions::new().read(true).write(true).create_new(true).open(path)?)
}

#[test]
fn full_original_raster_archive_continues_with_exact_old_and_new_bytes_across_cold_restore()
-> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let path = files.recovery();
    fs::create_dir(&path)?;
    let mut originals = AssetStore::open(&path.join("original"), room.asset_binding())?;
    let old = image(0)?;
    let new = image(MAX_ASSETS)?;
    for index in 0..MAX_ASSETS {
        room.put_asset("owner", &mut originals, prepared(&image(index)?)?)?;
    }
    assert!(matches!(
        room.put_asset("owner", &mut originals, prepared(&new)?),
        Err(Error::Contract("asset store budget"))
    ));
    let before = room.catchup("owner")?;
    let original_file = path.join("origin.archive");
    let selected = originals.write_backup(&mut ancestor(&original_file)?)?;
    assert_eq!(selected.assets, MAX_ASSETS as u64);
    let continued = path.join("continued");
    let mut store = ContinuedAssetStore::create_from_backup(
        &continued,
        File::open(&original_file)?,
        &selected,
    )?;
    let local = store.identity().clone();
    assert_eq!(store.active_count(), 0);
    assert!(matches!(
        room.put_continued_asset("reader", &mut store, prepared(&new)?),
        Err(Error::Permission)
    ));
    assert_eq!(
        room.read_continued_asset("reader", &store, &asset_id(&old))?.ok_or("old asset")?.bytes,
        old
    );
    assert!(room.put_continued_asset("owner", &mut store, prepared(&old)?)?.duplicate);
    assert_eq!(store.active_count(), 0);
    assert!(!room.put_continued_asset("owner", &mut store, prepared(&new)?)?.duplicate);
    assert_eq!(store.active_count(), 1);
    assert_eq!(room.catchup("owner")?, before);
    drop(store);

    // Simulate a complete active upload whose staging name survived the process exit.
    let stage = continued.join(ACTIVE).join(format!(".pending-{}", crate::credentials::issue()?));
    fs::hard_link(continued.join(ACTIVE).join(format!("{}.asset", &asset_id(&new)[7..])), &stage)?;
    let mut store = ContinuedAssetStore::open(&continued, &local)?;
    assert!(!stage.exists());
    assert!(store.put(prepared(&new)?)?.duplicate);
    assert_eq!(store.get(&asset_id(&new))?.ok_or("new asset")?.bytes, new);
    drop(originals);
    let mut predecessor = ancestor(&path.join("captured-predecessor"))?;
    let mut active = ancestor(&path.join("captured-active"))?;
    let backup = store.write_backup(&mut predecessor, &mut active)?;
    predecessor.sync_all()?;
    active.sync_all()?;
    assert_eq!(backup.predecessor(), &selected);
    assert_eq!(backup.active().assets, 1);
    assert_eq!(fs::read(&original_file)?, fs::read(path.join("captured-predecessor"))?);
    drop(store);
    assert!(AssetStore::open(&continued, room.asset_binding()).is_err());
    assert!(matches!(
        AssetStore::open(&continued.join(ACTIVE), room.asset_binding()),
        Err(Error::Contract("asset store room binding"))
    ));
    fs::rename(&continued, path.join("archived-original-directory"))?;
    let relocated_path = path.join("relocated");
    let relocated = ContinuedAssetStore::restore(&relocated_path, predecessor, active, &backup)?;
    let relocated_selection = relocated.identity().clone();
    assert_ne!(relocated_selection, local);
    assert_eq!(relocated.active_count(), 1);
    drop(relocated);
    assert!(ContinuedAssetStore::open(&relocated_path, &local).is_err());
    let mut relocated = ContinuedAssetStore::open(&relocated_path, &relocated_selection)?;
    for bytes in [&old, &new] {
        assert_eq!(relocated.get(&asset_id(bytes))?.ok_or("relocated asset")?.bytes, *bytes);
        assert!(relocated.put(prepared(bytes)?)?.duplicate);
    }
    let mut left = Vec::new();
    let mut right = Vec::new();
    assert_eq!(relocated.write_backup(&mut left, &mut right)?, backup);
    assert_eq!(left, fs::read(path.join("captured-predecessor"))?);
    assert_eq!(right, fs::read(path.join("captured-active"))?);
    #[cfg(feature = "server")]
    {
        assert!(relocated.matches_backup(&backup)?);
        relocated.put(prepared(&image(MAX_ASSETS + 1)?)?)?;
        assert!(!relocated.matches_backup(&backup)?);
    }
    Ok(())
}

#[test]
fn predecessor_replacement_fences_reads_and_writes_and_bad_pair_preflight_is_absent_only()
-> TestResult {
    let (files, room, _) = setup()?;
    let path = files.recovery();
    fs::create_dir(&path)?;
    let mut originals = AssetStore::open(&path.join("original"), room.asset_binding())?;
    let old = image(0)?;
    let new = image(1)?;
    originals.put(prepared(&old)?)?;
    let original_file = path.join("origin.archive");
    let selected = originals.write_backup(&mut ancestor(&original_file)?)?;
    let continued = path.join("continued");
    let mut store = ContinuedAssetStore::create_from_backup(
        &continued,
        File::open(&original_file)?,
        &selected,
    )?;
    let local = store.identity().clone();
    let mut predecessor = ancestor(&path.join("predecessor"))?;
    let mut active = ancestor(&path.join("active"))?;
    let backup = store.write_backup(&mut predecessor, &mut active)?;
    #[cfg(feature = "server")]
    assert!(store.matches_backup(&backup)?);
    let bad = path.join("bad");
    assert!(
        ContinuedAssetStore::restore(&bad, predecessor, File::open(&original_file)?, &backup)
            .is_err()
    );
    assert!(!bad.exists());
    let parked = path.join("parked");
    fs::rename(continued.join(ARCHIVE), &parked)?;
    fs::copy(&parked, continued.join(ARCHIVE))?;
    #[cfg(feature = "server")]
    assert!(store.matches_backup(&backup).is_err());
    assert!(store.get(&asset_id(&old)).is_err());
    assert!(store.put(prepared(&new)?).is_err());
    assert_eq!(store.active_count(), 0);
    drop(store);
    assert!(ContinuedAssetStore::open(&continued, &local).is_err());
    fs::remove_file(continued.join(ARCHIVE))?;
    fs::rename(parked, continued.join(ARCHIVE))?;
    let store = ContinuedAssetStore::open(&continued, &local)?;
    assert_eq!(store.get(&asset_id(&old))?.ok_or("retained raster")?.bytes, old);
    assert!(store.get(&asset_id(&new))?.is_none());
    drop(store);
    fs::remove_file(continued.join(CONTROL))?;
    assert!(ContinuedAssetStore::open(&continued, &local).is_err());
    Ok(())
}

#[path = "rollover_tests.rs"]
mod rollover_tests;
