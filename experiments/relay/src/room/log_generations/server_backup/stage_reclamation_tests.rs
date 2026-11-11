//! Recover exhausted rotation staging with the same protected histories and raster bytes.
use super::{
    super::{
        server_recovery::tests::source,
        tests::{send, staging_capacity::retain_interrupted_stages},
    },
    ServerLogGenerationRoomBackup,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Role, RoomRecoveryPolicy,
    ServerLogGenerationRoomRecovery, assets::AssetStore,
};
use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
use std::{fs, io::Write, os::unix::fs::OpenOptionsExt, path::Path};

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

fn write_stage(root: &Path) -> TestResult<String> {
    let name = format!(".stage-{}", crate::credentials::issue()?);
    let mut stage =
        fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(root.join(&name))?;
    stage.write_all(b"unpublished rotation bytes")?;
    stage.sync_all()?;
    Ok(name)
}

#[test]
fn separate_recovery_reclaims_all_staging_slots_and_preserves_offline_delivery_and_undo()
-> TestResult {
    let (files, mut room, mut assets, profile) = source(3, true, true)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registered = room.register("alice")?;
    let mut author = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    let edit = |text: &str| {
        vec![Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })]
    };
    author.apply(edit("Accepted before rotation "))?;
    let mut through = send(&mut room, &author, &registered.lease, "0")?;
    author.apply(edit("Offline during recovery "))?;
    let offline = author.checkpoint()?;
    let source_history = room.catchup("owner")?;
    let source_rasters = assets.export_backup()?.to_bytes()?;

    room = retain_interrupted_stages(&files.room(), room, 62)?;
    let stage = write_stage(&files.room())?;
    let capacity = room.storage_capacity(&assets, "owner")?;
    let original_rotation = capacity.log.rotation.ok_or("physical rotation")?;
    assert_eq!(original_rotation.unpublished_stages, 63);
    assert!(!original_rotation.can_rotate);

    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let original_pin = original.info()?.identity;
    let original_bytes = original.to_bytes()?;
    let original_path = files.recovery().with_file_name("original.backup");
    fs::write(&original_path, &original_bytes)?;
    let working = ServerLogGenerationRoomBackup::from_owned_bytes(fs::read(&original_path)?)?;
    let allocation = working.native().allocation_for_test();
    let candidate = working.prepare_offline_stage_reclamation(&original_pin)?;
    assert_eq!(candidate.native().allocation_for_test(), allocation);
    let candidate = ServerLogGenerationRoomBackup::from_owned_bytes(candidate.to_bytes()?)?;
    let candidate_pin = candidate.info()?.identity;
    assert_ne!(candidate_pin.archive_sha256, original_pin.archive_sha256);
    assert_eq!(candidate_pin.native.source, original_pin.native.source);
    assert_eq!(candidate_pin.native.manifest, original_pin.native.manifest);
    assert_eq!(candidate_pin.assets, original_pin.assets);
    assert_eq!(original.native().selected_files()?[stage.as_str()], b"unpublished rotation bytes");
    candidate.verify_offline_stage_reclamation(&original, &original_pin)?;
    assert!(candidate.check_archive_ancestor(&original).is_err());
    assert!(
        ServerLogGenerationRoomRecovery::begin(
            &files.recovery(),
            &candidate,
            &original_pin,
            POLICY
        )
        .is_err()
    );
    assert!(!files.recovery().exists());

    let mut restored = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &candidate,
        &candidate_pin,
        POLICY,
    )?
    .finish(&candidate)?;
    assert_eq!(restored.room().catchup("owner")?, source_history);
    assert_eq!(restored.assets_mut().export_backup()?.to_bytes()?, source_rasters);
    let restored_capacity = restored.room().storage_capacity(restored.assets(), "owner")?;
    assert_eq!(restored_capacity.log.active, capacity.log.active);
    assert_eq!(restored_capacity.log.retained, capacity.log.retained);
    let rotation = restored_capacity.log.rotation.ok_or("restored rotation")?;
    assert_eq!(rotation.unpublished_stages, 0);
    assert_eq!(
        rotation.continuation_files_remaining,
        original_rotation.continuation_files_remaining
    );
    assert!(rotation.can_rotate);

    let mut operational = restored.begin_operation(&candidate, &candidate_pin, POLICY, "owner")?;
    operational.room_mut().rotate_log_generation("owner", "after-stage-reclamation")?;
    let room_after = operational.room_mut();
    let lease = room_after.resume("alice", &registered.lease.writer, &registered.credential)?;
    let mut author = profile.restore("room", &offline)?;
    through = send(room_after, &author, &lease, &through)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(room_after, &author, &lease, &through)?;
        let peer =
            profile.join_frame("room".into(), "901".into(), &room_after.catchup("owner")?)?;
        assert_eq!(peer.document_json(), author.document_json());
    }
    let advanced = room_after.catchup("owner")?;
    drop(operational);
    let mut reopened = OperationalLogGenerationServerRoom::resume(
        &files.recovery(),
        &candidate,
        &candidate_pin,
        POLICY,
        "owner",
    )?;
    assert_eq!(reopened.room().catchup("owner")?, advanced);
    assert_eq!(reopened.assets_mut().export_backup()?.to_bytes()?, source_rasters);

    original.check_live(&mut room, &assets, "owner")?;
    assert_eq!(room.storage_capacity(&assets, "owner")?, capacity);
    assert_eq!(fs::read(original_path)?, original_bytes);
    assert_eq!(fs::read(files.room().join(stage))?, b"unpublished rotation bytes");
    Ok(())
}

#[test]
fn stage_reclamation_refuses_a_wrong_pin_existing_stages_and_changed_selected_components()
-> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let clean = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let clean_pin = clean.info()?.identity;
    assert!(matches!(
        ServerLogGenerationRoomBackup::from_bytes(&clean.to_bytes()?)?
            .prepare_offline_stage_reclamation(&clean_pin),
        Err(Error::Contract("generation backup has no unpublished stages"))
    ));
    write_stage(&files.room())?;
    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let original_pin = original.info()?.identity;
    let mut wrong_pin = original_pin.clone();
    wrong_pin.archive_sha256[0] ^= 1;
    assert!(
        ServerLogGenerationRoomBackup::from_bytes(&original.to_bytes()?)?
            .prepare_offline_stage_reclamation(&wrong_pin)
            .is_err()
    );
    assert!(clean.verify_offline_stage_reclamation(&original, &wrong_pin).is_err());
    assert!(original.verify_offline_stage_reclamation(&original, &original_pin).is_err());
    clean.verify_offline_stage_reclamation(&original, &original_pin)?;

    let mut empty =
        AssetStore::open(&files.recovery().with_file_name("no-rasters"), room.asset_binding())?;
    let different_rasters = ServerLogGenerationRoomBackup::from_components(
        room.export_log_generation_backup("owner")?.without_unpublished_stages()?,
        empty.export_backup()?,
    )?;
    assert!(matches!(
        different_rasters.verify_offline_stage_reclamation(&original, &original_pin),
        Err(Error::Contract("stage reclamation raster archive differs"))
    ));

    room.grant("owner", "bob", Some(Role::Reader))?;
    let changed = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let changed_pin = changed.info()?.identity;
    let changed = changed.prepare_offline_stage_reclamation(&changed_pin)?;
    assert!(matches!(
        changed.verify_offline_stage_reclamation(&original, &original_pin),
        Err(Error::Contract("generation stage reclamation selected cut differs"))
    ));
    Ok(())
}
