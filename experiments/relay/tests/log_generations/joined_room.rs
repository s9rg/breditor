//! Public native consumer: real images, old offline work, peer-preserving history and exact restore.
use super::{TestResult, insert, send, setup};
use breditor_collab_feasibility::rich_replica::{Command, actions::ReplaceImage};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, Role, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
};
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

fn fill(room: &breditor_collab_relay::Room, assets: &mut AssetStore) -> TestResult<Vec<String>> {
    let mut ids = Vec::new();
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let mut buffer = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 3).write_to(&mut buffer, format)?;
        let bytes = buffer.into_inner();
        let id = asset_id(&bytes);
        room.put_asset("owner", assets, prepare_asset(&id, mime, bytes)?)?;
        ids.push(id);
    }
    Ok(ids)
}

fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    let mut assets = AssetStore::open(&files.0.join("source-rasters"), room.asset_binding())?;
    let ids = fill(&room, &mut assets)?;
    let author = room.register("alice")?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("alice")?)?;
    client.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: ids[0].clone(),
        generation: "retained-generation".into(),
    })])?;
    insert(&mut client, "Accepted ")?;
    let mut through = send(&mut room, &client, "alice", &author.lease, "0", atomic)?;
    insert(&mut client, "Old offline ")?;
    let journal = client.checkpoint()?;
    room.seal_document_history_generation("owner", "two".into())?;
    room.rotate_log_generation("owner", "two")?;
    let registered_peer = room.register("bob")?;
    let mut peer = profile.join_frame(
        "room".into(),
        registered_peer.lease.writer.clone(),
        &room.catchup("bob")?,
    )?;
    insert(&mut peer, "Peer preserved ")?;
    send(&mut room, &peer, "bob", &registered_peer.lease, "0", atomic)?;
    room.seal_document_history_generation("owner", "three".into())?;
    room.rotate_log_generation("owner", "three")?;
    let participants = room.log_generation_participant_inventory("owner")?;
    let references = room.log_generation_retained_asset_references("owner")?;
    let raster_bytes = assets.export_backup()?.to_bytes()?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let identity = backup.info()?.identity;
    assert_eq!(identity.native, participants.identity().source);
    assert_eq!(identity.native, references.source);
    let backup = ServerLogGenerationRoomBackup::from_owned_bytes(backup.to_bytes()?)?;
    drop(room);
    drop(assets);
    let target = files.0.join("joined-recovery");
    let initial = ServerLogGenerationRoomRecovery::begin(
        &target,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert!(!initial.progress(&backup)?.completion_record);
    drop(initial);
    let mut recovered = ServerLogGenerationRoomRecovery::resume(
        &target,
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    recovered.check_live_source(&backup, "owner")?;
    let mut recovered = recovered.begin_operation(
        &backup,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    assert_eq!(recovered.assets().count(), 3);
    assert_eq!(recovered.assets_mut().export_backup()?.to_bytes()?, raster_bytes);
    assert!(recovered.room().validate_lease("alice", &author.lease).is_err());
    participants.verify_native(recovered.room_mut(), "owner")?;
    let (room, assets) = recovered.components_mut();
    for id in &ids {
        assert!(room.read_asset("owner", assets, id)?.is_some());
    }
    let lease = room.resume("alice", &author.lease.writer, &author.credential)?;
    client = profile.restore("room", &journal)?;
    client.receive_frame(&room.catchup("alice")?)?;
    through = send(room, &client, "alice", &lease, &through, atomic)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "alice", &lease, &through, atomic)?;
        assert!(client.document_json().contains("Peer preserved "));
        assert_eq!(client.document_json().contains("Old offline "), redo);
        assert!(client.document_json().contains(&ids[0]));
    }
    room.rotate_log_generation("owner", "after-recovery")?;
    backup.check_retained(room, assets, "owner")?;
    assert!(backup.check_live(room, assets, "owner").is_err());
    recovered.check_live_source(&backup, "owner")?;
    drop(recovered);
    assert!(
        ServerLogGenerationRoomRecovery::resume(
            &target,
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    let current =
        continue_cold_author(&target, &backup, &mut client, &author, &through, atomic, &ids[0])?;
    verify_second_restore(&files, &profile, &current, client.document_json())
}
fn continue_cold_author(
    target: &std::path::Path,
    backup: &ServerLogGenerationRoomBackup,
    client: &mut breditor_collab_feasibility::rich_replica::RichReplica,
    author: &breditor_collab_relay::Registration,
    through: &str,
    atomic: bool,
    asset: &str,
) -> TestResult<ServerLogGenerationRoomBackup> {
    let mut through = through.to_owned();
    let mut cold = OperationalLogGenerationServerRoom::resume(
        target,
        backup,
        &backup.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    assert_eq!(cold.origin(), &backup.info()?.identity);
    let (room, assets) = cold.components_mut();
    let lease = room.resume("alice", &author.lease.writer, &author.credential)?;
    client.receive_frame(&room.catchup("alice")?)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, client, "alice", &lease, &through, atomic)?;
        assert!(client.document_json().contains("Peer preserved "));
        assert_eq!(client.document_json().contains("Old offline "), redo);
        assert!(client.document_json().contains(asset));
    }
    let current = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    cold.check_live_source(backup, "owner")?;
    Ok(current)
}
fn verify_second_restore(
    files: &super::Files,
    profile: &breditor_collab_feasibility::rich_replica::SharedRichProfile,
    current: &ServerLogGenerationRoomBackup,
    expected: &str,
) -> TestResult {
    let mut second = ServerLogGenerationRoomRecovery::begin(
        &files.0.join("second-joined-recovery"),
        current,
        &current.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(current)?;
    second.check_live_source(current, "owner")?;
    let observer =
        profile.join_frame("room".into(), "994".into(), &second.room().catchup("owner")?)?;
    assert_eq!(observer.document_json(), expected);
    assert_eq!(second.assets().count(), 3);
    Ok(())
}

#[test]
fn public_joined_recovery_keeps_real_rasters_old_offline_input_peer_undo_and_repeat_recovery_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            workflow(version, standard, atomic)?;
        }
    }
    Ok(())
}

#[test]
fn maximum_physical_layout_supports_streamed_joined_capture_and_actual_joined_restore_under_the_same_fd_budget()
-> TestResult {
    let (files, _, mut room) = setup(3, true, true)?;
    let mut assets =
        AssetStore::open(&files.0.join("maximum-source-assets"), room.asset_binding())?;
    fill(&room, &mut assets)?;
    for index in 0..62 {
        room.grant("owner", "reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("maximum-joined-{index}"))?;
    }
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let mut recovered = ServerLogGenerationRoomRecovery::begin(
        &files.0.join("maximum-joined"),
        &backup,
        &backup.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    recovered.check_live_source(&backup, "owner")?;
    assert_eq!(recovered.room().log_generation_descriptor("owner")?.sealed, 62);
    assert_eq!(recovered.assets().count(), 3);
    let mut operational = recovered.begin_operation(
        &backup,
        &backup.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    operational.check_live_source(&backup, "owner")?;
    drop(operational);
    let mut operational = OperationalLogGenerationServerRoom::resume(
        &files.0.join("maximum-joined"),
        &backup,
        &backup.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    operational.check_live_source(&backup, "owner")?;
    Ok(())
}
