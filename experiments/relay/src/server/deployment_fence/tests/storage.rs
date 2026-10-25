//! Failure, retirement and namespace laws over actual ledger bytes and native leases.
use super::super::{RoomDeploymentAuthority, transaction::transaction};
use super::fixture::{Directory, TestResult, room};
use crate::Error;
use std::{
    fs,
    io::{Seek, SeekFrom, Write},
    sync::atomic::{AtomicUsize, Ordering},
};
#[test]
fn occupied_creation_and_wrong_outside_pin_never_modify_the_namespace() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"e".repeat(64))?;
    let before = fs::read(d.authority().join("authority.log"))?;
    assert!(RoomDeploymentAuthority::create(&d.authority(), &"e".repeat(64)).is_err());
    let mut wrong = a.identity();
    wrong.authority = "f".repeat(64);
    assert!(RoomDeploymentAuthority::open(&d.authority(), &wrong).is_err());
    assert_eq!(fs::read(d.authority().join("authority.log"))?, before);
    Ok(())
}
#[test]
fn actual_corrupt_and_rolled_back_bytes_refuse_serving_without_repair() -> TestResult {
    for mode in 0..3 {
        let d = Directory::new()?;
        let a = RoomDeploymentAuthority::create(&d.authority(), &"1".repeat(64))?;
        let first = a.claim(&a.current_selection()?)?;
        let old = fs::read(d.authority().join("authority.log"))?;
        let second = a.claim(&a.current_selection()?)?;
        let path = d.authority().join("authority.log");
        let mut bytes = fs::read(&path)?;
        match mode {
            0 => {
                let last = bytes.len() - 1;
                bytes[last] ^= 1;
            }
            1 => bytes = old,
            _ => bytes[20] ^= 1,
        }
        fs::write(&path, &bytes)?;
        assert!(second.check().is_err());
        assert!(
            transaction::<()>(Some(&second), || panic!("invalid epoch must never run native work"))
                .is_err()
        );
        assert_eq!(fs::read(&path)?, bytes);
        drop(first);
    }
    Ok(())
}
#[test]
fn namespace_replacement_cannot_keep_a_live_lease_on_an_old_inode() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"2".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let selected = a.current_selection()?;
    fs::rename(d.authority(), d.0.join("previous-authority"))?;
    let other = RoomDeploymentAuthority::create(&d.authority(), &"2".repeat(64))?;
    assert!(lease.check().is_err());
    assert!(a.claim(&selected).is_err());
    assert_ne!(other.identity(), a.identity());
    Ok(())
}
#[test]
fn uncertain_append_keeps_old_bytes_and_requires_fresh_open_not_a_silent_retry() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"3".repeat(64))?;
    let first = a.claim(&a.current_selection()?)?;
    let choice = a.current_selection()?;
    let path = d.authority().join("authority.log");
    let before = fs::read(&path)?;
    *a.state.file.lock().map_err(|_| "file mutex")? =
        fs::OpenOptions::new().read(true).open(&path)?;
    assert!(a.claim(&choice).is_err());
    assert!(matches!(first.check(), Err(Error::NeedsRecovery)));
    assert!(a.claim(&choice).is_err());
    assert_eq!(fs::read(&path)?, before);
    a.close()?;
    let reopened = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let next = reopened.claim(&reopened.current_selection()?)?;
    assert_eq!(next.selection().generation, "2");
    next.check()?;
    assert!(first.check().is_err());
    Ok(())
}
#[test]
fn authority_retirement_cannot_unlock_in_flight_work_or_reenable_after_cleanup() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"4".repeat(64))?;
    let first = a.claim(&a.current_selection()?)?;
    let other = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let selected = other.current_selection()?;
    let completed = AtomicUsize::new(0);
    assert!(
        transaction(Some(&first), || {
            completed.fetch_add(1, Ordering::SeqCst);
            assert!(matches!(a.close(), Err(Error::Locked)));
            assert!(matches!(other.claim(&selected), Err(Error::Locked)));
            Ok(())
        })
        .is_err()
    );
    assert_eq!(completed.load(Ordering::SeqCst), 1);
    a.close()?;
    a.close()?;
    assert!(first.check().is_err());
    assert!(a.claim(&selected).is_err());
    let next = other.claim(&selected)?;
    next.check()?;
    Ok(())
}
#[test]
fn closed_lease_clones_cannot_run_even_while_the_saved_epoch_is_still_current() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"5".repeat(64))?;
    let first = a.claim(&a.current_selection()?)?;
    let copy = first.clone();
    let selected = first.selection();
    first.close();
    assert!(copy.check().is_err());
    assert_eq!(a.current_selection()?, selected);
    assert!(transaction::<()>(Some(&copy), || panic!("retired epoch must not execute")).is_err());
    Ok(())
}
#[test]
fn same_sized_epoch_rewrite_is_storage_failure_not_a_client_lease_problem() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"6".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let mut file = fs::OpenOptions::new().write(true).open(&path)?;
    file.seek(SeekFrom::End(-64))?;
    file.write_all(&[255])?;
    assert!(matches!(transaction(Some(&lease), || Ok(())), Err(Error::NeedsRecovery)));
    Ok(())
}
#[test]
fn immutable_room_binding_distinguishes_every_supported_profile_and_transport() -> TestResult {
    let d = Directory::new()?;
    let mut seen = std::collections::BTreeSet::new();
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (room, _) = room(
                &d.0.join(format!("room-{version}-{standard}-{atomic}.log")),
                version,
                standard,
                atomic,
            )?;
            assert!(seen.insert(room.deployment_binding()?));
        }
    }
    assert_eq!(seen.len(), 10);
    Ok(())
}

