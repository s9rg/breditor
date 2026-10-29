//! Actual guard ownership, not a sleep or cached attached flag.
use super::HostDeployment;
use crate::Error;
use std::sync::{TryLockError, mpsc};
use std::time::Duration;

#[test]
fn admitted_work_holds_the_shared_attachment_gate_until_it_settles() {
    let source = HostDeployment::unfenced();
    let worker = source.clone();
    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let task = std::thread::spawn(move || {
        worker.transaction(|| {
            entered_tx.send(()).map_err(|_| Error::NeedsRecovery)?;
            release_rx.recv_timeout(Duration::from_secs(5)).map_err(|_| Error::NeedsRecovery)?;
            Ok(())
        })
    });
    entered_rx.recv_timeout(Duration::from_secs(5)).expect("actual admission");
    assert!(matches!(source.state.try_write(), Err(TryLockError::WouldBlock)));
    release_tx.send(()).expect("release actual work");
    task.join().expect("worker join").expect("worker settled");
    assert!(source.state.try_write().is_ok());
}

#[test]
fn a_poisoned_attachment_gate_never_falls_back_to_unfenced_work() {
    let source = HostDeployment::unfenced();
    let state = source.state.clone();
    let failure = std::thread::spawn(move || {
        let _held = state.write().expect("exclusive attachment guard");
        panic!("test attachment uncertainty");
    });
    assert!(failure.join().is_err());
    let mut touched = false;
    assert!(matches!(
        source.transaction(|| {
            touched = true;
            Ok(())
        }),
        Err(Error::NeedsRecovery)
    ));
    assert!(!touched);
    assert!(matches!(
        source.fenced(|_| {
            touched = true;
            Ok(())
        }),
        Err(Error::NeedsRecovery)
    ));
    assert!(!touched);
}

#[test]
fn an_explicit_legacy_host_still_has_no_fenced_source_capability() {
    let source = HostDeployment::unfenced();
    assert_eq!(source.transaction(|| Ok(7)).expect("legacy transaction"), 7);
    let mut touched = false;
    assert!(matches!(
        source.fenced(|_| {
            touched = true;
            Ok(())
        }),
        Err(Error::Contract("fenced source host required"))
    ));
    assert!(!touched);
}
