use super::*;

#[test]
fn framing_header_and_exact_ranges_are_closed_and_bounded() -> TestResult {
    let directory = Directory::new()?;
    let archive = source(&directory)?.export_backup()?;
    let original = archive.to_bytes()?;
    for length in [0, 1, format::PREFIX - 1, format::PREFIX, original.len() - 1] {
        assert!(AssetStoreBackup::from_bytes(&original[..length]).is_err());
    }
    for offset in [0, format::MAGIC.len() + 4, format::PREFIX, original.len() - 1] {
        let mut changed = original.clone();
        changed[offset] ^= 1;
        assert!(AssetStoreBackup::from_bytes(&changed).is_err());
    }
    let mut extra = original;
    extra.push(0);
    assert!(AssetStoreBackup::from_bytes(&extra).is_err());
    let data = body(&archive);
    let json = serde_json::to_value(&archive.header)?;
    let mut unknown = json.clone();
    unknown["unrecognized"] = true.into();
    assert!(AssetStoreBackup::from_bytes(&frame(&serde_json::to_vec(&unknown)?, &data)?).is_err());
    let pretty = frame(&serde_json::to_vec_pretty(&archive.header)?, &data)?;
    assert!(AssetStoreBackup::from_bytes(&pretty).is_err());
    let encoded = serde_json::to_string(&archive.header)?;
    let duplicate = encoded.replacen('{', "{\"formatVersion\":1,", 1);
    assert!(AssetStoreBackup::from_bytes(&frame(duplicate.as_bytes(), &data)?).is_err());
    for fault in [
        "version",
        "binding",
        "bytes",
        "offset",
        "hash",
        "size",
        "order",
        "duplicate",
        "nested",
        "mime",
        "count",
    ] {
        let mut header = json.clone();
        match fault {
            "version" => header["formatVersion"] = 2.into(),
            "binding" => header["binding"] = "invalid".into(),
            "bytes" => header["bytes"] = 0.into(),
            "offset" => header["records"][0]["record"]["offset"] = 0.into(),
            "hash" => header["manifest"]["sha256"][0] = 256.into(),
            "size" => header["records"][0]["record"]["bytes"] = u64::MAX.into(),
            "order" => header["records"].as_array_mut().ok_or("records")?.reverse(),
            "duplicate" => header["records"][1] = header["records"][0].clone(),
            "nested" => header["records"][0]["record"]["unknown"] = true.into(),
            "mime" => header["records"][0]["info"]["mime"] = "image/svg+xml".into(),
            _ => {
                let record = header["records"][0].clone();
                header["records"] = vec![record; crate::assets::MAX_ASSETS + 1].into();
            }
        }
        assert!(
            AssetStoreBackup::from_bytes(&frame(&serde_json::to_vec(&header)?, &data)?).is_err(),
            "{fault}"
        );
    }
    assert!(!directory.path("restore").exists());
    Ok(())
}

#[test]
fn valid_new_envelope_hashes_cannot_launder_false_native_geometry_mime_or_pixels() -> TestResult {
    for fault in ["geometry", "mime", "decode", "record-hash", "manifest-room"] {
        let directory = Directory::new()?;
        let mut archive = source(&directory)?.export_backup()?;
        if fault == "manifest-room" {
            let mut manifest: serde_json::Value = serde_json::from_slice(&archive.manifest)?;
            manifest["binding"] = asset_id(b"other-room").into();
            archive.manifest = serde_json::to_vec(&manifest)?;
        } else {
            let record = &mut archive.records[0];
            let stored = crate::assets::record::decode(&record.encoded, &record.info.asset)?;
            let mut pixels = stored.bytes;
            match fault {
                "geometry" => record.info.width += 1,
                "mime" => {
                    record.info.mime = if record.info.mime == crate::assets::RasterMime::Png {
                        crate::assets::RasterMime::Jpeg
                    } else {
                        crate::assets::RasterMime::Png
                    }
                }
                "decode" => {
                    pixels = b"not a decoded raster".to_vec();
                    record.info.asset = asset_id(&pixels);
                    record.info.bytes = pixels.len() as u64;
                }
                _ => pixels[0] ^= 1,
            }
            record.encoded = original_record(&record.info, &pixels, false)?;
        }
        assert!(AssetStoreBackup::from_bytes(&reframed(&archive)?).is_err(), "{fault}");
        assert!(!directory.path("restore").exists());
    }
    Ok(())
}

#[test]
fn selected_identity_refuses_another_valid_same_room_cut_before_destination_io() -> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let selected = store.export_backup()?;
    let bytes = raster(ImageFormat::Png, 5, 7)?;
    store.put(prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?;
    let later = store.export_backup()?;
    for fault in ["digest", "binding", "bytes", "assets", "later"] {
        let mut expected = selected.info().identity;
        match fault {
            "digest" => expected.archive_sha256[0] ^= 1,
            "binding" => expected.binding = asset_id(b"wrong-room"),
            "bytes" => expected.bytes += 1,
            "assets" => expected.assets += 1,
            _ => expected = later.info().identity,
        }
        assert!(
            AssetRestore::begin(&directory.path("restore"), &selected, &expected, POLICY).is_err()
        );
        assert!(!directory.path("restore").exists());
    }
    let pending = begin(&directory, &selected)?;
    drop(pending);
    let before = snapshot(&directory.path("restore"))?;
    assert!(resume(&directory, &later).is_err());
    assert_eq!(snapshot(&directory.path("restore"))?, before);
    Ok(())
}

#[test]
fn different_original_file_bytes_with_the_same_room_counts_and_payloads_are_not_the_selected_archive()
-> TestResult {
    let directory = Directory::new()?;
    let mut selected = source(&directory)?.export_backup()?;
    let expected = selected.info().identity;
    let manifest: serde_json::Value = serde_json::from_slice(&selected.manifest)?;
    selected.manifest = serde_json::to_vec_pretty(&manifest)?;
    let other = AssetStoreBackup::from_bytes(&reframed(&selected)?)?;
    assert_eq!(other.identity.binding, expected.binding);
    assert_eq!(other.identity.assets, expected.assets);
    assert_eq!(other.identity.bytes, expected.bytes);
    assert_ne!(other.identity.archive_sha256, expected.archive_sha256);
    assert!(AssetRestore::begin(&directory.path("restore"), &other, &expected, POLICY).is_err());
    assert!(!directory.path("restore").exists());
    Ok(())
}
