//! The exact named portable backup must still exist when the serving source is fenced.
use super::{Barrier, Interruption, Point, Source, TestResult, auth};
use crate::{
    Error, Role,
    server::{RelaySegmentPortableBackupIdentity, RelaySegmentPortableSeal, ServerBackupHandle},
};
use std::{
    fs,
    path::Path,
    sync::{Mutex, mpsc},
    thread,
    time::Duration,
};

#[tokio::test]
async fn seal_refuses_a_displaced_backup_root() -> TestResult {
    protect_named_backup("portable", ServerBackupHandle::capture_portable_relay_segment).await
}

#[tokio::test]
async fn seal_refuses_a_displaced_native_lineage() -> TestResult {
    protect_named_backup(
        "portable/native-lineage",
        ServerBackupHandle::capture_portable_relay_segment,
    )
    .await
}

#[tokio::test]
async fn seal_refuses_a_displaced_packed_client_archive() -> TestResult {
    protect_named_backup(
        "portable/client-inputs.bin",
        ServerBackupHandle::capture_fully_packed_portable_relay_segment,
    )
    .await
}

#[tokio::test]
async fn seal_refuses_a_late_unexpected_file_in_packed_native_lineage() -> TestResult {
    for capture in [
        ServerBackupHandle::capture_fully_packed_portable_relay_segment as Capture,
        ServerBackupHandle::capture_portable_relay_segment_with_compressed_checkpoints,
    ] {
        protect_backup(
            capture,
            |parent| {
                fs::write(parent.join("portable/native-lineage/unexpected"), b"extra")?;
                Ok(())
            },
            |error| matches!(error, Error::Contract("packed lineage contains unexpected files")),
        )
        .await?;
    }
    Ok(())
}

type Capture =
    fn(&ServerBackupHandle, &str, &str, &Path) -> crate::Result<RelaySegmentPortableBackupIdentity>;

async fn protect_named_backup(named_component: &str, capture: Capture) -> TestResult {
    protect_backup(
        capture,
        |parent| {
            fs::rename(parent.join(named_component), parent.join("parked"))?;
            Ok(())
        },
        |error| matches!(error, Error::Io(io) if io.kind() == std::io::ErrorKind::NotFound),
    )
    .await
}

async fn protect_backup(
    capture: Capture,
    change: impl FnOnce(&Path) -> TestResult<()>,
    expected: impl FnOnce(&Error) -> bool,
) -> TestResult {
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
    let intent = RelaySegmentPortableSeal::select(capture(&live, "owner", &source.token, &path)?)?;
    assert_eq!(intent.backup().native_predecessors.len(), 1);
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
        change(&source.parent)?;
        proceed.send(())?;
        worker.join().map_err(|_| "portable seal worker panicked".into())
    })?;
    assert!(
        refused.as_ref().is_err_and(expected),
        "seal published or failed unexpectedly after the backup changed: {refused:?}"
    );
    assert_eq!(source.authority.current_selection()?, selection);
    live.host.transaction(|room| room.grant("owner", "still-writable", Some(Role::Reader))).await?;

    let retry = source.parent.join("fresh-portable");
    let fresh = RelaySegmentPortableSeal::select(capture(&live, "owner", &source.token, &retry)?)?;
    let sealed = live.seal_portable_relay_segment("owner", &source.token, &retry, &fresh)?;
    assert_eq!(sealed, fresh.planned_selection()?);
    assert_eq!(source.authority.current_selection()?, sealed);
    Ok(())
}
