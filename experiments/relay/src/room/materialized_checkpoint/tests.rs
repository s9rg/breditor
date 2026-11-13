//! Materialized checkpoint recovery must agree with ordinary cold replay at the same held cut.
use super::RelayCheckpoint;
use crate::room::{log_generations::tests::setup_profile, metadata_receipts::test_fixture};
use crate::{
    Admission, Error, Role, Room, ServerNativeHistoryLane as Lane, SuggestionRevisionAdmission,
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{Command, ReviewAnchorTarget, actions::InsertText, selection::Selection},
};

type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn materialized_relay_checkpoint_keeps_old_receipts_and_resumes_both_offline_histories()
-> TestResult {
    let (files, mut room, profile) = setup_profile(3, true, true)?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "doc-root".into(), "doc-v1".into())?;
    room.enable_review_history_generations("owner", "review-root".into(), "review-v1".into())?;
    let registration = room.register("alice")?;
    let actor = ReviewActorId::try_new("owner.comments")?;
    let review = room.register_review("owner", actor.clone())?;
    let mut author = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    let mut comments = author.create_review_session(ReviewActorPolicy {
        actor,
        principal: ReviewPrincipalId::try_new("owner")?,
        access: ReviewAccess::Moderate,
    })?;
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Accepted ".into(),
    })])?;
    let frame_json: serde_json::Value =
        serde_json::from_str(&author.writer_groups_v2_guarded(&author.observe()?, "0")?)?;
    let frame = frame_json["groups"][0].as_str().ok_or("document frame")?;
    let Admission::Durable(ack) = room.admit("alice", &registration.lease, frame)? else {
        return Err("document receipt absent".into());
    };
    let anchor = author.capture_review_anchor_guarded(
        &author.observe()?,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    for text in ["Accepted comment", "Offline comment"] {
        let observed = comments.observe();
        assert!(matches!(
            author.dispatch_review_guarded(
                &author.observe()?,
                &mut comments,
                &observed,
                ReviewAction::CreateThread(CreateReviewThread {
                    anchor_json: anchor.clone(),
                    body: text.into()
                })
            )?,
            ReviewOutcome::Committed(_)
        ));
        if text == "Accepted comment" {
            room.admit_review("owner", &review.lease, &comments.export_frame(0)?)?;
        }
    }
    author.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline ".into(),
    })])?;
    let request = test_fixture::seed_with_request(&mut room, 2, true)?.ok_or("revision request")?;
    room.continue_document_native_history("owner", "doc-v2".into())?;
    room.continue_review_native_history("owner", "review-v2".into())?;
    assert!(room.materialize_relay_checkpoint("owner").is_err());
    room.rotate_log_generation("owner", "post-checkpoint")?;
    assert!(matches!(room.materialize_relay_checkpoint("alice"), Err(Error::Permission)));
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    let identity = checkpoint.identity().clone();
    let mut changed = checkpoint.bytes().to_vec();
    changed[0] ^= 1;
    assert!(RelayCheckpoint::from_bytes(changed, &identity).is_err());
    let checkpoint = RelayCheckpoint::from_bytes(checkpoint.bytes().to_vec(), &identity)?;
    assert!(room.pack_sealed_wal("owner", "one")?.packed);
    room.grant("owner", "later-reader", Some(Role::Reader))?;
    test_fixture::publish_version(&mut room, "After checkpoint")?;
    room.rotate_log_generation("owner", "later")?;
    room.grant("owner", "active-reader", Some(Role::Reader))?;
    drop(room);

    let (mut ordinary, _) = Room::open_log_generations(&files.room())?;
    let identities = ordinary.export_log_generation_backup("owner")?.to_bytes();
    let before = ordinary.log_generation_retained_asset_references("owner")?;
    let expected_doc = ordinary.native_history_checkpoint("owner", Lane::Document)?;
    let expected_review = ordinary.native_history_checkpoint("owner", Lane::Review)?;
    let expected_versions = ordinary.document_versions_page("owner", None)?;
    drop(ordinary);
    let mut room = Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint)?;
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), identities);
    assert_eq!(
        serde_json::to_vec(&room.log_generation_retained_asset_references("owner")?)?,
        serde_json::to_vec(&before)?
    );
    assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, expected_doc);
    assert_eq!(room.native_history_checkpoint("owner", Lane::Review)?, expected_review);
    assert_eq!(room.document_versions_page("owner", None)?, expected_versions);
    assert!(matches!(room.admit("alice", &registration.lease, frame), Err(Error::Lease)));
    let lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    let Admission::Durable(retry) = room.admit("alice", &lease, frame)? else {
        return Err("retry receipt absent".into());
    };
    assert_eq!(retry, crate::DurableReceipt { duplicate: true, ..ack.clone() });
    let revision = room.revise_document_suggestion("owner", &request)?;
    assert!(matches!(revision, SuggestionRevisionAdmission::Durable(row) if row.duplicate));
    let actor = room.resume_review("owner", &review.lease.actor, &review.credential)?;
    let crate::ReviewAdmission::Durable(accepted) =
        room.admit_review("owner", &actor, &comments.export_frame(0)?)?
    else {
        return Err("offline comment refused".into());
    };
    assert!(!accepted.duplicate);
    let mut comment_through = accepted.receipt.through.parse()?;
    let mut through = super::super::log_generations::tests::send(
        &mut room,
        &author,
        &lease,
        &ack.receipt.through,
    )?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = super::super::log_generations::tests::send(&mut room, &author, &lease, &through)?;
        assert_eq!(
            profile
                .join_frame("room".into(), "901".into(), &room.catchup("owner")?)?
                .document_json(),
            author.document_json()
        );
        let observed = comments.observe();
        let outcome = if redo {
            author.redo_review_guarded(&author.observe()?, &mut comments, &observed)?
        } else {
            author.undo_review_guarded(&author.observe()?, &mut comments, &observed)?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        let crate::ReviewAdmission::Durable(receipt) =
            room.admit_review("owner", &actor, &comments.export_frame(comment_through)?)?
        else {
            return Err("comment history refused".into());
        };
        assert!(!receipt.duplicate);
        comment_through = receipt.receipt.through.parse()?;
    }
    Ok(())
}

