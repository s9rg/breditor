use super::{POLICY, Source, TestResult, auth};
use crate::{
    Error, Role,
    server::{
        RelaySegmentHandoverApproval, RelaySegmentPortableBackupIdentity,
        RelaySegmentRetainedBackup,
    },
};
use std::fs;

#[tokio::test]
async fn reopens_two_native_predecessors_from_the_portable_copy() -> TestResult {
    let source = Source::open()?;
    let separate_root = source.parent.join("separate-root");
    let root = source.capture("separate-root")?;
    let (first, approval) = source.approve(&root, &source.parent.join("live-first"))?;
    let (first_router, first_host, first_epoch) = source.handle.commit_relay_segment_handover(
        "owner",
        &source.token,
        first,
        auth(&source.token)?,
        &approval,
    )?;
    first_host
        .host
        .transaction(|room| room.grant("owner", "first-reader", Some(Role::Reader)))
        .await?;

    let separate_first = source.parent.join("separate-first");
    let first_identity =
        first_host.capture_portable_relay_segment("owner", &source.token, &separate_first)?;
    assert_eq!(first_identity.native_predecessors, [root.identity().native.clone()]);
    let first_backup = RelaySegmentRetainedBackup::open_portable(&separate_first, &first_identity)?;
    let second = first_backup.restore(&source.parent.join("live-second"), "second", POLICY)?;
    let approval = RelaySegmentHandoverApproval::select(
        &second,
        first_identity.retained.backup.clone(),
        first_epoch,
    )?;
    let (second_router, second_host, second_epoch) = first_host.commit_relay_segment_handover(
        "owner",
        &source.token,
        second,
        auth(&source.token)?,
        &approval,
    )?;
    second_host
        .host
        .transaction(|room| room.grant("owner", "second-reader", Some(Role::Reader)))
        .await?;

    let portable = source.parent.join("portable");
    let identity = second_host.capture_portable_relay_segment("owner", &source.token, &portable)?;
    assert_eq!(identity.retained.source_epoch, second_epoch);
    assert_eq!(
        identity.native_predecessors,
        [root.identity().native.clone(), first_identity.retained.backup.native.clone(),]
    );
    let saved: RelaySegmentPortableBackupIdentity =
        serde_json::from_slice(&serde_json::to_vec(&identity)?)?;
    drop((root, first_backup, first_router, first_host, second_router, second_host));
    fs::rename(separate_root, source.parent.join("parked-root"))?;
    fs::rename(separate_first, source.parent.join("parked-first"))?;

    let mut reordered = saved.clone();
    reordered.native_predecessors.swap(0, 1);
    assert!(RelaySegmentRetainedBackup::open_portable(&portable, &reordered).is_err());
    let checkpoint = portable.join("native-lineage/0.checkpoint");
    let parked = portable.join("native-lineage/parked.checkpoint");
    fs::rename(&checkpoint, &parked)?;
    let missing = RelaySegmentRetainedBackup::open_portable(&portable, &saved);
    fs::rename(&parked, &checkpoint)?;
    assert!(
        matches!(missing, Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound)
    );

    let bundle = RelaySegmentRetainedBackup::open_portable(&portable, &saved)?;
    let destination = source.parent.join("recovered");
    let target = bundle.restore(&destination, "recovered", POLICY)?;
    drop(target);
    let target = bundle.backup().reopen(&destination, POLICY)?;
    target.components().0.catchup("first-reader")?;
    target.components().0.catchup("second-reader")?;
    assert_eq!(source.authority.current_selection()?, second_epoch);
    Ok(())
}
