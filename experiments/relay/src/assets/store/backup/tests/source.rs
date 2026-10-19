use super::*;

#[test]
fn export_never_silently_cleans_pending_unknown_or_corrupt_source_files() -> TestResult {
    for fault in ["pending", "unknown", "manifest", "payload", "missing"] {
        let directory = Directory::new()?;
        let mut store = source(&directory)?;
        let archive = store.export_backup()?;
        match fault {
            "pending" => fs::write(
                directory.path(&format!("source/.pending-{}", "a".repeat(64))),
                b"retained work",
            )?,
            "unknown" => fs::write(directory.path("source/host-notes.txt"), b"retained work")?,
            "manifest" => fs::write(directory.path("source/store.json"), b"partial manifest")?,
            "payload" => fs::write(
                directory.path(&format!("source/{}", record_name(&archive.records[0]))),
                b"bad complete file",
            )?,
            _ => fs::remove_file(
                directory.path(&format!("source/{}", record_name(&archive.records[0]))),
            )?,
        }
        let before = snapshot(&directory.path("source"))?;
        assert!(store.export_backup().is_err(), "{fault}");
        assert_eq!(snapshot(&directory.path("source"))?, before, "{fault}");
    }
    Ok(())
}

#[test]
fn stored_record_legacy_reading_is_preserved_but_new_archive_requires_true_raster_metadata()
-> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let record = store.export_backup()?.records.remove(0);
    let stored = store.get(&record.info.asset)?.ok_or("asset")?;
    let binding = store.binding().to_owned();
    let mut info = stored.info;
    info.width += 1;
    fs::write(
        directory.path(&format!("source/{}", record_name(&record))),
        original_record(&info, &stored.bytes, false)?,
    )?;
    drop(store);
    let mut store = AssetStore::open(&directory.path("source"), &binding)?;
    assert_eq!(store.get(&info.asset)?.ok_or("legacy asset")?.info.width, info.width);
    let before = snapshot(&directory.path("source"))?;
    assert!(store.export_backup().is_err());
    assert_eq!(snapshot(&directory.path("source"))?, before);
    Ok(())
}

#[test]
fn uncertain_put_fences_export_instead_of_adopting_an_unacknowledged_file() -> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let bytes = raster(ImageFormat::Png, 5, 9)?;
    let asset = asset_id(&bytes);
    fs::write(directory.path(&format!("source/{}.asset", &asset[7..])), b"occupied")?;
    assert!(store.put(prepare_asset(&asset, "image/png", bytes)?).is_err());
    let before = snapshot(&directory.path("source"))?;
    assert!(matches!(store.export_backup(), Err(crate::Error::NeedsRecovery)));
    assert_eq!(snapshot(&directory.path("source"))?, before);
    Ok(())
}

#[cfg(unix)]
#[test]
fn replaced_live_lock_inode_refuses_export_and_live_restore_completion() -> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let archive = store.export_backup()?;
    fs::rename(directory.path("source/.lock"), directory.path("held-source-lock"))?;
    fs::write(directory.path("source/.lock"), [])?;
    assert!(store.export_backup().is_err());
    let restore = begin(&directory, &archive)?;
    fs::rename(restore.root().join(".lock"), directory.path("held-restore-lock"))?;
    fs::write(restore.root().join(".lock"), [])?;
    assert!(restore.progress(&archive).is_err());
    assert!(restore.finish(&archive).is_err());
    assert!(directory.path("restore/.restore.json").is_file());
    Ok(())
}
