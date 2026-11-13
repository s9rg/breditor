//! Actual native owners and real synced phase boundaries; no stub storage or fake histories.
use super::super::super::ServerLogGenerationRoomBackup;
use super::super::{
    ServerLogGenerationRoomRecovery, files, selection::RasterComponent, tests::source,
};
use super::{
    OperationalLogGenerationServerRoom,
    interruption::{Interruption, Point},
};
use crate::{
    Error, Role, RoomRecoveryPolicy,
    assets::{asset_id, prepare_asset},
};
use image::{DynamicImage, ImageFormat};
use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
};
mod inspect_torn_tail;
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;
fn accepted_insert(
    room: &mut crate::Room,
    profile: &breditor_collab_feasibility::rich_replica::SharedRichProfile,
    atomic: bool,
) -> TestResult {
    use breditor_collab_feasibility::rich_replica::{Command, actions::InsertText};
    let registered = room.register("owner")?;
    let mut author = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "After handoff ".into(),
    })])?;
    let groups: serde_json::Value = serde_json::from_str(&if atomic {
        author.writer_groups_v2_guarded(&author.observe()?, "0")?
    } else {
        author.writer_groups_guarded(&author.observe()?, "0")?
    })?;
    for frame in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit("owner", &registered.lease, frame.as_str().ok_or("frame")?)?,
            crate::Admission::Durable(_)
        ));
    }
    Ok(())
}

