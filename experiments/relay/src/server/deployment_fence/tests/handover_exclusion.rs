//! Deterministic old-write exclusion, with a genuine second-process contender.
use super::super::{RoomDeploymentAuthority, RoomDeploymentIdentity, prepare_host, seal};
use super::fixture::{Directory, TestResult, authentication, room};
use crate::{Error, ServerRoomBackup, assets::AssetStore};
use serde_json::{Value, json};
use std::{
    env, fs,
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
const CHILD: &str = "BREDITOR_HANDOVER_EXCLUSION_FIXTURE";

#[test]
fn source_capture_and_fence_exclude_real_process_claims_and_queued_native_work() -> TestResult {
    if let Ok(input) = env::var(CHILD) {
        if input.len() > 16384 {
            return Err("child input budget".into());
        }
        let row: Value = serde_json::from_str(&input)?;
        let identity: RoomDeploymentIdentity = serde_json::from_value(row["identity"].clone())?;
        assert!(matches!(
            RoomDeploymentAuthority::open(
                std::path::Path::new(row["root"].as_str().ok_or("root")?),
                &identity
            ),
            Err(Error::Locked)
        ));
        return Ok(());
    }
    let d = Directory::new()?;
    let path = d.0.join("source.log");
    let (room, _) = room(&path, 3, true, true)?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let previous = lease.selection();
    let (token, _) = crate::server::Authentication::issue_token()?;
    let host = prepare_host(room, authentication(&token)?, Some(assets), lease.clone())?;
    let expected = {
        let mut room = host.room.lock().map_err(|_| "room mutex")?;
        let mut assets = host.assets.as_ref().ok_or("assets")?.lock().map_err(|_| "asset mutex")?;
        ServerRoomBackup::capture(&mut room, &mut assets)?.info().identity
    };
    let native = fs::read(&path)?;
    // Pin native entry so the sealing worker must visibly hold EXCLUSIVE
    // authority before it can capture. This is not a callback or elapsed sleep.
    let native_entry = host.room.lock().map_err(|_| "room mutex")?;
    let sealing = host.clone();
    let selected = expected.clone();
    let other = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    let worker = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match seal(&sealing, &selected) {
                Err(Error::Locked) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(2));
                }
                result => return result,
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let exclusive = loop {
        match other.current_selection() {
            Err(Error::Locked) => break true,
            Ok(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(2)),
            _ => break false,
        }
    };
    let refused = matches!(other.claim(&previous), Err(Error::Locked));
    let invoked = Arc::new(AtomicUsize::new(0));
    let called = invoked.clone();
    let obsolete = host.clone();
    let pending = std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread().build().map_err(Error::Io)?.block_on(
            obsolete.transaction(move |room| {
                called.fetch_add(1, Ordering::SeqCst);
                room.register("owner")?;
                Ok(())
            }),
        )
    });
    let child = if exclusive {
        Some(Command::new(env::current_exe()?).args(["--exact","server::deployment_fence::tests::handover_exclusion::source_capture_and_fence_exclude_real_process_claims_and_queued_native_work","--nocapture","--test-threads=1"]).env(CHILD,json!({"root":d.authority(),"identity":authority.identity(),"expected":previous}).to_string()).output())
    } else {
        None
    };
    drop(native_entry);
    let (backup, before, sealed) = worker.join().map_err(|_| "sealing thread panic")??;
    let pending = pending.join().map_err(|_| "pending thread panic")?;
    assert!(exclusive, "worker never acquired the real exclusive authority");
    assert!(refused, "independently opened authority claimed during exclusion");
    let child = child.ok_or("child not started")??;
    assert!(child.status.success(), "child failed: {}", String::from_utf8_lossy(&child.stderr));
    assert_eq!(before, previous);
    assert_eq!(sealed, authority.current_selection()?);
    assert_eq!(backup.info().identity, expected);
    assert!(matches!(pending, Err(Error::Lease)));
    assert_eq!(invoked.load(Ordering::SeqCst), 0);
    assert_eq!(fs::read(&path)?, native);
    assert!(matches!(lease.check(), Err(Error::Lease)));
    Ok(())
}
