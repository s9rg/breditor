//! Actual current native history, room-bound raster bytes and revocable opaque host mappings.
use super::{
    live::{authentication, request, start},
    support::{Directory, Result, fill, raster, source_for_profile},
};
use breditor_collab_feasibility::rich_replica::{
    Command, VersionAssetReference, actions::ReplaceImage,
};
use breditor_collab_relay::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, Room, RoomRecoveryPolicy,
    ServerAssetReferenceOutcome, ServerRoomRecovery,
    assets::{AssetStore, asset_id},
    server::{
        ContentAddressedServerAssets, ServerAssetAvailabilityCoverage,
        ServerAssetAvailabilityMissing, ServerBackupHandle, ServerRecoveryAssetCoverage,
        ServerRecoveryAssetProvider, ServerRecoveryContinuationCoverage,
        ServerRecoveryContinuationIdentity, ServerRecoveryStateIdentity,
        VerifiedServerAssetAvailability, VerifiedServerRecoveryContinuation,
        router_with_server_backups,
    },
};
use image::{DynamicImage, ImageFormat};
use std::{
    collections::BTreeMap,
    fs,
    io::Cursor,
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct MappingState {
    allowed: bool,
    epoch: u64,
    pairs: BTreeMap<(String, String), String>,
    calls: usize,
    flip_on: Option<usize>,
    flip_target: String,
}
struct MappingGuard {
    state: Arc<Mutex<MappingState>>,
    epoch: u64,
}
impl ServerRecoveryAssetProvider for MappingGuard {
    fn check(&self) -> std::result::Result<(), Error> {
        let state = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        if !state.allowed || state.epoch != self.epoch {
            return Err(Error::Permission);
        }
        Ok(())
    }
    fn resolve(&self, pair: &VersionAssetReference) -> std::result::Result<Option<String>, Error> {
        let mut state = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        let key = (pair.asset.clone(), pair.generation.clone());
        let value = state.pairs.get(&key).cloned();
        state.calls += 1;
        if state.flip_on == Some(state.calls) {
            let target = state.flip_target.clone();
            state.pairs.insert(key, target);
        }
        Ok(value)
    }
}

struct Fixture {
    router: Option<axum::Router>,
    handle: Option<ServerBackupHandle>,
    directory: Directory,
    owner: String,
    reader: String,
    expected: ServerRecoveryStateIdentity,
    credentials: RecoveryRegistrationCredentials,
}
impl Fixture {
    async fn new(opaque: bool) -> Result<Self> {
        Self::with_profile(opaque, (3, true, true)).await
    }
    async fn with_profile(opaque: bool, spec: (u32, bool, bool)) -> Result<Self> {
        Self::with_opaque_asset(opaque.then_some("opaque-image"), spec).await
    }
    async fn with_opaque_asset(
        opaque_asset: Option<&str>,
        spec: (u32, bool, bool),
    ) -> Result<Self> {
        let directory = Directory::new()?;
        let (authority, assets, credentials) = {
            let (profile, mut authority, mut assets) =
                source_for_profile(&directory, spec.0, spec.1, spec.2)?;
            fill(&authority, &mut assets)?;
            let registered = authority.register("owner")?;
            let mut client = profile.join_frame(
                "room".into(),
                registered.lease.writer.clone(),
                &authority.catchup("owner")?,
            )?;
            let mut commands = vec![
                Command::ReplaceImage(ReplaceImage {
                    block: "image-block".into(),
                    asset: asset_id(&raster(ImageFormat::Jpeg)?),
                    generation: "jpeg-generation".into(),
                }),
                Command::ReplaceImage(ReplaceImage {
                    block: "image-block".into(),
                    asset: asset_id(&raster(ImageFormat::WebP)?),
                    generation: "webp-generation".into(),
                }),
            ];
            if let Some(opaque_asset) = opaque_asset {
                commands.extend([
                    Command::ReplaceImage(ReplaceImage {
                        block: "image-block".into(),
                        asset: opaque_asset.into(),
                        generation: "first-generation".into(),
                    }),
                    Command::ReplaceImage(ReplaceImage {
                        block: "image-block".into(),
                        asset: opaque_asset.into(),
                        generation: "second-generation".into(),
                    }),
                ]);
            }
            client.apply(commands)?;
            let groups: serde_json::Value = serde_json::from_str(&if spec.2 {
                client.writer_groups_v2_guarded(&client.observe()?, "0")?
            } else {
                client.writer_groups_guarded(&client.observe()?, "0")?
            })?;
            for group in groups["groups"].as_array().ok_or("native groups")? {
                assert!(matches!(
                    authority.admit(
                        "owner",
                        &registered.lease,
                        group.as_str().ok_or("native group")?
                    )?,
                    breditor_collab_relay::Admission::Durable(_)
                ));
            }
            let credentials = RecoveryRegistrationCredentials {
                documents: vec![RecoveryDocumentCredential {
                    principal: "owner".into(),
                    writer: registered.lease.writer,
                    credential: registered.credential,
                }],
                reviews: Vec::new(),
            };
            (authority, assets, credentials)
        };
        let (auth, owner, reader) = authentication()?;
        let (router, handle) = router_with_server_backups(authority, auth, assets)?;
        let state = handle.capture_asset_recovery_state("owner", &owner).await?;
        assert_eq!(state.references.room, state.current.server.room);
        assert!(matches!(state.references.outcome, ServerAssetReferenceOutcome::Ready { .. }));
        Ok(Self {
            router: Some(router),
            handle: Some(handle),
            directory,
            owner,
            reader,
            expected: state.current,
            credentials,
        })
    }
    fn handle(&self) -> &ServerBackupHandle {
        self.handle.as_ref().expect("actual fixture host")
    }
    async fn proof(
        &self,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<VerifiedServerAssetAvailability> {
        let ServerAssetAvailabilityCoverage::Verified(proof) = self
            .handle()
            .verify_server_asset_availability("owner", &self.owner, self.expected.clone(), provider)
            .await?
        else {
            return Err("complete native/provider byte availability expected".into());
        };
        Ok(proof)
    }
    fn snapshot(&self) -> Result<BTreeMap<String, Vec<u8>>> {
        let mut out = BTreeMap::new();
        out.insert("source.log".into(), fs::read(self.directory.0.join("source.log"))?);
        for entry in fs::read_dir(self.directory.0.join("source-assets"))? {
            let entry = entry?;
            out.insert(
                format!("source-assets/{}", entry.file_name().to_string_lossy()),
                fs::read(entry.path())?,
            );
        }
        Ok(out)
    }
    fn stop(&mut self) {
        self.router.take();
        self.handle.take();
    }
    async fn refresh(&mut self) -> Result {
        self.expected =
            self.handle().capture_asset_recovery_state("owner", &self.owner).await?.current;
        Ok(())
    }
    async fn continuation(&self) -> Result<Arc<VerifiedServerRecoveryContinuation>> {
        let captured = self.handle().capture_recovery_state("owner", &self.owner).await?;
        assert_eq!(captured.identity(), self.expected);
        let (original, inventory) = captured.into_parts();
        let selected = ServerRecoveryContinuationIdentity {
            origin: original.info().identity,
            current: self.expected.clone(),
        };
        let supplied = RecoveryRegistrationCredentials {
            documents: self
                .credentials
                .documents
                .iter()
                .map(|r| RecoveryDocumentCredential {
                    principal: r.principal.clone(),
                    writer: r.writer.clone(),
                    credential: r.credential.clone(),
                })
                .collect(),
            reviews: Vec::new(),
        };
        let ServerRecoveryContinuationCoverage::Verified(proof) = self
            .handle()
            .verify_continued_recovery_state(
                "owner",
                &self.owner,
                original,
                selected,
                inventory,
                supplied,
            )
            .await?
        else {
            return Err("genuine original/current credential proof expected".into());
        };
        Ok(Arc::new(proof))
    }
}

struct RefusingProvider;
impl ServerRecoveryAssetProvider for RefusingProvider {
    fn check(&self) -> std::result::Result<(), Error> {
        Ok(())
    }
    fn resolve(&self, _: &VersionAssetReference) -> std::result::Result<Option<String>, Error> {
        Err(Error::Contract("private-provider-diagnostic"))
    }
}
#[tokio::test]
async fn valid_opaque_hash_prefixed_ids_keep_the_original_native_identity_and_need_host_mapping()
-> Result {
    for original in ["sha256:opaque".to_string(), format!("sha256:{}", "A".repeat(64))] {
        let f = Box::pin(Fixture::with_opaque_asset(Some(&original), (3, true, true))).await?;
        let before = f.snapshot()?;
        let pending = f
            .handle()
            .verify_server_asset_availability(
                "owner",
                &f.owner,
                f.expected.clone(),
                Arc::new(ContentAddressedServerAssets),
            )
            .await?;
        assert!(matches!(pending, ServerAssetAvailabilityCoverage::Pending { missing, .. }
            if missing.len() == 2 && missing.iter().all(|m|
                matches!(m, ServerAssetAvailabilityMissing::Mapping { reference }
                    if reference.asset == original))));
        let state = mappings()?;
        {
            let mut mapping = state.lock().map_err(|_| "mapping mutex")?;
            mapping.pairs = std::mem::take(&mut mapping.pairs)
                .into_iter()
                .map(|((_, generation), content)| ((original.clone(), generation), content))
                .collect();
        }
        let provider = provider(&state)?;
        let proof = f.proof(provider.clone()).await?;
        proof.check_live(f.handle(), "owner", &f.owner, provider).await?;
        assert_eq!(
            proof.metadata().resolutions.iter().filter(|r| r.reference.asset == original).count(),
            2,
        );
        assert_eq!(f.snapshot()?, before);
    }
    Ok(())
}
#[tokio::test]
async fn direct_native_content_ids_are_not_remapped_and_bad_opaque_targets_or_provider_errors_refuse()
-> Result {
    let direct = Box::pin(Fixture::new(false)).await?;
    let direct_provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(RefusingProvider);
    direct.proof(direct_provider).await?;
    let f = Box::pin(Fixture::new(true)).await?;
    let before = f.snapshot()?;
    let result = f
        .handle()
        .verify_server_asset_availability(
            "owner",
            &f.owner,
            f.expected.clone(),
            Arc::new(RefusingProvider),
        )
        .await;
    assert!(matches!(result, Err(Error::Contract("server asset provider resolution refused"))));
    for invalid in ["not-a-content-id".to_string(), format!("sha256:{}", "A".repeat(64))] {
        let state = mappings()?;
        for target in state.lock().map_err(|_| "mapping mutex")?.pairs.values_mut() {
            *target = invalid.clone();
        }
        assert!(matches!(
            f.handle()
                .verify_server_asset_availability(
                    "owner",
                    &f.owner,
                    f.expected.clone(),
                    provider(&state)?
                )
                .await,
            Err(Error::Contract("server asset provider content identity"))
        ));
    }
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
#[tokio::test]
async fn original_credentials_and_current_native_bytes_join_only_from_genuine_same_host_proofs()
-> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let continuation = f.continuation().await?;
    let before = f.snapshot()?;
    let pending = f
        .handle()
        .verify_recovery_asset_availability(
            "owner",
            &f.owner,
            continuation.clone(),
            Arc::new(ContentAddressedServerAssets),
        )
        .await?;
    assert!(matches!(pending, ServerRecoveryAssetCoverage::Pending { .. }));
    let state = mappings()?;
    let provider = provider(&state)?;
    let ServerRecoveryAssetCoverage::Verified(proof) = f
        .handle()
        .verify_recovery_asset_availability(
            "owner",
            &f.owner,
            continuation.clone(),
            provider.clone(),
        )
        .await?
    else {
        return Err("joined server requirements expected".into());
    };
    assert_eq!(proof.identity(), continuation.identity());
    assert_eq!(proof.metadata().state.current, proof.identity().current);
    proof.check_live(f.handle(), "owner", &f.owner, provider.clone()).await?;
    let current = f.handle().capture().await?;
    let (authority, assets) = ServerRoomRecovery::begin(
        &f.directory.0.join("second-live"),
        &current,
        &f.expected.server,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&current)?
    .into_parts();
    let (auth, owner, _) = authentication()?;
    let (_router, other) = router_with_server_backups(authority, auth, assets)?;
    assert!(proof.check_live(&other, "owner", &owner, provider.clone()).await.is_err());
    assert!(
        other
            .verify_recovery_asset_availability("owner", &owner, continuation, provider.clone())
            .await
            .is_err()
    );
    state.lock().map_err(|_| "mapping mutex")?.allowed = false;
    assert!(proof.check_live(f.handle(), "owner", &f.owner, provider).await.is_err());
    assert_eq!(f.snapshot()?, before);
    Ok(())
}

fn mappings() -> Result<Arc<Mutex<MappingState>>> {
    let id = asset_id(&raster(ImageFormat::Png)?);
    Ok(Arc::new(Mutex::new(MappingState {
        allowed: true,
        epoch: 1,
        pairs: BTreeMap::from([
            (("opaque-image".into(), "first-generation".into()), id.clone()),
            (("opaque-image".into(), "second-generation".into()), id),
        ]),
        flip_target: asset_id(&raster(ImageFormat::Jpeg)?),
        ..MappingState::default()
    })))
}
fn provider(state: &Arc<Mutex<MappingState>>) -> Result<Arc<dyn ServerRecoveryAssetProvider>> {
    let epoch = state.lock().map_err(|_| "mapping mutex")?.epoch;
    Ok(Arc::new(MappingGuard { state: state.clone(), epoch }))
}
fn extra_image() -> Result<Vec<u8>> {
    let mut out = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(9, 11).write_to(&mut out, ImageFormat::Png)?;
    Ok(out.into_inner())
}

#[tokio::test]
async fn native_content_ids_and_opaque_generations_have_actual_bytes_without_rewriting_sources()
-> Result {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for opaque in [false, true] {
                let f =
                    Box::pin(Fixture::with_profile(opaque, (language, standard, atomic))).await?;
                let before = f.snapshot()?;
                let state = mappings()?;
                let provider: Arc<dyn ServerRecoveryAssetProvider> =
                    if opaque { provider(&state)? } else { Arc::new(ContentAddressedServerAssets) };
                let proof = f.proof(provider.clone()).await?;
                let read = proof.metadata();
                assert_eq!(read.state.current, f.expected);
                assert_eq!(read.resolutions.len(), if opaque { 5 } else { 3 });
                assert_eq!(read.assets.len(), 3);
                for format in [ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::WebP] {
                    assert!(read.assets.iter().any(
                        |a| a.asset == asset_id(&raster(format).expect("native fixture image"))
                    ));
                }
                proof.check_live(f.handle(), "owner", &f.owner, provider).await?;
                assert_eq!(f.snapshot()?, before);
            }
        }
    }
    Ok(())
}
#[tokio::test]
async fn unresolved_opaque_bindings_and_absent_actual_payloads_return_no_partial_proof() -> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let before = f.snapshot()?;
    let ServerAssetAvailabilityCoverage::Pending { state, missing } = f
        .handle()
        .verify_server_asset_availability(
            "owner",
            &f.owner,
            f.expected.clone(),
            Arc::new(ContentAddressedServerAssets),
        )
        .await?
    else {
        return Err("opaque mappings must remain pending".into());
    };
    assert_eq!(missing.len(), 2);
    assert!(missing.iter().all(|m| matches!(m, ServerAssetAvailabilityMissing::Mapping { .. })));
    assert!(matches!(state.references.outcome, ServerAssetReferenceOutcome::Ready { .. }));
    let state = mappings()?;
    let absent = asset_id(&extra_image()?);
    for value in state.lock().map_err(|_| "mapping mutex")?.pairs.values_mut() {
        *value = absent.clone();
    }
    let ServerAssetAvailabilityCoverage::Pending { missing, .. } = f
        .handle()
        .verify_server_asset_availability("owner", &f.owner, f.expected.clone(), provider(&state)?)
        .await?
    else {
        return Err("missing actual native payloads must remain pending".into());
    };
    assert_eq!(missing.len(), 2);
    assert!(missing.iter().all(|m| matches!(m, ServerAssetAvailabilityMissing::Bytes { .. })));
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
#[tokio::test]
async fn current_owner_authentication_is_required_for_capture_check_and_recheck() -> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    let guard = provider(&state)?;
    let proof = f.proof(guard.clone()).await?;
    let before = f.snapshot()?;
    for (principal, token) in [
        ("owner", f.reader.as_str()),
        ("reader", f.reader.as_str()),
        ("owner", "invalid"),
        ("unknown", f.owner.as_str()),
    ] {
        assert!(f.handle().capture_asset_recovery_state(principal, token).await.is_err());
        assert!(
            f.handle()
                .verify_server_asset_availability(
                    principal,
                    token,
                    f.expected.clone(),
                    guard.clone()
                )
                .await
                .is_err()
        );
        assert!(proof.check_live(f.handle(), principal, token, guard.clone()).await.is_err());
    }
    let mut expected = f.expected.clone();
    expected.server.archive_sha256[0] ^= 1;
    assert!(
        f.handle()
            .verify_server_asset_availability("owner", &f.owner, expected, guard)
            .await
            .is_err()
    );
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
#[tokio::test]
async fn different_bytes_for_one_opaque_asset_across_generations_refuse_without_remapping_history()
-> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    state.lock().map_err(|_| "mapping mutex")?.pairs.insert(
        ("opaque-image".into(), "second-generation".into()),
        asset_id(&raster(ImageFormat::Jpeg)?),
    );
    let before = f.snapshot()?;
    assert!(matches!(
        f.handle()
            .verify_server_asset_availability(
                "owner",
                &f.owner,
                f.expected.clone(),
                provider(&state)?
            )
            .await,
        Err(Error::Contract("server asset changed immutable bytes across generations"))
    ));
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
#[tokio::test]
async fn mapping_changes_during_resolution_are_rechecked_even_without_an_epoch_change() -> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    state.lock().map_err(|_| "mapping mutex")?.flip_on = Some(1);
    let before = f.snapshot()?;
    assert!(matches!(
        f.handle()
            .verify_server_asset_availability(
                "owner",
                &f.owner,
                f.expected.clone(),
                provider(&state)?
            )
            .await,
        Err(Error::Contract("server asset provider mapping changed"))
    ));
    assert_eq!(f.snapshot()?, before);
    Ok(())
}
#[tokio::test]
async fn revoked_changed_or_expired_provider_guards_cannot_reuse_a_byte_verification() -> Result {
    let f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    let guard = provider(&state)?;
    let proof = f.proof(guard.clone()).await?;
    assert!(proof.check_live(f.handle(), "owner", &f.owner, provider(&state)?).await.is_err());
    state.lock().map_err(|_| "mapping mutex")?.allowed = false;
    assert!(proof.check_live(f.handle(), "owner", &f.owner, guard.clone()).await.is_err());
    {
        let mut s = state.lock().map_err(|_| "mapping mutex")?;
        s.allowed = true;
        s.epoch += 1;
    }
    assert!(proof.check_live(f.handle(), "owner", &f.owner, guard.clone()).await.is_err());
    drop(guard);
    assert!(proof.check_live(f.handle(), "owner", &f.owner, provider(&state)?).await.is_err());
    f.proof(provider(&state)?).await?;
    Ok(())
}
#[tokio::test]
async fn a_verification_keeps_neither_native_host_nor_provider_alive_and_restart_needs_a_fresh_proof()
-> Result {
    let mut f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    let guard = provider(&state)?;
    let proof = f.proof(guard.clone()).await?;
    let before = f.snapshot()?;
    f.stop();
    let (authority, _) = Room::open(&f.directory.0.join("source.log"))?;
    let assets = AssetStore::open(&f.directory.0.join("source-assets"), authority.asset_binding())?;
    let (auth, owner, reader) = authentication()?;
    let (router, handle) = router_with_server_backups(authority, auth, assets)?;
    f.router = Some(router);
    f.handle = Some(handle);
    f.owner = owner;
    f.reader = reader;
    assert_eq!(f.snapshot()?, before);
    assert!(proof.check_live(f.handle(), "owner", &f.owner, guard.clone()).await.is_err());
    f.proof(guard).await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_authenticated_upload_stales_the_exact_cut_and_requires_current_recapture() -> Result {
    let mut f = Box::pin(Fixture::new(true)).await?;
    let state = mappings()?;
    let guard = provider(&state)?;
    let proof = f.proof(guard.clone()).await?;
    let (address, stop, task) = start(f.router.take().ok_or("fixture router")?).await?;
    let bytes = extra_image()?;
    let path = format!("/assets/{}", asset_id(&bytes));
    assert_eq!(request(address, "PUT", &path, "owner", &f.owner, &bytes).await?.0, 200);
    assert!(proof.check_live(f.handle(), "owner", &f.owner, guard.clone()).await.is_err());
    assert!(f.proof(guard.clone()).await.is_err());
    f.refresh().await?;
    f.proof(guard.clone()).await?.check_live(f.handle(), "owner", &f.owner, guard).await?;
    assert_eq!(request(address, "GET", &path, "owner", &f.owner, &[]).await?.1, bytes);
    stop.send(()).map_err(|()| "stop availability service")?;
    task.await??;
    Ok(())
}
