//! Native authenticated review transport, independent document permissions and durable recovery.
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewImportOutcome, ReviewMessageId,
        ReviewOutcome, ReviewPrincipalId, ReviewSession, ReviewThreadId,
        actions::{CreateReviewThread, EditReviewMessage, ReplyToReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::InsertText,
    },
};
use breditor_collab_relay::{
    Admission, DurableReviewReceipt, Error, ReviewAdmission, ReviewCursor, ReviewRegistration,
    ReviewRole, Role, Room,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Files {
    dir: PathBuf,
    path: PathBuf,
}
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "breditor-review-room-{}-{nonce}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir)?;
        Ok(Self { path: dir.join("room.log"), dir })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        for name in ["room.log", "copy.log"] {
            let _ = fs::remove_file(self.dir.join(name));
        }
        let _ = fs::remove_dir(&self.dir);
    }
}
fn start(files: &Files) -> Result<(SharedRichProfile, Room)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/review-relay","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/review-relay","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok((profile, Room::create(&files.path, &configuration, &document, "owner")?))
}
fn policy(actor: &str, principal: &str, access: ReviewAccess) -> Result<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access,
    })
}
fn reviewer(
    profile: &SharedRichProfile,
    room: &mut Room,
    principal: &str,
    actor: &str,
    role: ReviewRole,
) -> Result<(ReviewRegistration, RichReplica, ReviewSession)> {
    room.grant("owner", principal, Some(Role::Reader))?;
    room.grant_review("owner", principal, Some(role))?;
    let observer = room.register_observer(principal)?;
    let replica =
        profile.join_frame("room".into(), observer.lease.writer, &room.catchup(principal)?)?;
    let registration = room.register_review(principal, ReviewActorId::try_new(actor)?)?;
    let review = replica.create_review_session(policy(
        actor,
        principal,
        if role == ReviewRole::Moderator { ReviewAccess::Moderate } else { ReviewAccess::Comment },
    )?)?;
    Ok((registration, replica, review))
}
fn dispatch(
    replica: &RichReplica,
    review: &mut ReviewSession,
    action: ReviewAction,
) -> Result<ReviewThreadId> {
    let ReviewOutcome::Committed(id) =
        replica.dispatch_review_guarded(&replica.observe()?, review, &review.observe(), action)?
    else {
        return Err("expected action".into());
    };
    Ok(ReviewThreadId::from_event(id))
}
fn create(replica: &RichReplica, review: &mut ReviewSession, body: &str) -> Result<ReviewThreadId> {
    dispatch(
        replica,
        review,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: replica.capture_review_anchor_guarded(
                &replica.observe()?,
                &ReviewAnchorTarget::Document,
            )?,
            body: body.into(),
        }),
    )
}
fn ack(outcome: ReviewAdmission) -> Result<DurableReviewReceipt> {
    let ReviewAdmission::Durable(ack) = outcome else {
        return Err("expected durable review receipt".into());
    };
    Ok(ack)
}
fn receive(
    room: &Room,
    principal: &str,
    replica: &RichReplica,
    review: &mut ReviewSession,
    cursor: Option<&ReviewCursor>,
) -> Result<ReviewCursor> {
    let mut page = room.review_catchup(principal, cursor)?;
    loop {
        for batch in &page.batches {
            assert!(matches!(
                replica.receive_review_guarded(
                    &replica.observe()?,
                    review,
                    &review.observe(),
                    &batch.source.policy(),
                    &batch.frame
                )?,
                ReviewImportOutcome::Applied | ReviewImportOutcome::Unchanged
            ));
        }
        if !page.more {
            return Ok(page.cursor);
        }
        page = room.review_catchup(principal, Some(&page.cursor))?;
    }
}

