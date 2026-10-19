use super::*;

#[test]
fn all_original_rasters_and_unreferenced_files_roundtrip_without_normalizing_metadata() -> TestResult
{
    let directory = Directory::new()?;
    let store = source(&directory)?;
    let binding = store.binding().to_owned();
    drop(store);
    let manifest = directory.path("source/store.json");
    let metadata: serde_json::Value = serde_json::from_slice(&fs::read(&manifest)?)?;
    fs::write(&manifest, serde_json::to_vec_pretty(&metadata)?)?;
    let mut store = AssetStore::open(&directory.path("source"), &binding)?;
    let records = store.entries.values().cloned().collect::<Vec<_>>();
    for info in &records {
        let stored = store.get(&info.asset)?.ok_or("asset")?;
        fs::write(
            directory.path(&format!("source/{}.asset", &info.asset[7..])),
            original_record(info, &stored.bytes, true)?,
        )?;
    }
    let before = snapshot(&directory.path("source"))?;
    let archive = store.export_backup()?;
    assert_eq!(snapshot(&directory.path("source"))?, before);
    let file = archive.to_bytes()?;
    assert_eq!(archive.info().identity.archive_sha256, format::sha(&file));
    let archive = AssetStoreBackup::from_bytes(&file)?;
    assert_eq!(archive.to_bytes()?, file);
    assert_eq!(archive.info().identity.assets, 3);
    let restore = begin(&directory, &archive)?;
    assert_eq!(restore.progress(&archive)?.complete_assets, 0);
    assert!(!restore.progress(&archive)?.ready);
    let mut restored = restore.finish(&archive)?;
    assert_eq!(snapshot(&directory.path("restore"))?, before);
    assert_eq!(restored.binding(), binding);
    assert_eq!(restored.stored_bytes(), store.stored_bytes());
    for record in &archive.records {
        let original = store.get(&record.info.asset)?.ok_or("source asset")?;
        assert_eq!(
            restored.get(&record.info.asset)?.ok_or("restored asset")?.bytes,
            original.bytes
        );
        assert!(
            restored
                .put(
                    prepare_asset(&record.info.asset, record.info.mime.as_str(), original.bytes,)?
                )?
                .duplicate
        );
    }
    assert_eq!(restored.count(), 3);
    drop(restored);
    let completed = snapshot(&directory.path("restore"))?;
    let adopted = resume(&directory, &archive)?;
    assert!(adopted.progress(&archive)?.ready);
    let store = adopted.finish(&archive)?;
    assert_eq!(snapshot(&directory.path("restore"))?, completed);
    drop(store);
    let mut store = AssetStore::open(&directory.path("restore"), &binding)?;
    let bytes = raster(ImageFormat::Png, 4, 5)?;
    assert!(!store.put(prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?.duplicate);
    assert_eq!(store.count(), 4);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::metadata(directory.path("restore"))?.permissions().mode() & 0o777, 0o700);
        for entry in fs::read_dir(directory.path("restore"))? {
            assert_eq!(entry?.metadata()?.permissions().mode() & 0o777, 0o600);
        }
    }
    Ok(())
}

#[test]
fn empty_source_is_an_exact_resumable_store_not_a_missing_component() -> TestResult {
    let directory = Directory::new()?;
    let mut source = AssetStore::open(&directory.path("source"), &asset_id(b"empty"))?;
    let archive = source.export_backup()?;
    let admitted = AssetStoreBackup::from_bytes(&archive.to_bytes()?)?;
    assert_eq!(admitted.info().identity.assets, 0);
    let restored = begin(&directory, &admitted)?.finish(&admitted)?;
    assert_eq!(restored.count(), 0);
    assert_eq!(snapshot(&directory.path("restore"))?, snapshot(&directory.path("source"))?);
    Ok(())
}
