//! Public-only consumer of generation native continuity and actual provider-backed raster bytes.
use super::{TestResult, setup};
use breditor_collab_feasibility::{review::ReviewActorId, rich_replica::VersionAssetReference};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Registration, ReviewRegistration,
    RoomRecoveryPolicy, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ContentAddressedServerAssets, PreparedLogGenerationRecoveryHost,
        ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryCoverage,
        ServerRecoveryAssetProvider, VerifiedServerLogGenerationRecoveryAssets,
        prepare_log_generation_recovery_host,
    },
};
use std::{io::Cursor, sync::Arc};

async fn prepare_standalone(
    operation: OperationalLogGenerationServerRoom,
    origin: &ServerLogGenerationRoomBackup,
) -> TestResult<(PreparedLogGenerationRecoveryHost, String)> {
    let (token, hash) = Authentication::issue_token()?;
    let auth=Authentication::from_json(&serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]}).to_string())?;
    let host = prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(origin.to_bytes()?)?,
        &origin.info()?.identity,
        "owner",
        &token,
    )
    .await?;
    Ok((host, token))
}
struct ImageMapping(String);
impl ServerRecoveryAssetProvider for ImageMapping {
    fn check(&self) -> std::result::Result<(), breditor_collab_relay::Error> {
        Ok(())
    }
    fn resolve(
        &self,
        reference: &VersionAssetReference,
    ) -> std::result::Result<Option<String>, breditor_collab_relay::Error> {
        Ok((reference.asset == "asset" && reference.generation == "generation")
            .then(|| self.0.clone()))
    }
}
async fn verify_sources(
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    author: &Registration,
    reviewer: &ReviewRegistration,
    content: &str,
) -> TestResult<(VerifiedServerLogGenerationRecoveryAssets, Arc<dyn ServerRecoveryAssetProvider>)> {
    let capture = host.capture_recovery_state("owner", token).await?;
    let expected = capture.identity()?;
    let (_, inventory) = capture.into_parts();
    let credentials = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: author.lease.writer.clone(),
            credential: author.credential.clone(),
        }],
        reviews: vec![RecoveryReviewCredential {
            principal: "owner".into(),
            actor: reviewer.lease.actor.as_str().into(),
            credential: reviewer.credential.clone(),
        }],
    };
    let ServerLogGenerationRecoveryCoverage::Verified(native) = host
        .verify_selected_recovery_state("owner", token, expected.clone(), inventory, credentials)
        .await?
    else {
        return Err("public protected records did not verify".into());
    };
    let native = Arc::new(native);
    let ServerLogGenerationRecoveryAssetCoverage::Pending { missing, .. } = host
        .verify_recovery_asset_availability(
            "owner",
            token,
            native.clone(),
            Arc::new(ContentAddressedServerAssets),
        )
        .await?
    else {
        return Err("public missing mapping produced a proof".into());
    };
    assert_eq!(missing.len(), 1);
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ImageMapping(content.into()));
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) =
        host.verify_recovery_asset_availability("owner", token, native, provider.clone()).await?
    else {
        return Err("public actual raster did not verify".into());
    };
    let read = proof.metadata();
    assert_eq!(read.state.current, expected);
    assert_eq!(read.format, "breditor/server-log-generation-asset-availability");
    assert_eq!(read.assets.len(), 1);
    assert_eq!(read.assets[0].asset, content);
    assert_eq!(read.resolutions.len(), 1);
    assert_eq!(read.resolutions[0].reference.asset, "asset");
    proof.check_live(host, "owner", token, provider.clone()).await?;
    Ok((proof, provider))
}
async fn workflow(language: u32, standard: bool, atomic: bool) -> TestResult {
    let (files, _, mut room) = setup(language, standard, atomic)?;
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
    let author = room.register("owner")?;
    let reviewer = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let mut assets =
        AssetStore::open(&files.0.join("generation-provider-assets"), room.asset_binding())?;
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, image::ImageFormat::Png)?;
    let bytes = bytes.into_inner();
    let content = asset_id(&bytes);
    room.put_asset("owner", &mut assets, prepare_asset(&content, "image/png", bytes.clone())?)?;
    let ancestor = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    room.grant("owner", "reader", Some(breditor_collab_relay::Role::Reader))?;
    room.rotate_log_generation("owner", "public-provider-origin")?;
    let local = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let destination = files.0.join("generation-provider-host");
    let operation = ServerLogGenerationRoomRecovery::begin(
        &destination,
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&local)?
    .begin_operation(
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let (host, token) = Box::pin(prepare_standalone(operation, &local)).await?;
    let (proof, provider) = verify_sources(&host, &token, &author, &reviewer, &content).await?;
    assert_eq!(proof.identity().origin, local.info()?.identity);
    assert_ne!(proof.identity().origin, ancestor.info()?.identity);
    drop(host);
    let mut current = OperationalLogGenerationServerRoom::resume(
        &destination,
        &local,
        &local.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let (room, assets) = current.components_mut();
    assert_eq!(room.read_asset("owner", assets, &content)?.ok_or("actual raster")?.bytes, bytes);
    current.check_live_source(&local, "owner")?;
    drop(provider);
    assert_eq!(
        proof.metadata().assets[0].asset,
        content,
        "detached metadata retains no provider or host lease"
    );
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn public_generation_provider_contract_keeps_actual_bytes_and_local_origin_in_ten_modes()
-> TestResult {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            Box::pin(workflow(language, standard, atomic)).await?;
        }
    }
    Ok(())
}