#[test]
fn lane_is_opt_in_and_comment_only_accounts_cannot_author_documents_even_after_promotion() -> Result
{
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    let before = fs::read(&files.path)?;
    assert!(room.review_descriptor("owner").is_err());
    assert!(room.register_review("owner", ReviewActorId::try_new("mine")?).is_err());
    assert_eq!(fs::read(&files.path)?, before);
    room.grant("owner", "reader", Some(Role::Reader))?;
    assert!(matches!(room.enable_review("reader"), Err(Error::Permission)));
    let descriptor = room.enable_review("owner")?;
    let enabled = fs::read(&files.path)?;
    assert_eq!(room.enable_review("owner")?, descriptor);
    assert_eq!(fs::read(&files.path)?, enabled);
    let observer = room.register_observer("reader")?;
    room.validate_observer_lease("reader", &observer.lease)?;
    assert!(room.register("reader").is_err());
    assert!(room.register_review("reader", ReviewActorId::try_new("reader.comments")?).is_err());
    room.grant_review("owner", "reader", Some(ReviewRole::Comment))?;
    let registration =
        room.register_review("reader", ReviewActorId::try_new("reader.comments")?)?;
    let mut reader = profile.join_frame(
        "room".into(),
        observer.lease.writer.clone(),
        &room.catchup("reader")?,
    )?;
    let mut review = reader.create_review_session(policy(
        "reader.comments",
        "reader",
        ReviewAccess::Comment,
    )?)?;
    let document = room.catchup("owner")?;
    create(&reader, &mut review, "Comment without edit permission")?;
    ack(room.admit_review("reader", &registration.lease, &review.export_frame(0)?)?)?;
    assert_eq!(room.catchup("owner")?, document);
    reader.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Not authorized".into(),
    })])?;
    let groups: Value =
        serde_json::from_str(&reader.writer_groups_guarded(&reader.observe()?, "0")?)?;
    let group = groups["groups"][0].as_str().ok_or("group")?;
    assert!(room.admit("reader", &observer.lease, group).is_err());
    room.grant("owner", "reader", Some(Role::Editor))?;
    let observer_lease =
        room.resume_observer("reader", &observer.lease.writer, &observer.credential)?;
    assert!(matches!(room.admit("reader", &observer_lease, group), Err(Error::Lease)));
    assert!(room.resume("reader", &observer.lease.writer, &observer.credential).is_err());
    let actual_writer = room.register("reader")?;
    assert_ne!(actual_writer.lease.writer, observer.lease.writer);
    assert!(
        room.resume_observer("reader", &actual_writer.lease.writer, &actual_writer.credential)
            .is_err()
    );
    assert_eq!(room.catchup("owner")?, document);
    drop(room);
    let (mut room, _) = Room::open(&files.path)?;
    let resumed = room.resume_observer("reader", &observer.lease.writer, &observer.credential)?;
    assert!(room.admit("reader", &resumed, group).is_err());
    assert_eq!(room.review_descriptor("owner")?, descriptor);
    Ok(())
}

