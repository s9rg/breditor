//! Public participant/native archive composition, protected continuity and unchanged offline work.
use super::{TestResult, insert, send, setup};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{ReviewAnchorTarget, RichReplica, selection::Selection},
};
use breditor_collab_relay::{
    GenerationRecoveryRegistrationCoverage, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Registration, ReviewAdmission,
    ReviewRegistration, ReviewRole, Role, Room, RoomRecoveryPolicy,
    ServerLogGenerationParticipantInventory, ServerLogGenerationRecovery,
};

struct Registrations {
    document: Registration,
    review: ReviewRegistration,
    retired: Registration,
    observer: Registration,
    protected: RecoveryRegistrationCredentials,
}
fn register(room: &mut Room) -> TestResult<Registrations> {
    room.enable_review("owner")?;
    room.grant("owner", "retired", Some(Role::Editor))?;
    room.grant_review("owner", "retired", Some(ReviewRole::Comment))?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    let document = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let retired = room.register("retired")?;
    let retired_review =
        room.register_review("retired", ReviewActorId::try_new("old.comments")?)?;
    let observer = room.register_observer("reader")?;
    let read_review =
        room.register_review_observer("reader", ReviewActorId::try_new("read.comments")?)?;
    room.grant("owner", "retired", None)?;
    let protected = RecoveryRegistrationCredentials {
        documents: [&document, &retired, &observer]
            .into_iter()
            .zip(["owner", "retired", "reader"])
            .map(|(value, principal)| RecoveryDocumentCredential {
                principal: principal.into(),
                writer: value.lease.writer.clone(),
                credential: value.credential.clone(),
            })
            .collect(),
        reviews: [&review, &retired_review, &read_review]
            .into_iter()
            .zip(["owner", "retired", "reader"])
            .map(|(value, principal)| RecoveryReviewCredential {
                principal: principal.into(),
                actor: value.lease.actor.as_str().into(),
                credential: value.credential.clone(),
            })
            .collect(),
    };
    Ok(Registrations { document, review, retired, observer, protected })
}
fn accepted_comment(
    room: &mut Room,
    client: &RichReplica,
    registration: &ReviewRegistration,
) -> TestResult {
    let mut review = client.create_review_session(ReviewActorPolicy {
        actor: registration.lease.actor.clone(),
        principal: ReviewPrincipalId::try_new("owner")?,
        access: ReviewAccess::Moderate,
    })?;
    let observed = review.observe();
    assert!(matches!(
        client.dispatch_review_guarded(
            &client.observe()?,
            &mut review,
            &observed,
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json: client.capture_review_anchor_guarded(
                    &client.observe()?,
                    &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() })
                )?,
                body: "Retained comment prefix".into(),
            })
        )?,
        ReviewOutcome::Committed(_)
    ));
    assert!(matches!(
        room.admit_review("owner", &registration.lease, &review.export_frame(0)?)?,
        ReviewAdmission::Durable(_)
    ));
    Ok(())
}
fn workflow(version: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, profile, mut room) = setup(version, standard, atomic)?;
    let registrations = register(&mut room)?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
    let mut client = profile.join_frame(
        "room".into(),
        registrations.document.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut client, "Accepted ")?;
    let mut through =
        send(&mut room, &client, "owner", &registrations.document.lease, "0", atomic)?;
    accepted_comment(&mut room, &client, &registrations.review)?;
    room.seal_document_history_generation("owner", "two".into())?;
    room.seal_review_history_generation("owner", "two".into())?;
    room.rotate_log_generation("owner", "two")?;
    insert(&mut client, "Old offline ")?;
    let journal = client.checkpoint()?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let selected = inventory.identity();
    let json = inventory.to_json().to_owned();
    let backup = room.export_log_generation_backup("owner")?;
    assert_eq!(selected.source, backup.info().identity);
    let metadata = inventory.metadata().native;
    assert_eq!(metadata.writers.len(), 3);
    assert_eq!(metadata.review.ok_or("native comment inventory")?.writers.len(), 3);
    assert_eq!(
        metadata
            .accounts
            .iter()
            .find(|a| a.principal == "retired")
            .ok_or("revoked account")?
            .document_role,
        None
    );
    assert!(metadata.writers.iter().any(|w| w.observer && w.clock.through == "0"));
    drop(room);
    let mut recovered = ServerLogGenerationRecovery::begin(
        &files.0.join("participants"),
        &backup,
        &selected.source,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    let room = recovered.room_mut();
    let inventory = ServerLogGenerationParticipantInventory::from_json(&json, &selected)?;
    let GenerationRecoveryRegistrationCoverage::Pending { missing } = inventory
        .verify_registrations(room, "owner", &RecoveryRegistrationCredentials::default())?
    else {
        return Err("complete missing protected set must remain pending".into());
    };
    assert_eq!(missing.len(), 6);
    let GenerationRecoveryRegistrationCoverage::Verified(proof) =
        inventory.verify_registrations(room, "owner", &registrations.protected)?
    else {
        return Err("complete protected set must match native restored source".into());
    };
    assert!(room.validate_lease("owner", &registrations.document.lease).is_err());
    assert!(room.validate_review_lease("owner", &registrations.review.lease).is_err());
    assert!(
        room.resume(
            "retired",
            &registrations.retired.lease.writer,
            &registrations.retired.credential
        )
        .is_err()
    );
    let observer = room.resume_observer(
        "reader",
        &registrations.observer.lease.writer,
        &registrations.observer.credential,
    )?;
    room.validate_observer_lease("reader", &observer)?;
    let lease = room.resume(
        "owner",
        &registrations.document.lease.writer,
        &registrations.document.credential,
    )?;
    proof.check_live(room, "owner")?;
    client = profile.restore("room", &journal)?;
    through = send(room, &client, "owner", &lease, &through, atomic)?;
    assert!(proof.check_live(room, "owner").is_err());
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "owner", &lease, &through, atomic)?;
        let peer = profile.join_frame("room".into(), "990".into(), &room.catchup("reader")?)?;
        assert_eq!(peer.document_json(), client.document_json());
        assert_eq!(client.document_json().contains("Old offline "), redo);
    }
    for secret in registrations
        .protected
        .documents
        .iter()
        .map(|d| &d.credential)
        .chain(registrations.protected.reviews.iter().map(|r| &r.credential))
    {
        assert!(!json.contains(secret));
    }
    Ok(())
}
#[test]
fn matching_generation_inventory_native_restore_and_protected_records_preserve_offline_undo_in_ten_modes()
-> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            workflow(version, standard, atomic)?;
        }
    }
    Ok(())
}

