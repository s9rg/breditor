use super::*;
#[test]
fn all_ten_original_compilers_and_transports_keep_exact_components_and_complete_once() -> TestResult
{
    for atomic in [false, true] {
        for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
            let directory = Directory::new()?;
            let (mut room, mut assets) = source(&directory, version, standard, atomic)?;
            room.grant("owner", "reader", Some(crate::Role::Reader))?;
            let before = room.catchup("owner")?;
            let original_log = fs::read(directory.path("source.log"))?;
            let original_assets = snapshot(&directory.path("source-assets"))?;
            let selected = ServerRoomBackup::capture(&mut room, &mut assets)?;
            assert_eq!(room.catchup("owner")?, before);
            assert_eq!(fs::read(directory.path("source.log"))?, original_log);
            assert_eq!(snapshot(&directory.path("source-assets"))?, original_assets);
            let encoded = selected.to_bytes()?;
            let selected = ServerRoomBackup::from_bytes(&encoded)?;
            assert_eq!(selected.to_bytes()?, encoded);
            let attempt = begin(&directory, &selected)?;
            assert!(!attempt.progress(&selected)?.completion_record);
            let restored = attempt.finish(&selected)?;
            assert!(restored.root().join(".ready.json").is_file());
            assert_eq!(fs::read(restored.root().join("room.log"))?, original_log);
            assert_eq!(snapshot(&restored.root().join("assets"))?, original_assets);
            assert!(resume(&directory, &selected).is_err());
            let (mut recovered, mut rasters) = restored.into_parts();
            assert_eq!(recovered.backup_identity()?, selected.identity.room);
            assert_eq!(
                ServerRoomBackup::capture(&mut recovered, &mut rasters)?.to_bytes()?,
                encoded
            );
            for asset in &selected.assets.info().assets {
                assert!(recovered.read_asset("reader", &rasters, &asset.asset)?.is_some());
                assert!(recovered.read_asset("unknown", &rasters, &asset.asset).is_err());
            }
            drop(recovered);
            drop(rasters);
            let old = snapshot(&directory.path("restored"))?;
            let attempt = resume(&directory, &selected)?;
            assert!(attempt.progress(&selected)?.completion_record);
            drop(attempt.finish(&selected)?);
            assert_eq!(snapshot(&directory.path("restored"))?, old);
        }
    }
    Ok(())
}
#[test]
fn captured_server_cut_is_immutable_when_later_roles_or_assets_change() -> TestResult {
    let directory = Directory::new()?;
    let (mut room, mut assets) = source(&directory, 3, true, true)?;
    let archive = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let original = archive.to_bytes()?;
    room.grant("owner", "late", Some(crate::Role::Editor))?;
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(3, 5).write_to(&mut bytes, ImageFormat::Png)?;
    let bytes = bytes.into_inner();
    assets.put(prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?;
    assert_eq!(archive.to_bytes()?, original);
    assert_ne!(ServerRoomBackup::capture(&mut room, &mut assets)?.identity, archive.identity);
    let (room, assets) = begin(&directory, &archive)?.finish(&archive)?.into_parts();
    assert!(room.catchup("late").is_err());
    assert_eq!(assets.count(), 3);
    Ok(())
}
#[test]
fn mismatched_live_server_components_refuse_capture_without_side_effects() -> TestResult {
    let directory = Directory::new()?;
    let (mut room, _assets) = source(&directory, 3, true, true)?;
    let mut other = AssetStore::open(&directory.path("other-assets"), &asset_id(b"other-seed"))?;
    let before = fs::read(directory.path("source.log"))?;
    assert!(ServerRoomBackup::capture(&mut room, &mut other).is_err());
    assert_eq!(fs::read(directory.path("source.log"))?, before);
    assert_eq!(other.count(), 0);
    Ok(())
}