#[test]
fn materialized_relay_checkpoint_retains_the_reserved_suggestion_effect_receipt() -> TestResult {
    use crate::{
        DocumentSuggestionDecisionAdmission, SuggestionDecision, SuggestionDecisionRequest,
    };
    let (files, mut room, _) = setup_profile(3, true, true)?;
    let request = test_fixture::seed_with_request(&mut room, 0, true)?.ok_or("revision request")?;
    let successor = room
        .document_suggestion_successor("owner", &request.previous_suggestion_id)?
        .ok_or("published replacement")?;
    let accept = SuggestionDecisionRequest {
        binding: room.document_suggestions_descriptor("owner")?.binding,
        suggestion_id: successor.publication.suggestion.id,
        decision: SuggestionDecision::Accept,
    };
    let DocumentSuggestionDecisionAdmission::Durable(first) =
        room.decide_document_suggestion("owner", &accept)?
    else {
        return Err("expected accepted suggestion".into());
    };
    assert!(first.decision.effect.is_some());
    room.rotate_log_generation("owner", "two")?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    let original = room.catchup("owner")?;
    drop(room);
    let mut restored = Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint)?;
    assert_eq!(restored.catchup("owner")?, original);
    let DocumentSuggestionDecisionAdmission::Durable(retry) =
        restored.decide_document_suggestion("owner", &accept)?
    else {
        return Err("expected original suggestion receipt".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.decision, first.decision);
    Ok(())
}

#[test]
fn materialized_relay_checkpoint_refuses_a_foreign_lineage_or_pending_rotation() -> TestResult {
    let (files, mut room, _) = setup_profile(3, true, true)?;
    room.grant("owner", "checkpoint-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    let (foreign, mut foreign_room, _) = setup_profile(3, true, true)?;
    foreign_room.grant("owner", "foreign-reader", Some(Role::Reader))?;
    foreign_room.rotate_log_generation("owner", "two")?;
    drop(foreign_room);
    assert!(Room::open_log_generations_with_checkpoint(&foreign.room(), &checkpoint).is_err());
    assert!(Room::open_log_generations(&foreign.room()).is_ok());

    room.grant("owner", "later-reader", Some(Role::Reader))?;
    room.log.interrupt_rotation_for_test(crate::log::generations::RotationPoint::IntentSynced)?;
    assert!(room.rotate_log_generation("owner", "pending").is_err());
    drop(room);
    let intent = files.room().join(".rotation.json");
    let bytes = std::fs::read(&intent)?;
    assert!(Room::open_log_generations_with_checkpoint(&files.room(), &checkpoint).is_err());
    assert_eq!(std::fs::read(&intent)?, bytes);
    assert!(Room::open_log_generations(&files.room()).is_ok());
    Ok(())
}
