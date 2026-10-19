//! Public native checks bind fresh authentication and complete original files to one actual host.
use super::{
    live::{authentication, request, start},
    support::{Directory, Result, fill, source},
};
use breditor_collab_feasibility::review::ReviewActorId;
use breditor_collab_relay::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RoomParticipantInventory, RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
    assets::asset_id,
    server::{
        ServerBackupHandle, ServerRecoveryCoverage, ServerRecoveryStateIdentity,
        VerifiedServerRecoveryState, router_with_server_backups,
    },
};
use image::{DynamicImage, ImageFormat};
use std::{
    fs,
    io::{Cursor, Write},
};

struct Fixture {
    // Keep the directory alive until every native owner has been dropped.
    router: Option<axum::Router>,
    handle: Option<ServerBackupHandle>,
    directory: Directory,
    expected: ServerRecoveryStateIdentity,
    archive: ServerRoomBackup,
    inventory_json: String,
    originals: RecoveryRegistrationCredentials,
    owner: String,
    reader: String,
}
impl Fixture {
    async fn new() -> Result<Self> {
        let directory = Directory::new()?;
        let (_, mut room, mut assets) = source(&directory)?;
        fill(&room, &mut assets)?;
        room.enable_review("owner")?;
        let document = room.register("owner")?;
        let review = room.register_review("owner", ReviewActorId::try_new("owner.review")?)?;
        let originals = RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: document.lease.writer,
                credential: document.credential,
            }],
            reviews: vec![RecoveryReviewCredential {
                principal: "owner".into(),
                actor: review.lease.actor.as_str().into(),
                credential: review.credential,
            }],
        };
        let (auth, owner, reader) = authentication()?;
        let (router, handle) = router_with_server_backups(room, auth, assets)?;
        let capture = handle.capture_recovery_state("owner", &owner).await?;
        let expected = capture.identity();
        let (archive, inventory) = capture.into_parts();
        Ok(Self {
            router: Some(router),
            handle: Some(handle),
            directory,
            expected,
            archive,
            inventory_json: inventory.to_json().into(),
            originals,
            owner,
            reader,
        })
    }
    fn handle(&self) -> &ServerBackupHandle {
        self.handle.as_ref().expect("live fixture host")
    }
    fn inventory(&self) -> Result<RoomParticipantInventory> {
        Ok(RoomParticipantInventory::from_json(&self.inventory_json, &self.expected.participants)?)
    }
    fn credentials(&self) -> RecoveryRegistrationCredentials {
        RecoveryRegistrationCredentials {
            documents: self
                .originals
                .documents
                .iter()
                .map(|r| RecoveryDocumentCredential {
                    principal: r.principal.clone(),
                    writer: r.writer.clone(),
                    credential: r.credential.clone(),
                })
                .collect(),
            reviews: self
                .originals
                .reviews
                .iter()
                .map(|r| RecoveryReviewCredential {
                    principal: r.principal.clone(),
                    actor: r.actor.clone(),
                    credential: r.credential.clone(),
                })
                .collect(),
        }
    }
    async fn proof(&self) -> Result<VerifiedServerRecoveryState> {
        let ServerRecoveryCoverage::Verified(proof) = self
            .handle()
            .verify_selected_recovery_state(
                "owner",
                &self.owner,
                self.expected.clone(),
                self.inventory()?,
                self.credentials(),
            )
            .await?
        else {
            return Err("complete fixture credentials must verify".into());
        };
        Ok(proof)
    }
}

