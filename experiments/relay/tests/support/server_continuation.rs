//! Actual native continuation is checked separately from the immutable original selected cut.
#[path = "server_continuation/fixture.rs"]
mod fixture;
use super::{
    live::{authentication, request, start},
    support::{Result, raster},
};
use breditor_collab_relay::{
    Error, OperationalServerRoom, RecoveryRegistrationCredentials, Room, RoomRecoveryPolicy,
    ServerRoomBackup, ServerRoomRecovery,
    assets::{AssetStore, asset_id},
    server::ServerRecoveryContinuationCoverage,
};
use fixture::{Fixture, copy_credentials, image};
use image::ImageFormat;
use std::{fs, io::Write};

#[tokio::test]
async fn checksummed_original_header_cannot_claim_another_native_profile_or_owner() -> Result {
    use sha2::{Digest, Sha256};
    let f = Fixture::new().await?;
    let before = f.snapshot()?;
    let magic = b"BREDITOR-SERVER1\n";
    let prefix = magic.len() + 4 + 32;
    let size = usize::try_from(u32::from_be_bytes(
        f.original_file[magic.len()..magic.len() + 4].try_into()?,
    ))?;
    let header = std::str::from_utf8(&f.original_file[prefix..prefix + size])?;
    for (old, new) in [
        (
            format!("\"profile\":{}", serde_json::to_string(&f.expected.origin.room.profile)?),
            format!(
                "\"profile\":{}",
                serde_json::to_string(&breditor_collab_relay::AtomicTransportProfile::Original)?
            ),
        ),
        ("\"owner\":\"owner\"".into(), "\"owner\":\"another-owner\"".into()),
        ("\"writerTransportVersion\":2".into(), "\"writerTransportVersion\":1".into()),
        (
            format!("\"document\":{}", serde_json::to_string(&f.expected.origin.room.document)?),
            "\"document\":\"another-document\"".into(),
        ),
    ] {
        assert!(header.contains(&old));
        let changed = header.replacen(&old, &new, 1);
        let mut file = magic.to_vec();
        file.extend_from_slice(&u32::try_from(changed.len())?.to_be_bytes());
        file.extend_from_slice(&Sha256::digest(changed.as_bytes()));
        file.extend_from_slice(changed.as_bytes());
        file.extend_from_slice(&f.original_file[prefix + size..]);
        let admitted = ServerRoomBackup::from_bytes(&file)?;
        let mut selected = f.expected.clone();
        selected.origin = admitted.info().identity;
        assert!(
            f.handle()
                .verify_continued_recovery_state(
                    "owner",
                    &f.owner,
                    admitted,
                    selected,
                    f.inventory()?,
                    copy_credentials(&f.credentials)
                )
                .await
                .is_err(),
            "Transport admission cannot prove original native identity: {old}"
        );
    }
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test]
async fn original_history_rasters_and_all_current_native_registrations_verify_without_mutation()
-> Result {
    let f = Fixture::new().await?;
    let before = f.snapshot()?;
    assert_ne!(f.expected.origin, f.expected.current.server);
    assert_eq!(f.expected.origin.assets.assets, 3);
    assert_eq!(f.expected.current.server.assets.assets, 4);
    let metadata = f.inventory()?.metadata();
    assert_eq!(metadata.writers.len(), 3);
    assert!(metadata.accounts.iter().any(|a| a.principal == "reader" && a.document_role.is_none()));
    assert_eq!(metadata.writers.iter().filter(|w| w.observer).count(), 1);
    let proof = f.proof().await?;
    assert_eq!(proof.identity(), f.expected);
    let mut detached = proof.identity();
    detached.origin.archive_sha256[0] ^= 1;
    detached.current.server.archive_sha256[0] ^= 1;
    assert_eq!(proof.identity(), f.expected);
    proof.check_live(f.handle(), "owner", &f.owner).await?;
    proof.check_live(&f.handle().clone(), "owner", &f.owner).await?;
    assert!(
        f.handle()
            .verify_selected_recovery_state(
                "owner",
                &f.owner,
                f.expected.current.clone(),
                f.inventory()?,
                copy_credentials(&f.credentials)
            )
            .await
            .is_ok()
    );
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test]
async fn missing_revoked_observer_and_later_credentials_remain_pending() -> Result {
    let f = Fixture::new().await?;
    let before = f.snapshot()?;
    for only_originals in [false, true] {
        let mut supplied = if only_originals {
            copy_credentials(&f.credentials)
        } else {
            RecoveryRegistrationCredentials::default()
        };
        if only_originals {
            supplied.documents.pop();
            supplied.reviews.pop();
        }
        let ServerRecoveryContinuationCoverage::Pending { missing } = f
            .handle()
            .verify_continued_recovery_state(
                "owner",
                &f.owner,
                f.original()?,
                f.expected.clone(),
                f.inventory()?,
                supplied,
            )
            .await?
        else {
            return Err("missing protected registrations must remain pending".into());
        };
        assert_eq!(missing.len(), if only_originals { 2 } else { 6 });
        if !only_originals {
            assert!(serde_json::to_string(&missing)?.contains("reader"));
        }
    }
    f.proof().await?;
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test]
async fn wrong_duplicate_or_foreign_original_and_later_credentials_refuse_instead_of_pending()
-> Result {
    let f = Fixture::new().await?;
    let before = f.snapshot()?;
    for variant in 0..7 {
        let mut supplied = copy_credentials(&f.credentials);
        match variant {
            0 => supplied.documents[0].credential = "a".repeat(64),
            1 => supplied.reviews[0].credential = "b".repeat(64),
            2 => supplied.documents[2].credential = "c".repeat(64),
            3 => supplied.reviews[2].credential = "d".repeat(64),
            4 => supplied.documents[2].writer = supplied.documents[0].writer.clone(),
            5 => supplied.reviews[1].principal = "owner".into(),
            _ => {
                supplied.documents[0].credential = "wrong".into();
                supplied.reviews.pop();
            }
        }
        assert!(matches!(
            f.handle()
                .verify_continued_recovery_state(
                    "owner",
                    &f.owner,
                    f.original()?,
                    f.expected.clone(),
                    f.inventory()?,
                    supplied
                )
                .await,
            Err(Error::Lease)
        ));
    }
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test]
async fn every_check_requires_current_authenticated_owner_and_exact_independent_selections()
-> Result {
    let f = Fixture::new().await?;
    let proof = f.proof().await?;
    let before = f.snapshot()?;
    for (principal, token) in [
        ("owner", f.reader.as_str()),
        ("reader", f.reader.as_str()),
        ("unknown", f.owner.as_str()),
        ("owner", "not-a-token"),
    ] {
        assert!(matches!(
            f.handle()
                .verify_continued_recovery_state(
                    principal,
                    token,
                    f.original()?,
                    f.expected.clone(),
                    f.inventory()?,
                    copy_credentials(&f.credentials)
                )
                .await,
            Err(Error::Permission)
        ));
        assert!(matches!(
            proof.check_live(f.handle(), principal, token).await,
            Err(Error::Permission)
        ));
    }
    for variant in 0..5 {
        let mut expected = f.expected.clone();
        match variant {
            0 => expected.origin.archive_sha256[0] ^= 1,
            1 => expected.current.server.assets.archive_sha256[0] ^= 1,
            2 => expected.current.participants.sha256[0] ^= 1,
            3 => expected.current.server.room.terminal_log_digest[0] ^= 1,
            _ => expected.current.participants.room.records += 1,
        }
        assert!(
            f.handle()
                .verify_continued_recovery_state(
                    "owner",
                    &f.owner,
                    f.original()?,
                    expected,
                    f.inventory()?,
                    copy_credentials(&f.credentials)
                )
                .await
                .is_err()
        );
    }
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test]
async fn valid_native_fork_with_the_same_original_seed_is_not_a_continuation() -> Result {
    let f = Fixture::new().await?;
    let original = f.original()?;
    let (mut room, mut assets) = ServerRoomRecovery::begin(
        &f.directory.0.join("fork"),
        &original,
        &f.expected.origin,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&original)?
    .into_parts();
    assert_eq!(room.asset_binding(), f.expected.current.server.assets.binding);
    room.grant("owner", "fork-only", Some(breditor_collab_relay::Role::Reader))?;
    let fork = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let mut expected = f.expected.clone();
    expected.origin = fork.info().identity;
    let before = f.snapshot()?;
    assert!(matches!(
        f.handle()
            .verify_continued_recovery_state(
                "owner",
                &f.owner,
                fork,
                expected,
                f.inventory()?,
                RecoveryRegistrationCredentials::default()
            )
            .await,
        Err(Error::Contract("continued server log lost selected original prefix"))
    ));
    assert_eq!(f.snapshot()?, before);
    f.proof().await?;
    Ok(())
}