#[test]
fn wrong_duplicate_unknown_foreign_or_cross_domain_secrets_never_yield_a_partial_proof()
-> TestResult {
    let (_files, _, mut room) = setup(3, true, true)?;
    let mut registrations = register(&mut room)?;
    let inventory = room.log_generation_participant_inventory("owner")?;
    let before = room.export_log_generation_backup("owner")?.to_bytes();
    for case in 0..7 {
        let d = &registrations.protected.documents[0];
        let mut supplied = RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: d.principal.clone(),
                writer: d.writer.clone(),
                credential: d.credential.clone(),
            }],
            reviews: vec![],
        };
        match case {
            0 => supplied.documents[0].principal = "reader".into(),
            1 => supplied.documents[0].writer = "999".into(),
            2 => supplied.documents[0].credential = "bad".into(),
            3 => supplied.documents.push(RecoveryDocumentCredential {
                principal: d.principal.clone(),
                writer: d.writer.clone(),
                credential: d.credential.clone(),
            }),
            4 => supplied.reviews.push(RecoveryReviewCredential {
                principal: "owner".into(),
                actor: registrations.review.lease.actor.as_str().into(),
                credential: d.credential.clone(),
            }),
            5 => supplied.documents[0].credential = registrations.document.lease.token.clone(),
            _ => supplied.reviews.push(RecoveryReviewCredential {
                principal: "owner".into(),
                actor: "unknown".into(),
                credential: d.credential.clone(),
            }),
        }
        assert!(inventory.verify_registrations(&mut room, "owner", &supplied).is_err());
    }
    registrations.protected.reviews.pop();
    assert!(
        matches!(inventory.verify_registrations(&mut room, "owner", &registrations.protected)?,
        GenerationRecoveryRegistrationCoverage::Pending { missing } if missing.len() == 1)
    );
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), before);
    room.validate_lease("owner", &registrations.document.lease)?;
    room.validate_review_lease("owner", &registrations.review.lease)?;
    Ok(())
}
