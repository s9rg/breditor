//! The continued receiver retains authenticated offline comments and receipts after replay.
use super::*;
use crate::{RoomBackup, RoomRecoveryPolicy};

#[test]
fn continued_review_reopens_before_snapshot_and_preserves_original_receipts() -> TestResult {
    for (version, standard, atomic) in [(1, false, false), (2, false, true), (3, true, true)] {
        let files = Files::new()?;
        let (profile, mut room) = start(&files, version, standard, atomic)?;
        room.enable_review("owner")?;
        room.grant("owner", "alice", Some(Role::Editor))?;
        room.grant_review("owner", "alice", Some(ReviewRole::Moderator))?;
        let registration =
            room.register_review("alice", ReviewActorId::try_new("alice.review")?)?;
        let writer = room.register("alice")?.lease.writer;
        let document = profile.join_frame("room".into(), writer, &room.catchup("alice")?)?;
        let mut author = document.create_review_session(policy("alice.review", "alice")?)?;
        comment(&document, &mut author, "Review accepted before continuation")?;
        let (old_frame, old_receipt) =
            send_review(&mut room, "alice", &author, &registration.lease, 0)?;
        enable(&mut room, Lane::Review)?;
        comment(&document, &mut author, "Review written while offline")?;
        let offline = author.export_frame(1)?;
        let document_cut = room.native_history_checkpoint("owner", Lane::Document)?;
        let before: Value =
            serde_json::from_str(&room.native_history_checkpoint("owner", Lane::Review)?)?;
        let archive_path = files.path("source.log");
        let raw_before = fs::read(&archive_path)?;
        assert!(matches!(
            room.continue_review_native_history("alice", "v2".into()),
            Err(Error::Permission)
        ));
        assert_eq!(fs::read(&archive_path)?, raw_before);
        let boundary = room.continue_review_native_history("owner", "v2".into())?;
        assert_eq!(boundary.format_version, 2);
        assert!(!boundary.duplicate);
        let exact = room.native_history_checkpoint("owner", Lane::Review)?;
        let after: Value = serde_json::from_str(&exact)?;
        assert_eq!(after["root"], before["root"]);
        assert_eq!(after["sealed"], json!([before["active"]]));
        assert_eq!(after["continuedAfter"], 1);
        let descriptor = room.native_history_descriptor("owner")?;
        assert_eq!(descriptor.format_version, 2);
        assert_eq!(descriptor.review, Some(Family::ContinuedV2));
        drop(room);

        let (mut room, recovery) = Room::open(&archive_path)?;
        assert_eq!(recovery.truncated_bytes, 0);
        assert_eq!(room.native_history_checkpoint("owner", Lane::Review)?, exact);
        assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, document_cut);
        assert!(room.validate_review_lease("alice", &registration.lease).is_err());
        let duplicate = room.continue_review_native_history("owner", "v2".into())?;
        assert!(duplicate.duplicate);
        assert_eq!(
            (duplicate.sequence, duplicate.before, duplicate.after),
            (boundary.sequence, boundary.before, boundary.after)
        );
        let lease =
            room.resume_review("alice", &registration.lease.actor, &registration.credential)?;
        let ReviewAdmission::Durable(retry) = room.admit_review("alice", &lease, &old_frame)?
        else {
            return Err("original receipt missing".into());
        };
        assert!(retry.duplicate);
        assert_eq!(retry.sequence, old_receipt.sequence);
        assert_eq!(retry.receipt, old_receipt.receipt);
        let ReviewAdmission::Durable(new_receipt) = room.admit_review("alice", &lease, &offline)?
        else {
            return Err("offline input did not commit".into());
        };
        assert!(!new_receipt.duplicate);
        assert_eq!(new_receipt.receipt.through, "2");
        seal(&mut room, Lane::Review, "after-offline")?;
        let exact = room.native_history_checkpoint("owner", Lane::Review)?;
        assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, document_cut);
        let identity = room.backup_identity()?;
        let backup = RoomBackup::from_bytes(&room.export_backup()?.to_bytes())?;
        drop(room);
        let mut restored = Room::restore_backup(
            &files.path("restored.log"),
            &backup,
            &identity,
            RoomRecoveryPolicy::HostReacquired,
        )?;
        assert_eq!(restored.native_history_checkpoint("owner", Lane::Review)?, exact);
        assert_eq!(restored.native_history_descriptor("owner")?.review, Some(Family::ContinuedV2));
        let lease =
            restored.resume_review("alice", &registration.lease.actor, &registration.credential)?;
        let ReviewAdmission::Durable(retry) = restored.admit_review("alice", &lease, &offline)?
        else {
            return Err("offline receipt missing after restore".into());
        };
        assert!(retry.duplicate);
        assert_eq!(retry.sequence, new_receipt.sequence);
        assert_eq!(retry.receipt, new_receipt.receipt);
    }
    Ok(())
}
