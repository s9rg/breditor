//! Public owner-authenticated native inventory, exact server restore and unchanged offline history.
#[path = "support/server_recovery.rs"]
mod support;
use breditor_collab_feasibility::review::ReviewActorId;
use breditor_collab_relay::{
    MissingRecoveryRegistration, RecoveryDocumentCredential, RecoveryRegistrationCoverage,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Registration, ReviewRegistration,
    RoomParticipantInventory, RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
};
use support::{Directory, Result, flush, insert, source};

#[cfg(feature = "server")]
fn current_authentication()
-> Result<(breditor_collab_relay::server::Authentication, String, String)> {
    use breditor_collab_relay::server::Authentication;
    use serde_json::json;
    let (owner, owner_hash) = Authentication::issue_token()?;
    let (reader, reader_hash) = Authentication::issue_token()?;
    let config=json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":owner_hash},{"principal":"reader","tokenHash":reader_hash}]}).to_string();
    Ok((Authentication::from_json(&config)?, owner, reader))
}

fn protected_records(
    author: &Registration,
    reviewer: &ReviewRegistration,
    observer: &Registration,
    reader_review: &ReviewRegistration,
) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: [author, observer]
            .into_iter()
            .zip(["owner", "reader"])
            .map(|(record, principal)| RecoveryDocumentCredential {
                principal: principal.into(),
                writer: record.lease.writer.clone(),
                credential: record.credential.clone(),
            })
            .collect(),
        reviews: [reviewer, reader_review]
            .into_iter()
            .zip(["owner", "reader"])
            .map(|(record, principal)| RecoveryReviewCredential {
                principal: principal.into(),
                actor: record.lease.actor.as_str().into(),
                credential: record.credential.clone(),
            })
            .collect(),
    }
}

#[test]
fn restored_inventory_verifies_protected_records_without_reviving_leases_or_losing_offline_undo()
-> Result {
    let directory = Directory::new()?;
    let (profile, mut room, mut assets) = source(&directory)?;
    support::fill(&room, &mut assets)?;
    room.enable_review("owner")?;
    let author = room.register("owner")?;
    let reviewer = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let observer = room.register_observer("reader")?;
    let reader_review =
        room.register_review_observer("reader", ReviewActorId::try_new("reader.metadata")?)?;
    let mut client =
        profile.join_frame("room".into(), author.lease.writer.clone(), &room.catchup("owner")?)?;
    insert(&mut client, "p", "Accepted ")?;
    let through = flush(&mut room, &client, "owner", &author.lease, "0")?;
    insert(&mut client, "p", "Offline retained ")?;
    let journal = client.checkpoint()?;
    let inventory = room.participant_inventory("owner")?;
    let selected_inventory = inventory.identity();
    let inventory_file = inventory.to_json().to_owned();
    let backup = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let selected = backup.info().identity;
    assert_eq!(selected.room, selected_inventory.room);
    let file = backup.to_bytes()?;
    drop(room);
    drop(assets);
    let backup = ServerRoomBackup::from_bytes(&file)?;
    let (mut room, assets) = ServerRoomRecovery::begin(
        &directory.0.join("restored"),
        &backup,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?
    .into_parts();
    assert_eq!(assets.count(), 3);
    let inventory = RoomParticipantInventory::from_json(&inventory_file, &selected_inventory)?;
    inventory.verify_native(&mut room, "owner")?;
    let RecoveryRegistrationCoverage::Pending { missing } = inventory.verify_registrations(
        &mut room,
        "owner",
        &RecoveryRegistrationCredentials::default(),
    )?
    else {
        return Err("missing credentials".into());
    };
    assert!(missing.contains(&MissingRecoveryRegistration::Document {
        principal: "reader".into(),
        writer: observer.lease.writer.clone()
    }));
    let input = protected_records(&author, &reviewer, &observer, &reader_review);
    let RecoveryRegistrationCoverage::Verified(proof) =
        inventory.verify_registrations(&mut room, "owner", &input)?
    else {
        return Err("verified input".into());
    };
    proof.check_live(&mut room, "owner")?;
    assert!(room.validate_lease("owner", &author.lease).is_err());
    assert!(room.validate_review_lease("owner", &reviewer.lease).is_err());
    assert!(room.resume("reader", &observer.lease.writer, &observer.credential).is_err());
    let observer_lease =
        room.resume_observer("reader", &observer.lease.writer, &observer.credential)?;
    room.validate_observer_lease("reader", &observer_lease)?;
    let lease = room.resume("owner", &author.lease.writer, &author.credential)?;
    let mut client = profile.restore("room", &journal)?;
    let mut through = flush(&mut room, &client, "owner", &lease, &through)?;
    assert!(proof.check_live(&mut room, "owner").is_err());
    for redo in [false, true, false, false, true, true] {
        if redo {
            client.redo()?;
        } else {
            client.undo()?;
        }
        through = flush(&mut room, &client, "owner", &lease, &through)?;
        let remote = profile.join_frame("room".into(), "900".into(), &room.catchup("reader")?)?;
        assert_eq!(remote.document_json(), client.document_json());
    }
    Ok(())
}

#[cfg(feature = "server")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn private_live_host_authenticates_owner_and_never_interchanges_account_tokens_and_resume_secrets()
-> Result {
    use breditor_collab_relay::server::router_with_server_backups;
    let directory = Directory::new()?;
    let (_profile, mut room, assets) = source(&directory)?;
    let registration = room.register("owner")?;
    let (authentication, owner, reader) = current_authentication()?;
    let (_router, handle) = router_with_server_backups(room, authentication, assets)?;
    assert!(handle.capture_recovery_state("owner", &reader).await.is_err());
    assert!(handle.capture_recovery_state("reader", &reader).await.is_err());
    let cut = handle.capture_recovery_state("owner", &owner).await?;
    let identity = cut.identity();
    let (server, inventory) = cut.into_parts();
    assert_eq!(identity.server, server.info().identity);
    assert_eq!(identity.participants, inventory.identity());
    let input = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: registration.lease.writer.clone(),
            credential: owner.clone(),
        }],
        reviews: vec![],
    };
    assert!(
        handle
            .verify_recovery_registrations("owner", &owner, inventory.clone(), input)
            .await
            .is_err()
    );
    let input = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: registration.lease.writer,
            credential: registration.credential,
        }],
        reviews: vec![],
    };
    assert!(matches!(
        handle.verify_recovery_registrations("owner", &owner, inventory.clone(), input).await?,
        RecoveryRegistrationCoverage::Verified(_)
    ));
    for secret in [&owner, &reader, &registration.lease.token] {
        assert!(!inventory.to_json().contains(secret));
    }
    Ok(())
}

