use super::*;
#[test]
fn framing_header_component_ranges_and_closed_identities_reject() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let file = backup.to_bytes()?;
    for size in [0, 1, format::PREFIX - 1, format::PREFIX, file.len() - 1] {
        assert!(ServerRoomBackup::from_bytes(&file[..size]).is_err());
    }
    for at in [0, format::MAGIC.len() + 4, format::PREFIX, file.len() - 1] {
        let mut changed = file.clone();
        changed[at] ^= 1;
        assert!(ServerRoomBackup::from_bytes(&changed).is_err());
    }
    let mut extra = file;
    extra.push(0);
    assert!(ServerRoomBackup::from_bytes(&extra).is_err());
    let log = backup.room.to_bytes();
    let assets = backup.assets.to_bytes()?;
    assert!(
        ServerRoomBackup::from_bytes(&format::frame(
            &serde_json::to_vec_pretty(&backup.header)?,
            &log,
            &assets
        )?)
        .is_err()
    );
    for fault in [
        "version",
        "extra",
        "nested",
        "binding",
        "cut",
        "asset-cut",
        "range",
        "size",
        "component-digest",
    ] {
        let mut header = serde_json::to_value(&backup.header)?;
        match fault {
            "version" => header["formatVersion"] = 2.into(),
            "extra" => header["unknown"] = true.into(),
            "nested" => header["room"]["unknown"] = true.into(),
            "binding" => header["room"]["assetBinding"] = asset_id(b"other").into(),
            "cut" => header["room"]["records"] = 0.into(),
            "asset-cut" => header["assets"]["assets"] = 0.into(),
            "range" => header["rasters"]["offset"] = 0.into(),
            "size" => header["log"]["bytes"] = u64::MAX.into(),
            _ => header["log"]["sha256"][0] = 256.into(),
        }
        assert!(
            ServerRoomBackup::from_bytes(&format::frame(
                &serde_json::to_vec(&header)?,
                &log,
                &assets
            )?)
            .is_err(),
            "{fault}"
        );
    }
    assert!(!directory.path("restored").exists());
    Ok(())
}
#[test]
fn independent_selected_identity_is_checked_before_creating_a_destination() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    for fault in ["hash", "room", "assets"] {
        let mut expected = backup.info().identity;
        match fault {
            "hash" => expected.archive_sha256[0] ^= 1,
            "room" => expected.room.owner = "another".into(),
            _ => expected.assets.archive_sha256[0] ^= 1,
        }
        assert!(
            ServerRoomRecovery::begin(&directory.path("restored"), &backup, &expected, POLICY)
                .is_err()
        );
        assert!(!directory.path("restored").exists());
    }
    Ok(())
}
#[test]
fn checksummed_but_false_native_profile_never_publishes_a_log_or_ready_components() -> TestResult {
    let directory = Directory::new()?;
    let backup = backup(&directory)?;
    let mut header = backup.header.clone();
    header.room.profile = AtomicTransportProfile::Original;
    let admitted = ServerRoomBackup::from_bytes(&reframed(&backup, &header)?)?;
    assert!(begin(&directory, &admitted)?.finish(&admitted).is_err());
    assert!(!directory.path("restored/room.log").exists());
    assert!(!directory.path("restored/assets").exists());
    assert!(!directory.path("restored/.ready.json").exists());
    assert!(directory.path("restored/.recovery.json").is_file());
    Ok(())
}
