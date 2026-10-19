use super::*;

#[test]
fn occupied_files_empty_directories_and_existing_stores_are_never_adopted_by_begin() -> TestResult {
    for kind in ["file", "empty", "populated", "store"] {
        let directory = Directory::new()?;
        let archive = source(&directory)?.export_backup()?;
        let destination = directory.path("restore");
        match kind {
            "file" => fs::write(&destination, b"host data")?,
            "empty" => fs::create_dir(&destination)?,
            "populated" => {
                fs::create_dir(&destination)?;
                fs::write(destination.join("host-data"), b"host data")?;
            }
            _ => {
                drop(AssetStore::open(&destination, &archive.identity.binding)?);
            }
        }
        let before = if kind == "file" {
            BTreeMap::from([("file".into(), fs::read(&destination)?)])
        } else {
            snapshot(&destination)?
        };
        assert!(begin(&directory, &archive).is_err(), "{kind}");
        let after = if kind == "file" {
            BTreeMap::from([("file".into(), fs::read(&destination)?)])
        } else {
            snapshot(&destination)?
        };
        assert_eq!(after, before, "{kind}");
    }
    Ok(())
}

#[test]
fn ambiguous_destination_names_do_not_create_or_adopt_any_directory() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    for name in ["", ".", "..", "new/.", "new/..", "new/"] {
        assert!(
            AssetRestore::begin(&directory.path(name), &archive, &archive.identity, POLICY)
                .is_err(),
            "{name}"
        );
    }
    assert!(!directory.path("new").exists());
    drop(begin(&directory, &archive)?);
    let before = snapshot(&directory.path("restore"))?;
    for name in ["restore/.", "restore/..", "restore/"] {
        assert!(
            AssetRestore::resume(&directory.path(name), &archive, &archive.identity, POLICY)
                .is_err(),
            "{name}"
        );
    }
    assert_eq!(snapshot(&directory.path("restore"))?, before);
    Ok(())
}

#[cfg(unix)]
#[test]
fn destination_symlinks_and_source_symlinks_are_preserved_and_refused() -> TestResult {
    use std::os::unix::fs::symlink;
    for dangling in [true, false] {
        let directory = Directory::new()?;
        let archive = source(&directory)?.export_backup()?;
        let target = directory.path("target");
        if !dangling {
            fs::create_dir(&target)?;
        }
        symlink(&target, directory.path("restore"))?;
        assert!(begin(&directory, &archive).is_err());
        assert!(resume(&directory, &archive).is_err());
        assert_eq!(fs::read_link(directory.path("restore"))?, target);
    }
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let archive = store.export_backup()?;
    let record = &archive.records[0];
    let path = directory.path(&format!("source/{}", record_name(record)));
    fs::rename(&path, directory.path("real-asset"))?;
    symlink(directory.path("real-asset"), &path)?;
    assert!(store.export_backup().is_err());
    assert!(fs::symlink_metadata(path)?.is_symlink());
    Ok(())
}

#[test]
fn concurrent_begin_and_resume_each_have_one_exclusive_winner() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    let path = directory.path("restore");
    for operation in ["begin", "resume"] {
        let start = std::sync::Barrier::new(2);
        let hold = std::sync::Barrier::new(2);
        let winners = std::thread::scope(|scope| {
            let attempt = || {
                start.wait();
                let result = if operation == "begin" {
                    AssetRestore::begin(&path, &archive, &archive.identity, POLICY)
                } else {
                    AssetRestore::resume(&path, &archive, &archive.identity, POLICY)
                };
                hold.wait();
                result.is_ok()
            };
            let a = scope.spawn(attempt);
            let b = scope.spawn(attempt);
            Ok::<_, Box<dyn std::error::Error>>(
                usize::from(a.join().map_err(|_| "first thread")?)
                    + usize::from(b.join().map_err(|_| "second thread")?),
            )
        })?;
        assert_eq!(winners, 1, "{operation}");
    }
    assert_eq!(resume(&directory, &archive)?.finish(&archive)?.count(), 3);
    Ok(())
}