#[tokio::test]
async fn selected_native_check_is_read_only_and_missing_originals_never_create_a_proof() -> Result {
    let f = Fixture::new().await?;
    let before = fs::read(f.directory.0.join("source.log"))?;
    let ServerRecoveryCoverage::Pending { missing } = f
        .handle()
        .verify_selected_recovery_state(
            "owner",
            &f.owner,
            f.expected.clone(),
            f.inventory()?,
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("missing originals must stay pending".into());
    };
    assert_eq!(missing.len(), 2);
    let proof = f.proof().await?;
    assert_eq!(proof.identity(), f.expected);
    let mut detached = proof.identity();
    detached.server.archive_sha256[0] ^= 1;
    assert_eq!(proof.identity(), f.expected, "metadata copy cannot edit native proof");
    proof.check_live(f.handle(), "owner", &f.owner).await?;
    proof.check_live(&f.handle().clone(), "owner", &f.owner).await?;
    assert_eq!(fs::read(f.directory.0.join("source.log"))?, before);
    assert_eq!(f.handle().capture().await?.to_bytes()?, f.archive.to_bytes()?);
    Ok(())
}

#[tokio::test]
async fn selected_check_and_recheck_require_current_authentication_and_actual_owner_role() -> Result
{
    let f = Fixture::new().await?;
    for (principal, token) in [
        ("owner", f.reader.as_str()),
        ("reader", f.reader.as_str()),
        ("owner", "not-a-token"),
        ("unknown", f.owner.as_str()),
    ] {
        assert!(matches!(
            f.handle()
                .verify_selected_recovery_state(
                    principal,
                    token,
                    f.expected.clone(),
                    f.inventory()?,
                    f.credentials(),
                )
                .await,
            Err(Error::Permission)
        ));
    }
    let proof = f.proof().await?;
    assert!(matches!(
        proof.check_live(f.handle(), "reader", &f.reader).await,
        Err(Error::Permission)
    ));
    assert!(matches!(
        proof.check_live(f.handle(), "owner", &f.reader).await,
        Err(Error::Permission)
    ));
    Ok(())
}

#[tokio::test]
async fn wrong_original_document_or_review_credentials_reject_instead_of_pending() -> Result {
    let f = Fixture::new().await?;
    for review in [false, true] {
        let mut supplied = f.credentials();
        if review {
            supplied.reviews[0].credential = "a".repeat(64);
        } else {
            supplied.documents[0].credential = "b".repeat(64);
        }
        assert!(matches!(
            f.handle()
                .verify_selected_recovery_state(
                    "owner",
                    &f.owner,
                    f.expected.clone(),
                    f.inventory()?,
                    supplied,
                )
                .await,
            Err(Error::Lease)
        ));
    }
    f.proof().await?;
    Ok(())
}

#[tokio::test]
async fn changed_independent_selections_and_native_inventory_refuse_without_overwriting() -> Result
{
    let f = Fixture::new().await?;
    let before = f.handle().capture().await?.to_bytes()?;
    for variant in 0..4 {
        let mut expected = f.expected.clone();
        match variant {
            0 => expected.server.archive_sha256[0] ^= 1,
            1 => expected.server.assets.archive_sha256[0] ^= 1,
            2 => expected.participants.sha256[0] ^= 1,
            _ => expected.server.room.terminal_log_digest[0] ^= 1,
        }
        assert!(
            f.handle()
                .verify_selected_recovery_state(
                    "owner",
                    &f.owner,
                    expected,
                    f.inventory()?,
                    f.credentials(),
                )
                .await
                .is_err()
        );
    }
    assert_eq!(f.handle().capture().await?.to_bytes()?, before);
    Ok(())
}