#[test]
fn offline_comments_replies_and_independent_undo_recover_with_original_repacked_receipts() -> Result
{
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    room.enable_review("owner")?;
    let (ra, a, mut ar) =
        reviewer(&profile, &mut room, "alice", "alice.comments", ReviewRole::Comment)?;
    let (rb, b, mut br) =
        reviewer(&profile, &mut room, "bob", "bob.comments", ReviewRole::Comment)?;
    let document = room.catchup("owner")?;
    let thread = create(&a, &mut ar, "Offline original 🙂")?;
    let first_frame = ar.export_frame(0)?;
    let first = ack(room.admit_review("alice", &ra.lease, &first_frame)?)?;
    let cursor = receive(&room, "bob", &b, &mut br, None)?;
    dispatch(
        &b,
        &mut br,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Peer contribution".into() }),
    )?;
    ack(room.admit_review("bob", &rb.lease, &br.export_frame(0)?)?)?;
    receive(&room, "alice", &a, &mut ar, None)?;
    let observed = ar.observe();
    a.undo_review_guarded(&a.observe()?, &mut ar, &observed)?;
    let second_frame = ar.export_frame(1)?;
    let second = ack(room.admit_review("alice", &ra.lease, &second_frame)?)?;
    let proof = room.review_cursor_proof("alice", &cursor)?;
    assert_eq!(proof.prefixes.len(), 1);
    assert_eq!(proof.prefixes[0].principal.as_str(), "alice");
    assert_eq!(proof.prefixes[0].clock.through, "1");
    assert_eq!(proof.prefixes[0].clock.prefix_digest, first.receipt.prefix_digest);
    receive(&room, "bob", &b, &mut br, Some(&cursor))?;
    assert_eq!(br.view()?.threads[0].messages.len(), 2);
    assert_eq!(room.catchup("owner")?, document);
    let exact = ar.checkpoint_json()?;
    let own_doc = a.checkpoint()?;
    let stored = fs::read(&files.path)?;
    for secret in [&ra.credential, &ra.lease.token, &rb.credential, &rb.lease.token] {
        assert!(!stored.windows(secret.len()).any(|bytes| bytes == secret.as_bytes()));
    }
    drop(room);
    let (mut room, report) = Room::open(&files.path)?;
    assert_eq!(report.truncated_bytes, 0);
    assert!(matches!(room.admit_review("alice", &ra.lease, &second_frame), Err(Error::Lease)));
    let lease = room.resume_review("alice", &ra.lease.actor, &ra.credential)?;
    let before = fs::read(&files.path)?;
    let retry = ack(room.admit_review(
        "alice",
        &lease,
        &serde_json::to_string_pretty(&serde_json::from_str::<Value>(&first_frame)?)?,
    )?)?;
    assert_eq!(retry.sequence, first.sequence);
    assert_eq!(retry.receipt, first.receipt);
    assert!(retry.duplicate);
    let repacked = ack(room.admit_review("alice", &lease, &ar.export_frame(0)?)?)?;
    assert!(repacked.duplicate);
    assert_eq!(repacked.sequence, second.sequence);
    assert_eq!(repacked.receipt.through, "2");
    assert_eq!(fs::read(&files.path)?, before);
    let a = profile.restore("room", &own_doc)?;
    let mut restored = a.restore_review_session(
        policy("alice.comments", "alice", ReviewAccess::Comment)?,
        &exact,
    )?;
    receive(&room, "alice", &a, &mut restored, None)?;
    assert_eq!(restored.checkpoint_json()?, exact);
    let observed = restored.observe();
    a.redo_review_guarded(&a.observe()?, &mut restored, &observed)?;
    ack(room.admit_review("alice", &lease, &restored.export_frame(2)?)?)?;
    assert_eq!(room.review_writer_clock("bob", &ra.lease.actor)?.through, "3");
    assert_eq!(room.catchup("owner")?, document);
    Ok(())
}

