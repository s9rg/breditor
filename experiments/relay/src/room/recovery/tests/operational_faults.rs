//! Explicit filesystem interruption states and native admission; no production fault bypasses.
use super::*;
use crate::{
    OperationalServerRoom, Role,
    log::{Event, Log},
};
use std::io::Write;

fn completed(directory: &Directory, archive: &ServerRoomBackup) -> TestResult<PathBuf> {
    let operation = begin(directory, archive)?.finish(archive)?.begin_operation(
        archive,
        &archive.identity,
        POLICY,
    )?;
    let root = operation.root().to_path_buf();
    drop(operation);
    Ok(root)
}
fn stage(root: &std::path::Path) -> TestResult<PathBuf> {
    let marker: super::super::types::Marker =
        serde_json::from_slice(&fs::read(root.join(".recovery.json"))?)?;
    Ok(root.join(format!(".operational-{}", marker.id)))
}

#[test]
fn partial_intent_and_published_before_ack_resume_without_rewriting_native_components() -> TestResult
{
    for part in 0..6 {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        let marker = fs::read(root.join(".operational.json"))?;
        if part == 5 {
            fs::hard_link(root.join(".operational.json"), stage(&root)?)?;
        } else {
            fs::remove_file(root.join(".operational.json"))?;
            let size = match part {
                0 => 0,
                1 => 1,
                2 => marker.len() / 2,
                3 => marker.len() - 1,
                _ => marker.len(),
            };
            fs::write(stage(&root)?, &marker[..size])?;
        }
        let before = snapshot(&root)?;
        drop(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY)?);
        assert_eq!(fs::read(root.join(".operational.json"))?, marker);
        assert!(!stage(&root)?.exists());
        for name in ["room.log", ".recovery.json", ".ready.json", "assets/store.json"] {
            assert_eq!(snapshot(&root)?[name], before[name]);
        }
        for (name, bytes) in before {
            if std::path::Path::new(&name).extension().is_some_and(|ext| ext == "asset") {
                assert_eq!(snapshot(&root)?[&name], bytes);
            }
        }
    }
    Ok(())
}

#[test]
fn unpublished_intent_cannot_adopt_later_appends_or_added_assets() -> TestResult {
    for asset in [false, true] {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        let bytes = fs::read(root.join(".operational.json"))?;
        fs::remove_file(root.join(".operational.json"))?;
        fs::write(stage(&root)?, bytes)?;
        if asset {
            let mut store =
                AssetStore::open(&root.join("assets"), &archive.identity.assets.binding)?;
            let mut data = Cursor::new(Vec::new());
            DynamicImage::new_rgb8(5, 7).write_to(&mut data, ImageFormat::Png)?;
            let data = data.into_inner();
            store.put(prepare_asset(&asset_id(&data), "image/png", data)?)?;
        } else {
            let (mut authority, _) = Room::open(&root.join("room.log"))?;
            authority.grant("owner", "late", Some(Role::Reader))?;
        }
        let before = snapshot(&root)?;
        assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
        assert_eq!(snapshot(&root)?, before);
        assert!(!root.join(".operational.json").exists());
    }
    Ok(())
}

#[test]
fn incomplete_or_semantically_invalid_native_tail_is_not_trimmed_on_refusal() -> TestResult {
    for semantic in [false, true] {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        let path = root.join("room.log");
        if semantic {
            let (mut log, _, _) = Log::open(&path)?;
            log.append(Event::Grant {
                actor: "not-the-owner".into(),
                principal: "late".into(),
                role: Some(Role::Editor),
            })?;
        } else {
            let mut file = fs::OpenOptions::new().append(true).open(&path)?;
            file.write_all(&[1, 2, 3])?;
            file.sync_all()?;
        }
        let before = snapshot(&root)?;
        assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
        assert_eq!(snapshot(&root)?, before);
    }
    Ok(())
}

#[test]
fn missing_original_assets_or_native_components_are_not_recreated() -> TestResult {
    for name in ["room.log", "assets/store.json", "assets/.lock", "original-asset", ".ready.json"] {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        let path = if name == "original-asset" {
            root.join("assets")
                .join(format!("{}.asset", &archive.assets.info().assets[0].asset[7..]))
        } else {
            root.join(name)
        };
        fs::remove_file(path)?;
        let before = snapshot(&root)?;
        assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
        assert_eq!(snapshot(&root)?, before);
    }
    Ok(())
}

