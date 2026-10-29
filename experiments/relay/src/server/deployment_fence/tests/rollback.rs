//! Actual old epoch bytes must not revive a live handle or erase observed custody.
use super::super::{RoomDeploymentAuthority, transaction::transaction};
use super::fixture::{Directory, TestResult};
use std::{
    fs,
    sync::atomic::{AtomicUsize, Ordering},
};

#[test]
fn an_old_live_lease_cannot_revive_after_its_authority_published_a_later_epoch() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"1".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let _second = authority.claim(&first.selection())?;
    fs::write(&path, &older)?;
    let executed = AtomicUsize::new(0);
    let result = transaction(Some(&first), || {
        executed.fetch_add(1, Ordering::SeqCst);
        Ok(())
    });
    assert!(result.is_err(), "older lease revived before a newer lease was checked");
    assert_eq!(executed.load(Ordering::SeqCst), 0);
    assert_eq!(fs::read(&path)?, older);
    Ok(())
}

#[test]
fn a_lease_that_observed_its_replacement_stays_retired_after_rollback() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"2".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let other = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let _replacement = other.claim(&first.selection())?;
    assert!(first.check().is_err(), "replacement must be observed before the fault");
    fs::write(&path, &older)?;
    let executed = AtomicUsize::new(0);
    let result = transaction(Some(&first), || {
        executed.fetch_add(1, Ordering::SeqCst);
        Ok(())
    });
    assert!(result.is_err(), "observed revocation was forgotten");
    assert_eq!(executed.load(Ordering::SeqCst), 0);
    assert_eq!(fs::read(&path)?, older);
    Ok(())
}

#[test]
fn a_cas_caller_cannot_append_on_top_of_its_own_rolled_back_choice() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"3".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let _second = authority.claim(&first.selection())?;
    fs::write(&path, &older)?;
    assert!(authority.claim(&first.selection()).is_err(), "stale CAS was accepted after rollback");
    assert_eq!(fs::read(&path)?, older);
    Ok(())
}

#[test]
fn a_larger_valid_fork_cannot_replace_a_prefix_this_authority_already_observed() -> TestResult {
    let d = Directory::new()?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &"4".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let path = d.authority().join("authority.log");
    let older = fs::read(&path)?;
    let second = authority.claim(&first.selection())?;
    fs::write(&path, &older)?;
    // A legacy opener has no independent newer pin: it cannot know omitted history.
    let fork = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let other_second = fork.claim(&fork.current_selection()?)?;
    assert_ne!(other_second.selection(), second.selection());
    let _third = fork.claim(&other_second.selection())?;
    let changed = fs::read(&path)?;
    assert!(
        authority.current_selection().is_err(),
        "a larger counter hid a different retained prefix"
    );
    assert_eq!(fs::read(&path)?, changed);
    Ok(())
}