#[test]
fn missing_review_or_document_dependencies_and_wrong_source_never_publish_or_append() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    room.enable_review("owner")?;
    let (ra, a, mut ar) =
        reviewer(&profile, &mut room, "alice", "alice.comments", ReviewRole::Comment)?;
    let (rb, b, mut br) =
        reviewer(&profile, &mut room, "bob", "bob.comments", ReviewRole::Comment)?;
    let thread = create(&a, &mut ar, "Not accepted yet")?;
    let observed = br.observe();
    b.receive_review_guarded(
        &b.observe()?,
        &mut br,
        &observed,
        &policy("alice.comments", "alice", ReviewAccess::Comment)?,
        &ar.export_frame(0)?,
    )?;
    dispatch(
        &b,
        &mut br,
        ReviewAction::Reply(ReplyToReviewThread { thread, body: "Depends on Alice".into() }),
    )?;
    let before = fs::read(&files.path)?;
    assert!(matches!(
        room.admit_review("bob", &rb.lease, &br.export_frame(0)?)?,
        ReviewAdmission::Pending { .. }
    ));
    assert!(room.admit_review("alice", &ra.lease, &br.export_frame(0)?).is_err());
    assert!(room.admit_review("bob", &ra.lease, &ar.export_frame(0)?).is_err());
    assert_eq!(fs::read(&files.path)?, before);
    assert_eq!(room.review_writer_clock("owner", &rb.lease.actor)?.through, "0");
    ack(room.admit_review("alice", &ra.lease, &ar.export_frame(0)?)?)?;
    ack(room.admit_review("bob", &rb.lease, &br.export_frame(0)?)?)?;
    room.grant("owner", "editor", Some(Role::Editor))?;
    room.grant_review("owner", "editor", Some(ReviewRole::Comment))?;
    let writer = room.register("editor")?;
    let registration =
        room.register_review("editor", ReviewActorId::try_new("editor.comments")?)?;
    let mut doc =
        profile.join_frame("room".into(), writer.lease.writer, &room.catchup("editor")?)?;
    let mut review =
        doc.create_review_session(policy("editor.comments", "editor", ReviewAccess::Comment)?)?;
    doc.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Offline edit ".into(),
    })])?;
    create(&doc, &mut review, "Comment on unaccepted edit")?;
    let frame = review.export_frame(0)?;
    let before = fs::read(&files.path)?;
    assert!(matches!(
        room.admit_review("editor", &registration.lease, &frame)?,
        ReviewAdmission::PendingDocument { .. }
    ));
    assert_eq!(fs::read(&files.path)?, before);
    let groups: Value = serde_json::from_str(&doc.writer_groups_guarded(&doc.observe()?, "0")?)?;
    let doc_lease = room.resume("editor", doc.writer(), &writer.credential)?;
    assert!(matches!(
        room.admit("editor", &doc_lease, groups["groups"][0].as_str().ok_or("group")?)?,
        Admission::Durable(_)
    ));
    ack(room.admit_review("editor", &registration.lease, &frame)?)?;
    Ok(())
}

#[test]
fn live_grants_fence_old_sockets_but_historical_moderator_admission_survives_revocation() -> Result
{
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    room.enable_review("owner")?;
    let (ra, a, mut ar) =
        reviewer(&profile, &mut room, "alice", "alice.comments", ReviewRole::Comment)?;
    let (rb, b, mut br) =
        reviewer(&profile, &mut room, "bob", "bob.comments", ReviewRole::Moderator)?;
    let thread = create(&a, &mut ar, "Original")?;
    ack(room.admit_review("alice", &ra.lease, &ar.export_frame(0)?)?)?;
    receive(&room, "bob", &b, &mut br, None)?;
    dispatch(
        &b,
        &mut br,
        ReviewAction::EditMessage(EditReviewMessage {
            message: ReviewMessageId::from_event(thread.event().clone()),
            body: "Moderated".into(),
        }),
    )?;
    ack(room.admit_review("bob", &rb.lease, &br.export_frame(0)?)?)?;
    room.grant_review("owner", "bob", Some(ReviewRole::Comment))?;
    assert!(room.admit_review("bob", &rb.lease, &br.export_frame(0)?).is_err());
    let lease = room.resume_review("bob", &rb.lease.actor, &rb.credential)?;
    room.release_review(&rb.lease);
    room.validate_review_lease("bob", &lease)?;
    dispatch(
        &b,
        &mut br,
        ReviewAction::EditMessage(EditReviewMessage {
            message: ReviewMessageId::from_event(thread.event().clone()),
            body: "No longer allowed".into(),
        }),
    )?;
    let before = fs::read(&files.path)?;
    assert!(room.admit_review("bob", &lease, &br.export_frame(1)?).is_err());
    assert_eq!(fs::read(&files.path)?, before);
    room.grant("owner", "bob", None)?;
    assert!(room.review_cursor_proof("bob", &room.review_catchup("alice", None)?.cursor).is_err());
    assert!(room.review_catchup("bob", None).is_err());
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    let page = room.review_catchup("alice", None)?;
    assert_eq!(page.batches[1].source.role, ReviewRole::Moderator);
    assert_eq!(page.current_role, Some(ReviewRole::Comment));
    receive(&room, "alice", &a, &mut ar, None)?;
    assert_eq!(ar.view()?.threads[0].messages[0].versions[0].text.as_deref(), Some("Moderated"));
    Ok(())
}

