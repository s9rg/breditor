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
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::Arc,
};

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

pub(super) fn check_retention(
    parent: &Path,
    backup: &RelaySegmentRoomBackupFiles,
    archives: &[RelaySegmentClientUploadArchive],
    originals: &[RelaySegmentClientJournal],
    alternatives: &[RelaySegmentClientJournal],
    pin: &RelaySegmentClientJournalPin,
) -> Result<()> {
    let duplicate = parent.join("duplicate-alternate");
    assert!(matches!(
        backup.restore_with_client_journal_alternatives(
            &duplicate,
            "duplicate-original",
            POLICY,
            archives,
            originals,
            &originals[..1],
        ),
        Err(Error::Contract(
            "alternate participant requires a different selected original of the same writer and actor"
        ))
    ));
    assert!(!duplicate.exists());

    let path = parent.join("altered-alternate");
    let target = backup.restore_with_client_journal_alternatives(
        &path,
        "altered-alternate",
        POLICY,
        archives,
        originals,
        alternatives,
    )?;
    assert_eq!(target.client_alternate_pins()?, [pin.clone()]);
    let mut copy = Vec::new();
    assert!(!target.copy_client_archive(pin, &mut copy)?);
    assert!(target.copy_client_alternative(pin, &mut copy)?);
    assert_eq!(copy, std::fs::read(parent.join("incoming-branch.bin"))?);
    drop(target);
    let mut file = File::options()
        .read(true)
        .write(true)
        .open(path.join("client-alternatives/journals.bin"))?;
    let mut byte = [0];
    file.seek(SeekFrom::End(-1))?;
    file.read_exact(&mut byte)?;
    byte[0] ^= 1;
    file.seek(SeekFrom::End(-1))?;
    file.write_all(&byte)?;
    file.sync_all()?;
    assert!(matches!(
        backup.reopen(&path, POLICY),
        Err(Error::Contract("retained client journal digest differs"))
    ));
    Ok(())
}
