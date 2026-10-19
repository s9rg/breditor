use super::*;
use sha2::{Digest, Sha256};

fn wrap(payload: &[u8]) -> Vec<u8> {
    let mut file = b"BREDITOR-RELAY1\n".to_vec();
    file.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    file.extend_from_slice(&Sha256::digest(payload));
    file.extend_from_slice(payload);
    file
}

#[test]
fn closed_transport_preserves_exact_bytes_and_refuses_corruption_and_partial_logs() -> TestResult {
    let directory = Directory::new()?;
    let (_, mut room) = start(&directory, 1, false, false)?;
    let before = fs::read(directory.path("source.log"))?;
    let archive = room.export_backup()?;
    let file = archive.to_bytes();
    assert_eq!(&file[super::super::format::PREFIX_BYTES..], before);
    assert_eq!(archive.info(), RoomBackup::from_bytes(&file)?.info());
    assert_eq!(RoomBackup::from_bytes(&file)?.to_bytes(), file);
    assert_eq!(fs::read(directory.path("source.log"))?, before);
    assert_eq!(archive.info().format, "breditor/relay-room-backup");
    assert_eq!(archive.info().format_version, 1);
    assert_eq!(archive.info().records, 1);
    assert_eq!(archive.info().log_bytes, u64::try_from(before.len())?);
    assert_eq!(super::super::MAX_ROOM_BACKUP_BYTES, 256 * 1024 * 1024 + 56);
    for input in [vec![], file[..file.len() - 1].to_vec(), [file.clone(), vec![0]].concat()] {
        assert!(RoomBackup::from_bytes(&input).is_err());
    }
    for at in [0, 16, 25, file.len() - 1] {
        let mut altered = file.clone();
        altered[at] ^= 1;
        assert!(RoomBackup::from_bytes(&altered).is_err());
    }
    assert!(RoomBackup::from_bytes(&wrap(&[])).is_err());
    let mut torn = before.clone();
    torn.extend_from_slice(&[1, 2, 3]);
    assert!(matches!(
        RoomBackup::from_bytes(&wrap(&torn)),
        Err(Error::Contract("room backup has an incomplete tail"))
    ));
    let mut bad_record = before;
    bad_record[80] ^= 1;
    assert!(RoomBackup::from_bytes(&wrap(&bad_record)).is_err());
    assert_eq!(directory.names()?, vec!["source.log"]);
    Ok(())
}

#[test]
fn correct_checksums_do_not_substitute_for_semantic_seed_and_account_replay() -> TestResult {
    use crate::log::{Event, Log};
    let directory = Directory::new()?;
    let (profile, configuration, document) = seed(3, false)?;
    let mut identity = RoomBackupIdentity {
        document: "room".into(),
        owner: "owner".into(),
        asset_binding: "0".repeat(64),
        profile: crate::AtomicTransportProfile::Original,
        writer_transport_version: 1,
        records: 0,
        terminal_log_digest: [0; 32],
    };
    let journal = profile.create(&document, "1".into())?.checkpoint()?;
    let invalid = directory.path("invalid.log");
    // Every original log hash is valid, but the unchanged durable seed selects V1, not V3.
    drop(Log::create(
        &invalid,
        Event::Seed { configuration, room: "room".into(), owner: "owner".into(), journal },
    )?);
    let archive = RoomBackup::from_bytes(&wrap(&fs::read(&invalid)?))?;
    (identity.records, identity.terminal_log_digest) = archive.snapshot.cut();
    assert!(
        Room::restore_backup(
            &directory.path("target.log"),
            &archive,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert_eq!(directory.names()?, vec!["invalid.log"]);

    let (_, config, doc) = seed(1, false)?;
    let p = SharedRichProfile::from_configuration_json(&config)?;
    let mut log = Log::create(
        &directory.path("invalid-grant.log"),
        Event::Seed {
            configuration: config,
            room: "room".into(),
            owner: "owner".into(),
            journal: p.create(&doc, "1".into())?.checkpoint()?,
        },
    )?;
    log.append(Event::Grant {
        actor: "not-owner".into(),
        principal: "bob".into(),
        role: Some(crate::Role::Editor),
    })?;
    drop(log);
    let bytes = fs::read(directory.path("invalid-grant.log"))?;
    let archive = RoomBackup::from_bytes(&wrap(&bytes))?;
    (identity.records, identity.terminal_log_digest) = archive.snapshot.cut();
    assert!(matches!(
        Room::restore_backup(
            &directory.path("target.log"),
            &archive,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        ),
        Err(Error::Permission)
    ));
    assert!(!directory.path("target.log").exists());
    assert_eq!(fs::read(directory.path("invalid-grant.log"))?, bytes);
    assert!(directory.names()?.iter().all(|name| !name.starts_with(".breditor-room-restore-")));
    Ok(())
}

#[test]
fn exported_snapshot_does_not_advance_the_log_and_future_appends_keep_the_original_cursor()
-> TestResult {
    let directory = Directory::new()?;
    let (_, mut room) = start(&directory, 3, true, true)?;
    let original = room.export_backup()?.to_bytes();
    assert_eq!(room.export_backup()?.to_bytes(), original);
    room.grant("owner", "alice", Some(crate::Role::Editor))?;
    let next = room.export_backup()?;
    assert_ne!(next.to_bytes(), original);
    assert_eq!(next.info().records, 2);
    let bytes = fs::read(directory.path("source.log"))?;
    drop(room);
    let (mut reopened, recovery) = Room::open(&directory.path("source.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(reopened.export_backup()?.to_bytes(), next.to_bytes());
    assert_eq!(fs::read(directory.path("source.log"))?, bytes);
    Ok(())
}