fn snapshot(root: &Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    let mut output = BTreeMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().into_string().map_err(|_| "test filename")?;
        if entry.file_type()?.is_dir() {
            for (child, bytes) in snapshot(&entry.path())? {
                output.insert(format!("{name}/{child}"), bytes);
            }
        } else {
            output.insert(name, fs::read(entry.path())?);
        }
    }
    Ok(output)
}
fn restored() -> TestResult<(
    crate::room::log_generations::tests::Files,
    ServerLogGenerationRoomBackup,
    crate::RecoveredLogGenerationServerRoom,
)> {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let recovered = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &backup,
        &backup.info()?.identity,
        POLICY,
    )?
    .finish(&backup)?;
    Ok((files, backup, recovered))
}
fn reopen(
    root: &Path,
    backup: &ServerLogGenerationRoomBackup,
) -> crate::Result<OperationalLogGenerationServerRoom> {
    OperationalLogGenerationServerRoom::resume(
        root,
        backup,
        &backup.info()?.identity,
        POLICY,
        "owner",
    )
}
#[test]
fn six_actual_operational_handoff_prefixes_preserve_native_and_raster_custody() -> TestResult {
    for point in [
        Point::StageCreated,
        Point::IntentSelected,
        Point::DataPrefix,
        Point::DataSynced,
        Point::MarkerLinked,
        Point::StageRetired,
    ] {
        let (files, backup, recovered) = restored()?;
        let document = recovered.room().catchup("owner")?;
        assert!(
            recovered
                .handoff(
                    &backup,
                    &backup.info()?.identity,
                    POLICY,
                    "owner",
                    &Interruption { point: Some(point) }
                )
                .is_err(),
            "{point:?}"
        );
        if point == Point::StageCreated {
            let before = snapshot(&files.recovery())?;
            assert!(reopen(&files.recovery(), &backup).is_err());
            assert_eq!(snapshot(&files.recovery())?, before);
            let exact = ServerLogGenerationRoomRecovery::resume(
                &files.recovery(),
                &backup,
                &backup.info()?.identity,
                POLICY,
            )?
            .finish(&backup)?;
            let mut operational =
                exact.begin_operation(&backup, &backup.info()?.identity, POLICY, "owner")?;
            operational.check_live_source(&backup, "owner")?;
        } else {
            let mut operational = reopen(&files.recovery(), &backup)?;
            assert_eq!(operational.room().catchup("owner")?, document, "{point:?}");
            assert_eq!(operational.assets().count(), 3, "{point:?}");
            operational.check_live_source(&backup, "owner")?;
            drop(operational);
            assert!(
                ServerLogGenerationRoomRecovery::resume(
                    &files.recovery(),
                    &backup,
                    &backup.info()?.identity,
                    POLICY
                )
                .is_err(),
                "{point:?}"
            );
        }
        let mut operational = reopen(&files.recovery(), &backup)?;
        operational.room_mut().grant("owner", "later", Some(Role::Reader))?;
        operational.room_mut().rotate_log_generation("owner", "later")?;
        operational.check_live_source(&backup, "owner")?;
        drop(operational);
        let mut cold = reopen(&files.recovery(), &backup)?;
        assert!(cold.room().catchup("later").is_ok());
        cold.check_live_source(&backup, "owner")?;
    }
    Ok(())
}
#[test]
fn continuing_cold_reopen_preserves_later_native_generations_and_unreferenced_rasters_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let (files, mut room, mut assets, profile) = source(version, standard, atomic)?;
            room.enable_document_history_generations("owner", "root".into(), "one".into())?;
            let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
            drop(room);
            drop(assets);
            let recovered = ServerLogGenerationRoomRecovery::begin(
                &files.recovery(),
                &backup,
                &backup.info()?.identity,
                POLICY,
            )?
            .finish(&backup)?;
            let mut live =
                recovered.begin_operation(&backup, &backup.info()?.identity, POLICY, "owner")?;
            assert!(matches!(reopen(&files.recovery(), &backup), Err(Error::Locked)));
            live.room_mut().grant("owner", "new-reader", Some(Role::Reader))?;
            accepted_insert(live.room_mut(), &profile, atomic)?;
            live.room_mut().seal_document_history_generation("owner", "two".into())?;
            live.room_mut().rotate_log_generation("owner", "operational-two")?;
            let mut bytes = Cursor::new(Vec::new());
            DynamicImage::new_rgb8(4, 5).write_to(&mut bytes, ImageFormat::Png)?;
            let bytes = bytes.into_inner();
            let id = asset_id(&bytes);
            let (room, assets) = live.components_mut();
            room.put_asset("owner", assets, prepare_asset(&id, "image/png", bytes)?)?;
            live.check_live_source(&backup, "owner")?;
            let current = live.room().catchup("owner")?;
            let generation = live.room_mut().log_generation_descriptor("owner")?;
            drop(live);
            let before = snapshot(&files.recovery())?;
            let mut cold = reopen(&files.recovery(), &backup)?;
            assert_eq!(cold.room().catchup("owner")?, current);
            assert_eq!(cold.room_mut().log_generation_descriptor("owner")?, generation);
            assert_eq!(cold.assets().count(), 4);
            assert!(cold.assets().get(&id)?.is_some());
            cold.check_live_source(&backup, "owner")?;
            assert_eq!(snapshot(&files.recovery())?, before);
        }
    }
    Ok(())
}
#[test]
fn operational_absence_wrong_source_non_owner_and_unowned_even_matching_markers_do_not_mutate()
-> TestResult {
    let (files, backup, recovered) = restored()?;
    let before = snapshot(&files.recovery())?;
    assert!(matches!(
        recovered.begin_operation(&backup, &backup.info()?.identity, POLICY, "someone"),
        Err(Error::Permission)
    ));
    assert_eq!(snapshot(&files.recovery())?, before);
    assert!(reopen(&files.recovery(), &backup).is_err());
    assert_eq!(snapshot(&files.recovery())?, before);
    let recovered = ServerLogGenerationRoomRecovery::resume(
        &files.recovery(),
        &backup,
        &backup.info()?.identity,
        POLICY,
    )?
    .finish(&backup)?;
    assert!(
        recovered
            .handoff(
                &backup,
                &backup.info()?.identity,
                POLICY,
                "owner",
                &Interruption { point: Some(Point::IntentSelected) }
            )
            .is_err()
    );
    let directory = crate::log::generations::GenerationDirectory::open(&files.recovery())?;
    let recovery = files::read(&files.recovery().join(".recovery.json"))?;
    let context = super::context::Context::read(&directory, &recovery)?;
    let bytes = context.bytes.clone();
    drop(directory);
    let mut unrelated = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(files.recovery().join(".operational.json"))?;
    unrelated.write_all(&bytes)?;
    unrelated.sync_all()?;
    drop(unrelated);
    let before = snapshot(&files.recovery())?;
    assert!(reopen(&files.recovery(), &backup).is_err());
    assert_eq!(snapshot(&files.recovery())?, before);
    Ok(())
}
#[test]
fn cold_provenance_refuses_torn_tail_and_pending_rotation_without_trimming_or_completing()
-> TestResult {
    for pending in [false, true] {
        let (files, backup, recovered) = restored()?;
        let mut live =
            recovered.begin_operation(&backup, &backup.info()?.identity, POLICY, "owner")?;
        if pending {
            live.room_mut().grant("owner", "before-rotation", Some(Role::Reader))?;
            live.room_mut().log.interrupt_rotation_for_test(
                crate::log::generations::RotationPoint::IntentSynced,
            )?;
            assert!(live.room_mut().rotate_log_generation("owner", "unfinished").is_err());
        } else {
            live.room().log.append_incomplete_header_for_test()?;
        }
        drop(live);
        let before = snapshot(&files.recovery())?;
        assert!(reopen(&files.recovery(), &backup).is_err(), "pending={pending}");
        if pending {
            assert!(
                OperationalLogGenerationServerRoom::inspect_committed_native_tail(
                    &files.recovery(),
                    &backup,
                    &backup.info()?.identity,
                    &backup,
                    POLICY,
                    "owner",
                )
                .is_err()
            );
        }
        assert_eq!(snapshot(&files.recovery())?, before, "pending={pending}");
    }
    Ok(())
}
#[test]
fn changed_controls_original_raster_inodes_and_unknown_or_pending_work_are_preserved_and_refused()
-> TestResult {
    for fault in ["control", "raster-inode", "unknown-parent", "pending-raster", "intent-inode"] {
        let (files, backup, recovered) = restored()?;
        drop(recovered.begin_operation(&backup, &backup.info()?.identity, POLICY, "owner")?);
        if fault == "control" {
            let path = files.recovery().join(".complete.json");
            let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&path)?)?;
            value["format"] = "wrong-family".into();
            fs::write(path, serde_json::to_vec(&value)?)?;
        } else if fault == "unknown-parent" {
            fs::write(files.recovery().join("preserve-user-work"), b"unrecognized")?;
        } else if fault == "intent-inode" {
            let path = files.recovery().join(".operation-intent.json");
            let bytes = fs::read(&path)?;
            fs::rename(&path, files.recovery().with_file_name("original-intent"))?;
            let mut file =
                fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        } else {
            let raster: RasterComponent = files::read(&files.recovery().join(".rasters.json"))?;
            let raster = files.recovery().join(raster.directory);
            if fault == "pending-raster" {
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .mode(0o600)
                    .open(raster.join(".pending-00000000000000000000000000000000"))?
                    .write_all(b"preserve")?;
            } else {
                let name = backup
                    .rasters()
                    .selected_files()
                    .keys()
                    .find(|name| name.as_bytes().ends_with(b".asset"))
                    .cloned()
                    .ok_or("source asset")?;
                let path = raster.join(name);
                let bytes = fs::read(&path)?;
                fs::rename(&path, files.recovery().with_file_name("original-raster"))?;
                let mut file =
                    fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
                file.write_all(&bytes)?;
                file.sync_all()?;
            }
        }
        let before = snapshot(&files.recovery())?;
        assert!(reopen(&files.recovery(), &backup).is_err(), "{fault}");
        assert_eq!(snapshot(&files.recovery())?, before, "{fault}");
    }
    Ok(())
}