#[test]
fn cursor_is_bound_to_exact_log_and_large_escaped_catchup_is_paginated() -> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    room.enable_review("owner")?;
    let (registration, replica, mut review) =
        reviewer(&profile, &mut room, "alice", "alice.comments", ReviewRole::Comment)?;
    let body = "\"".repeat(16000);
    for _ in 0..80 {
        create(&replica, &mut review, &body)?;
    }
    let mut after = 0;
    let mut batch_count = 0;
    while after < 80 {
        let receipt =
            ack(room.admit_review("alice", &registration.lease, &review.export_frame(after)?)?)?;
        after = receipt.receipt.through.parse()?;
        batch_count += 1;
    }
    let first = room.review_catchup("alice", None)?;
    assert!(first.more);
    assert!(serde_json::to_vec(&first)?.len() <= 4 * 1024 * 1024);
    let second = room.review_catchup("alice", Some(&first.cursor))?;
    assert!(!second.more);
    assert!(!second.batches.is_empty());
    assert_eq!(first.batches.len() + second.batches.len(), batch_count);
    let viewer = profile.join_frame("room".into(), "999".into(), &room.catchup("owner")?)?;
    let mut peer = viewer.create_review_session(policy(
        "viewer.comments",
        "owner",
        ReviewAccess::ReadOnly,
    )?)?;
    receive(&room, "owner", &viewer, &mut peer, None)?;
    assert_eq!(peer.view()?.threads.len(), 80);
    for cursor in [
        ReviewCursor { binding: first.cursor.binding.clone(), after: "01".into() },
        ReviewCursor { binding: first.cursor.binding.clone(), after: "999999".into() },
        ReviewCursor { binding: "0".repeat(64), after: first.cursor.after.clone() },
    ] {
        assert!(room.review_catchup("owner", Some(&cursor)).is_err());
    }
    let other_files = Files::new()?;
    let (_, mut other) = start(&other_files)?;
    other.enable_review("owner")?;
    assert!(other.review_catchup("owner", Some(&first.cursor)).is_err());
    Ok(())
}

#[test]
fn torn_review_append_recovers_to_previous_prefix_and_exact_retry_after_complete_append_is_duplicate()
-> Result {
    let files = Files::new()?;
    let (profile, mut room) = start(&files)?;
    room.enable_review("owner")?;
    let (registration, replica, mut review) =
        reviewer(&profile, &mut room, "alice", "alice.comments", ReviewRole::Comment)?;
    create(&replica, &mut review, "Durable boundary")?;
    let frame = review.export_frame(0)?;
    let before = fs::read(&files.path)?;
    let accepted = ack(room.admit_review("alice", &registration.lease, &frame)?)?;
    drop(room);
    let complete = fs::read(&files.path)?;
    let copy = files.dir.join("copy.log");
    for keep in [1, 40, 71, 72, (complete.len() - before.len()) / 2] {
        fs::write(&copy, &complete[..before.len() + keep])?;
        let (mut room, report) = Room::open(&copy)?;
        assert_eq!(report.truncated_bytes, u64::try_from(keep)?);
        assert_eq!(room.review_writer_clock("owner", &registration.lease.actor)?.through, "0");
        let lease =
            room.resume_review("alice", &registration.lease.actor, &registration.credential)?;
        assert!(!ack(room.admit_review("alice", &lease, &frame)?)?.duplicate);
    }
    let (mut room, _) = Room::open(&files.path)?;
    let lease = room.resume_review("alice", &registration.lease.actor, &registration.credential)?;
    let retry = ack(room.admit_review("alice", &lease, &frame)?)?;
    assert_eq!(retry.sequence, accepted.sequence);
    assert_eq!(retry.receipt, accepted.receipt);
    assert!(retry.duplicate);
    assert_eq!(fs::read(&files.path)?, complete);
    Ok(())
}
