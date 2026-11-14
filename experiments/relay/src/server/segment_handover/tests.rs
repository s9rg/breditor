use super::RelaySegmentHandoverApproval;
use crate::{
    Error, RecoveredRelaySegmentRoom, RelaySegmentBaseFile, RelaySegmentRoomBackupFiles, Role,
    RoomRecoveryPolicy,
    assets::{AssetStore, asset_id, prepare_asset},
    room::{SegmentHandoverTestFiles, segment_handover_test_source},
    server::{
        Authentication, RoomDeploymentAuthority, RoomDeploymentLease, ServerBackupHandle,
        deployment_fence::commit_segment_handover,
        generation_backup::durable::{Barrier, Interruption, Point},
        router_with_server_backups_and_deployment_lease,
    },
};
use serde_json::json;
use std::{
    fs::File,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

mod client_rasters;
mod verified_inputs;

struct Source {
    _files: SegmentHandoverTestFiles,
    parent: PathBuf,
    authority: RoomDeploymentAuthority,
    lease: RoomDeploymentLease,
    handle: ServerBackupHandle,
    token: String,
}

impl Source {
    fn open() -> TestResult<Self> {
        let (files, room, _) = segment_handover_test_source(3, true, true)?;
        let parent = files.room().parent().ok_or("fixture parent")?.to_owned();
        let assets = AssetStore::open(&parent.join("rasters"), room.asset_binding())?;
        let authority = RoomDeploymentAuthority::create(
            &parent.join("authority"),
            &room.deployment_binding()?,
        )?;
        let lease = authority.claim(&authority.current_selection()?)?;
        let (token, _) = Authentication::issue_token()?;
        let (_, handle) = router_with_server_backups_and_deployment_lease(
            room,
            auth(&token)?,
            assets,
            lease.clone(),
        )?;
        Ok(Self { _files: files, parent, authority, lease, handle, token })
    }

    fn capture(&self, name: &str) -> TestResult<RelaySegmentRoomBackupFiles> {
        let directory = self.parent.join(name);
        let (id, previous) = self.handle.capture_relay_segment("owner", &self.token, &directory)?;
        assert_eq!(previous, self.lease.selection());
        let native = Arc::new(RelaySegmentBaseFile::open(
            File::open(directory.join("native.archive"))?,
            File::open(directory.join("native.checkpoint"))?,
            &id.native,
        )?);
        Ok(RelaySegmentRoomBackupFiles::open(
            native,
            File::open(directory.join("rasters.archive"))?,
            &id,
        )?)
    }

    fn approve(
        &self,
        backup: &RelaySegmentRoomBackupFiles,
        path: &Path,
    ) -> TestResult<(RecoveredRelaySegmentRoom, RelaySegmentHandoverApproval)> {
        let restore = backup.restore(path, "new", POLICY)?;
        let approval = RelaySegmentHandoverApproval::select(
            &restore,
            backup.identity().clone(),
            self.lease.selection(),
        )?;
        Ok((restore, approval))
    }
}

fn auth(token: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(
        &json!({
            "format":"breditor/relay-auth", "formatVersion":1, "origins":["http://127.0.0.1:4187"],
            "accounts":[{"principal":"owner", "tokenHash": crate::credentials::hash(token)?}],
        })
        .to_string(),
    )?)
}