#[cfg(feature = "server")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stopped_source_and_restored_private_host_require_fresh_auth_but_keep_original_resume_records()
-> Result {
    use breditor_collab_relay::server::router_with_server_backups;
    let directory = Directory::new()?;
    let (_profile, mut room, mut assets) = source(&directory)?;
    support::fill(&room, &mut assets)?;
    let registered = room.register("owner")?;
    let (authentication, old_owner, _) = current_authentication()?;
    let (router, handle) = router_with_server_backups(room, authentication, assets)?;
    let cut = handle.capture_recovery_state("owner", &old_owner).await?;
    let selected = cut.identity();
    let (server, inventory) = cut.into_parts();
    let server_file = server.to_bytes()?;
    let inventory_file = inventory.to_json().to_owned();
    drop(handle);
    drop(router);
    let backup = ServerRoomBackup::from_bytes(&server_file)?;
    let (room, assets) = ServerRoomRecovery::begin(
        &directory.0.join("restored-private-host"),
        &backup,
        &selected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?
    .into_parts();
    assert_eq!(assets.count(), 3);
    assert!(room.validate_lease("owner", &registered.lease).is_err());
    let (authentication, owner, _) = current_authentication()?;
    let (_router, handle) = router_with_server_backups(room, authentication, assets)?;
    let inventory = RoomParticipantInventory::from_json(&inventory_file, &selected.participants)?;
    assert!(handle.capture_recovery_state("owner", &old_owner).await.is_err());
    assert_eq!(handle.capture_recovery_state("owner", &owner).await?.identity(), selected);
    assert!(
        handle
            .verify_recovery_registrations(
                "owner",
                &old_owner,
                inventory.clone(),
                RecoveryRegistrationCredentials::default()
            )
            .await
            .is_err()
    );
    assert!(matches!(
        handle
            .verify_recovery_registrations(
                "owner",
                &owner,
                inventory,
                RecoveryRegistrationCredentials {
                    documents: vec![RecoveryDocumentCredential {
                        principal: "owner".into(),
                        writer: registered.lease.writer,
                        credential: registered.credential,
                    }],
                    reviews: vec![],
                },
            )
            .await?,
        RecoveryRegistrationCoverage::Verified(_)
    ));
    Ok(())
}