#[tokio::test]
async fn byte_identical_second_restored_host_cannot_reuse_the_first_hosts_proof() -> Result {
    let mut f = Fixture::new().await?;
    let original_proof = f.proof().await?;
    f.router.take();
    f.handle.take();
    let mut hosts = Vec::new();
    for id in ["restored-one", "restored-two"] {
        let restored = ServerRoomRecovery::begin(
            &f.directory.0.join(id),
            &f.archive,
            &f.expected.server,
            RoomRecoveryPolicy::HostReacquired,
        )?
        .finish(&f.archive)?;
        let (room, assets) = restored.into_parts();
        let (auth, owner, _) = authentication()?;
        let (router, handle) = router_with_server_backups(room, auth, assets)?;
        assert!(original_proof.check_live(&handle, "owner", &owner).await.is_err());
        // Original account bearer tokens are not revived by a restored room log.
        assert!(matches!(
            handle
                .verify_selected_recovery_state(
                    "owner",
                    &f.owner,
                    f.expected.clone(),
                    f.inventory()?,
                    f.credentials()
                )
                .await,
            Err(Error::Permission)
        ));
        let ServerRecoveryCoverage::Verified(proof) = handle
            .verify_selected_recovery_state(
                "owner",
                &owner,
                f.expected.clone(),
                f.inventory()?,
                f.credentials(),
            )
            .await?
        else {
            return Err("restored native cut must verify with current auth".into());
        };
        proof.check_live(&handle, "owner", &owner).await?;
        hosts.push((router, handle, owner, proof));
    }
    assert_eq!(hosts[0].3.identity(), hosts[1].3.identity());
    assert!(hosts[0].3.check_live(&hosts[1].1, "owner", &hosts[1].2).await.is_err());
    assert!(hosts[1].3.check_live(&hosts[0].1, "owner", &hosts[0].2).await.is_err());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_http_raster_change_stales_proof_even_when_the_native_room_log_did_not_change()
-> Result {
    let mut f = Fixture::new().await?;
    let proof = f.proof().await?;
    let before = fs::read(f.directory.0.join("source.log"))?;
    let mut encoded = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(4, 5).write_to(&mut encoded, ImageFormat::Png)?;
    let bytes = encoded.into_inner();
    let (address, stop, task) = start(f.router.take().ok_or("router")?).await?;
    let path = format!("/assets/{}", asset_id(&bytes));
    assert_eq!(request(address, "PUT", &path, "owner", &f.owner, &bytes).await?.0, 200);
    assert_eq!(fs::read(f.directory.0.join("source.log"))?, before);
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    assert!(
        f.handle()
            .verify_selected_recovery_state(
                "owner",
                &f.owner,
                f.expected.clone(),
                f.inventory()?,
                RecoveryRegistrationCredentials::default()
            )
            .await
            .is_err(),
        "Missing credentials must not hide changed native files behind Pending"
    );
    stop.send(()).map_err(|()| "stop test server")?;
    task.await??;
    Ok(())
}

#[tokio::test]
async fn changed_native_log_bytes_refuse_recheck_without_repair_or_overwrite() -> Result {
    let f = Fixture::new().await?;
    let proof = f.proof().await?;
    let path = f.directory.0.join("source.log");
    let mut file = fs::OpenOptions::new().append(true).open(&path)?;
    file.write_all(&[1, 2, 3])?;
    file.sync_all()?;
    drop(file);
    let changed = fs::read(&path)?;
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    assert!(
        f.handle()
            .verify_selected_recovery_state(
                "owner",
                &f.owner,
                f.expected.clone(),
                f.inventory()?,
                f.credentials()
            )
            .await
            .is_err()
    );
    assert_eq!(fs::read(path)?, changed);
    Ok(())
}

#[tokio::test]
async fn changed_native_raster_bytes_refuse_recheck_without_repair_or_overwrite() -> Result {
    let f = Fixture::new().await?;
    let proof = f.proof().await?;
    let path = fs::read_dir(f.directory.0.join("source-assets"))?
        .filter_map(std::result::Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.extension().is_some_and(|extension| extension == "asset"))
        .ok_or("original raster record")?;
    let mut changed = fs::read(&path)?;
    let end = changed.len() - 1;
    changed[end] ^= 1;
    fs::write(&path, &changed)?;
    assert!(proof.check_live(f.handle(), "owner", &f.owner).await.is_err());
    assert!(
        f.handle()
            .verify_selected_recovery_state(
                "owner",
                &f.owner,
                f.expected.clone(),
                f.inventory()?,
                f.credentials()
            )
            .await
            .is_err()
    );
    assert_eq!(fs::read(path)?, changed);
    Ok(())
}
