//! End-to-end native server families with genuine original offline clients and exact cold recovery.
use super::*;
use crate::{Registration, ReviewRegistration, RoomBackup, RoomRecoveryPolicy};

struct Author {
    document: RichReplica,
    review: ReviewSession,
    document_registration: Registration,
    review_registration: ReviewRegistration,
    through: String,
}
struct FirstAcceptance {
    document_frame: String,
    document_receipt: DurableReceipt,
    review_frame: String,
    review_receipt: DurableReviewReceipt,
}
struct OfflineInput {
    document: String,
    review: String,
}

fn prepare_offline_author(
    profile: &SharedRichProfile,
    room: &mut Room,
    atomic: bool,
) -> TestResult<(Author, FirstAcceptance, OfflineInput)> {
    room.enable_review("owner")?;
    for principal in ["alice", "bob"] {
        room.grant("owner", principal, Some(Role::Editor))?;
        room.grant_review("owner", principal, Some(ReviewRole::Moderator))?;
    }
    let document_registration = room.register("alice")?;
    let review_registration =
        room.register_review("alice", ReviewActorId::try_new("alice.review")?)?;
    let mut document = profile.join_frame(
        "room".into(),
        document_registration.lease.writer.clone(),
        &room.catchup("alice")?,
    )?;
    insert(&mut document, "Alice retained ")?;
    insert(&mut document, "Alice redo ")?;
    assert!(document.undo()?);
    let (through, document_frame, document_receipt) =
        send_document(room, "alice", &document, &document_registration.lease, "0", atomic)?;
    let mut review = document.create_review_session(policy("alice.review", "alice")?)?;
    comment(&document, &mut review, "Alice retained comment")?;
    comment(&document, &mut review, "Alice redo comment")?;
    let observed = review.observe();
    assert!(matches!(
        document.undo_review_guarded(&document.observe()?, &mut review, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    let (review_frame, review_receipt) =
        send_review(room, "alice", &review, &review_registration.lease, 0)?;
    // These actual pending inputs precede both server-native generation boundaries.
    assert!(document.redo()?);
    let observed = review.observe();
    assert!(matches!(
        document.redo_review_guarded(&document.observe()?, &mut review, &observed)?,
        ReviewOutcome::Committed(_)
    ));
    let offline =
        OfflineInput { document: document.checkpoint()?, review: review.checkpoint_json()? };
    Ok((
        Author { document, review, document_registration, review_registration, through },
        FirstAcceptance { document_frame, document_receipt, review_frame, review_receipt },
        offline,
    ))
}

fn advance_peer(
    profile: &SharedRichProfile,
    room: &mut Room,
    atomic: bool,
    document_generations: bool,
    review_generations: bool,
) -> TestResult<ReviewSession> {
    let registration = room.register("bob")?;
    let comments = room.register_review("bob", ReviewActorId::try_new("bob.review")?)?;
    let mut owner = profile.join_frame(
        "room".into(),
        registration.lease.writer.clone(),
        &room.catchup("bob")?,
    )?;
    let mut review = owner.create_review_session(policy("bob.review", "bob")?)?;
    let mut through = "0".to_owned();
    for (index, next) in ["second", "third"].into_iter().enumerate() {
        insert(&mut owner, &format!("Bob peer {index} "))?;
        through = send_document(room, "bob", &owner, &registration.lease, &through, atomic)?.0;
        comment(&owner, &mut review, &format!("Bob peer {index}"))?;
        send_review(room, "bob", &review, &comments.lease, index as u64)?;
        if document_generations {
            seal(room, Lane::Document, next)?;
        }
        if review_generations {
            seal(room, Lane::Review, next)?;
        }
    }
    Ok(review)
}

fn reconnect(
    profile: &SharedRichProfile,
    room: &mut Room,
    author: &mut Author,
    first: &FirstAcceptance,
    offline: &OfflineInput,
    peer: &ReviewSession,
    atomic: bool,
) -> TestResult {
    author.document = profile.restore("room", &offline.document)?;
    author.document.receive_frame(&room.catchup("alice")?)?;
    author.review = author
        .document
        .restore_review_session(policy("alice.review", "alice")?, &offline.review)?;
    let observed = author.review.observe();
    author.document.receive_review_guarded(
        &author.document.observe()?,
        &mut author.review,
        &observed,
        &policy("bob.review", "bob")?,
        &peer.export_frame(0)?,
    )?;
    author.through = send_document(
        room,
        "alice",
        &author.document,
        &author.document_registration.lease,
        &author.through,
        atomic,
    )?
    .0;
    send_review(
        room,
        "alice",
        &author.review,
        &author.review_registration.lease,
        first.review_receipt.receipt.through.parse()?,
    )?;
    Ok(())
}

fn restore_and_continue(
    files: &Files,
    mut room: Room,
    mut author: Author,
    first: &FirstAcceptance,
    atomic: bool,
) -> TestResult {
    let document_cut = room.native_history_checkpoint("owner", Lane::Document)?;
    let review_cut = room.native_history_checkpoint("owner", Lane::Review)?;
    let native = room.replica.document_json().to_owned();
    let descriptor = room.native_history_descriptor("alice")?;
    let archive = room.export_backup()?;
    let identity = room.backup_identity()?;
    let bytes = fs::read(files.path("source.log"))?;
    drop(room);
    let loaded = RoomBackup::from_bytes(&archive.to_bytes())?;
    let mut room = Room::restore_backup(
        &files.path("restored.log"),
        &loaded,
        &identity,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    assert_eq!(fs::read(files.path("restored.log"))?, bytes);
    assert_eq!(room.replica.document_json(), native);
    assert_eq!(room.native_history_checkpoint("owner", Lane::Document)?, document_cut);
    assert_eq!(room.native_history_checkpoint("owner", Lane::Review)?, review_cut);
    assert_eq!(room.native_history_descriptor("alice")?, descriptor);
    assert!(room.validate_lease("alice", &author.document_registration.lease).is_err());
    assert!(room.validate_review_lease("alice", &author.review_registration.lease).is_err());
    let lease = room.resume(
        "alice",
        &author.document_registration.lease.writer,
        &author.document_registration.credential,
    )?;
    let review_lease = room.resume_review(
        "alice",
        &author.review_registration.lease.actor,
        &author.review_registration.credential,
    )?;
    let Admission::Durable(retry) = room.admit("alice", &lease, &first.document_frame)? else {
        return Err("duplicate document".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.sequence, first.document_receipt.sequence);
    assert_eq!(retry.receipt, first.document_receipt.receipt);
    let ReviewAdmission::Durable(retry) =
        room.admit_review("alice", &review_lease, &first.review_frame)?
    else {
        return Err("duplicate review".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.sequence, first.review_receipt.sequence);
    assert_eq!(retry.receipt, first.review_receipt.receipt);
    assert_eq!(fs::read(files.path("restored.log"))?, bytes);
    let mut review_through: u64 = author.review.local_writer_clock()?.through.parse()?;
    for redo in [false, true, false, true] {
        assert!(if redo { author.document.redo()? } else { author.document.undo()? });
        author.through =
            send_document(&mut room, "alice", &author.document, &lease, &author.through, atomic)?.0;
        assert!(room.replica.document_json().contains("Bob peer 0"));
        assert!(room.replica.document_json().contains("Bob peer 1"));
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
        send_review(&mut room, "alice", &author.review, &review_lease, review_through)?;
        review_through = author.review.local_writer_clock()?.through.parse()?;
        let view = room.review.as_ref().ok_or("review")?.session.view()?;
        assert!(view.threads.iter().any(|thread| thread.messages.iter().any(|message| {
            message.versions.iter().any(|version| version.text.as_deref() == Some("Bob peer 0"))
        })));
    }
    Ok(())
}

fn exercise(
    profile_version: (u32, bool),
    atomic: bool,
    document_generations: bool,
    review_generations: bool,
) -> TestResult {
    let files = Files::new()?;
    let (profile, mut room) = start(&files, profile_version.0, profile_version.1, atomic)?;
    let (mut author, first, offline) = prepare_offline_author(&profile, &mut room, atomic)?;
    let document_root = room.native_history_checkpoint("owner", Lane::Document)?;
    let review_root = room.native_history_checkpoint("owner", Lane::Review)?;
    if review_generations {
        enable(&mut room, Lane::Review)?;
    }
    if document_generations {
        enable(&mut room, Lane::Document)?;
    }
    let descriptor = room.native_history_descriptor("alice")?;
    assert_eq!(
        descriptor.document,
        if document_generations { Family::SegmentedV1 } else { Family::Original }
    );
    assert_eq!(
        descriptor.review,
        Some(if review_generations { Family::SegmentedV1 } else { Family::Original })
    );
    if document_generations {
        let saved: Value =
            serde_json::from_str(&room.native_history_checkpoint("owner", Lane::Document)?)?;
        assert_eq!(saved["rootCheckpoint"], document_root);
    }
    if review_generations {
        let saved: Value =
            serde_json::from_str(&room.native_history_checkpoint("owner", Lane::Review)?)?;
        assert_eq!(saved["root"], review_root);
    }
    let peer = advance_peer(&profile, &mut room, atomic, document_generations, review_generations)?;
    reconnect(&profile, &mut room, &mut author, &first, &offline, &peer, atomic)?;
    restore_and_continue(&files, room, author, &first, atomic)
}

#[test]
fn forty_independent_server_families_preserve_exact_archives_receipts_offline_edits_and_future_history()
-> TestResult {
    let mut cases = 0;
    for atomic in [false, true] {
        for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
            for document in [false, true] {
                for review in [false, true] {
                    exercise((version, standard), atomic, document, review)?;
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 40);
    Ok(())
}
