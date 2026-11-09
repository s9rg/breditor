//! Exact joined migration keeps rasters and independent comment receipts through a cold recovery.
use super::*;
use crate::{
    DurableReviewReceipt, ReviewAdmission, ReviewRegistration, ReviewRole, Role,
    ServerLogGenerationOptions, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{ReviewAnchorTarget, RichReplica},
};

struct ReviewFixture {
    client: RichReplica,
    comments: ReviewSession,
    policy: ReviewActorPolicy,
    registration: ReviewRegistration,
    accepted: String,
    before: DurableReviewReceipt,
}

fn first_review_generation(original: &mut Room) -> TestResult<ReviewFixture> {
    original.enable_review("owner")?;
    original.grant("owner", "alice", Some(Role::Editor))?;
    original.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
    let author = original.register("alice")?;
    let policy = ReviewActorPolicy {
        actor: ReviewActorId::try_new("alice.comments")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    };
    let registration = original.register_review("alice", policy.actor.clone())?;
    let client = original.profile.join_frame(
        "room".into(),
        author.lease.writer,
        &original.catchup("alice")?,
    )?;
    let mut comments = client.create_review_session(policy.clone())?;
    let anchor_json =
        client.capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?;
    original.enable_review_history_generations(
        "owner",
        "comments-root".into(),
        "comments-1".into(),
    )?;
    let observed = comments.observe();
    assert!(matches!(
        client.dispatch_review_guarded(
            &client.observe()?,
            &mut comments,
            &observed,
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json,
                body: "Retain comment 🙂".into()
            })
        )?,
        ReviewOutcome::Committed(_)
    ));
    let accepted = comments.export_frame(0)?;
    let ReviewAdmission::Durable(before) =
        original.admit_review("alice", &registration.lease, &accepted)?
    else {
        return Err("review receipt".into());
    };
    original.seal_review_history_generation("owner", "comments-2".into())?;
    Ok(ReviewFixture { client, comments, policy, registration, accepted, before })
}

#[test]
fn joined_migration_keeps_exact_rasters_and_pending_independent_comment_history() -> TestResult {
    let directory = Directory::new()?;
    let (mut original, mut assets) = source(&directory, 3, true, true)?;
    let ReviewFixture { client, mut comments, policy, registration, accepted, before } =
        first_review_generation(&mut original)?;
    let view = comments.view()?;
    let observed = comments.observe();
    assert!(matches!(
        client.undo_review_guarded(&client.observe()?, &mut comments, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    let checkpoint = comments.checkpoint_json()?;
    let original_log = fs::read(directory.path("source.log"))?;
    let original_rasters = assets.export_backup()?.to_bytes()?;
    let original_doc = original.catchup("owner")?;
    let original_review = original.review_descriptor("owner")?;
    let archive = ServerRoomBackup::capture(&mut original, &mut assets)?;
    let expected = archive.info().identity;
    let persisted = archive.to_bytes()?;
    let options = ServerLogGenerationOptions { root: "legacy".into(), active: "one".into() };
    let mut wrong = expected.clone();
    wrong.archive_sha256[0] ^= 1;
    assert!(
        ServerRoomBackup::from_bytes(&persisted)?
            .prepare_generation_migration(&wrong, &options)
            .is_err()
    );
    let archive = archive.prepare_generation_migration(&expected, &options)?;
    let archive = ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?;
    let identity = archive.info()?.identity;
    assert_eq!(identity.native.source, expected.room);
    assert_eq!(identity.assets, expected.assets);
    let destination = directory.path("migrated");
    drop(ServerLogGenerationRoomRecovery::begin(&destination, &archive, &identity, POLICY)?);
    assert!(
        ServerLogGenerationRoomRecovery::begin(&destination, &archive, &identity, POLICY).is_err()
    );
    let mut recovered =
        ServerLogGenerationRoomRecovery::resume(&destination, &archive, &identity, POLICY)?
            .finish(&archive)?;
    assert_eq!(recovered.assets_mut().export_backup()?.to_bytes()?, original_rasters);
    assert_eq!(recovered.room().review_descriptor("owner")?, original_review);
    assert_eq!(recovered.room().catchup("owner")?, original_doc);
    let room = recovered.room_mut();
    assert!(room.admit_review("alice", &registration.lease, &accepted).is_err());
    let lease = room.resume_review("alice", &registration.lease.actor, &registration.credential)?;
    let ReviewAdmission::Durable(retry) = room.admit_review("alice", &lease, &accepted)? else {
        return Err("review retry receipt".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.sequence, before.sequence);
    assert_eq!(retry.receipt, before.receipt);
    let mut comments = client.restore_review_session(policy, &checkpoint)?;
    let ReviewAdmission::Durable(offline) =
        room.admit_review("alice", &lease, &comments.export_frame(1)?)?
    else {
        return Err("offline review receipt".into());
    };
    assert_eq!(offline.sequence, expected.room.records.to_string());
    room.rotate_log_generation("owner", "two")?;
    room.seal_review_history_generation("owner", "comments-3".into())?;
    let observed = comments.observe();
    assert!(matches!(
        client.redo_review_guarded(&client.observe()?, &mut comments, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    assert!(matches!(
        room.admit_review("alice", &lease, &comments.export_frame(2)?)?,
        ReviewAdmission::Durable(_)
    ));
    assert_eq!(comments.view()?.threads, view.threads);
    assert_eq!(room.review_writer_clock("alice", &registration.lease.actor)?.through, "3");
    assert_eq!(room.catchup("owner")?, original_doc);
    assert_eq!(fs::read(directory.path("source.log"))?, original_log);
    assert_eq!(assets.export_backup()?.to_bytes()?, original_rasters);
    Ok(())
}
