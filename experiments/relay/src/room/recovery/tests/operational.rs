use super::*;
use crate::{Error, OperationalServerRoom, Role};

#[test]
fn all_ten_native_families_reopen_actual_service_appends_and_preserve_original_files() -> TestResult
{
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let directory = Directory::new()?;
            let (mut authority, mut assets) = source(&directory, version, standard, atomic)?;
            let archive = ServerRoomBackup::capture(&mut authority, &mut assets)?;
            let original_file = archive.to_bytes()?;
            drop(authority);
            drop(assets);
            let recovered = begin(&directory, &archive)?.finish(&archive)?;
            let root = recovered.root().to_path_buf();
            let before = snapshot(&root)?;
            let operation = recovered.begin_operation(&archive, &archive.identity, POLICY)?;
            assert_eq!(operation.origin(), archive.identity);
            assert_eq!(operation.root(), root);
            let marker = fs::read(root.join(".operational.json"))?;
            let (mut authority, mut assets) = operation.into_parts();
            authority.grant("owner", "late", Some(Role::Reader))?;
            let registration = authority.register("owner")?;
            let mut encoded = Cursor::new(Vec::new());
            DynamicImage::new_rgb8(4, 5).write_to(&mut encoded, ImageFormat::Png)?;
            let bytes = encoded.into_inner();
            let id = asset_id(&bytes);
            assets.put(prepare_asset(&id, "image/png", bytes.clone())?)?;
            let catchup = authority.catchup("late")?;
            let changed = ServerRoomBackup::capture(&mut authority, &mut assets)?.to_bytes()?;
            assert_ne!(changed, original_file);
            drop(authority);
            drop(assets);
            let durable = snapshot(&root)?;
            assert!(resume(&directory, &archive).is_err());
            assert_eq!(snapshot(&root)?, durable);
            let operation =
                OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY)?;
            assert_eq!(operation.origin(), archive.identity);
            let (mut authority, mut assets) = operation.into_parts();
            assert_eq!(authority.catchup("late")?, catchup);
            assert_eq!(assets.count(), 4);
            assert_eq!(assets.get(&id)?.ok_or("new raster")?.bytes, bytes);
            assert!(authority.validate_lease("owner", &registration.lease).is_err());
            let lease =
                authority.resume("owner", &registration.lease.writer, &registration.credential)?;
            authority.validate_lease("owner", &lease)?;
            assert_eq!(
                ServerRoomBackup::capture(&mut authority, &mut assets)?.to_bytes()?,
                changed
            );
            for info in archive.assets.info().assets {
                assert!(assets.get(&info.asset)?.is_some());
            }
            for name in [".recovery.json", ".ready.json"] {
                assert_eq!(fs::read(root.join(name))?, before[name]);
            }
            assert_eq!(fs::read(root.join(".operational.json"))?, marker);
            assert_eq!(archive.to_bytes()?, original_file);
            drop(authority);
            drop(assets);
            drop(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY)?);
            assert_eq!(snapshot(&root)?, durable);
        }
    }
    Ok(())
}

#[test]
fn operational_missing_inspection_never_initializes_or_promotes_an_exact_recovery() -> TestResult {
    let directory = Directory::new()?;
    let archive = backup(&directory)?;
    let absent = directory.path("not-created");
    assert!(OperationalServerRoom::resume(&absent, &archive, &archive.identity, POLICY).is_err());
    assert!(!absent.exists());
    let recovered = begin(&directory, &archive)?.finish(&archive)?;
    let root = recovered.root().to_path_buf();
    drop(recovered);
    let before = snapshot(&root)?;
    assert!(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY).is_err());
    assert_eq!(snapshot(&root)?, before);
    let recovered = resume(&directory, &archive)?.finish(&archive)?;
    drop(recovered.begin_operation(&archive, &archive.identity, POLICY)?);
    Ok(())
}

#[test]
fn native_component_locks_remain_exclusive_after_operational_coordinator_handoff() -> TestResult {
    let directory = Directory::new()?;
    let archive = backup(&directory)?;
    let operation = begin(&directory, &archive)?.finish(&archive)?.begin_operation(
        &archive,
        &archive.identity,
        POLICY,
    )?;
    let root = operation.root().to_path_buf();
    let before = snapshot(&root)?;
    assert!(matches!(
        OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY),
        Err(Error::Locked)
    ));
    let (authority, assets) = operation.into_parts();
    assert!(matches!(
        OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY),
        Err(Error::Locked)
    ));
    assert_eq!(snapshot(&root)?, before);
    drop(authority);
    drop(assets);
    drop(OperationalServerRoom::resume(&root, &archive, &archive.identity, POLICY)?);
    Ok(())
}
