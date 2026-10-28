//! Native seal races and uncertain append failures preserve whole original sources.
use super::super::{RoomDeploymentAuthority, prepare_host, seal};
use super::fixture::{Directory, TestResult, authentication, room};
use crate::{Error, ServerRoomBackup, assets::AssetStore};
use std::{
    fs,
    sync::{Arc, Barrier},
};

#[test]
fn simultaneous_seals_append_one_epoch_and_neither_changes_accepted_data() -> TestResult {
    for _ in 0..20 {
        let d = Directory::new()?;
        let (mut room, _) = room(&d.0.join("source.log"), 3, true, true)?;
        room.register("owner")?;
        let mut assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
        let backup = ServerRoomBackup::capture(&mut room, &mut assets)?;
        let selected = backup.info().identity;
        let before = fs::read(d.0.join("source.log"))?;
        let authority =
            RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
        let lease = authority.claim(&authority.current_selection()?)?;
        let ledger = fs::read(d.authority().join("authority.log"))?;
        let (token, _) = crate::server::Authentication::issue_token()?;
        let host = prepare_host(room, authentication(&token)?, Some(assets), lease)?;
        let start = Arc::new(Barrier::new(3));
        let first_host = host.clone();
        let first_cut = selected.clone();
        let first_start = start.clone();
        let first = std::thread::spawn(move || {
            first_start.wait();
            seal(&first_host, &first_cut)
        });
        let second_host = host.clone();
        let second_cut = selected.clone();
        let second_start = start.clone();
        let second = std::thread::spawn(move || {
            second_start.wait();
            seal(&second_host, &second_cut)
        });
        start.wait();
        let a = first.join().map_err(|_| "first thread panic")?;
        let b = second.join().map_err(|_| "second thread panic")?;
        assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
        let (accepted, rejected) = if a.is_ok() { (a, b) } else { (b, a) };
        assert!(matches!(rejected, Err(Error::Locked | Error::Lease)));
        let (actual, _, sealed) = accepted?;
        assert_eq!(actual.to_bytes()?, backup.to_bytes()?);
        assert_eq!(actual.info().identity, selected);
        assert_eq!(sealed, authority.current_selection()?);
        assert_eq!(sealed.generation, "2");
        assert_eq!(
            fs::metadata(d.authority().join("authority.log"))?.len(),
            ledger.len() as u64 + 104
        );
        assert_eq!(fs::read(d.0.join("source.log"))?, before);
    }
    Ok(())
}
#[test]
fn failed_seal_append_poisons_actual_authority_without_truncating_native_or_raster_sources()
-> TestResult {
    let d = Directory::new()?;
    let (mut room, _) = room(&d.0.join("source.log"), 3, true, true)?;
    room.register("owner")?;
    let mut assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let backup = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let expected = backup.info().identity;
    let source = fs::read(d.0.join("source.log"))?;
    let authority = RoomDeploymentAuthority::create(&d.authority(), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let previous = lease.selection();
    let path = d.authority().join("authority.log");
    let ledger = fs::read(&path)?;
    let (token, _) = crate::server::Authentication::issue_token()?;
    let host = prepare_host(room, authentication(&token)?, Some(assets), lease.clone())?;
    // Actual descriptor permissions fail the real write after exact capture;
    // no replacement fsync implementation or simulated acknowledgement is used.
    *authority.state.file.lock().map_err(|_| "authority mutex")? =
        fs::OpenOptions::new().read(true).open(&path)?;
    assert!(matches!(seal(&host, &expected), Err(Error::Io(_))));
    assert!(matches!(lease.check(), Err(Error::NeedsRecovery)));
    assert!(matches!(seal(&host, &expected), Err(Error::NeedsRecovery)));
    assert_eq!(fs::read(d.0.join("source.log"))?, source);
    assert_eq!(fs::read(&path)?, ledger);
    let mut room = host.room.lock().map_err(|_| "room mutex")?;
    let mut assets = host.assets.as_ref().ok_or("assets")?.lock().map_err(|_| "asset mutex")?;
    assert_eq!(ServerRoomBackup::capture(&mut room, &mut assets)?.to_bytes()?, backup.to_bytes()?);
    let reopened = RoomDeploymentAuthority::open(&d.authority(), &authority.identity())?;
    assert_eq!(reopened.current_selection()?, previous);
    // Reopening can inspect known exact old bytes, but it never revives the
    // poisoned old lease or silently issues another serving epoch.
    assert!(matches!(lease.check(), Err(Error::NeedsRecovery)));
    Ok(())
}
