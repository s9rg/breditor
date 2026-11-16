//! Reproduce saturation of both stores and verify repeated rollover using original archive bytes.
use super::{
    ContinuedAssetStore, Error, File, MAX_ASSETS, TestResult, ancestor, asset_id, fs, image,
    prepared, setup,
};
use std::io::Write;

#[test]
fn two_full_raster_generations_roll_forward_and_reopen_twice() -> TestResult {
    let (files, room, _) = setup()?;
    let directory = files.recovery();
    fs::create_dir(&directory)?;
    let mut root =
        crate::assets::AssetStore::open(&directory.join("original"), room.asset_binding())?;
    for i in 0..MAX_ASSETS {
        root.put(prepared(&image(i)?)?)?;
    }
    let root_path = directory.join("root.archive");
    let genesis = root.write_backup(&mut ancestor(&root_path)?)?;
    drop(root);
    let mut source = ContinuedAssetStore::create_from_backup(
        &directory.join("source"),
        File::open(&root_path)?,
        &genesis,
    )?;
    for i in MAX_ASSETS..2 * MAX_ASSETS {
        source.put(prepared(&image(i)?)?)?;
    }
    let new = image(2 * MAX_ASSETS)?;
    assert!(matches!(source.put(prepared(&new)?), Err(Error::Contract("asset store budget"))));
    let previous_path = directory.join("first-retained");
    let full_path = directory.join("first-active");
    let selected =
        source.write_backup(&mut ancestor(&previous_path)?, &mut ancestor(&full_path)?)?;
    assert_eq!(selected.predecessor().assets, MAX_ASSETS as u64);
    assert_eq!(selected.active().assets, MAX_ASSETS as u64);
    assert_eq!(fs::read(&previous_path)?, fs::read(&root_path)?);

    let full = directory.join("ordinary-restore");
    let mut restored = ContinuedAssetStore::restore(
        &full,
        File::open(&previous_path)?,
        File::open(&full_path)?,
        &selected,
    )?;
    assert!(matches!(restored.put(prepared(&new)?), Err(Error::Contract("asset store budget"))));
    drop(restored);

    let next = directory.join("rolled");
    let mut target = ContinuedAssetStore::rollover_from_backup(
        &next,
        File::open(&previous_path)?,
        File::open(&full_path)?,
        &selected,
    )?;
    assert_eq!(target.binding(), room.asset_binding());
    assert_eq!(target.active_count(), 0);
    let old = image(MAX_ASSETS - 1)?;
    let middle = image(2 * MAX_ASSETS - 1)?;
    for bytes in [&old, &middle] {
        let id = asset_id(bytes);
        assert_eq!(target.get(&id)?.ok_or("retained image")?.bytes, *bytes);
        assert!(target.put(prepared(bytes)?)?.duplicate);
    }
    assert!(!target.put(prepared(&new)?)?.duplicate);
    let local = target.identity().clone();
    drop(target);

    let target = ContinuedAssetStore::open(&next, &local)?;
    let packed_path = directory.join("next-retained");
    let active_path = directory.join("next-active");
    let recaptured =
        target.write_backup(&mut ancestor(&packed_path)?, &mut ancestor(&active_path)?)?;
    assert_eq!(recaptured.active().assets, 1);
    assert_eq!(recaptured.predecessor(), &genesis);
    assert_eq!(
        fs::read(&packed_path)?,
        [fs::read(&previous_path)?, fs::read(&full_path)?].concat()
    );
    drop(target);
    assert_eq!(source.active_count(), MAX_ASSETS);
    assert!(!source.get(&asset_id(&new))?.is_some());

    let invalid = directory.join("packed-with-extra-byte");
    let mut changed = ancestor(&invalid)?;
    changed.write_all(&fs::read(&packed_path)?)?;
    changed.write_all(&[0])?;
    changed.sync_all()?;
    let rejected = directory.join("must-stay-absent");
    assert!(
        ContinuedAssetStore::rollover_from_backup(
            &rejected,
            changed,
            File::open(&active_path)?,
            &recaptured,
        )
        .is_err()
    );
    assert!(!rejected.exists());

    let relocated = directory.join("rolled-again");
    let twice = ContinuedAssetStore::rollover_from_backup(
        &relocated,
        File::open(&packed_path)?,
        File::open(&active_path)?,
        &recaptured,
    )?;
    let second_pin = twice.identity().clone();
    drop(twice);
    let mut twice = ContinuedAssetStore::open(&relocated, &second_pin)?;
    for bytes in [&old, &middle, &new] {
        assert_eq!(twice.get(&asset_id(bytes))?.ok_or("recaptured image")?.bytes, *bytes);
        assert!(twice.put(prepared(bytes)?)?.duplicate);
    }
    assert_eq!(twice.active_count(), 0);
    let final_bytes = image(2 * MAX_ASSETS + 1)?;
    assert!(!twice.put(prepared(&final_bytes)?)?.duplicate);
    assert_eq!(
        twice.get(&asset_id(&final_bytes))?.ok_or("fourth-generation image")?.bytes,
        final_bytes
    );
    Ok(())
}