#[test]
fn panic_poison_retires_work_but_keeps_explicit_cleanup_available() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"7".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let before = fs::read(d.authority().join("authority.log"))?;
    let panicked = std::panic::catch_unwind(|| {
        transaction::<()>(Some(&lease), || panic!("owned native panic"))
    });
    assert!(panicked.is_err());
    assert!(matches!(lease.check(), Err(Error::NeedsRecovery)));
    assert!(a.current_selection().is_err());
    a.close()?;
    assert_eq!(fs::read(d.authority().join("authority.log"))?, before);
    let reopened = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let next = reopened.claim(&reopened.current_selection()?)?;
    next.check()?;
    assert!(lease.check().is_err());
    Ok(())
}

#[test]
fn exhausted_epoch_geometry_refuses_before_replay_or_append() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"8".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let choice = lease.selection();
    let path = d.authority().join("authority.log");
    let original = fs::read(&path)?;
    let length =
        a.state.offset + (super::super::journal::MAX_CLAIMS + 1) * super::super::journal::FRAME;
    fs::OpenOptions::new().write(true).open(&path)?.set_len(length)?;
    assert!(a.current_selection().is_err());
    assert!(a.claim(&choice).is_err());
    assert!(
        transaction::<()>(Some(&lease), || panic!("exhausted namespace must not serve")).is_err()
    );
    assert_eq!(fs::metadata(&path)?.len(), length);
    let mut actual = vec![0; original.len()];
    std::io::Read::read_exact(&mut fs::File::open(&path)?, &mut actual)?;
    assert_eq!(actual, original);
    Ok(())
}

#[test]
fn authority_replaced_during_durable_native_work_cannot_publish_a_success() -> TestResult {
    let d = Directory::new()?;
    let path = d.0.join("room.log");
    let (mut native, _) = room(&path, 3, true, true)?;
    let binding = native.deployment_binding()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &binding)?;
    let lease = a.claim(&a.current_selection()?)?;
    let ledger = fs::read(d.authority().join("authority.log"))?;
    let before = fs::read(&path)?;
    let result = transaction(Some(&lease), || {
        native.grant("owner", "peer", Some(crate::Role::Editor))?;
        fs::rename(d.authority(), d.0.join("previous-authority"))?;
        let replacement = RoomDeploymentAuthority::create(&d.authority(), &binding)?;
        assert_ne!(replacement.identity(), a.identity());
        Ok(())
    });
    assert!(matches!(result, Err(Error::NeedsRecovery)), "changed authority returned {result:?}");
    assert_ne!(fs::read(&path)?, before, "already durable native work must not be rolled back");
    assert_eq!(fs::read(d.0.join("previous-authority/authority.log"))?, ledger);
    // Even if a host restores the original path afterward, this uncertain local
    // instance stays retired. Fresh independent opening remains a separate act.
    fs::rename(d.authority(), d.0.join("replacement-authority"))?;
    fs::rename(d.0.join("previous-authority"), d.authority())?;
    assert!(matches!(lease.check(), Err(Error::NeedsRecovery)));
    a.close()?;
    Ok(())
}
