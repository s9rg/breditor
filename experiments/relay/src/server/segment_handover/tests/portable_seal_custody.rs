//! The exact named portable backup must still exist when the serving source is fenced.
use super::{Barrier, Interruption, Point, Source, TestResult, auth};
use crate::{Error, Role, server::RelaySegmentPortableSeal};
use std::{
    fs,
    sync::{Mutex, mpsc},
    thread,
    time::Duration,
};

#[tokio::test]
async fn seal_refuses_a_displaced_backup_root() -> TestResult {
    protect_named_backup("portable").await
}

#[tokio::test]
async fn seal_refuses_a_displaced_native_lineage() -> TestResult {
    protect_named_backup("portable/native-lineage").await
}

async fn protect_named_backup(named_component: &str) -> TestResult {
    let source = Source::open()?;
    let base = source.capture("base-input")?;
    let (target, approval) = source.approve(&base, &source.parent.join("live-successor"))?;
    let (_router, live, selection) = source.handle.commit_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
    )?;
    let path = source.parent.join("portable");
    let intent = RelaySegmentPortableSeal::select(live.capture_portable_relay_segment(
        "owner",
        &source.token,
        &path,
    )?)?;
    assert_eq!(intent.backup().native_predecessors.len(), 1);
    let named = source.parent.join(named_component);
    let parked = source.parent.join("parked");
    let refused = thread::scope(|scope| -> TestResult<_> {
        let (entered, parked_worker) = mpsc::channel();
        let (proceed, release) = mpsc::channel();
        let pause = Interruption {
            barrier: Some(Barrier {
                point: Point::SourceChecked,
                entered,
                release: Mutex::new(release),
            }),
            ..Interruption::default()
        };
        let live = &live;
        let token = &source.token;
        let path = &path;
        let intent = &intent;
        let worker = scope.spawn(move || {
            live.seal_portable_relay_segment_with_interruption("owner", token, path, intent, &pause)
        });
        parked_worker.recv_timeout(Duration::from_secs(10))?;
        fs::rename(&named, &parked)?;
        proceed.send(())?;
        worker.join().map_err(|_| "portable seal worker panicked".into())
    })?;
    fs::rename(parked, named)?;
    assert!(
        matches!(&refused, Err(Error::Io(io)) if io.kind() == std::io::ErrorKind::NotFound),
        "seal published or failed unexpectedly after displacing {named_component}: {refused:?}"
    );
    assert_eq!(source.authority.current_selection()?, selection);
    live.host.transaction(|room| room.grant("owner", "still-writable", Some(Role::Reader))).await?;

    let retry = source.parent.join("fresh-portable");
    let fresh = RelaySegmentPortableSeal::select(live.capture_portable_relay_segment(
        "owner",
        &source.token,
        &retry,
    )?)?;
    let sealed = live.seal_portable_relay_segment("owner", &source.token, &retry, &fresh)?;
    assert_eq!(sealed, fresh.planned_selection()?);
    assert_eq!(source.authority.current_selection()?, sealed);
    Ok(())
}
