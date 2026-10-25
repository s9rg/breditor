use super::super::{RoomDeploymentAuthority, transaction::transaction};
use super::fixture::{Directory, TestResult};
use crate::Error;
use std::fs;
#[test]
fn exact_epoch_cas_fences_existing_leases_without_reissuing_saved_data() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"a".repeat(64))?;
    let zero = a.current_selection()?;
    let first = a.claim(&zero)?;
    first.check()?;
    assert!(matches!(a.claim(&zero), Err(Error::Lease)));
    let other = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let next = other.claim(&other.current_selection()?)?;
    assert!(matches!(first.check(), Err(Error::Lease)));
    next.check()?;
    assert_eq!(next.selection().generation, "2");
    assert_eq!(
        fs::metadata(d.authority().join("authority.log"))?.len(),
        44 + serde_json::to_vec(&a.identity())?.len() as u64 + 208
    );
    Ok(())
}
#[test]
fn native_transaction_holds_actual_fence_until_work_finishes() -> TestResult {
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"b".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let b = RoomDeploymentAuthority::open(&d.authority(), &a.identity())?;
    let selected = b.current_selection()?;
    transaction(Some(&lease), || {
        assert!(matches!(b.claim(&selected), Err(Error::Locked)));
        Ok(())
    })?;
    let next = b.claim(&selected)?;
    next.check()?;
    assert!(lease.check().is_err());
    Ok(())
}
#[test]
fn incomplete_epoch_tail_never_selects_or_truncates_an_older_prefix() -> TestResult {
    use std::io::Write;
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"c".repeat(64))?;
    let lease = a.claim(&a.current_selection()?)?;
    let path = d.authority().join("authority.log");
    fs::OpenOptions::new().append(true).open(&path)?.write_all(&[1, 2, 3])?;
    let before = fs::read(&path)?;
    assert!(lease.check().is_err());
    assert!(a.current_selection().is_err());
    assert!(RoomDeploymentAuthority::open(&d.authority(), &a.identity()).is_err());
    assert_eq!(fs::read(&path)?, before);
    Ok(())
}