#[tokio::test]
async fn current_valid_store_missing_an_original_unreferenced_raster_is_not_complete() -> Result {
    let mut f = Fixture::new().await?;
    f.stop();
    let root = f.directory.0.join("restored");
    let old = asset_id(&raster(ImageFormat::Jpeg)?);
    fs::remove_file(root.join("assets").join(format!("{}.asset", &old[7..])))?;
    let (authority, _) = Room::open(&root.join("room.log"))?;
    let assets = AssetStore::open(&root.join("assets"), authority.asset_binding())?;
    let (auth, owner, reader) = authentication()?;
    f.bind(authority, assets, auth, owner, reader)?;
    f.refresh().await?;
    assert_eq!(
        f.expected.current.server.assets.assets, 3,
        "A count equal to the original is not a retained-file proof"
    );
    let before = f.snapshot()?;
    assert!(matches!(
        f.handle()
            .verify_continued_recovery_state(
                "owner",
                &f.owner,
                f.original()?,
                f.expected.clone(),
                f.inventory()?,
                RecoveryRegistrationCredentials::default()
            )
            .await,
        Err(Error::Contract("operational original asset absent"))
    ));
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_http_mutation_invalidates_the_old_proof_and_fresh_selection_verifies_again() -> Result
{
    let mut f = Fixture::new().await?;
    let proof = f.proof().await?;
    let router = f.router.take().ok_or("fixture router")?;
    let (address, stop, task) = start(router).await?;
    let bytes = image(9, 11)?;
    let path = format!("/assets/{}", asset_id(&bytes));
    assert_eq!(request(address, "PUT", &path, "owner", &f.owner, &bytes).await?.0, 200);
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    assert!(
        f.proof().await.is_err(),
        "A saved exact current selection cannot authorize later rasters"
    );
    f.refresh().await?;
    let fresh = f.proof().await?;
    fresh.check_live(f.handle(), "owner", &f.owner).await?;
    assert_eq!(fresh.identity().origin, f.expected.origin);
    assert_eq!(fresh.identity().current.server.assets.assets, 5);
    assert_eq!(request(address, "GET", &path, "owner", &f.owner, &[]).await?.1, bytes);
    stop.send(()).map_err(|()| "stop continuation HTTP")?;
    task.await??;
    Ok(())
}

#[tokio::test]
async fn proofs_do_not_hold_stopped_owners_or_authorize_an_identical_restarted_host() -> Result {
    let mut f = Fixture::new().await?;
    let proof = f.proof().await?;
    let before = f.snapshot()?;
    f.stop();
    let operation = OperationalServerRoom::resume(
        &f.directory.0.join("restored"),
        &f.original()?,
        &f.expected.origin,
        RoomRecoveryPolicy::HostReacquired,
    )?;
    let (room, assets) = operation.into_parts();
    let (auth, owner, reader) = authentication()?;
    f.bind(room, assets, auth, owner, reader)?;
    assert_eq!(f.snapshot()?, before);
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    f.proof().await?.check_live(f.handle(), "owner", &f.owner).await?;
    Ok(())
}

#[tokio::test]
async fn a_second_live_native_host_cannot_reuse_the_first_hosts_continuation_proof() -> Result {
    use breditor_collab_relay::server::router_with_server_backups;
    let f = Fixture::new().await?;
    let proof = f.proof().await?;
    let current = f.handle().capture().await?;
    let (room, assets) = ServerRoomRecovery::begin(
        &f.directory.0.join("identical-current"),
        &current,
        &f.expected.current.server,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&current)?
    .into_parts();
    let (auth, owner, _) = authentication()?;
    let (_router, other) = router_with_server_backups(room, auth, assets)?;
    assert_eq!(other.capture_recovery_state("owner", &owner).await?.identity(), f.expected.current);
    assert!(proof.check_live(&other, "owner", &owner).await.is_err());
    let ServerRecoveryContinuationCoverage::Verified(fresh) = other
        .verify_continued_recovery_state(
            "owner",
            &owner,
            f.original()?,
            f.expected.clone(),
            f.inventory()?,
            copy_credentials(&f.credentials),
        )
        .await?
    else {
        return Err("the other live native host must obtain its own proof".into());
    };
    fresh.check_live(&other, "owner", &owner).await?;
    proof.check_live(f.handle(), "owner", &f.owner).await?;
    Ok(())
}

#[tokio::test]
async fn externally_appended_log_bytes_refuse_without_trimming_or_acknowledging_them() -> Result {
    let f = Fixture::new().await?;
    let proof = f.proof().await?;
    let mut file =
        fs::OpenOptions::new().append(true).open(f.directory.0.join("restored/room.log"))?;
    file.write_all(&[1, 2, 3])?;
    file.sync_all()?;
    let before = f.snapshot()?;
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    assert!(f.proof().await.is_err());
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