#[test]
fn complete_native_replay_must_refuse_a_real_pending_rotation_without_finishing_it() -> TestResult {
    let (files, mut room, assets, _) = source(3, true, true)?;
    room.grant("owner", "before-rotation", Some(Role::Reader))?;
    room.log.interrupt_rotation_for_test(crate::log::generations::RotationPoint::IntentSynced)?;
    assert!(room.rotate_log_generation("owner", "pending").is_err());
    drop(room);
    drop(assets);
    let directory = crate::log::generations::GenerationDirectory::open(&files.room())?;
    let (log, recovery) = crate::log::Log::open_owned_generations(directory)?;
    assert_eq!(recovery.truncated_bytes, 0);
    let before = snapshot(&files.room())?;
    assert!(crate::Room::replay_generation(log)?.finish_replay(recovery, false).is_err());
    assert_eq!(snapshot(&files.room())?, before);
    // Repair is separately explicit, not a side effect of provenance admission.
    let (mut repaired, _) = crate::Room::open_log_generations(&files.room())?;
    assert!(repaired.rotate_log_generation("owner", "pending")?.duplicate);
    Ok(())
}

#[test]
fn existing_committed_reopen_preserves_partial_and_committed_phase_markers() -> TestResult {
    for point in [Point::IntentSelected, Point::DataSynced, Point::MarkerLinked] {
        let (files, backup, recovered) = restored()?;
        let document = recovered.room().catchup("owner")?;
        let identity = backup.info()?.identity;
        let root = files.recovery();
        assert!(
            recovered
                .handoff(&backup, &identity, POLICY, "owner", &Interruption { point: Some(point) })
                .is_err()
        );
        let before = snapshot(&root)?;
        let stage = before
            .keys()
            .find(|name| name.starts_with(".operation-data-"))
            .ok_or("owned staged marker")?;
        let committed = point == Point::MarkerLinked;
        assert_eq!(before.contains_key(".operational.json"), committed);
        let opened = OperationalLogGenerationServerRoom::open_committed(
            &root, &backup, &identity, POLICY, "owner",
        );
        if committed {
            let operational = opened?;
            assert_eq!(operational.room().catchup("owner")?, document);
            assert_eq!(operational.assets().count(), 3);
        } else {
            assert!(matches!(
                opened,
                Err(Error::Contract("existing committed operational marker required"))
            ));
        }
        assert_eq!(snapshot(&root)?, before);
        let repaired = reopen(&root, &backup)?;
        assert_eq!(repaired.room().catchup("owner")?, document);
        drop(repaired);
        let after = snapshot(&root)?;
        assert!(!after.contains_key(stage));
        assert!(after.contains_key(".operational.json"));
    }
    Ok(())
}

