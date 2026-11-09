//! The genuine original host seals the exact migrated source before authenticated activation.
use super::{
    TestResult, authentication, author, credentials, insert, network, prepare_target, serve,
    traffic,
};
use breditor_collab_relay::{
    Error, ServerLogGenerationOptions,
    assets::asset_id,
    server::{
        LogGenerationHandoverStatus, NativeGenerationActivationPrepareOptions,
        PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity,
        RoomDeploymentAuthority, ServerBackupHandle, prepare_durable_native_activation_control,
        router_with_server_backups_and_deployment_lease,
    },
};
use serde_json::{Value, json};
use std::{fs, io::Cursor, path::Path, sync::Arc};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn migrated_original_host_seals_exact_cut_and_activates_over_authenticated_http() -> TestResult
{
    for (version, atomic) in [(1, false), (3, true)] {
        Box::pin(workflow(version, atomic)).await?;
    }
    Ok(())
}

async fn workflow(version: u32, atomic: bool) -> TestResult {
    let (files, profile, mut room) =
        super::super::setup_with_storage(version, atomic, atomic, false)?;
    let prepared = author::prepare(&mut room, &profile, &files.0.join("assets"), atomic)?;
    let mut client = prepared.author;
    let authority =
        RoomDeploymentAuthority::create(&files.0.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (auth, old_token) = authentication()?;
    let (router, live) =
        router_with_server_backups_and_deployment_lease(room, auth, prepared.assets, lease)?;
    let old = network::Network::start(router).await?;
    let mut socket = network::Socket::connect(old.address).await?;
    traffic::authenticate(&mut socket, &old_token, atomic).await?;
    traffic::resume(&mut socket, &client).await?;
    let options = ServerLogGenerationOptions { root: "legacy".into(), active: "first".into() };
    reject_stale_document(
        &live,
        &old_token,
        &files.0,
        &authority,
        &options,
        (&mut socket, &mut client, atomic),
    )
    .await?;
    let retained =
        reject_stale_raster(&live, &old_token, &files.0, &authority, &options, &old).await?;

    let wal = fs::read(files.room())?;
    let sealed = seal_selected(&live, &old_token, &files.0, &authority, options).await?;
    assert!(live.capture().await.is_err());
    insert(&mut client.document, "Offline document through migrated activation 🙂 ")?;
    author::comment(&client.document, &mut client.review, "Offline comment through migration")?;
    let document = client.document.checkpoint()?;
    let review = client.review.checkpoint_json()?;
    let observed = client.document.observe()?;
    let groups: Value = serde_json::from_str(&if atomic {
        client.document.writer_groups_v2_guarded(&observed, &client.document_through)?
    } else {
        client.document.writer_groups_guarded(&observed, &client.document_through)?
    })?;
    let frame = groups["groups"].as_array().and_then(|rows| rows.first()).ok_or("offline frame")?;
    let response = socket.request(json!({"kind":"submit","group":frame})).await;
    assert!(response.is_err() || response?["kind"] != "durable");
    drop(socket);
    assert_eq!(fs::read(files.room())?, wal);

    let (service, token) = Box::pin(activate(&files.0, &authority, sealed, &client)).await?;
    assert_eq!(client.document.checkpoint()?, document);
    assert_eq!(client.review.checkpoint_json()?, review);
    serve(
        &service,
        &old,
        &profile,
        &mut client,
        (&token, &old_token),
        (&prepared.asset, &prepared.png),
        atomic,
    )
    .await?;
    assert_eq!(fs::read(files.room())?, wal);
    assert_eq!(service.http("GET", &retained.0, &token, &[]).await?, (200, retained.1));
    service.stop().await?;
    old.stop().await?;
    Ok(())
}

async fn reject_stale_document(
    live: &ServerBackupHandle,
    token: &str,
    root: &Path,
    authority: &RoomDeploymentAuthority,
    options: &ServerLogGenerationOptions,
    (socket, client, atomic): (&mut network::Socket, &mut author::Author, bool),
) -> TestResult {
    let initial = live.capture().await?.info().identity;
    let stale = live
        .prepare_generation_migration_handover(
            "owner",
            token,
            &root.join("stale"),
            initial.clone(),
            options.clone(),
        )
        .await?;
    assert_eq!(stale.status(authority)?, LogGenerationHandoverStatus::Prepared);
    insert(&mut client.document, "Accepted while migration was prepared. ")?;
    traffic::send_document(socket, client, atomic, true).await?;
    let stale_choice = stale.identity().clone();
    assert!(matches!(
        live.seal_prepared_generation_migration_handover(
            "owner",
            token,
            stale,
            &stale_choice,
            options.clone(),
        )
        .await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert_eq!(authority.current_selection()?, *stale_choice.previous_selection());
    let absent = root.join("stale-prepare-must-not-create");
    assert!(matches!(
        live.prepare_generation_migration_handover(
            "owner",
            token,
            &absent,
            initial,
            options.clone(),
        )
        .await,
        Err(Error::Contract("original migration source cut changed"))
    ));
    assert!(!absent.exists());

    Ok(())
}

async fn reject_stale_raster(
    live: &ServerBackupHandle,
    token: &str,
    root: &Path,
    authority: &RoomDeploymentAuthority,
    options: &ServerLogGenerationOptions,
    old: &network::Network,
) -> TestResult<(String, Vec<u8>)> {
    let cut = live.capture().await?.info().identity;
    let path = root.join("stale-raster");
    assert!(matches!(
        live.prepare_generation_migration_handover(
            "owner",
            &"0".repeat(64),
            &path,
            cut.clone(),
            options.clone(),
        )
        .await,
        Err(Error::Permission)
    ));
    assert!(!path.exists());
    let prepared = live
        .prepare_generation_migration_handover("owner", token, &path, cut.clone(), options.clone())
        .await?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(3, 2).write_to(&mut png, image::ImageFormat::Png)?;
    let bytes = png.into_inner();
    let route = format!("/assets/{}", asset_id(&bytes));
    assert_eq!(old.http("PUT", &route, token, &bytes).await?.0, 200);
    let current = live.capture().await?.info().identity;
    assert_eq!(current.room, cut.room);
    assert_ne!(current.assets, cut.assets);
    let choice = prepared.identity().clone();
    assert!(matches!(
        live.seal_prepared_generation_migration_handover(
            "owner",
            token,
            prepared,
            &choice,
            options.clone(),
        )
        .await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert_eq!(authority.current_selection()?, *choice.previous_selection());
    Ok((route, bytes))
}

async fn seal_selected(
    live: &ServerBackupHandle,
    token: &str,
    root: &Path,
    authority: &RoomDeploymentAuthority,
    options: ServerLogGenerationOptions,
) -> TestResult<Arc<PreparedLogGenerationHandover>> {
    let path = root.join("migration-intent");
    let legacy = live.capture().await?;
    let original = legacy.info().identity;
    let expected = legacy.prepare_generation_migration(&original, &options)?.info()?.identity;
    let selected = live
        .prepare_generation_migration_handover("owner", token, &path, original, options.clone())
        .await?;
    assert_eq!(selected.identity().source(), &expected);
    let outside = root.join("migration-choice.json");
    fs::write(&outside, serde_json::to_vec(selected.identity())?)?;
    drop(selected);
    let choice: PreparedLogGenerationHandoverIdentity =
        serde_json::from_slice(&fs::read(outside)?)?;
    let selected = PreparedLogGenerationHandover::open(&path, &choice)?;
    let wrong = ServerLogGenerationOptions { active: "wrong".into(), ..options.clone() };
    assert!(matches!(
        live.seal_prepared_generation_migration_handover("owner", token, selected, &choice, wrong)
            .await,
        Err(Error::Contract("prepared handover source cut changed"))
    ));
    assert_eq!(authority.current_selection()?, *choice.previous_selection());
    assert_eq!(live.capture().await?.info().identity.room, expected.native.source);
    let selected = PreparedLogGenerationHandover::open(&path, &choice)?;
    assert_eq!(selected.status(authority)?, LogGenerationHandoverStatus::Prepared);
    let sealed = live
        .seal_prepared_generation_migration_handover("owner", token, selected, &choice, options)
        .await?;
    assert_eq!(authority.current_selection()?, *choice.planned_selection());
    assert_eq!(sealed.status(authority)?, LogGenerationHandoverStatus::Sealed);
    drop(sealed);
    let cold = PreparedLogGenerationHandover::open(&path, &choice)?;
    assert_eq!(cold.status(authority)?, LogGenerationHandoverStatus::Sealed);
    Ok(Arc::new(cold))
}

async fn activate(
    root: &Path,
    authority: &RoomDeploymentAuthority,
    sealed: Arc<PreparedLogGenerationHandover>,
    author: &author::Author,
) -> TestResult<(network::Network, String)> {
    let (host, token, proof) =
        Box::pin(prepare_target(root, sealed.source_backup(), credentials(author))).await?;
    let prepared = Arc::new(
        host.prepare_durable_native_activation(
            "owner",
            &token,
            sealed,
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: root.join("activation-checkpoint"),
                authority: authority.clone(),
            },
        )
        .await?,
    );
    let (operator, operator_token) = authentication()?;
    let (router, control) = prepare_durable_native_activation_control(
        host,
        Arc::new(proof),
        prepared,
        authority.clone(),
        "owner",
        &token,
        operator,
    )
    .await?;
    let choice = control.identity();
    assert!(control.service_router().await.is_err());
    let network = network::Network::start(router).await?;
    let path = "/recovery/native-activation/v1/commit";
    let request = serde_json::to_vec(&choice)?;
    assert_eq!(network.post_json(path, &token, &request).await?.0, 403);
    assert_eq!(authority.current_selection()?, choice.previous);
    let (status, receipt) = network.post_json(path, &operator_token, &request).await?;
    assert_eq!(status, 200);
    let data: Value = serde_json::from_slice(&receipt)?;
    assert_eq!(data["selection"], serde_json::to_value(&choice)?);
    assert_eq!(data["scope"], "actual-held-native-service-only");
    assert_eq!(authority.current_selection()?, choice.planned);
    assert_eq!(network.post_json(path, &operator_token, &request).await?, (200, receipt));
    assert_eq!(authority.current_selection()?, choice.planned);
    let service = network::Network::start(control.service_router().await?).await?;
    control.close();
    network.stop().await?;
    Ok((service, token))
}
