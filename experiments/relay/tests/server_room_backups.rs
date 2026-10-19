//! Public joined server recovery and real private-host capture, not a substitute merge model.
#[cfg(feature = "server")]
#[path = "support/server_recovery_live.rs"]
mod live;
#[path = "support/server_recovery.rs"]
mod support;
use breditor_collab_relay::{
    Role, RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery, assets::asset_id,
};
use image::ImageFormat;
use std::fs;
use support::{Directory, Result, fill, flush, insert, raster, source};

#[test]
fn joined_restore_retains_offline_work_and_selective_history_without_undoing_a_peer() -> Result {
    let directory = Directory::new()?;
    let (profile, mut room, mut assets) = source(&directory)?;
    fill(&room, &mut assets)?;
    room.grant("owner", "peer", Some(Role::Editor))?;
    let peer_registration = room.register("peer")?;
    let mut peer = profile.join_frame(
        "room".into(),
        peer_registration.lease.writer.clone(),
        &room.catchup("peer")?,
    )?;
    insert(&mut peer, "caption", "Peer preserved ")?;
    flush(&mut room, &peer, "peer", &peer_registration.lease, "0")?;
    room.grant("owner", "peer", Some(Role::Reader))?;
    let registration = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut client, "p", "Accepted ")?;
    let through = flush(&mut room, &client, "owner", &registration.lease, "0")?;
    insert(&mut client, "p", "Offline ")?;
    let journal = client.checkpoint()?;
    let backup = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let expected = backup.info().identity;
    let archive = ServerRoomBackup::from_bytes(&backup.to_bytes()?)?;
    drop(room);
    drop(assets);
    let destination = directory.0.join("restored");
    drop(ServerRoomRecovery::begin(
        &destination,
        &archive,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?);
    let restored = ServerRoomRecovery::resume(
        &destination,
        &archive,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&archive)?;
    assert!(restored.root().join(".ready.json").is_file());
    let (mut room, assets) = restored.into_parts();
    assert!(room.validate_lease("owner", &registration.lease).is_err());
    let lease = room.resume("owner", &registration.lease.writer, &registration.credential)?;
    assert!(
        room.resume("peer", &peer_registration.lease.writer, &peer_registration.credential)
            .is_err()
    );
    let mut client = profile.restore("room", &journal)?;
    let mut through = flush(&mut room, &client, "owner", &lease, &through)?;
    let png = raster(ImageFormat::Png)?;
    let image = asset_id(&png);
    for redo in [false, true, false, false, true, true] {
        if redo {
            assert!(client.redo()?);
        } else {
            assert!(client.undo()?);
        }
        through = flush(&mut room, &client, "owner", &lease, &through)?;
        let observer = profile.join_frame("room".into(), "900".into(), &room.catchup("reader")?)?;
        assert_eq!(observer.document_json(), client.document_json());
        assert!(observer.document_json().contains("Peer preserved"));
        assert_eq!(room.read_asset("reader", &assets, &image)?.ok_or("history raster")?.bytes, png);
        assert_eq!(assets.count(), 3);
    }
    let changed = fs::read(destination.join("room.log"))?;
    assert!(
        ServerRoomRecovery::resume(
            &destination,
            &archive,
            &expected,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert_eq!(
        fs::read(destination.join("room.log"))?,
        changed,
        "A completed backup cut never overwrites subsequent service edits"
    );
    Ok(())
}
