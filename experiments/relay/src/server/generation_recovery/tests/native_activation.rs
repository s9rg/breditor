//! Actual source seal, retained recovery custody and native serving activation.
use super::source::{Source, TestResult, authentication};
use crate::{
    Error, Room,
    assets::AssetStore,
    server::{
        NativeLogGenerationActivationIdentity, PreparedLogGenerationHandover,
        PreparedLogGenerationRecoveryHost, RoomDeploymentAuthority,
        ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
        prepare_log_generation_recovery_host,
        router_with_log_generation_backups_and_deployment_lease,
    },
};
use std::{fs, sync::Arc};

struct Setup {
    source: Source,
    authority: RoomDeploymentAuthority,
    intent: Arc<PreparedLogGenerationHandover>,
    handle: PreparedLogGenerationRecoveryHost,
    owner: String,
    reader: String,
    _old_router: axum::Router,
}
impl Setup {
    async fn new(
        profile: (u32, bool),
        atomic: bool,
        history: (bool, bool),
        seal: bool,
    ) -> TestResult<Self> {
        let source = Source::new(profile, atomic, history.0, history.1)?;
        let (room, _) = Room::open_log_generations(&source.directory.0.join("source"))?;
        let assets = AssetStore::open_retained(
            &source.directory.0.join("source-assets"),
            room.asset_binding(),
        )?;
        let authority = RoomDeploymentAuthority::create(
            &source.directory.0.join("authority"),
            &room.deployment_binding()?,
        )?;
        let lease = authority.claim(&authority.current_selection()?)?;
        let (auth, owner, _) = authentication()?;
        let (router, live) = router_with_log_generation_backups_and_deployment_lease(
            room, auth, assets, lease, "owner", &owner,
        )
        .await?;
        let current = live.capture("owner", &owner).await?;
        assert_eq!(current.to_bytes()?, source.original.to_bytes()?);
        let intent = live
            .prepare_handover(
                "owner",
                &owner,
                &source.directory.0.join("intent"),
                current.info()?.identity,
            )
            .await?;
        let expected = intent.identity().clone();
        let intent = if seal {
            live.seal_prepared_handover("owner", &owner, intent, &expected).await?
        } else {
            intent
        };
        let (auth, token, reader) = authentication()?;
        let handle = prepare_log_generation_recovery_host(
            source.operation("target")?,
            auth,
            source.original_copy()?,
            &source.original.info()?.identity,
            "owner",
            &token,
        )
        .await?;
        // Target account credentials are separately configured, not copied from the source.
        Ok(Self {
            source,
            authority,
            intent: Arc::new(intent),
            handle,
            owner: token,
            reader,
            _old_router: router,
        })
    }
    async fn proof(&self) -> TestResult<VerifiedServerLogGenerationRecoveryState> {
        let state = self.handle.capture_recovery_state("owner", &self.owner).await?;
        let id = state.identity()?;
        let (_, inventory) = state.into_parts();
        match self
            .handle
            .verify_selected_recovery_state(
                "owner",
                &self.owner,
                id,
                inventory,
                self.source.protected_records(),
            )
            .await?
        {
            ServerLogGenerationRecoveryCoverage::Verified(proof) => Ok(proof),
            ServerLogGenerationRecoveryCoverage::Pending { .. } => {
                Err("missing actual credentials".into())
            }
        }
    }
    async fn choice(
        &self,
        proof: &VerifiedServerLogGenerationRecoveryState,
    ) -> TestResult<NativeLogGenerationActivationIdentity> {
        Ok(self
            .handle
            .preview_native_service_activation(
                "owner",
                &self.owner,
                &self.authority,
                &self.intent,
                proof,
            )
            .await?)
    }
    fn ledger(&self) -> TestResult<Vec<u8>> {
        Ok(fs::read(self.source.directory.0.join("authority/authority.log"))?)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_native_modes_activate_once_and_keep_original_custody_through_routes_and_earlier_clones()
-> TestResult {
    let mut count = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    let setup =
                        Box::pin(Setup::new(profile, atomic, (document, review), true)).await?;
                    let proof = setup.proof().await?;
                    let choice = setup.choice(&proof).await?;
                    let serialized = serde_json::to_vec(&choice)?;
                    let selected: NativeLogGenerationActivationIdentity =
                        serde_json::from_slice(&serialized)?;
                    let before = setup.ledger()?;
                    let earlier = setup.handle.clone();
                    let intent_root = setup.intent.root().to_owned();
                    let intent_id = setup.intent.identity().clone();
                    let root = setup.source.directory.0.join("target");
                    let active = setup
                        .handle
                        .activate_native_service(
                            "owner",
                            &setup.owner,
                            setup.authority.clone(),
                            setup.intent,
                            proof,
                            selected.clone(),
                        )
                        .await?;
                    assert_eq!(active.selection(), selected.planned_selection());
                    assert_eq!(setup.authority.current_selection()?, *selected.planned_selection());
                    assert_eq!(
                        fs::read(setup.source.directory.0.join("authority/authority.log"))?.len(),
                        before.len() + 104
                    );
                    let router = active.router();
                    drop(active);
                    drop(setup.handle);
                    assert!(matches!(
                        PreparedLogGenerationHandover::open(&intent_root, &intent_id),
                        Err(Error::Locked)
                    ));
                    assert!(matches!(
                        crate::log::generations::GenerationDirectory::open(&root),
                        Err(Error::Locked)
                    ));
                    earlier.capture_recovery_state("owner", &setup.owner).await?;
                    // A real later independent claim permanently fences even clones
                    // taken while the recovered host was still unfenced.
                    setup.authority.claim(selected.planned_selection())?.close();
                    assert!(matches!(
                        earlier.capture_recovery_state("owner", &setup.owner).await,
                        Err(Error::Lease)
                    ));
                    drop(earlier);
                    assert!(matches!(
                        PreparedLogGenerationHandover::open(&intent_root, &intent_id),
                        Err(Error::Locked)
                    ));
                    drop(router);
                    let cold = PreparedLogGenerationHandover::open(&intent_root, &intent_id)?;
                    assert_eq!(cold.source_backup().to_bytes()?, setup.source.original.to_bytes()?);
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 40);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wrong_auth_host_and_stale_target_never_append() -> TestResult {
    for kind in ["auth", "host", "physical", "raster", "decision"] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let proof = setup.proof().await?;
        let choice = setup.choice(&proof).await?;
        let before = setup.ledger()?;
        match kind {
            "auth" => {
                assert!(
                    setup
                        .handle
                        .activate_native_service(
                            "owner",
                            &setup.reader,
                            setup.authority.clone(),
                            setup.intent,
                            proof,
                            choice
                        )
                        .await
                        .is_err()
                );
            }
            "host" => {
                let (other, owner) = Box::pin(other_host(&setup)).await?;
                assert!(
                    other
                        .activate_native_service(
                            "owner",
                            &owner,
                            setup.authority.clone(),
                            setup.intent,
                            proof,
                            choice
                        )
                        .await
                        .is_err()
                );
            }
            "physical" | "raster" => {
                advance_target(&setup, kind == "raster").await?;
                let changed =
                    setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
                assert_ne!(changed, proof.identity());
                assert!(
                    setup
                        .handle
                        .activate_native_service(
                            "owner",
                            &setup.owner,
                            setup.authority.clone(),
                            setup.intent,
                            proof,
                            choice
                        )
                        .await
                        .is_err()
                );
                assert_eq!(
                    setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?,
                    changed
                );
            }
            "decision" => {
                let wrong = changed_choice(choice)?;
                assert!(
                    setup
                        .handle
                        .activate_native_service(
                            "owner",
                            &setup.owner,
                            setup.authority.clone(),
                            setup.intent,
                            proof,
                            wrong
                        )
                        .await
                        .is_err()
                );
            }
            _ => unreachable!(),
        }
        assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, before);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_same_actual_host_cannot_claim_a_second_activation() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let first = setup.proof().await?;
    let first_choice = setup.choice(&first).await?;
    let root = setup.intent.root().to_owned();
    let id = setup.intent.identity().clone();
    let active = setup
        .handle
        .activate_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            setup.intent,
            first,
            first_choice.clone(),
        )
        .await?;
    let before = fs::read(setup.source.directory.0.join("authority/authority.log"))?;
    let proof = setup.handle.capture_recovery_state("owner", &setup.owner).await?;
    let (_, inventory) = proof.into_parts();
    let crate::server::ServerLogGenerationRecoveryCoverage::Verified(proof) = setup
        .handle
        .verify_selected_recovery_state(
            "owner",
            &setup.owner,
            first_choice.current().clone(),
            inventory,
            setup.source.protected_records(),
        )
        .await?
    else {
        return Err("proof".into());
    };
    // The actual source owner is still held by the shared serving custody,
    // and even an earlier native handle cannot claim a second service epoch.
    assert!(PreparedLogGenerationHandover::open(&root, &id).is_err());
    let actual =
        setup.handle.host.generation_serving.get().ok_or("serving custody")?.source.clone();
    assert!(
        crate::server::deployment_fence::activate_native_generation(
            &setup.handle,
            "owner",
            &setup.authority,
            &actual,
            &proof,
            &first_choice,
            &crate::server::generation_backup::durable::Interruption::default()
        )
        .is_err()
    );
    assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, before);
    drop(active);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn interruption_after_synced_activation_keeps_the_same_host_permanently_fenced() -> TestResult
{
    use crate::server::generation_backup::durable::{Interruption, Point};
    for point in [Point::SourceChecked, Point::EpochWritten, Point::EpochSynced] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let proof = setup.proof().await?;
        let choice = setup.choice(&proof).await?;
        let before = setup.ledger()?;
        let result = crate::server::deployment_fence::activate_native_generation(
            &setup.handle,
            "owner",
            &setup.authority,
            &setup.intent,
            &proof,
            &choice,
            &Interruption { stop: Some(point), ..Default::default() },
        );
        assert!(result.is_err());
        let after = fs::read(setup.source.directory.0.join("authority/authority.log"))?;
        if point == Point::SourceChecked {
            assert_eq!(before, after);
            setup.handle.capture_recovery_state("owner", &setup.owner).await?;
        } else {
            assert_eq!(after.len(), before.len() + 104);
            assert_eq!(setup.authority.current_selection()?, *choice.planned_selection());
            assert!(
                setup.handle.capture_recovery_state("owner", &setup.owner).await.is_err(),
                "a synced epoch without a returned lease must not leave an unfenced usable host"
            );
            let cold = RoomDeploymentAuthority::open_at_least(
                &setup.source.directory.0.join("authority"),
                choice.planned_selection(),
            )?;
            assert_eq!(cold.current_selection()?, *choice.planned_selection());
        }
    }
    Ok(())
}

