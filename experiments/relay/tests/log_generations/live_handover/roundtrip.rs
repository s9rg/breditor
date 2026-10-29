//! Real accepted offline frames, exact retries and future native history in both lanes.
use super::super::send;
use super::{TestResult, author::Author};
use breditor_collab_feasibility::{review::ReviewOutcome, rich_replica::SharedRichProfile};
use breditor_collab_relay::{Admission, ReviewAdmission, Room};
use serde_json::Value;

pub(super) fn reconnect(room: &mut Room, author: &mut Author, atomic: bool) -> TestResult {
    let lease = room.resume(
        "owner",
        &author.document_registration.lease.writer,
        &author.document_registration.credential,
    )?;
    let groups: Value = serde_json::from_str(&if atomic {
        author
            .document
            .writer_groups_v2_guarded(&author.document.observe()?, &author.document_through)?
    } else {
        author
            .document
            .writer_groups_guarded(&author.document.observe()?, &author.document_through)?
    })?;
    for frame in groups["groups"].as_array().ok_or("offline groups")? {
        let frame = frame.as_str().ok_or("offline frame")?;
        let Admission::Durable(first) = room.admit("owner", &lease, frame)? else {
            return Err("offline document pending".into());
        };
        assert!(!first.duplicate);
        let Admission::Durable(retry) = room.admit("owner", &lease, frame)? else {
            return Err("exact document retry pending".into());
        };
        assert!(retry.duplicate);
        assert_eq!(retry.sequence, first.sequence);
    }
    author.document_through = groups["through"].as_str().ok_or("document through")?.into();
    let review_lease = room.resume_review(
        "owner",
        &author.review_registration.lease.actor,
        &author.review_registration.credential,
    )?;
    let frame = author.review.export_frame(author.review_through)?;
    let ReviewAdmission::Durable(first) = room.admit_review("owner", &review_lease, &frame)? else {
        return Err("offline comment pending".into());
    };
    assert!(!first.duplicate);
    let ReviewAdmission::Durable(retry) = room.admit_review("owner", &review_lease, &frame)? else {
        return Err("exact comment retry pending".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.sequence, first.sequence);
    author.review_through = author.review.local_writer_clock()?.through.parse()?;
    let expected_document = author.document.document_json().to_owned();
    let expected_comments = serde_json::to_value(author.review.view()?.threads)?;
    for redo in [false, true] {
        assert!(if redo { author.document.redo()? } else { author.document.undo()? });
        author.document_through =
            send(room, &author.document, "owner", &lease, &author.document_through, atomic)?;
        let observed = author.review.observe();
        let outcome = if redo {
            author.document.redo_review_guarded(
                &author.document.observe()?,
                &mut author.review,
                &observed,
            )?
        } else {
            author.document.undo_review_guarded(
                &author.document.observe()?,
                &mut author.review,
                &observed,
            )?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        assert!(matches!(
            room.admit_review(
                "owner",
                &review_lease,
                &author.review.export_frame(author.review_through)?
            )?,
            ReviewAdmission::Durable(_)
        ));
        author.review_through = author.review.local_writer_clock()?.through.parse()?;
    }
    assert_eq!(author.document.document_json(), expected_document);
    assert_eq!(serde_json::to_value(author.review.view()?.threads)?, expected_comments);
    Ok(())
}
pub(super) fn check_document(
    profile: &SharedRichProfile,
    room: &Room,
    author: &Author,
) -> TestResult {
    let observer = profile.join_frame("room".into(), "99".into(), &room.catchup("owner")?)?;
    assert_eq!(observer.document_json(), author.document.document_json());
    Ok(())
}