#[test]
fn takeover_requires_current_owner_approval_and_an_untouched_completed_target() -> TestResult {
    let source = Source::open()?;
    let backup = source.capture("before")?;
    let path = source.parent.join("target");
    let (target, approval) = source.approve(&backup, &path)?;
    assert!(matches!(
        target.resume_handover(
            auth(&source.token)?,
            "owner",
            &source.token,
            &source.authority,
            &approval,
            approval.previous_selection(),
        ),
        Err(Error::Lease)
    ));

    let target = backup.reopen(&path, POLICY)?;
    let (different_token, _) = Authentication::issue_token()?;
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&different_token)?,
            &approval,
        ),
        Err(Error::Permission)
    ));

    let mut target = backup.reopen(&path, POLICY)?;
    target.components_mut().0.grant("owner", "target-only", Some(Role::Reader))?;
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &approval,
        ),
        Err(Error::Contract("relay segment handover target advanced"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    backup.reopen(&path, POLICY)?.components().0.catchup("target-only")?;
    source.lease.check()?;
    Ok(())
}

#[tokio::test]
async fn stale_native_and_raster_approvals_append_no_epoch() -> TestResult {
    let source = Source::open()?;
    assert!(matches!(
        source.handle.capture_relay_segment("owner", "invalid", &source.parent.join("invalid")),
        Err(Error::Permission)
    ));
    assert!(!source.parent.join("invalid").exists());
    let backup = source.capture("before")?;
    let (target, approval) = source.approve(&backup, &source.parent.join("target"))?;
    source
        .handle
        .host
        .transaction(|room| room.grant("owner", "new-reader", Some(Role::Reader)))
        .await?;
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &approval,
        ),
        Err(Error::Contract("relay segment handover source cut changed"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());

    let backup = source.capture("before-raster")?;
    let (target, approval) = source.approve(&backup, &source.parent.join("target-raster"))?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgba8(1, 1).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let asset = prepare_asset(&asset_id(&png), "image/png", png)?;
    let store = source.handle.host.assets.clone().ok_or("source assets")?;
    source
        .handle
        .host
        .transaction(move |room| {
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset("owner", &mut store, asset)
        })
        .await?;
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &approval,
        ),
        Err(Error::Contract("relay segment handover source cut changed"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    source.lease.check()?;
    Ok(())
}

#[tokio::test]
async fn replacement_epoch_excludes_other_claims_and_cold_resumes_after_interruption() -> TestResult
{
    let source = Source::open()?;
    let backup = source.capture("original")?;
    let path = source.parent.join("target");
    let (target, approve) = source.approve(&backup, &path)?;
    let other_path = source.parent.join("different-target");
    let other = backup.restore(&other_path, "new", POLICY)?;
    assert!(approve.check_target(&other).is_err());
    drop(other);
    let contender = RoomDeploymentAuthority::open(
        &source.parent.join("authority"),
        &source.authority.identity(),
    )?;
    let (entered, reached) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let stop = Interruption {
        barrier: Some(Barrier {
            point: Point::SourceChecked,
            entered,
            release: Mutex::new(released),
        }),
        stop: Some(Point::EpochWritten),
        exit_process: false,
    };
    let old = source.handle.host.clone();
    let approved = approve.clone();
    let worker = tokio::task::spawn_blocking(move || {
        commit_segment_handover(&old, "owner", &target, &approved, None, &stop).map(|_| ())
    });
    let held = reached.recv_timeout(Duration::from_secs(10));
    let concurrent = contender.claim(&source.lease.selection());
    release.send(())?;
    held?;
    assert!(matches!(concurrent, Err(Error::Locked)));
    assert!(matches!(
        worker.await?,
        Err(Error::Contract("injected durable handover interruption"))
    ));
    let first = approve.planned_selection()?;
    assert_eq!(contender.current_selection()?, first);
    assert!(matches!(
        source.handle.host.transaction(|room| room.register("owner")).await,
        Err(Error::Lease)
    ));
    let target = backup.reopen(&path, POLICY)?;
    let (_, successor, current) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &contender,
        &approve,
        &first,
    )?;
    successor.host.transaction(|room| room.grant("owner", "resumed", Some(Role::Reader))).await?;
    let _ = successor.capture_relay_segment(
        "owner",
        &source.token,
        &source.parent.join("recapture"),
    )?;
    drop(successor);
    let target = backup.reopen(&path, POLICY)?;
    target.components().0.catchup("resumed")?;
    let (_, successor, latest) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &contender,
        &approve,
        &current,
    )?;
    drop(successor);
    let unrelated = contender.claim(&latest)?;
    let target = backup.reopen(&path, POLICY)?;
    assert!(matches!(
        target.resume_handover(
            auth(&source.token)?,
            "owner",
            &source.token,
            &contender,
            &approve,
            &unrelated.selection(),
        ),
        Err(Error::Lease)
    ));
    Ok(())
}
