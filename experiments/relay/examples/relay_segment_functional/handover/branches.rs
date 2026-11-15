//! Exercise actual read-only branch inspection before choosing the original that can resume.
use super::{POLICY, Result};
use breditor_collab_relay::{
    Error, RecoveryRegistrationCredentials, RelaySegmentClientJournal,
    RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive, RelaySegmentRoomBackupFiles,
    RelaySegmentRoomBackupIdentity,
    server::{
        Authentication, ContentAddressedServerAssets, RoomDeploymentSelection, ServerBackupHandle,
        ServerRecoveryAssetProvider,
    },
};
use serde_json::{Value, json};
use std::{fs::File, path::Path, sync::Arc};

pub(super) fn inspect(
    parent: &Path,
    handle: &ServerBackupHandle,
    authentication: &Authentication,
    token: &str,
    credentials: &RecoveryRegistrationCredentials,
    expected: &RelaySegmentRoomBackupIdentity,
    previous: &RoomDeploymentSelection,
    backup: &RelaySegmentRoomBackupFiles,
    archives: &[RelaySegmentClientUploadArchive],
    originals: &[RelaySegmentClientJournal],
    peer: &RelaySegmentClientJournalPin,
    incoming: RelaySegmentClientJournalPin,
) -> Result<Value> {
    let incoming =
        RelaySegmentClientJournal::open(File::open(parent.join("incoming-branch.bin"))?, incoming)?;
    let read =
        |secret: &str, cut: &RelaySegmentRoomBackupIdentity, epoch: &RoomDeploymentSelection| {
            handle.inspect_relay_segment_participant_branches(
                "owner",
                secret,
                cut,
                epoch,
                &originals[0],
                &incoming,
            )
        };
    assert!(matches!(read(&"0".repeat(64), expected, previous), Err(Error::Permission)));
    let mut stale_cut = expected.clone();
    stale_cut.assets.archive_sha256[0] ^= 1;
    assert!(matches!(
        read(token, &stale_cut, previous),
        Err(Error::Contract("relay participant branch source cut changed"))
    ));
    let mut stale_epoch = previous.clone();
    stale_epoch.generation = (stale_epoch.generation.parse::<u64>()? + 1).to_string();
    assert!(matches!(read(token, expected, &stale_epoch), Err(Error::Lease)));
    let comparison = read(token, expected, previous)?;
    assert_eq!(comparison.backup, *expected);
    assert_eq!(comparison.epoch, *previous);
    for clock in [&comparison.current.document, &comparison.current.review] {
        assert!(clock.prefix_matches);
        assert_eq!(clock.compared_through, clock.accepted_through);
    }
    for clock in [&comparison.incoming.document, &comparison.incoming.review] {
        assert!(!clock.prefix_matches);
        assert!(clock.compared_through.parse::<u64>()? > 0);
    }

    let peer =
        RelaySegmentClientJournal::open(File::open(parent.join("journal-1.json"))?, peer.clone())?;
    let mut rejected = backup.restore_with_client_journals(
        &parent.join("diverged-participant-restore"),
        "diverged-incoming",
        POLICY,
        archives,
        &[incoming, peer],
    )?;
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    assert!(matches!(
        rejected.verify_handover_inputs(authentication, "owner", token, credentials, &provider),
        Err(Error::Contract("client journal document prefix diverged"))
    ));
    Ok(json!({"admissions":2,"refusedCuts":3,"refusedIncoming":1}))
}