#[test]
fn unknown_or_pending_files_and_fabricated_markers_are_preserved_and_refused() -> TestResult {
    for variant in 0..6 {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        match variant {
            0 => {
                fs::write(root.join("undeclared"), b"retained")?;
            }
            1 => {
                fs::write(
                    root.join("assets").join(format!(".pending-{}", "a".repeat(64))),
                    b"unacknowledged upload",
                )?;
            }
            2 => {
                fs::write(root.join("assets/undeclared"), b"retained")?;
            }
            _ => {
                let path = root.join(".operational.json");
                let mut value: Value = serde_json::from_slice(&fs::read(&path)?)?;
                match variant {
                    3 => value["extra"] = json!(true),
                    4 => value["formatVersion"] = json!(99),
                    _ => {
                        let before = value["origin"]["archiveSha256"][0]
                            .as_u64()
                            .ok_or("native digest byte")?;
                        value["origin"]["archiveSha256"][0] = json!(before ^ 1);
                    }
                }
                fs::write(path, serde_json::to_vec(&value)?)?;
            }
        }
        let before = snapshot(&root)?;
        assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
        assert_eq!(snapshot(&root)?, before);
    }
    Ok(())
}

#[test]
fn fully_valid_native_fork_with_identical_genesis_and_assets_does_not_replace_selected_history()
-> TestResult {
    let directory = Directory::new()?;
    let (mut authority, mut assets) = source(&directory, 3, true, true)?;
    authority.grant("owner", "selected-reader", Some(Role::Reader))?;
    let archive = ServerRoomBackup::capture(&mut authority, &mut assets)?;
    drop(authority);
    drop(assets);
    let root = completed(&directory, &archive)?;
    let path = root.join("room.log");
    let original = fs::read(&path)?;
    let payload = u64::from_be_bytes(original[..8].try_into()?);
    let seed_end = 72 + usize::try_from(payload)?;
    fs::write(&path, &original[..seed_end])?;
    let (mut fork, recovery) = Room::open(&path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    fork.grant("owner", "other-reader", Some(Role::Reader))?;
    assert!(fork.catchup("other-reader").is_ok());
    drop(fork);
    let before = snapshot(&root)?;
    assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
    assert_eq!(snapshot(&root)?, before);
    Ok(())
}

#[test]
fn ordinary_native_open_keeps_its_explicit_torn_tail_and_pending_cleanup_contract() -> TestResult {
    let directory = Directory::new()?;
    let archive = backup(&directory)?;
    let root = completed(&directory, &archive)?;
    let path = root.join("room.log");
    let original = fs::read(&path)?;
    let mut file = fs::OpenOptions::new().append(true).open(&path)?;
    file.write_all(&[1, 2, 3])?;
    file.sync_all()?;
    drop(file);
    let pending = root.join("assets").join(format!(".pending-{}", "a".repeat(64)));
    fs::write(&pending, b"unacknowledged")?;
    let (authority, recovery) = Room::open(&path)?;
    assert_eq!(recovery.truncated_bytes, 3);
    assert_eq!(fs::read(&path)?, original);
    let store = AssetStore::open(&root.join("assets"), authority.asset_binding())?;
    assert!(!pending.exists());
    assert_eq!(store.count(), 3);
    drop(authority);
    drop(store);
    drop(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY)?);
    Ok(())
}

#[cfg(unix)]
#[test]
fn native_path_aliases_and_byte_identical_log_replacement_do_not_transfer_owned_locks() -> TestResult
{
    for name in ["room.log", "assets", ".operational.json"] {
        let directory = Directory::new()?;
        let archive = backup(&directory)?;
        let root = completed(&directory, &archive)?;
        let target = root.join(name);
        let retained = directory.path("retained-entry");
        fs::rename(&target, &retained)?;
        std::os::unix::fs::symlink(&retained, &target)?;
        assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
        assert!(fs::symlink_metadata(&target)?.file_type().is_symlink());
        assert!(retained.exists());
    }
    let directory = Directory::new()?;
    let archive = backup(&directory)?;
    let recovered = begin(&directory, &archive)?.finish(&archive)?;
    let root = recovered.root().to_path_buf();
    let path = root.join("room.log");
    let old = directory.path("still-owned.log");
    fs::rename(&path, &old)?;
    let bytes = fs::read(&old)?;
    fs::write(&path, &bytes)?;
    assert!(recovered.begin_operation(&archive, &archive.identity, POLICY).is_err());
    assert_eq!(fs::read(&path)?, bytes);
    assert_eq!(fs::read(&old)?, bytes);
    assert!(!root.join(".operational.json").exists());
    Ok(())
}
