use super::{POLICY, Source, TestResult};
use crate::{Error, Role, server::RelaySegmentDiscussionBackup};
use std::{sync::mpsc, time::Duration};

#[test]
fn bundled_capture_with_no_sources_reopens_and_a_superseded_host_cannot_create_another()
-> TestResult {
    let source = Source::open()?;
    let path = source.parent.join("discussion-backup");
    let expected = source.handle.capture_relay_segment_with_discussion_sources(
        "owner",
        &source.token,
        &path,
    )?;
    assert_eq!(expected.source_epoch, source.lease.selection());
    assert!(expected.discussion_sources.is_empty());
    assert!(!path.join("discussion-sources").exists());
    let opened = RelaySegmentDiscussionBackup::open(&path, None, &expected)?;
    assert_eq!(opened.backup.identity(), &expected.backup);
    assert!(opened.discussion_sources.is_empty());
    assert!(opened.backup.required_recovered_discussion_sources()?.is_empty());
    let _next = source.authority.claim(&source.authority.current_selection()?)?;
    let absent = source.parent.join("superseded-discussion-backup");
    assert!(matches!(
        source.handle.capture_relay_segment_with_discussion_sources(
            "owner",
            &source.token,
            &absent
        ),
        Err(Error::Lease)
    ));
    assert!(!absent.exists());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_live_write_can_finish_during_backup_copy_and_stays_outside_the_cut() -> TestResult {
    let source = Source::open()?;
    let path = source.parent.join("discussion-backup");
    let handle = source.handle.clone();
    let token = source.token.clone();
    let destination = path.clone();
    let (started, waiting) = tokio::sync::oneshot::channel();
    let (release, parked) = mpsc::channel();
    let job = tokio::task::spawn_blocking(move || {
        handle.capture_discussion_backup("owner", &token, &destination, || {
            started.send(()).map_err(|()| Error::NeedsRecovery)?;
            parked.recv_timeout(Duration::from_secs(30)).map_err(|_| Error::NeedsRecovery)
        })
    });

    tokio::time::timeout(Duration::from_secs(15), waiting).await??;
    let ordinary_write = tokio::time::timeout(
        Duration::from_secs(5),
        source
            .handle
            .host
            .transaction(|room| room.grant("owner", "post-backup-cut", Some(Role::Reader))),
    )
    .await;
    release.send(())?;
    let expected = tokio::time::timeout(Duration::from_secs(15), job).await???;
    ordinary_write.map_err(|_| "live room write was blocked by the archive copy")??;
    let opened = RelaySegmentDiscussionBackup::open(&path, None, &expected)?;
    let restored = opened.backup.restore(&source.parent.join("restored"), "restored", POLICY)?;
    assert!(matches!(restored.components().0.catchup("post-backup-cut"), Err(Error::Permission)));
    source.handle.host.transaction(|room| room.catchup("post-backup-cut")).await?;
    Ok(())
}

#[test]
fn an_epoch_replacement_can_proceed_during_copy_and_prevents_backup_confirmation() -> TestResult {
    let source = Source::open()?;
    let path = source.parent.join("interrupted-backup");
    let result = source.handle.capture_discussion_backup("owner", &source.token, &path, || {
        let prior = source.authority.current_selection()?;
        source.authority.claim(&prior)?.check()
    });
    assert!(matches!(result, Err(Error::Lease)));
    assert_ne!(source.authority.current_selection()?, source.lease.selection());
    assert!(path.join("native.archive").is_file());
    Ok(())
}
