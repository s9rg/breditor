//! The actual host retained by one HTTP activation can provision the next.
use super::{Network, Setup, TestResult, control, operators, request};
use crate::server::generation_recovery::tests::{
    native_activation::advance_target,
    publication_history::continue_original_history,
    publication_socket::Socket,
    source::{POLICY, authentication},
};
use crate::{
    Error, Role, ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    server::{
        Authentication, LogGenerationHandoverStatus, NativeGenerationActivationPrepareOptions,
        PreparedLogGenerationHandover, ServerLogGenerationRecoveryAssetCoverage,
        ServerLogGenerationRecoveryCoverage, ServerRecoveryAssetProvider,
        prepare_durable_native_activation_control, prepare_log_generation_recovery_host,
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde_json::json;
use std::{io::Cursor, sync::Arc};
mod paths;
mod reader;

struct SourceRasterProvider(String);

impl ServerRecoveryAssetProvider for SourceRasterProvider {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }

    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        Ok((reference.asset == "asset" && reference.generation == "generation")
            .then(|| self.0.clone()))
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[expect(
    clippy::too_many_lines,
    reason = "The scenario follows one set of real controls through both serving epochs"
)]
async fn http_activated_host_seals_the_next_cut_and_fresh_control_resumes_offline_history()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let (router, first, operator) = control(&setup).await?;
    let root = &setup.source.directory.0;
    let before = setup.ledger()?;
    let first_choice = first.identity();
    let absent = root.join("not-active");
    assert!(matches!(
        first
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &absent,
                first_choice.current.server.clone()
            )
            .await,
        Err(Error::NeedsRecovery)
    ));
    assert!(!absent.exists());
    let network = Network::start(router).await?;
    let body = serde_json::to_vec(&first_choice)?;
    assert_eq!(network.request(&request(&operator), &body).await?.status, 200);
    assert_eq!(setup.ledger()?.len(), before.len() + 104);

    let wrong = root.join("operator-is-not-native-owner");
    assert!(
        first
            .prepare_next_handover("owner", &operator, &wrong, first_choice.current.server.clone())
            .await
            .is_err()
    );
    assert!(!wrong.exists());
    let stale = Arc::new(
        first
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &root.join("stale-next"),
                first_choice.current.server,
            )
            .await?,
    );
    advance_target(&setup, true).await?;
    let earlier = setup.handle.capture_recovery_state("owner", &setup.owner).await?.into_parts().0;
    assert_eq!(earlier.info()?.identity.native, stale.identity().source().native);
    assert_ne!(earlier.info()?.identity, *stale.identity().source());
    setup
        .handle
        .host
        .transaction(|room| {
            room.grant("owner", "accepted-on-first-http-host", Some(Role::Reader))?;
            room.rotate_log_generation("owner", "first-http-host-next-cut")
        })
        .await?;
    assert!(matches!(
        first.seal_next_handover("owner", &setup.owner, &stale, stale.identity()).await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert!(first.service_router().await.is_ok());
    assert_eq!(setup.ledger()?.len(), before.len() + 104);

    let selected = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    let source = Arc::new(
        first
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &root.join("next-source"),
                selected.server.clone(),
            )
            .await?,
    );
    let competing = Arc::new(
        first
            .prepare_next_handover(
                "owner",
                &setup.owner,
                &root.join("same-cut-unsealed"),
                selected.server.clone(),
            )
            .await?,
    );
    first.seal_next_handover("owner", &setup.owner, &source, source.identity()).await?;
    assert_eq!(setup.ledger()?.len(), before.len() + 208);
    assert!(first.service_router().await.is_err());
    assert_eq!(network.request(&request(&operator), &body).await?.status, 403);
    network.stop().await?;
    let source_root = source.root().to_owned();
    let source_choice = source.identity().clone();
    drop(source);
    let source = Arc::new(PreparedLogGenerationHandover::open(&source_root, &source_choice)?);
    assert_eq!(source.status(&setup.authority)?, LogGenerationHandoverStatus::Sealed);

    let archive = source.source_backup();
    let operation = ServerLogGenerationRoomRecovery::begin(
        &root.join("second-host"),
        archive,
        &selected.server,
        POLICY,
    )?
    .finish(archive)?
    .begin_operation(archive, &selected.server, POLICY, "owner")?;
    let (auth, token, _) = authentication()?;
    let successor = prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?,
        &selected.server,
        "owner",
        &token,
    )
    .await?;
    let cut = successor.capture_recovery_state("owner", &token).await?;
    let identity = cut.identity()?;
    assert_eq!(identity.origin, selected.server);
    assert_eq!(identity.server, selected.server);
    let (_, inventory) = cut.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = successor
        .verify_selected_recovery_state(
            "owner",
            &token,
            identity,
            inventory,
            setup.source.protected_records(),
        )
        .await?
    else {
        return Err("successor is missing original registrations".into());
    };
    let proof = Arc::new(proof);
    let spanning = Box::pin(paths::check(
        &setup,
        &successor,
        &token,
        proof.clone(),
        &earlier,
        source.clone(),
        competing,
    ))
    .await?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut png, image::ImageFormat::Png)?;
    let provider = Arc::new(SourceRasterProvider(crate::assets::asset_id(png.get_ref())));
    let ServerLogGenerationRecoveryAssetCoverage::Verified(assets) = successor
        .verify_recovery_asset_availability("owner", &token, proof.clone(), provider.clone())
        .await?
    else {
        return Err("successor is missing retained rasters".into());
    };
    assets.check_live(&successor, "owner", &token, provider.clone()).await?;
    let continuity = Arc::new(
        successor
            .verify_delivery_continuation(
                "owner",
                &token,
                ServerLogGenerationRoomBackup::from_owned_bytes(
                    source.source_backup().to_bytes()?,
                )?,
                source.identity().source(),
                proof.clone(),
            )
            .await?,
    );
    let reader = Box::pin(reader::operator_read(
        &successor,
        &token,
        provider,
        Arc::new(assets),
        continuity,
        Arc::new(spanning),
    ))
    .await?;
    let prepared = Arc::new(
        successor
            .prepare_durable_native_activation(
                "owner",
                &token,
                source,
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: root.join("second-checkpoint"),
                    authority: setup.authority.clone(),
                },
            )
            .await?,
    );
    let (operator, _) = Authentication::issue_token()?;
    let (router, second) = prepare_durable_native_activation_control(
        successor.clone(),
        proof,
        prepared,
        setup.authority.clone(),
        "owner",
        &token,
        operators(&operator)?,
    )
    .await?;
    let network = Network::start(router).await?;
    let body = serde_json::to_vec(&second.identity())?;
    assert_eq!(network.request(&request(&operator), &body).await?.status, 200);
    assert_eq!(setup.ledger()?.len(), before.len() + 312);
    reader.check().await?;
    let serving = Network::start(second.service_router().await?).await?;
    let socket = Socket::open(serving.address).await?;
    let (socket, auth) = socket.request("auth", json!({
        "kind":"authenticate","principal":"owner","token":token,"capabilities":["writerTransportV2","reviewV1"],
    })).await?;
    assert_eq!(auth["kind"], "authenticated");
    let (socket, document) = socket.request("document", json!({
        "kind":"resume","writer":setup.source.author.lease.writer,"credential":setup.source.author.credential,
    })).await?;
    assert_eq!(document["kind"], "resumed");
    let (socket, review) = socket.request("review", json!({
        "kind":"reviewResume","actor":setup.source.reviewer.lease.actor,"credential":setup.source.reviewer.credential,
    })).await?;
    assert_eq!(review["kind"], "reviewResumed");
    drop(continue_original_history(socket, &setup).await?);
    reader.stale().await?;
    serving.stop().await?;
    network.stop().await?;
    Ok(())
}
