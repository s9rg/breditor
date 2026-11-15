//! Deterministic interleavings at the actual serving transaction and worker-quota boundary.
use super::{Host, verify_then_commit};
use crate::{
    Error, Role,
    assets::AssetStore,
    room::{SegmentHandoverTestFiles, segment_handover_test_source},
    server::{
        Authentication, RoomDeploymentAuthority, router_with_server_backups_and_deployment_lease,
    },
};
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::{Semaphore, oneshot};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const DEADLINE: Duration = Duration::from_secs(10);

struct Fixture {
    host: Host,
    authority: RoomDeploymentAuthority,
    _files: SegmentHandoverTestFiles,
}

impl Fixture {
    fn new() -> TestResult<Self> {
        let (files, room, _) = segment_handover_test_source(3, true, true)?;
        let parent = files.room().parent().ok_or("fixture parent")?.to_owned();
        let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
        let authority = RoomDeploymentAuthority::create(
            &parent.join("authority"),
            &room.deployment_binding()?,
        )?;
        let lease = authority.claim(&authority.current_selection()?)?;
        let (_, token_hash) = Authentication::issue_token()?;
        let auth = Authentication::from_json(
            &json!({
                "format":"breditor/relay-auth","formatVersion":1,
                "origins":["http://127.0.0.1:4100"],
                "accounts":[{"principal":"owner","tokenHash":token_hash}]
            })
            .to_string(),
        )?;
        let (_, handle) =
            router_with_server_backups_and_deployment_lease(room, auth, assets, lease)?;
        Ok(Self { host: handle.host, authority, _files: files })
    }

    fn has_reader(&self, principal: &str) -> TestResult<bool> {
        let room = self.host.room.lock().map_err(|_| "poisoned fixture")?;
        match room.reader(principal) {
            Ok(()) => Ok(true),
            Err(Error::Permission) => Ok(false),
            Err(error) => Err(error.into()),
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn archive_work_leaves_the_room_open_and_a_superseded_epoch_cannot_commit() -> TestResult {
    let fixture = Fixture::new()?;
    let host = fixture.host.clone();
    let permit = host.discussion_operations.clone().try_acquire_owned()?;
    let (started, waiting) = oneshot::channel();
    let (release, parked) = std::sync::mpsc::channel();
    let job = tokio::spawn(async move {
        verify_then_commit(
            &host,
            permit,
            move || {
                started.send(()).map_err(|_| Error::NeedsRecovery)?;
                parked.recv_timeout(DEADLINE).map_err(|_| Error::NeedsRecovery)?;
                Ok(())
            },
            |room, ()| room.grant("owner", "late-archive", Some(Role::Reader)),
        )
        .await
    });

    tokio::time::timeout(DEADLINE, waiting).await??;
    tokio::time::timeout(
        DEADLINE,
        fixture.host.transaction(|room| room.grant("owner", "ordinary-reader", Some(Role::Reader))),
    )
    .await??;
    let authority_path = fixture._files.room().parent().ok_or("fixture parent")?.join("authority");
    let identity = fixture.authority.identity();
    tokio::time::timeout(
        DEADLINE,
        tokio::task::spawn_blocking(move || {
            let next = RoomDeploymentAuthority::open(&authority_path, &identity)?;
            next.claim(&next.current_selection()?)?.check()
        }),
    )
    .await???;
    release.send(())?;
    assert!(matches!(tokio::time::timeout(DEADLINE, job).await??, Err(Error::Lease)));
    assert!(fixture.has_reader("ordinary-reader")?);
    assert!(!fixture.has_reader("late-archive")?);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn abandoning_the_request_retains_quota_until_the_archive_worker_finishes() -> TestResult {
    let fixture = Fixture::new()?;
    let host = fixture.host.clone();
    let quota = Arc::new(Semaphore::new(1));
    let permit = quota.clone().try_acquire_owned()?;
    let (started, waiting) = oneshot::channel();
    let (release, parked) = std::sync::mpsc::channel();
    let job = tokio::spawn(async move {
        verify_then_commit(
            &host,
            permit,
            move || {
                started.send(()).map_err(|_| Error::NeedsRecovery)?;
                parked.recv_timeout(DEADLINE).map_err(|_| Error::NeedsRecovery)?;
                Ok(())
            },
            |room, ()| room.grant("owner", "abandoned-archive", Some(Role::Reader)),
        )
        .await
    });

    tokio::time::timeout(DEADLINE, waiting).await??;
    job.abort();
    assert!(job.await.is_err_and(|error| error.is_cancelled()));
    assert!(quota.clone().try_acquire_owned().is_err());
    release.send(())?;
    let _available = tokio::time::timeout(DEADLINE, quota.acquire_owned()).await??;
    assert!(!fixture.has_reader("abandoned-archive")?);
    Ok(())
}
