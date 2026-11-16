//! Reserve selection from real native files, including original and continued room cuts.
use super::*;
use crate::{
    ServerNativeHistoryPlan, ServerNativeHistoryReserve as Reserve,
    ServerNativeHistoryReserveOutcome as Outcome, ServerNativeHistoryReserveRequest as Request,
};

fn request(lane: Lane, next: &str, reserve: Reserve) -> Request {
    Request { lane, next: next.into(), original_root: None, reserve }
}

fn boundary(outcome: Outcome) -> TestResult<ServerNativeHistoryPlan> {
    match outcome {
        Outcome::Boundary { plan } => Ok(*plan),
        _ => Err("expected a staged boundary".into()),
    }
}

#[test]
fn reserve_enables_with_an_explicit_root_then_prefers_a_seal_over_continuation() -> TestResult {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, 3, true, true)?;
    let path = files.path("source.log");
    room.enable_document_suggestions("owner")?;
    let registration = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut client, "before enable")?;
    let (through, _, _) =
        send_document(&mut room, "owner", &client, &registration.lease, "0", true)?;
    let available = |room: &Room| {
        Ok::<_, Error>(room.native_history_capacity("owner")?.document.capacity.active_entries)
    };
    let mut convert =
        request(Lane::Document, "first", Reserve { generation_files: 1, ..Reserve::default() });
    let bytes = fs::read(&path)?;
    assert!(matches!(
        room.plan_native_history_reserve("owner", convert.clone())?,
        Outcome::Unavailable { .. }
    ));
    convert.original_root = Some("original".into());
    let plan = boundary(room.plan_native_history_reserve("owner", convert)?)?;
    assert!(matches!(plan.selection.boundary, NativeHistoryBoundary::Enable { .. }));
    assert_eq!(plan.capacity_after.document.family, Family::SegmentedV1);
    assert_eq!(plan.capacity_after.suggestion_effect.ok_or("effect")?.family, Family::SegmentedV1);
    assert_eq!(bytes, fs::read(&path)?);
    room.apply_prepared_native_history_boundary("owner", plan.selection)?;

    insert(&mut client, "after enable")?;
    send_document(&mut room, "owner", &client, &registration.lease, &through, true)?;
    let active = available(&room)?;
    assert!(active.used > 0);
    let minimum = Reserve { active_inputs: active.limit, ..Reserve::default() };
    let seal = request(Lane::Document, "second", minimum);
    let bytes = fs::read(&path)?;
    assert!(matches!(
        room.plan_native_history_reserve("other", seal.clone()),
        Err(Error::Permission)
    ));
    let plan = boundary(room.plan_native_history_reserve("owner", seal.clone())?)?;
    assert_eq!(plan.selection.boundary, NativeHistoryBoundary::Seal { next: "second".into() });
    let explicit = room.prepare_native_history_boundary(
        "owner",
        Lane::Document,
        plan.selection.boundary.clone(),
    )?;
    assert_eq!(plan, explicit);
    assert_eq!(plan.capacity_after.document.capacity.active_entries.used, 0);
    assert_eq!(plan.capacity_before.suggestion_effect, plan.capacity_after.suggestion_effect);
    assert_eq!(bytes, fs::read(&path)?);
    room.apply_prepared_native_history_boundary("owner", plan.selection)?;
    assert_eq!(room.native_history_capacity("owner")?, plan.capacity_after);
    assert!(matches!(
        room.plan_native_history_reserve("owner", seal)?,
        Outcome::Sufficient { source, capacity }
            if source == room.backup_identity()? && *capacity == plan.capacity_after
    ));
    Ok(())
}

#[test]
fn reserve_checks_the_private_author_and_room_receipts_before_selecting_a_boundary() -> TestResult {
    let files = Files::new()?;
    let (_, mut room) = start(&files, 3, true, true)?;
    room.enable_document_suggestions("owner")?;
    enable(&mut room, Lane::Document)?;
    let initial = room.native_history_capacity("owner")?;
    let effect = initial.suggestion_effect.ok_or("effect")?.capacity.active_bytes;
    let receiver = initial.document.capacity.active_bytes;
    assert!(effect.used > receiver.used);
    let bytes = fs::read(files.path("source.log"))?;
    let required = Reserve { active_bytes: receiver.limit - receiver.used, ..Reserve::default() };
    assert!(matches!(
        room.plan_native_history_reserve("owner", request(Lane::Document, "new", required))?,
        Outcome::Unavailable { capacity, .. } if *capacity == initial
    ));
    assert_eq!(bytes, fs::read(files.path("source.log"))?);
    let floor = initial.boundary_records.limit - initial.boundary_records.used + 1;
    let required = Reserve { boundary_records: floor, ..Reserve::default() };
    let plan = boundary(
        room.plan_native_history_reserve("owner", request(Lane::Document, "next", required))?,
    )?;
    assert!(matches!(plan.selection.boundary, NativeHistoryBoundary::ContinueDocument { .. }));
    assert_eq!(plan.capacity_after.boundary_records.used, initial.boundary_records.used + 1);
    assert!(plan.capacity_after.boundary_records.limit > initial.boundary_records.limit);
    Ok(())
}

#[test]
fn review_reserve_can_continue_once_and_reports_the_remaining_finite_ceiling() -> TestResult {
    let files = Files::new()?;
    let (_, mut room) = start(&files, 3, true, true)?;
    assert!(matches!(
        room.plan_native_history_reserve(
            "owner",
            request(Lane::Document, "next", Reserve::default()),
        ),
        Err(Error::Contract("native history reserve is empty"))
    ));
    let wrong_lane = Reserve { retained_review_events: 1, ..Reserve::default() };
    assert!(matches!(
        room.plan_native_history_reserve("owner", request(Lane::Document, "next", wrong_lane),),
        Err(Error::Contract("retained review reserve requires the review lane"))
    ));
    assert!(matches!(
        room.plan_native_history_reserve("owner", request(Lane::Review, "next", wrong_lane),),
        Err(Error::Contract("review V1 not enabled"))
    ));
    room.enable_review("owner")?;
    enable(&mut room, Lane::Review)?;
    let before = room.native_history_capacity("owner")?;
    let retained = before.review.ok_or("review")?.capacity.retained_events;
    let required = Reserve { retained_review_events: retained.limit + 1, ..Reserve::default() };
    let request_next = request(Lane::Review, "next", required);
    let plan = boundary(room.plan_native_history_reserve("owner", request_next.clone())?)?;
    assert_eq!(
        plan.selection.boundary,
        NativeHistoryBoundary::ContinueReview { next: "next".into() }
    );
    assert_eq!(plan.capacity_after.document, before.document);
    room.apply_prepared_native_history_boundary("owner", plan.selection)?;
    let bytes = fs::read(files.path("source.log"))?;
    let mut exhausted = request_next;
    exhausted.reserve.retained_review_events =
        plan.capacity_after.review.ok_or("review")?.capacity.retained_events.limit + 1;
    assert!(matches!(room.plan_native_history_reserve("owner", exhausted)?,
        Outcome::Unavailable { capacity, .. } if *capacity == plan.capacity_after));
    assert_eq!(bytes, fs::read(files.path("source.log"))?);
    Ok(())
}
