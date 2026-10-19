//! Actual accepted native document/review history and the original maximum registry sizes.
use super::*;
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorPolicy, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{Command, ReviewAnchorTarget, actions::InsertText},
};

#[test]
fn accepted_document_and_review_prefixes_are_native_and_capture_does_not_acknowledge_offline_work()
-> TestResult {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            accepted_prefix_case(language, standard, atomic)?;
        }
    }
    Ok(())
}

fn accepted_prefix_case(language: u32, standard: bool, atomic: bool) -> TestResult {
    let directory = Directory::new()?;
    let mut room = source(&directory, language, standard, atomic)?;
    room.enable_review("owner")?;
    let registered = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let mut client = room.profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Accepted native prefix ".into(),
    })])?;
    let groups: Value = serde_json::from_str(&if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, "0")?
    } else {
        client.writer_groups_guarded(&client.observe()?, "0")?
    })?;
    for group in groups["groups"].as_array().ok_or("groups")? {
        room.admit("owner", &registered.lease, group.as_str().ok_or("group")?)?;
    }
    let actor = ReviewActorId::try_new("owner.comments")?;
    let principal = ReviewPrincipalId::try_new("owner")?;
    let mut metadata = client.create_review_session(ReviewActorPolicy {
        actor: actor.clone(),
        principal: principal.clone(),
        access: ReviewAccess::Comment,
    })?;
    let anchor =
        client.capture_review_anchor_guarded(&client.observe()?, &ReviewAnchorTarget::Document)?;
    let review_observation = metadata.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut metadata,
        &review_observation,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor.clone(),
            body: "Accepted metadata prefix".into(),
        }),
    )?;
    room.admit_review("owner", &review.lease, &metadata.export_frame(0)?)?;
    let expected = if atomic {
        client.writer_clock_v2(&registered.lease.writer)?
    } else {
        client.writer_clock(&registered.lease.writer)?
    };
    let expected_review = metadata.writer_clock(&actor, &principal)?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Still offline ".into(),
    })])?;
    let review_observation = metadata.observe();
    client.dispatch_review_guarded(
        &client.observe()?,
        &mut metadata,
        &review_observation,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: anchor,
            body: "Still offline comment".into(),
        }),
    )?;
    let inventory = room.participant_inventory("owner")?;
    let row = &inventory.metadata.writers[0].clock;
    assert_eq!(row.through, expected.through);
    assert_eq!(row.prefix_digest, expected.prefix_digest);
    let local = if atomic {
        client.writer_clock_v2(&registered.lease.writer)?
    } else {
        client.writer_clock(&registered.lease.writer)?
    };
    assert_ne!(row.through, local.through);
    assert_eq!(
        inventory.metadata.review.as_ref().ok_or("review")?.writers[0].clock,
        expected_review
    );
    assert_ne!(expected_review.through, metadata.writer_clock(&actor, &principal)?.through);
    assert_ne!(inventory.metadata.review.as_ref().ok_or("review")?.writers[0].clock.through, "0");
    Ok(())
}

#[test]
fn maximum_original_document_and_review_registries_fit_without_omitting_empty_streams() -> TestResult
{
    let directory = Directory::new()?;
    let mut room = source(&directory, 1, false, false)?;
    room.enable_review("owner")?;
    for _ in 0..1024 {
        room.register("owner")?;
    }
    for n in 0..1023 {
        room.register_review("owner", ReviewActorId::try_new(format!("device.{n}"))?)?;
    }
    let inventory = room.participant_inventory("owner")?;
    assert_eq!(inventory.metadata.writers.len(), 1024);
    assert_eq!(inventory.metadata.review.as_ref().ok_or("review")?.writers.len(), 1023);
    assert!(inventory.to_json().len() < MAX_ROOM_PARTICIPANT_INVENTORY_BYTES);
    let copy = RoomParticipantInventory::from_json(inventory.to_json(), &inventory.identity())?;
    let RecoveryRegistrationCoverage::Pending { missing } =
        copy.verify_registrations(&mut room, "owner", &RecoveryRegistrationCredentials::default())?
    else {
        return Err("all protected inputs are still required".into());
    };
    assert_eq!(missing.len(), 2047);
    Ok(())
}
