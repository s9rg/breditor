//! Independent document/comment families retain actual protected journals through the host boundary.
use super::super::{ServerLogGenerationRecoveryCoverage, prepare_log_generation_recovery_host};
use super::source::{
    POLICY, Source, TestResult, authentication, comment, insert, review_policy, send,
};
use crate::OperationalLogGenerationServerRoom;

async fn workflow(
    profile_choice: (u32, bool),
    atomic: bool,
    document: bool,
    review: bool,
) -> TestResult {
    let source = Source::new(profile_choice, atomic, document, review)?;
    let operation = source.operation("prepared")?;
    let destination = operation.root().to_owned();
    let (auth, owner, _) = authentication()?;
    let handle = prepare_log_generation_recovery_host(
        operation,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (backup, inventory) = state.into_parts();
    assert_eq!(expected.origin, source.original.info()?.identity);
    assert_eq!(backup.to_bytes()?, source.original.to_bytes()?);
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected,
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("protected records missing".into());
    };
    proof.check_live(&handle, "owner", &owner).await?;
    let dependencies = handle.capture_asset_recovery_state("owner", &owner).await?;
    assert_eq!(dependencies.current, proof.identity());
    assert_eq!(dependencies.references.source, dependencies.current.server.native);
    drop(handle);
    let mut operational = OperationalLogGenerationServerRoom::resume(
        &destination,
        &source.original,
        &source.original.info()?.identity,
        POLICY,
        "owner",
    )?;
    let (room, assets) = operational.components_mut();
    let peer = room.register("owner")?;
    let mut peer_document = source.profile.join_frame(
        "room".into(),
        peer.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut peer_document, "Peer preserved ")?;
    send(room, &peer_document, "owner", &peer.lease, "0", atomic)?;
    let lease = room.resume("owner", &source.author.lease.writer, &source.author.credential)?;
    let mut author = source.profile.restore("room", &source.offline)?;
    author.receive_frame(&room.catchup("owner")?)?;
    let mut through = send(room, &author, "owner", &lease, &source.through, atomic)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(room, &author, "owner", &lease, &through, atomic)?;
        assert!(author.document_json().contains("Peer preserved "));
        assert_eq!(author.document_json().contains("Old offline "), redo);
    }
    merge_review_after_host(room, &author, &peer_document, &source)?;
    assert_eq!(assets.count(), 3);
    operational.check_live_source(&source.original, "owner")?;
    Ok(())
}
fn merge_review_after_host(
    room: &mut crate::Room,
    author: &breditor_collab_feasibility::rich_replica::RichReplica,
    peer_document: &breditor_collab_feasibility::rich_replica::RichReplica,
    source: &Source,
) -> TestResult {
    use breditor_collab_feasibility::review::{ReviewActorId, ReviewOutcome};
    let peer = room.register_review("owner", ReviewActorId::try_new("peer.comments")?)?;
    let mut peer_review = peer_document.create_review_session(review_policy("peer.comments")?)?;
    comment(peer_document, &mut peer_review, "Peer comment preserved")?;
    assert!(matches!(
        room.admit_review("owner", &peer.lease, &peer_review.export_frame(0)?)?,
        crate::ReviewAdmission::Durable(_)
    ));
    let lease =
        room.resume_review("owner", &source.reviewer.lease.actor, &source.reviewer.credential)?;
    let mut review =
        author.restore_review_session(review_policy("owner.comments")?, &source.review_offline)?;
    let observed = review.observe();
    author.receive_review_guarded(
        &author.observe()?,
        &mut review,
        &observed,
        &review_policy("peer.comments")?,
        &peer_review.export_frame(0)?,
    )?;
    let frame = review.export_frame(source.review_through)?;
    assert!(matches!(
        room.admit_review("owner", &lease, &frame)?,
        crate::ReviewAdmission::Durable(_)
    ));
    let crate::ReviewAdmission::Durable(repeated) = room.admit_review("owner", &lease, &frame)?
    else {
        return Err("repeated review receipt".into());
    };
    assert!(repeated.duplicate);
    let mut through = review.local_writer_clock()?.through.parse()?;
    for redo in [false, true] {
        let observed = review.observe();
        let outcome = if redo {
            author.redo_review_guarded(&author.observe()?, &mut review, &observed)?
        } else {
            author.undo_review_guarded(&author.observe()?, &mut review, &observed)?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        assert!(matches!(
            room.admit_review("owner", &lease, &review.export_frame(through)?)?,
            crate::ReviewAdmission::Durable(_)
        ));
        through = review.local_writer_clock()?.through.parse()?;
        assert!(serde_json::to_string(&review.view()?)?.contains("Peer comment preserved"));
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_independent_native_families_retain_old_offline_undo_and_exact_server_files_across_prepared_host_lifetime()
-> TestResult {
    let mut count = 0;
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    Box::pin(workflow((version, standard), atomic, document, review)).await?;
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 40);
    Ok(())
}