#[test]
fn only_a_committed_operational_marker_can_adopt_later_complete_native_appends() -> TestResult {
    for committed in [false, true] {
        let (files, backup, recovered) = restored()?;
        let point = if committed { Point::MarkerLinked } else { Point::IntentSelected };
        assert!(
            recovered
                .handoff(
                    &backup,
                    &backup.info()?.identity,
                    POLICY,
                    "owner",
                    &Interruption { point: Some(point) }
                )
                .is_err()
        );
        let native: serde_json::Value =
            serde_json::from_slice(&fs::read(files.recovery().join(".native.json"))?)?;
        let native = files.recovery().join(native["directory"].as_str().ok_or("native directory")?);
        let component: serde_json::Value =
            serde_json::from_slice(&fs::read(native.join(".component.json"))?)?;
        let inner = native.join(component["directory"].as_str().ok_or("inner directory")?);
        let (mut current, _) = crate::Room::open_log_generations(&inner)?;
        current.grant("owner", "later-native", Some(Role::Reader))?;
        drop(current);
        let before = snapshot(&files.recovery())?;
        if committed {
            let mut live = reopen(&files.recovery(), &backup)?;
            assert!(live.room().catchup("later-native").is_ok());
            live.check_live_source(&backup, "owner")?;
        } else {
            assert!(reopen(&files.recovery(), &backup).is_err());
            assert_eq!(snapshot(&files.recovery())?, before);
            assert!(!files.recovery().join(".operational.json").exists());
        }
    }
    Ok(())
}

#[test]
fn preserved_unselected_component_contents_remain_pinned_on_warm_checks_and_cold_reopen()
-> TestResult {
    for cold in [false, true] {
        let (files, mut room, mut assets, _) = source(3, true, true)?;
        let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        let identity = backup.info()?.identity;
        drop(room);
        drop(assets);
        let mut attempt =
            ServerLogGenerationRoomRecovery::begin(&files.recovery(), &backup, &identity, POLICY)?;
        attempt.stop_after = Some(super::super::interruption::JoinedPoint::NativeCreated);
        assert!(attempt.finish(&backup).is_err());
        let orphan = fs::read_dir(files.recovery())?
            .filter_map(std::result::Result::ok)
            .find(|entry| entry.file_name().to_string_lossy().starts_with(".native-"))
            .ok_or("actual unselected native component")?
            .path();
        let mut recovered =
            ServerLogGenerationRoomRecovery::resume(&files.recovery(), &backup, &identity, POLICY)?
                .finish(&backup)?;
        recovered.check_live_source(&backup, "owner")?;
        if cold {
            let live = recovered.begin_operation(&backup, &identity, POLICY, "owner")?;
            fs::write(orphan.join(".recovery.json"), b"preserve changed orphan control")?;
            drop(live);
            let before = snapshot(&files.recovery())?;
            assert!(reopen(&files.recovery(), &backup).is_err());
            assert_eq!(snapshot(&files.recovery())?, before);
        } else {
            fs::write(orphan.join(".recovery.json"), b"preserve changed orphan control")?;
            let before = snapshot(&files.recovery())?;
            assert!(recovered.check_live_source(&backup, "owner").is_err());
            assert_eq!(snapshot(&files.recovery())?, before);
        }
    }
    Ok(())
}
