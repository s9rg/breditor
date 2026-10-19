use super::*;

#[test]
fn host_selects_exact_genesis_owner_document_and_transport_before_target_publication() -> TestResult
{
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 3, true, true)?;
    let identity = source.backup_identity()?;
    let backup = source.export_backup()?;
    let bytes = fs::read(directory.path("source.log"))?;
    drop(source);
    let mut document = identity.clone();
    document.document = "other-room".into();
    let mut owner = identity.clone();
    owner.owner = "other-owner".into();
    let mut binding = identity.clone();
    binding.asset_binding = "0".repeat(64);
    let mut transport = identity.clone();
    transport.writer_transport_version = 1;
    let mut profile = identity.clone();
    profile.profile = crate::AtomicTransportProfile::LayoutV3 { standard_inline_v1: false };
    for wrong in [document, owner, binding, profile, transport] {
        assert!(matches!(
            Room::restore_backup(
                &directory.path("target.log"),
                &backup,
                &wrong,
                RoomRecoveryPolicy::HostReacquired
            ),
            Err(Error::Contract("room backup source identity"))
        ));
        assert_eq!(directory.names()?, vec!["source.log"]);
        assert_eq!(fs::read(directory.path("source.log"))?, bytes);
    }
    let room = Room::restore_backup(
        &directory.path("target.log"),
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(room.backup_identity()?, identity);
    Ok(())
}

#[test]
fn non_file_destinations_refuse_before_creating_a_staging_file() -> TestResult {
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    let backup = source.export_backup()?;
    let identity = source.backup_identity()?;
    drop(source);
    for name in ["target/", "target/.", ".", ".."] {
        assert!(matches!(
            Room::restore_backup(
                &directory.path(name),
                &backup,
                &identity,
                RoomRecoveryPolicy::HostReacquired
            ),
            Err(Error::Contract("room backup destination name"))
        ));
        assert_eq!(directory.names()?, vec!["source.log"]);
    }
    Ok(())
}

#[test]
fn a_same_count_valid_log_with_the_same_genesis_cannot_replace_the_trusted_selected_cut()
-> TestResult {
    use crate::log::{Event, Log};
    let directory = Directory::new()?;
    let (_, mut source) = start(&directory, 1, false, false)?;
    source.grant("owner", "alice", Some(crate::Role::Editor))?;
    let identity = source.backup_identity()?;
    let intended = source.export_backup()?;
    let bytes = fs::read(directory.path("source.log"))?;
    drop(source);
    // Reuse the exact original seed, not a newly generated or inferred profile identity.
    let (original, mut records, recovery) = Log::open(&directory.path("source.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    let mut alternate = Log::create(&directory.path("alternate.log"), records.remove(0).event)?;
    alternate.append(Event::Grant {
        actor: "owner".into(),
        principal: "other".into(),
        role: Some(crate::Role::Editor),
    })?;
    drop(alternate);
    drop(original);
    let (mut alternate, recovery) = Room::open(&directory.path("alternate.log"))?;
    assert_eq!(recovery.truncated_bytes, 0);
    let mut alternate_identity = alternate.backup_identity()?;
    assert_ne!(alternate_identity.terminal_log_digest, identity.terminal_log_digest);
    alternate_identity.terminal_log_digest = identity.terminal_log_digest;
    assert_eq!(alternate_identity, identity);
    let file = RoomBackup::from_bytes(&alternate.export_backup()?.to_bytes())?;
    drop(alternate);
    assert!(matches!(
        Room::restore_backup(
            &directory.path("target.log"),
            &file,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        ),
        Err(Error::Contract("room backup selected log cut"))
    ));
    assert_eq!(directory.names()?, vec!["alternate.log", "source.log"]);
    assert_eq!(fs::read(directory.path("source.log"))?, bytes);
    let restored = Room::restore_backup(
        &directory.path("target.log"),
        &intended,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(restored.backup_identity()?, identity);
    assert_eq!(fs::read(directory.path("target.log"))?, bytes);
    Ok(())
}
