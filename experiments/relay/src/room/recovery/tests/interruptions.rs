use super::*;
fn assets_prefix(
    directory: &Directory,
    attempt: &ServerRoomRecovery,
    backup: &ServerRoomBackup,
) -> TestResult {
    let path = attempt.root().join("assets");
    let assets = AssetRestore::begin(
        &path,
        &backup.assets,
        &backup.identity.assets,
        AssetRecoveryPolicy::HostReacquired,
    )?;
    let marker: Value = serde_json::from_slice(&fs::read(path.join(".restore.json"))?)?;
    let id = marker["id"].as_str().ok_or("asset restore id")?;
    let asset = &backup.assets.info().assets[0].asset;
    let bytes = fs::read(directory.path(&format!("source-assets/{}.asset", &asset[7..])))?;
    fs::write(path.join(format!(".restore-{id}-{}", &asset[7..])), &bytes[..bytes.len() / 2])?;
    drop(assets);
    Ok(())
}
#[test]
fn every_log_asset_and_completion_interruption_retains_and_resumes_exact_work() -> TestResult {
    for cut in [
        "reserved",
        "log-prefix",
        "log-linked",
        "asset-prefix",
        "assets",
        "ready-prefix",
        "ready-linked",
    ] {
        let directory = Directory::new()?;
        let backup = backup(&directory)?;
        let attempt = begin(&directory, &backup)?;
        if cut == "log-prefix" {
            let raw = backup.room.original_log();
            fs::write(attempt.log_stage(), &raw[..raw.len() / 2])?;
        } else if cut != "reserved" {
            drop(attempt.restore_log(&backup)?);
            if cut == "asset-prefix" {
                assets_prefix(&directory, &attempt, &backup)?;
            } else if cut != "log-linked" {
                drop(
                    AssetRestore::begin(
                        &attempt.root().join("assets"),
                        &backup.assets,
                        &backup.identity.assets,
                        AssetRecoveryPolicy::HostReacquired,
                    )?
                    .finish(&backup.assets)?,
                );
                if cut == "ready-prefix" {
                    fs::write(attempt.ready_stage(), &attempt.completion()?[..7])?;
                }
                if cut == "ready-linked" {
                    let ready = attempt.completion()?;
                    files::prepare(&attempt.ready_stage(), &ready)?;
                    files::publish(
                        attempt.root(),
                        &attempt.ready_stage(),
                        &attempt.root().join(".ready.json"),
                        &ready,
                    )?;
                }
            }
        }
        drop(attempt);
        let before = snapshot(&directory.path("restored"))?;
        let attempt = resume(&directory, &backup)?;
        let progress = attempt.progress(&backup)?;
        assert_eq!(progress.completion_record, cut == "ready-linked", "{cut}");
        assert_eq!(snapshot(attempt.root())?, before, "read-only resume {cut}");
        let result = attempt.finish(&backup)?;
        assert!(result.root().join(".ready.json").is_file());
        assert_eq!(fs::read(result.root().join("room.log"))?, backup.room.original_log());
        assert_eq!(
            snapshot(&result.root().join("assets"))?,
            snapshot(&directory.path("source-assets"))?
        );
        assert_eq!(fs::read_dir(result.root())?.count(), 5, "{cut}");
    }
    Ok(())
}
#[test]
fn malformed_completed_log_is_refused_before_ordinary_open_can_truncate_it() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let attempt = begin(&directory, &backup)?;
    let raw = backup.room.original_log();
    fs::write(attempt.root().join("room.log"), &raw[..raw.len() - 1])?;
    drop(attempt);
    let before = snapshot(&directory.path("restored"))?;
    assert!(resume(&directory, &backup).is_err());
    assert_eq!(snapshot(&directory.path("restored"))?, before);
    Ok(())
}
#[test]
fn unknown_or_divergent_recovery_work_is_never_deleted_or_reset() -> TestResult {
    for fault in ["stage", "marker", "unknown", "false-ready", "asset-unknown"] {
        let directory = Directory::new()?;
        let backup = backup(&directory)?;
        let attempt = begin(&directory, &backup)?;
        match fault {
            "stage" => fs::write(attempt.log_stage(), b"preserve divergent log")?,
            "marker" => fs::write(attempt.root().join(".recovery.json"), b"partial marker")?,
            "unknown" => fs::write(attempt.root().join("host-notes"), b"preserve host data")?,
            "false-ready" => fs::write(attempt.root().join(".ready.json"), attempt.completion()?)?,
            _ => {
                assets_prefix(&directory, &attempt, &backup)?;
                fs::write(attempt.root().join("assets/host-notes"), b"preserve host data")?;
            }
        }
        drop(attempt);
        let before = snapshot(&directory.path("restored"))?;
        assert!(resume(&directory, &backup).is_err(), "{fault}");
        assert_eq!(snapshot(&directory.path("restored"))?, before, "{fault}");
    }
    Ok(())
}
#[test]
fn failed_asset_phase_retains_published_log_and_never_issues_a_completion() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let attempt = begin(&directory, &backup)?;
    drop(attempt.restore_log(&backup)?);
    assets_prefix(&directory, &attempt, &backup)?;
    fs::write(attempt.root().join("assets/host-notes"), b"owned by host")?;
    let before = snapshot(attempt.root())?;
    assert!(attempt.finish(&backup).is_err());
    assert_eq!(snapshot(&directory.path("restored"))?, before);
    assert!(!directory.path("restored/.ready.json").exists());
    // Only remove this test's own injected obstruction; retained recovery data is untouched.
    fs::remove_file(directory.path("restored/assets/host-notes"))?;
    drop(resume(&directory, &backup)?.finish(&backup)?);
    Ok(())
}
