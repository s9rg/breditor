//! Public joined server recovery and real private-host capture, not a substitute merge model.
#[cfg(feature = "server")]
#[path = "support/server_asset_availability.rs"]
mod asset_availability;
#[cfg(feature = "server")]
#[path = "support/server_recovery_check.rs"]
mod checked;
#[cfg(feature = "server")]
#[path = "support/server_continuation.rs"]
mod continuation;
#[cfg(feature = "server")]
#[path = "support/server_recovery_live.rs"]
mod live;
#[path = "support/server_operation.rs"]
mod operational;
#[cfg(feature = "server")]
#[path = "support/server_operation_live.rs"]
mod operational_live;
#[cfg(feature = "server")]
#[path = "support/provider_callback_custody.rs"]
mod provider_callback_custody;
#[path = "support/server_recovery.rs"]
mod support;
use breditor_collab_feasibility::rich_replica::{RichReplica, SharedRichProfile};
use breditor_collab_relay::{
    Role, Room, RoomRecoveryPolicy, ServerNativeHistoryDescriptor, ServerNativeHistoryLane,
    ServerRetainedAssetReferences, ServerRoomBackup, ServerRoomRecovery, assets::asset_id,
};
use image::ImageFormat;
use std::fs;
use support::{Directory, Result, fill, flush, insert, raster, source};

#[test]
fn joined_restore_retains_offline_work_and_selective_history_without_undoing_a_peer() -> Result {
    joined_restore_workflow(false)
}

#[test]
fn native_generations_joined_restore_keeps_exact_histories_rasters_offline_work_and_peer_undo()
-> Result {
    joined_restore_workflow(true)
}

fn joined_restore_workflow(native_generations: bool) -> Result {
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
    if native_generations {
        enable_server_history(&mut room)?;
    }
    let registration = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    if native_generations {
        client.enable_segmented_history_guarded(
            &client.observe()?,
            "client.root".into(),
            "client.one".into(),
        )?;
    }
    insert(&mut client, "p", "Accepted ")?;
    let through = flush(&mut room, &client, "owner", &registration.lease, "0")?;
    if native_generations {
        room.seal_document_history_generation("owner", "server.two".into())?;
        client.seal_history_segment_guarded(&client.observe()?, "client.two".into())?;
    }
    insert(&mut client, "p", "Offline ")?;
    let journal =
        if native_generations { client.segmented_checkpoint()? } else { client.checkpoint()? };
    let cut = NativeCut::capture(&mut room, native_generations)?;
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
    cut.check(&mut room)?;
    assert!(room.validate_lease("owner", &registration.lease).is_err());
    let lease = room.resume("owner", &registration.lease.writer, &registration.credential)?;
    assert!(
        room.resume("peer", &peer_registration.lease.writer, &peer_registration.credential)
            .is_err()
    );
    let mut client = restore_client(&profile, native_generations, &journal)?;
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

fn enable_server_history(room: &mut Room) -> Result {
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "server.root".into(), "server.one".into())?;
    room.enable_review_history_generations("owner", "review.root".into(), "review.one".into())?;
    Ok(())
}

/// Exact native cuts and conservative asset inventory, not equal visible-document substitutes.
struct NativeCut {
    document: String,
    review: Option<String>,
    families: ServerNativeHistoryDescriptor,
    references: ServerRetainedAssetReferences,
}
impl NativeCut {
    fn capture(room: &mut Room, comments: bool) -> Result<Self> {
        Ok(Self {
            document: room.native_history_checkpoint("owner", ServerNativeHistoryLane::Document)?,
            review: if comments {
                Some(room.native_history_checkpoint("owner", ServerNativeHistoryLane::Review)?)
            } else {
                None
            },
            families: room.native_history_descriptor("owner")?,
            references: room.retained_asset_references("owner")?,
        })
    }

    fn check(&self, room: &mut Room) -> Result {
        assert_eq!(room.native_history_descriptor("owner")?, self.families);
        assert_eq!(
            room.native_history_checkpoint("owner", ServerNativeHistoryLane::Document)?,
            self.document
        );
        if let Some(review) = &self.review {
            assert_eq!(
                &room.native_history_checkpoint("owner", ServerNativeHistoryLane::Review)?,
                review
            );
        }
        assert_eq!(room.retained_asset_references("owner")?, self.references);
        Ok(())
    }
}

fn restore_client(
    profile: &SharedRichProfile,
    generations: bool,
    journal: &str,
) -> Result<RichReplica> {
    let owner = if generations {
        profile.restore_segmented("room", journal)?
    } else {
        profile.restore("room", journal)?
    };
    let saved = if generations { owner.segmented_checkpoint()? } else { owner.checkpoint()? };
    assert_eq!(saved, journal);
    Ok(owner)
}
