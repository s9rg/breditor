//! A V1 document receiver advances without replacing offline writer identities.
use super::*;

#[test]
fn continued_document_replays_the_exact_boundary_and_keeps_offline_writer_receipts() -> TestResult {
    for (version, atomic) in [(1, false), (3, true)] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, version, false, atomic)?;
        room.grant("owner", "alice", Some(Role::Editor))?;
        room.enable_review("owner")?;
        room.enable_document_history_generations("owner", "root".into(), "one".into())?;
        let registration = room.register("alice")?;
        let mut client = profile.join_frame(
            "room".into(),
            registration.lease.writer.clone(),
            &room.catchup("alice")?,
        )?;
        insert(&mut client, "Accepted before boundary ")?;
        let (through, original_frame, original_receipt) =
            send_document(&mut room, "alice", &client, &registration.lease, "0", atomic)?;
        insert(&mut client, "Created offline before boundary ")?;
        let review = room.native_history_checkpoint("owner", Lane::Review)?;
        let v1: Value =
            serde_json::from_str(&room.native_history_checkpoint("owner", Lane::Document)?)?;
        let path = files.path("source.log");
        let before = fs::read(&path)?;
        assert!(matches!(
            room.continue_document_native_history("alice", "two".into()),
            Err(Error::Permission)
        ));
        assert_eq!(fs::read(&path)?, before);
        let boundary = room.continue_document_native_history("owner", "two".into())?;
        assert_eq!(boundary.format_version, 2);
        let v2: Value =
            serde_json::from_str(&room.native_history_checkpoint("owner", Lane::Document)?)?;
        assert_eq!(v2["rootCheckpoint"], v1["rootCheckpoint"]);
        assert_eq!(v2["sealed"], json!([v1["active"]]));
        if atomic {
            // A room may enable suggestions after its receiver has continued.
            room.enable_document_suggestions("owner")?;
            assert!(
                room.suggestions
                    .as_ref()
                    .ok_or("effect owner")?
                    .effect_owner
                    .continued_history_enabled()
            );
        }
        let (_, offline_frame, offline_receipt) =
            send_document(&mut room, "alice", &client, &registration.lease, &through, atomic)?;
        room.seal_document_history_generation("owner", "three".into())?;
        let exact = room.native_history_checkpoint("owner", Lane::Document)?;
        drop(room);

        let (mut room, recovery) = Room::open(&path)?;
        assert_eq!(recovery.truncated_bytes, 0);
        assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, exact);
        assert_eq!(room.native_history_checkpoint("owner", Lane::Review)?, review);
        let descriptor = room.native_history_descriptor("owner")?;
        assert_eq!(descriptor.format_version, 2);
        assert_eq!(descriptor.document, Family::ContinuedV2);
        let retry = room.continue_document_native_history("owner", "two".into())?;
        assert!(retry.duplicate);
        assert_eq!(
            (retry.sequence, retry.before, retry.after),
            (boundary.sequence, boundary.before, boundary.after)
        );
        let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
        for (frame, expected) in
            [(original_frame, original_receipt), (offline_frame, offline_receipt)]
        {
            let Admission::Durable(actual) = room.admit("alice", &lease, &frame)? else {
                return Err("retained receipt missing".into());
            };
            assert!(actual.duplicate);
            assert_eq!((actual.sequence, actual.receipt), (expected.sequence, expected.receipt));
        }
    }
    Ok(())
}
