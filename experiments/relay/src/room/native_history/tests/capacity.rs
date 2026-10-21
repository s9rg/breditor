//! A real server crosses the old journal-entry ceiling without pretending to widen its Undo budget.
use super::*;
use crate::{RoomBackup, RoomRecoveryPolicy};

#[test]
fn more_than_one_thousand_durable_native_inputs_keep_old_offline_history_and_peer_work()
-> TestResult {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, 3, true, true)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let writer = room.register("alice")?;
    let mut client =
        profile.join_frame("room".into(), writer.lease.writer.clone(), &room.catchup("alice")?)?;
    client.enable_segmented_history_guarded(
        &client.observe()?,
        "client-root".into(),
        "client-one".into(),
    )?;
    enable(&mut room, Lane::Document)?;
    insert(&mut client, "Alice retained ")?;
    let mut through = "0".to_owned();
    let mut first = None;
    for index in 0..1025 {
        if index != 0 {
            assert!(if index % 2 == 0 { client.redo()? } else { client.undo()? });
        }
        let (next, frame, receipt) =
            send_document(&mut room, "alice", &client, &writer.lease, &through, true)?;
        through = next;
        if first.is_none() {
            first = Some((frame, receipt));
        }
        if index == 500 {
            room.grant("owner", "bob", Some(Role::Editor))?;
            let other = room.register("bob")?;
            let mut peer = profile.join_frame(
                "room".into(),
                other.lease.writer.clone(),
                &room.catchup("bob")?,
            )?;
            insert(&mut peer, "Bob preserved ")?;
            send_document(&mut room, "bob", &peer, &other.lease, "0", true)?;
            client.receive_frame(&room.catchup("alice")?)?;
        }
        if index == 400 || index == 800 {
            let next = format!("generation-{index}");
            client.seal_history_segment_guarded(&client.observe()?, next.clone())?;
            seal(&mut room, Lane::Document, &next)?;
        }
    }
    assert_eq!(client.undo_count(), 1);
    assert_eq!(client.redo_count(), 0);
    assert!(client.segmented_history_info().ok_or("client history")?.retained_entries > 1000);
    assert!(room.replica.segmented_history_info().ok_or("server history")?.retained_entries > 1000);
    assert!(room.replica.document_json().contains("Bob preserved "));
    let local = client.segmented_checkpoint()?;
    let server = room.native_history_checkpoint("owner", Lane::Document)?;
    let archive = RoomBackup::from_bytes(&room.export_backup()?.to_bytes())?;
    let identity = room.backup_identity()?;
    let bytes = fs::read(files.path("source.log"))?;
    drop(room);
    let mut room = Room::restore_backup(
        &files.path("restored.log"),
        &archive,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(fs::read(files.path("restored.log"))?, bytes);
    assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, server);
    let lease = room.resume("alice", &writer.lease.writer, &writer.credential)?;
    let (frame, original) = first.ok_or("first durable receipt")?;
    let Admission::Durable(receipt) = room.admit("alice", &lease, &frame)? else {
        return Err("old acceptance retry".into());
    };
    assert!(receipt.duplicate);
    assert_eq!(receipt.sequence, original.sequence);
    assert_eq!(receipt.receipt, original.receipt);
    assert_eq!(fs::read(files.path("restored.log"))?, bytes);
    client = profile.restore_segmented("room", &local)?;
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send_document(&mut room, "alice", &client, &lease, &through, true)?.0;
        assert!(room.replica.document_json().contains("Bob preserved "));
        assert_eq!(room.replica.document_json(), client.document_json());
    }
    Ok(())
}
