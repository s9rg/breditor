//! Actual selective history survives operational edits and two complete native service reopens.
use super::support::{Directory, Result, fill, flush, insert, source};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{
    OperationalServerRoom, Registration, Role, RoomRecoveryPolicy, ServerRoomBackup,
    ServerRoomRecovery,
    assets::{asset_id, prepare_asset},
};
use image::{DynamicImage, ImageFormat};
use std::{fs, io::Cursor};

struct Prepared {
    profile: SharedRichProfile,
    selected: ServerRoomBackup,
    registration: Registration,
    peer_registration: Registration,
    through: String,
    offline_journal: String,
}
fn prepare(directory: &Directory) -> Result<Prepared> {
    let (profile, mut authority, mut rasters) = source(directory)?;
    fill(&authority, &mut rasters)?;
    authority.grant("owner", "peer", Some(Role::Editor))?;
    let peer_registration = authority.register("peer")?;
    let mut peer = profile.join_frame(
        "room".into(),
        peer_registration.lease.writer.clone(),
        &authority.catchup("peer")?,
    )?;
    insert(&mut peer, "caption", "Peer preserved ")?;
    flush(&mut authority, &peer, "peer", &peer_registration.lease, "0")?;
    let registration = authority.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &authority.catchup("owner")?,
    )?;
    insert(&mut client, "p", "Accepted ")?;
    let through = flush(&mut authority, &client, "owner", &registration.lease, "0")?;
    insert(&mut client, "p", "Offline ")?;
    let offline_journal = client.checkpoint()?;
    let selected = ServerRoomBackup::capture(&mut authority, &mut rasters)?;
    Ok(Prepared { profile, selected, registration, peer_registration, through, offline_journal })
}

#[test]
fn operational_reopens_keep_offline_work_saved_redo_and_peer_edits_without_resetting_history()
-> Result {
    let directory = Directory::new()?;
    let Prepared { profile, selected, registration, peer_registration, through, offline_journal } =
        prepare(&directory)?;
    let original = selected.to_bytes()?;
    let expected = selected.info().identity;
    let destination = directory.0.join("operational");
    let recovered = ServerRoomRecovery::begin(
        &destination,
        &selected,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&selected)?;
    let operational =
        recovered.begin_operation(&selected, &expected, RoomRecoveryPolicy::HostReacquired)?;
    let (mut authority, mut rasters) = operational.into_parts();
    let lease = authority.resume("owner", &registration.lease.writer, &registration.credential)?;
    let mut client = profile.restore("room", &offline_journal)?;
    assert_eq!(client.undo_count(), 2);
    let through = flush(&mut authority, &client, "owner", &lease, &through)?;
    authority.grant("owner", "peer", Some(Role::Reader))?;
    let mut image = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(5, 6).write_to(&mut image, ImageFormat::Png)?;
    let image = image.into_inner();
    let asset = asset_id(&image);
    authority.put_asset(
        "owner",
        &mut rasters,
        prepare_asset(&asset, "image/png", image.clone())?,
    )?;
    assert!(client.undo()?);
    assert_eq!(client.redo_count(), 1);
    let through = flush(&mut authority, &client, "owner", &lease, &through)?;
    let saved_redo = client.checkpoint()?;
    let before_restart = fs::read(destination.join("room.log"))?;
    drop(authority);
    drop(rasters);
    assert!(
        ServerRoomRecovery::resume(
            &destination,
            &selected,
            &expected,
            RoomRecoveryPolicy::HostReacquired
        )
        .is_err()
    );
    assert_eq!(fs::read(destination.join("room.log"))?, before_restart);
    let operational = OperationalServerRoom::resume(
        &destination,
        &selected,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (mut authority, rasters) = operational.into_parts();
    let lease = authority.resume("owner", &registration.lease.writer, &registration.credential)?;
    assert!(
        authority
            .resume("peer", &peer_registration.lease.writer, &peer_registration.credential)
            .is_err()
    );
    let mut client = profile.restore("room", &saved_redo)?;
    assert_eq!(client.redo_count(), 1);
    assert!(client.redo()?);
    let mut through = flush(&mut authority, &client, "owner", &lease, &through)?;
    for redo in [false, true, false, false, true, true] {
        if redo {
            assert!(client.redo()?);
        } else {
            assert!(client.undo()?);
        }
        through = flush(&mut authority, &client, "owner", &lease, &through)?;
        let observer =
            profile.join_frame("room".into(), "900".into(), &authority.catchup("reader")?)?;
        assert_eq!(observer.document_json(), client.document_json());
        assert!(observer.document_json().contains("Peer preserved"));
        assert_eq!(
            authority.read_asset("reader", &rasters, &asset)?.ok_or("new raster retained")?.bytes,
            image
        );
    }
    assert_eq!(rasters.count(), 4);
    let final_journal = client.checkpoint()?;
    let final_frame = authority.catchup("reader")?;
    drop(authority);
    drop(rasters);
    let operational = OperationalServerRoom::resume(
        &destination,
        &selected,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (authority, rasters) = operational.into_parts();
    assert_eq!(authority.catchup("reader")?, final_frame);
    assert_eq!(profile.restore("room", &final_journal)?.checkpoint()?, final_journal);
    assert_eq!(rasters.count(), 4);
    assert_eq!(selected.to_bytes()?, original);
    Ok(())
}
