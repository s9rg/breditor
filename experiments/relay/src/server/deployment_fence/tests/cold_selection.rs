//! Independent cold pins, actual append-only histories and unchanged native data.
use super::super::{RoomDeploymentAuthority, transaction::transaction};
use super::fixture::{Directory, TestResult, room};
use std::fs;

#[test]
fn a_cold_minimum_pin_refuses_an_older_complete_prefix_without_repair() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"5".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let pin = authority.claim(&first.selection())?.selection();
    authority.close()?;
    fs::write(&path, &older)?;
    assert!(RoomDeploymentAuthority::open_at_least(&d.authority(), &pin).is_err());
    assert_eq!(fs::read(&path)?, older);
    Ok(())
}

#[test]
fn a_cold_pin_allows_later_valid_epochs_but_still_requires_a_new_claim() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"6".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let pin = first.selection();
    let second = authority.claim(&pin)?;
    let current = second.selection();
    authority.close()?;
    let reopened = RoomDeploymentAuthority::open_at_least(&d.authority(), &pin)?;
    assert_eq!(reopened.current_selection()?, current);
    let fresh = reopened.claim(&current)?;
    assert_eq!(fresh.selection().generation, "3");
    fresh.check()?;
    assert!(first.check().is_err());
    assert!(second.check().is_err());
    Ok(())
}

#[test]
fn a_cold_pin_checks_the_retained_nonce_even_beneath_a_larger_valid_counter() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"7".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let pin = authority.claim(&first.selection())?.selection();
    authority.close()?;
    fs::write(&path, &older)?;
    let fork = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let other = fork.claim(&fork.current_selection()?)?;
    assert_ne!(other.selection(), pin);
    let _later = fork.claim(&other.selection())?;
    fork.close()?;
    let bytes = fs::read(&path)?;
    assert!(RoomDeploymentAuthority::open_at_least(&d.authority(), &pin).is_err());
    assert_eq!(fs::read(&path)?, bytes);
    Ok(())
}

#[test]
fn cold_open_rejects_wrong_namespaces_and_noncanonical_choices_without_mutation() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"8".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let pin = first.selection();
    let before = fs::read(d.authority().join("authority.log"))?;
    for mode in 0..7 {
        let mut wrong = pin.clone();
        match mode {
            0 => wrong.generation = "01".into(),
            1 => wrong.owner = None,
            2 => wrong.owner = Some("z".repeat(64)),
            3 => wrong.generation = "1048577".into(),
            4 => wrong.generation = "0".into(),
            5 => wrong.identity.authority = "f".repeat(64),
            _ => {
                wrong.generation = "-1".into();
            }
        }
        assert!(RoomDeploymentAuthority::open_at_least(&d.authority(), &wrong).is_err());
        assert_eq!(fs::read(d.authority().join("authority.log"))?, before);
    }
    Ok(())
}

#[test]
fn a_pinned_opener_keeps_the_newer_head_it_actually_observed() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"9".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let _second = authority.claim(&first.selection())?;
    let reopened = RoomDeploymentAuthority::open_at_least(&d.authority(), &first.selection())?;
    fs::write(&path, &older)?;
    assert!(reopened.current_selection().is_err());
    assert!(reopened.claim(&first.selection()).is_err());
    assert_eq!(fs::read(&path)?, older);
    Ok(())
}

#[test]
fn valid_foreign_advancement_remains_usable_after_a_stale_choice_refuses() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"a".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let observer = RoomDeploymentAuthority::open_at_least(&d.authority(), &first.selection())?;
    let second = authority.claim(&first.selection())?;
    assert!(observer.claim(&first.selection()).is_err());
    assert_eq!(observer.current_selection()?, second.selection());
    let third = observer.claim(&second.selection())?;
    third.check()?;
    assert!(first.check().is_err());
    assert!(second.check().is_err());
    Ok(())
}

#[test]
fn witnessed_rollback_cannot_run_a_real_durable_native_write() -> TestResult {
    let d = Directory::new()?;
    let path = d.0.join("room.log");
    let (mut native, _) = room(&path, 3, true, true)?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &native.deployment_binding()?)?;
    let first = authority.claim(&authority.current_selection()?)?;
    let ledger = d.authority().join("authority.log");
    let older = fs::read(&ledger)?;
    let _second = authority.claim(&first.selection())?;
    let before = fs::read(&path)?;
    fs::write(&ledger, &older)?;
    assert!(
        transaction(Some(&first), || native.grant(
            "owner",
            "must-not-exist",
            Some(crate::Role::Reader)
        ))
        .is_err()
    );
    assert_eq!(fs::read(&path)?, before);
    assert_eq!(fs::read(&ledger)?, older);
    assert!(native.catchup("must-not-exist").is_err());
    Ok(())
}
