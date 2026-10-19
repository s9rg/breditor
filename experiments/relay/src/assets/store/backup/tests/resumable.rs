use super::*;

#[test]
fn dropped_attempt_retains_marker_blocks_ordinary_open_and_resumes() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    let restore = begin(&directory, &archive)?;
    assert_eq!(restore.root(), directory.path("restore").canonicalize()?);
    assert!(AssetRestore::resume(restore.root(), &archive, &archive.identity, POLICY).is_err());
    drop(restore);
    let before = snapshot(&directory.path("restore"))?;
    assert!(AssetStore::open(&directory.path("restore"), &archive.identity.binding).is_err());
    assert_eq!(snapshot(&directory.path("restore"))?, before);
    let restored = resume(&directory, &archive)?.finish(&archive)?;
    assert_eq!(restored.count(), 3);
    Ok(())
}

#[test]
fn exact_partial_staging_appends_and_repeated_resume_never_spends_budget_twice() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    let restore = begin(&directory, &archive)?;
    let first = &archive.records[0];
    let stage = restore.root().join(restore.stage(&first.info.asset)?);
    fs::write(&stage, &first.encoded[..first.encoded.len() / 2])?;
    let before = snapshot(restore.root())?;
    drop(restore);
    let restore = resume(&directory, &archive)?;
    assert_eq!(snapshot(restore.root())?, before);
    assert_eq!(restore.progress(&archive)?.complete_assets, 0);
    let mut store = restore.finish(&archive)?;
    assert_eq!(store.count(), 3);
    assert_eq!(store.stored_bytes(), archive.identity.bytes);
    let data = store.get(&first.info.asset)?.ok_or("asset")?;
    assert!(
        store
            .put(prepare_asset(&first.info.asset, first.info.mime.as_str(), data.bytes)?)?
            .duplicate
    );
    assert_eq!(store.stored_bytes(), archive.identity.bytes);
    Ok(())
}

#[test]
fn record_link_manifest_link_and_post_ack_interruptions_are_all_resumable() -> TestResult {
    for cut in ["record", "manifest", "retired"] {
        let directory = Directory::new()?;
        let archive = source(&directory)?.export_backup()?;
        let restore = begin(&directory, &archive)?;
        for asset in &archive.records {
            restore_files::publish(
                restore.root(),
                &restore.stage(&asset.info.asset)?,
                &record_name(asset),
                &asset.encoded,
            )?;
            if cut == "record" {
                break;
            }
        }
        if cut != "record" {
            restore_files::publish(
                restore.root(),
                &restore.manifest_stage()?,
                "store.json",
                &archive.manifest,
            )?;
        }
        if cut == "retired" {
            for asset in &archive.records {
                fs::remove_file(restore.root().join(restore.stage(&asset.info.asset)?))?;
            }
            fs::remove_file(restore.root().join(restore.manifest_stage()?))?;
            fs::remove_file(restore.root().join(".restore.json"))?;
        }
        drop(restore);
        let resumed = resume(&directory, &archive)?;
        assert_eq!(resumed.progress(&archive)?.ready, cut == "retired");
        assert_eq!(resumed.finish(&archive)?.count(), 3);
    }
    Ok(())
}

#[test]
fn completed_record_with_partial_duplicate_owned_stage_can_finish() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    let restore = begin(&directory, &archive)?;
    let asset = &archive.records[0];
    fs::write(restore.root().join(record_name(asset)), &asset.encoded)?;
    fs::write(restore.root().join(restore.stage(&asset.info.asset)?), &asset.encoded[..7])?;
    drop(restore);
    assert_eq!(resume(&directory, &archive)?.finish(&archive)?.count(), 3);
    Ok(())
}

#[test]
fn divergent_prefix_final_marker_and_unknown_files_are_preserved_and_refused() -> TestResult {
    for fault in ["prefix", "final", "marker", "unknown", "directory"] {
        let directory = Directory::new()?;
        let archive = source(&directory)?.export_backup()?;
        let restore = begin(&directory, &archive)?;
        let asset = &archive.records[0];
        let name = match fault {
            "prefix" | "directory" => restore.stage(&asset.info.asset)?,
            "final" => record_name(asset),
            "marker" => ".restore.json".into(),
            _ => "host-notes.txt".into(),
        };
        let path = restore.root().join(name);
        if fault == "directory" {
            fs::create_dir(&path)?;
        } else {
            fs::write(&path, b"preserve divergent work")?;
        }
        drop(restore);
        assert!(resume(&directory, &archive).is_err(), "{fault}");
        if fault == "directory" {
            assert!(path.is_dir());
            fs::remove_dir(path)?;
            assert_eq!(resume(&directory, &archive)?.finish(&archive)?.count(), 3);
        } else {
            assert_eq!(fs::read(path)?, b"preserve divergent work", "{fault}");
        }
    }
    Ok(())
}

#[test]
fn published_manifest_with_missing_records_and_unmarked_partial_store_are_not_adopted() -> TestResult
{
    for manifest in [true, false] {
        let directory = Directory::new()?;
        let archive = source(&directory)?.export_backup()?;
        let restore = begin(&directory, &archive)?;
        if manifest {
            fs::write(restore.root().join("store.json"), &archive.manifest)?;
        } else {
            fs::remove_file(restore.root().join(".restore.json"))?;
        }
        drop(restore);
        let before = snapshot(&directory.path("restore"))?;
        assert!(resume(&directory, &archive).is_err());
        assert_eq!(snapshot(&directory.path("restore"))?, before);
    }
    Ok(())
}
