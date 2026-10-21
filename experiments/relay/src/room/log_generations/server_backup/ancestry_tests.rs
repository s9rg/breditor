//! Pure complete archive containment, including byte-valid forks and unpublished physical work.
use super::super::server_recovery::tests::source;
use super::ServerLogGenerationRoomBackup;
use crate::{
    Role, RoomRecoveryPolicy, ServerLogGenerationRoomRecovery,
    log::generations::{verify_archive_ancestor, verify_generation_files},
};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn all_ten_transports_accept_self_active_growth_and_rotation_but_not_physical_reversal()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (_files, mut room, mut assets, _) = source(version, standard, atomic)?;
            let a = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
            a.check_archive_ancestor(&a)?;
            room.grant("owner", "new-reader", Some(Role::Reader))?;
            let b = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
            b.check_archive_ancestor(&a)?;
            assert!(a.check_archive_ancestor(&b).is_err());
            room.rotate_log_generation("owner", "three")?;
            let c = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
            assert_eq!(b.info()?.identity.native.source, c.info()?.identity.native.source);
            assert_ne!(b.info()?.identity.native.manifest, c.info()?.identity.native.manifest);
            c.check_archive_ancestor(&a)?;
            c.check_archive_ancestor(&b)?;
            assert!(b.check_archive_ancestor(&c).is_err());
        }
    }
    Ok(())
}

#[test]
fn two_individually_admitted_active_forks_are_not_ancestor_and_descendant() -> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let base = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    room.grant("owner", "left-reader", Some(Role::Reader))?;
    let left = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let mut right = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &base,
        &base.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&base)?;
    let (room, assets) = right.components_mut();
    room.grant("owner", "right-reader", Some(Role::Reader))?;
    let right = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    assert_eq!(left.info()?.identity.native.manifest, right.info()?.identity.native.manifest);
    assert_eq!(
        left.info()?.identity.native.source.records,
        right.info()?.identity.native.source.records
    );
    for value in [&left, &right] {
        value.check_archive_ancestor(&base)?;
        ServerLogGenerationRoomBackup::from_owned_bytes(value.to_bytes()?)?;
    }
    assert!(left.check_archive_ancestor(&right).is_err());
    assert!(right.check_archive_ancestor(&left).is_err());
    Ok(())
}

#[test]
fn transport_valid_stage_loss_or_change_is_not_containment_and_closed_bytes_are_never_optional()
-> TestResult {
    let (_files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let base = backup.native.selected_files()?;
    let name = format!(".stage-{}", "e".repeat(64));
    let mut ancestor = base.clone();
    ancestor.insert(&name, b"retained work");
    verify_generation_files(&ancestor)?;
    verify_generation_files(&base)?;
    assert!(verify_archive_ancestor(&base, &ancestor).is_err());
    let mut current = ancestor.clone();
    current.insert(&name, b"changed retained work");
    verify_generation_files(&current)?;
    assert!(verify_archive_ancestor(&current, &ancestor).is_err());
    verify_archive_ancestor(&ancestor, &base)?;
    verify_archive_ancestor(&ancestor, &ancestor)?;
    let closed = base
        .iter()
        .find(|(name, bytes)| name.starts_with("g-") && !bytes.is_empty())
        .map(|(name, _)| *name)
        .ok_or("closed native file")?;
    let mut missing = ancestor.clone();
    missing.remove(closed);
    assert!(verify_archive_ancestor(&missing, &ancestor).is_err());
    let mut corrupt = ancestor.clone();
    corrupt.insert(closed, b"different closed file");
    assert!(verify_archive_ancestor(&corrupt, &ancestor).is_err());
    Ok(())
}
