//! Actual private files, real source exclusion and source-bound epoch decisions.
use super::fixture::{Directory, TestResult, authentication, source};
use crate::{
    Error,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, LogGenerationHandoverStatus as Status, LogGenerationServerBackupHandle,
        PreparedLogGenerationHandover as Prepared,
        PreparedLogGenerationHandoverIdentity as Identity, RoomDeploymentAuthority,
        deployment_fence,
        generation_backup::durable::{Interruption, Point, prepare_with_interruption},
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use std::{fs, io::Cursor};
struct Live {
    directory: Directory,
    handle: LogGenerationServerBackupHandle,
    authority: RoomDeploymentAuthority,
    owner: String,
    reader: String,
    _router: axum::Router,
}
impl Live {
    async fn new() -> TestResult<Self> {
        Self::in_directory(Directory::new()?).await
    }
    async fn in_directory(directory: Directory) -> TestResult<Self> {
        let (mut room, _) = source(&directory, 3, true, true, true)?;
        room.enable_review("owner")?;
        room.enable_document_history_generations("owner", "root".into(), "one".into())?;
        room.enable_review_history_generations("owner", "root".into(), "one".into())?;
        let assets = AssetStore::open(&directory.0.join("assets"), room.asset_binding())?;
        let authority =
            RoomDeploymentAuthority::create(&directory.authority(), &room.deployment_binding()?)?;
        let lease = authority.claim(&authority.current_selection()?)?;
        let (owner, _) = Authentication::issue_token()?;
        let (reader, _) = Authentication::issue_token()?;
        let (router, handle) = router_with_log_generation_backups_and_deployment_lease(
            room,
            authentication(&owner, &reader)?,
            assets,
            lease,
            "owner",
            &owner,
        )
        .await?;
        Ok(Self { directory, handle, authority, owner, reader, _router: router })
    }
    async fn prepare(&self, name: &str) -> TestResult<Prepared> {
        let before = self.handle.capture("owner", &self.owner).await?;
        Ok(self
            .handle
            .prepare_handover(
                "owner",
                &self.owner,
                &self.directory.0.join(name),
                before.info()?.identity,
            )
            .await?)
    }
    fn ledger(&self) -> TestResult<Vec<u8>> {
        Ok(fs::read(self.directory.authority().join("authority.log"))?)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn prepared_archive_does_not_claim_and_unrelated_next_epoch_is_not_this_seal() -> TestResult {
    let live = Live::new().await?;
    let prepared = live.prepare("intent").await?;
    let id = prepared.identity().clone();
    let before = live.ledger()?;
    assert_eq!(prepared.status(&live.authority)?, Status::Prepared);
    assert!(matches!(Prepared::open(prepared.root(), &id), Err(Error::Locked)));
    let unrelated = live.authority.claim(id.previous_selection())?;
    assert_eq!(unrelated.selection().generation, id.planned_selection().generation);
    assert_ne!(unrelated.selection(), *id.planned_selection());
    assert_eq!(prepared.status(&live.authority)?, Status::Superseded);
    assert_eq!(live.ledger()?.len(), before.len() + 104);
    let root = prepared.root().to_owned();
    drop(prepared);
    let cold =
        Prepared::open(&root, &serde_json::from_slice::<Identity>(&serde_json::to_vec(&id)?)?)?;
    assert_eq!(cold.status(&live.authority)?, Status::Superseded);
    assert!(live.handle.seal_prepared_handover("owner", &live.owner, cold, &id).await.is_err());
    assert_eq!(live.ledger()?.len(), before.len() + 104);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_complete_intent_commits_its_own_nonce_and_remains_historical_after_later_claims()
-> TestResult {
    let live = Live::new().await?;
    let prepared = live.prepare("intent").await?;
    let id: Identity = serde_json::from_slice(&serde_json::to_vec(prepared.identity())?)?;
    let root = prepared.root().to_owned();
    let bytes = prepared.source_backup().to_bytes()?;
    let prepared = live.handle.seal_prepared_handover("owner", &live.owner, prepared, &id).await?;
    assert_eq!(live.authority.current_selection()?, *id.planned_selection());
    assert_eq!(prepared.status(&live.authority)?, Status::Sealed);
    assert!(live.handle.capture("owner", &live.owner).await.is_err());
    live.authority.claim(&live.authority.current_selection()?)?.close();
    assert_eq!(prepared.status(&live.authority)?, Status::Sealed);
    drop(prepared);
    let cold = Prepared::open(&root, &id)?;
    assert_eq!(cold.status(&live.authority)?, Status::Sealed);
    assert_eq!(cold.source_backup().to_bytes()?, bytes);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stale_physical_cut_or_raster_never_fences_a_newer_complete_source() -> TestResult {
    for raster in [false, true] {
        let live = Live::new().await?;
        let prepared = live.prepare("intent").await?;
        let id = prepared.identity().clone();
        let before = live.ledger()?;
        if raster {
            let mut png = Cursor::new(Vec::new());
            image::DynamicImage::new_rgb8(2, 3).write_to(&mut png, image::ImageFormat::Png)?;
            let png = png.into_inner();
            let blob = prepare_asset(&asset_id(&png), "image/png", png)?;
            let assets = live.handle.host.assets.clone().ok_or("assets")?;
            live.handle
                .host
                .transaction(move |room| {
                    room.put_asset(
                        "owner",
                        &mut *assets.lock().map_err(|_| Error::NeedsRecovery)?,
                        blob,
                    )
                })
                .await?;
        } else {
            live.handle
                .host
                .transaction(|room| room.rotate_log_generation("owner", "next"))
                .await?;
        }
        let newer = live.handle.capture("owner", &live.owner).await?.to_bytes()?;
        assert!(matches!(
            live.handle.seal_prepared_handover("owner", &live.owner, prepared, &id).await,
            Err(Error::Contract("prepared handover source cut changed"))
        ));
        assert_eq!(live.ledger()?, before);
        assert_eq!(live.handle.capture("owner", &live.owner).await?.to_bytes()?, newer);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn auth_owner_occupied_path_and_wrong_choice_fail_before_epoch_mutation() -> TestResult {
    let live = Live::new().await?;
    let backup = live.handle.capture("owner", &live.owner).await?;
    let root = live.directory.0.join("denied");
    let before = live.ledger()?;
    assert!(
        live.handle
            .prepare_handover("owner", &live.reader, &root, backup.info()?.identity)
            .await
            .is_err()
    );
    assert!(!root.exists());
    assert!(
        live.handle
            .prepare_handover("reader", &live.reader, &root, backup.info()?.identity)
            .await
            .is_err()
    );
    assert!(!root.exists());
    let prepared = live.prepare("intent").await?;
    let id = prepared.identity().clone();
    let another = live.prepare("another").await?;
    assert!(matches!(
        live.handle
            .seal_prepared_handover("owner", &live.owner, prepared, another.identity())
            .await,
        Err(Error::Contract("prepared handover selected intent differs"))
    ));
    let saved = fs::read(live.directory.0.join("intent/intent.json"))?;
    assert!(live.prepare("intent").await.is_err());
    assert_eq!(fs::read(live.directory.0.join("intent/intent.json"))?, saved);
    let prepared = Prepared::open(&live.directory.0.join("intent"), &id)?;
    assert!(
        live.handle.seal_prepared_handover("reader", &live.reader, prepared, &id).await.is_err()
    );
    assert_eq!(live.ledger()?, before);
    assert_eq!(live.handle.capture("owner", &live.owner).await?.to_bytes()?, backup.to_bytes()?);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn archive_and_intent_interruptions_preserve_every_byte_without_an_epoch_append() -> TestResult
{
    for point in [Point::ArchiveSynced, Point::IntentSynced] {
        let live = Live::new().await?;
        let backup = live.handle.capture("owner", &live.owner).await?;
        let root = live.directory.0.join("intent");
        let before = live.ledger()?;
        let stop =
            Interruption { stop: Some(point), exit_process: false, ..Interruption::default() };
        assert!(
            prepare_with_interruption(
                &live.handle.host,
                "owner",
                &root,
                &backup.info()?.identity,
                &stop
            )
            .is_err()
        );
        assert_eq!(fs::read(root.join("source.backup"))?, backup.to_bytes()?);
        if point == Point::IntentSynced {
            let selected: Identity = serde_json::from_slice(&fs::read(root.join("intent.json"))?)?;
            let prepared = Prepared::open(&root, &selected)?;
            assert_eq!(prepared.status(&live.authority)?, Status::Prepared);
        } else {
            assert!(!root.join("intent.json").exists());
        }
        assert_eq!(live.ledger()?, before);
        assert_eq!(
            live.handle.capture("owner", &live.owner).await?.to_bytes()?,
            backup.to_bytes()?
        );
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_failed_wait_before_or_after_epoch_sync_is_resolved_from_independently_retained_data()
-> TestResult {
    for point in [Point::SourceChecked, Point::EpochSynced] {
        let live = Live::new().await?;
        let prepared = live.prepare("intent").await?;
        let outside = serde_json::to_vec(prepared.identity())?;
        let root = prepared.root().to_owned();
        let bytes = prepared.source_backup().to_bytes()?;
        let before = live.ledger()?;
        let stop =
            Interruption { stop: Some(point), exit_process: false, ..Interruption::default() };
        assert!(
            deployment_fence::seal_prepared(&live.handle.host, "owner", &prepared, &stop).is_err()
        );
        drop(prepared);
        let cold = Prepared::open(&root, &serde_json::from_slice(&outside)?)?;
        assert_eq!(cold.source_backup().to_bytes()?, bytes);
        assert_eq!(
            cold.status(&live.authority)?,
            if point == Point::SourceChecked { Status::Prepared } else { Status::Sealed }
        );
        assert_eq!(
            live.ledger()?.len(),
            before.len() + if point == Point::SourceChecked { 0 } else { 104 }
        );
        assert_eq!(
            live.handle.capture("owner", &live.owner).await.is_ok(),
            point == Point::SourceChecked
        );
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn replaced_or_changed_immutable_intents_and_unknown_files_never_authorize_a_seal()
-> TestResult {
    for mode in 0..4 {
        let live = Live::new().await?;
        let prepared = live.prepare("intent").await?;
        let id = prepared.identity().clone();
        let before = live.ledger()?;
        let root = prepared.root().to_owned();
        let file = root.join(if mode == 0 { "source.backup" } else { "intent.json" });
        let original = fs::read(&file)?;
        match mode {
            0 | 1 => {
                fs::rename(&file, root.join("original-held"))?;
                fs::write(&file, &original)?;
            }
            2 => {
                fs::write(&file, &original)?;
            }
            _ => {
                fs::write(root.join("unknown"), b"preserve")?;
            }
        }
        assert!(prepared.status(&live.authority).is_err());
        assert!(
            live.handle.seal_prepared_handover("owner", &live.owner, prepared, &id).await.is_err()
        );
        assert_eq!(live.ledger()?, before);
        assert!(root.exists());
        assert_eq!(fs::read(&file)?, original);
    }
    Ok(())
}

#[path = "process_laws.rs"]
mod process_laws;
