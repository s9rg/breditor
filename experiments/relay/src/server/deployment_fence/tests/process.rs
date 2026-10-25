//! Separate operating-system processes must cooperate through the actual file lock.
use super::super::{RoomDeploymentAuthority, RoomDeploymentIdentity, transaction::transaction};
use super::fixture::{Directory, TestResult};
use crate::Error;
use serde_json::{Value, json};
use std::{env, process::Command};
const CHILD: &str = "BREDITOR_FENCE_PROCESS_FIXTURE";
#[test]
fn authority_file_lock_and_epoch_are_real_across_processes() -> TestResult {
    if let Ok(input) = env::var(CHILD) {
        if input.len() > 16384 {
            return Err("child fixture budget".into());
        }
        let value: Value = serde_json::from_str(&input)?;
        let path = std::path::Path::new(value["root"].as_str().ok_or("child root")?);
        let identity: RoomDeploymentIdentity = serde_json::from_value(value["identity"].clone())?;
        let authority = RoomDeploymentAuthority::open(path, &identity)?;
        let choice = authority.current_selection()?;
        if value["mode"] == "busy" {
            assert!(matches!(authority.claim(&choice), Err(Error::Locked)));
        } else if value["mode"] == "claim" {
            let lease = authority.claim(&choice)?;
            lease.check()?;
            assert_eq!(lease.selection().generation, "2");
        } else {
            return Err("child mode".into());
        }
        return Ok(());
    }
    let d = Directory::new()?;
    let a = RoomDeploymentAuthority::create(&d.authority(), &"d".repeat(64))?;
    let first = a.claim(&a.current_selection()?)?;
    let child = |mode: &str| -> TestResult {
        let output = Command::new(env::current_exe()?).args(["--exact", "server::deployment_fence::tests::process::authority_file_lock_and_epoch_are_real_across_processes", "--nocapture", "--test-threads=1"]).env(CHILD, json!({"root":d.authority(),"identity":a.identity(),"mode":mode}).to_string()).output()?;
        assert!(
            output.status.success(),
            "actual child failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        Ok(())
    };
    transaction(Some(&first), || {
        child("busy").map_err(|_| Error::Contract("child lock witness"))?;
        Ok(())
    })?;
    child("claim")?;
    assert!(matches!(first.check(), Err(Error::Lease)));
    assert_eq!(a.current_selection()?.generation, "2");
    let third = a.claim(&a.current_selection()?)?;
    assert_eq!(third.selection().generation, "3");
    third.check()?;
    Ok(())
}