async fn advance_target(setup: &Setup, raster: bool) -> TestResult {
    if raster {
        let assets = setup.handle.host.assets.clone().ok_or("assets")?;
        setup
            .handle
            .host
            .transaction(move |room| {
                use std::io::Cursor;
                let mut bytes = Cursor::new(Vec::new());
                image::DynamicImage::new_rgb8(4, 5)
                    .write_to(&mut bytes, image::ImageFormat::Png)
                    .map_err(|_| Error::Contract("test raster"))?;
                let bytes = bytes.into_inner();
                room.put_asset(
                    "owner",
                    &mut *assets.lock().map_err(|_| Error::NeedsRecovery)?,
                    crate::assets::prepare_asset(
                        &crate::assets::asset_id(&bytes),
                        "image/png",
                        bytes,
                    )?,
                )
            })
            .await?;
    } else {
        setup
            .handle
            .host
            .transaction(|room| room.rotate_log_generation("owner", "new-physical-cut"))
            .await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unsealed_source_cannot_preview_native_activation() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), false)).await?;
    let proof = setup.proof().await?;
    let before = setup.ledger()?;
    assert!(setup.choice(&proof).await.is_err());
    assert_eq!(setup.ledger()?, before);
    drop(setup);
    Ok(())
}

async fn other_host(setup: &Setup) -> TestResult<(PreparedLogGenerationRecoveryHost, String)> {
    let (auth, owner, _) = authentication()?;
    let other = prepare_log_generation_recovery_host(
        setup.source.operation("other")?,
        auth,
        setup.source.original_copy()?,
        &setup.source.original.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    Ok((other, owner))
}

fn changed_choice(
    choice: NativeLogGenerationActivationIdentity,
) -> TestResult<NativeLogGenerationActivationIdentity> {
    let mut json = serde_json::to_value(choice)?;
    json["planned"]["owner"] = serde_json::Value::String("00".repeat(32));
    Ok(serde_json::from_value(json)?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_different_actual_authority_cannot_activate_or_append() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let choice = setup.choice(&proof).await?;
    let before = setup.ledger()?;
    let other = RoomDeploymentAuthority::create(
        &setup.source.directory.0.join("other-authority"),
        &setup.authority.identity().binding,
    )?;
    assert!(
        setup
            .handle
            .activate_native_service("owner", &setup.owner, other, setup.intent, proof, choice)
            .await
            .is_err()
    );
    assert_eq!(fs::read(setup.source.directory.0.join("authority/authority.log"))?, before);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancelled_activation_waiter_keeps_actual_source_and_target_owners_until_worker_settles()
-> TestResult {
    use crate::server::generation_backup::durable::{Barrier, Interruption, Point};
    use std::time::Duration;
    for point in [Point::SourceChecked, Point::EpochWritten, Point::EpochSynced] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let proof = setup.proof().await?;
        let choice = setup.choice(&proof).await?;
        let root = setup.intent.root().to_owned();
        let id = setup.intent.identity().clone();
        let target = setup.source.directory.0.join("target");
        let (entered, ready) = std::sync::mpsc::channel();
        let (release, released) = std::sync::mpsc::channel();
        let held = setup.handle.clone();
        let authority = setup.authority.clone();
        let selected = choice.clone();
        let worker = tokio::task::spawn_blocking(move || {
            crate::server::deployment_fence::activate_native_generation(
                &held,
                "owner",
                &authority,
                &setup.intent,
                &proof,
                &selected,
                &Interruption {
                    barrier: Some(Barrier {
                        point,
                        entered,
                        release: std::sync::Mutex::new(released),
                    }),
                    ..Interruption::default()
                },
            )
        });
        let caller = tokio::spawn(worker);
        tokio::task::spawn_blocking(move || ready.recv_timeout(Duration::from_secs(10))).await??;
        drop(setup.handle);
        caller.abort();
        assert!(caller.await.is_err());
        assert!(matches!(PreparedLogGenerationHandover::open(&root, &id), Err(Error::Locked)));
        assert!(matches!(
            crate::log::generations::GenerationDirectory::open(&target),
            Err(Error::Locked)
        ));
        release.send(())?;
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                match PreparedLogGenerationHandover::open(&root, &id) {
                    Ok(cold) => {
                        assert_eq!(
                            cold.source_backup().to_bytes()?,
                            setup.source.original.to_bytes()?
                        );
                        break;
                    }
                    Err(Error::Locked) => tokio::time::sleep(Duration::from_millis(2)).await,
                    Err(error) => return Err(error.into()),
                }
            }
            Ok::<_, Box<dyn std::error::Error>>(())
        })
        .await??;
        assert_eq!(setup.authority.current_selection()?, *choice.planned_selection());
        let mut current = crate::OperationalLogGenerationServerRoom::resume(
            &target,
            &setup.source.original,
            &setup.source.original.info()?.identity,
            super::source::POLICY,
            "owner",
        )?;
        current.check_live_source(&setup.source.original, "owner")?;
    }
    Ok(())
}
