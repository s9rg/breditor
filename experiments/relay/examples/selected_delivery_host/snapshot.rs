//! Fresh complete actual server/provider cuts; old snapshots are never overwritten.
use super::{Result, authentication, credentials, public_inputs, setup::Ready, storage};
use breditor_collab_relay::server::{
    ContentAddressedServerAssets, ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationRecoveryAssetCoverage, ServerRecoveryAssetProvider,
    prepare_log_generation_delivery_path_recovery_control,
    prepare_log_generation_delivery_recovery_control, prepare_log_generation_recovery_control,
};
use serde_json::{Value, json};
use std::sync::Arc;

pub(super) struct Snapshot {
    pub public: Value,
    pub archive: Arc<breditor_collab_relay::ServerLogGenerationRoomBackup>,
    pub operator_token: String,
    pub control: ServerLogGenerationDeliveryPathRecoveryControl,
    pub router: axum::Router,
}
pub(super) async fn capture(
    ready: &Ready,
    sequence: u64,
    client_endpoint: &str,
    retired_endpoint: &str,
    predecessor: Option<&super::next::Previous>,
    observed: &std::collections::BTreeMap<
        u64,
        Arc<breditor_collab_relay::ServerLogGenerationRoomBackup>,
    >,
) -> Result<Snapshot> {
    let host = ready.active.recovery_host();
    let capture = host.capture_recovery_state("owner", &ready.owner_token).await?;
    let selected = capture.identity()?;
    let (current, inventory) = capture.into_parts();
    let native = credentials::verify(&host, &ready.owner_token, &ready.protected).await?;
    if native.identity() != selected {
        return Err("native changed during fixture capture".into());
    }
    let native = Arc::new(native);
    let path_proof = super::full_path::verify(ready, &current, native.clone(), observed).await?;
    let delivery_path = path_proof.identity();
    // The first ACTUAL target serving cut B stays distinct from restore origin A.
    // Every fresh capture must prove A <= B <= current C, even after real delivery.
    if ready.initial_snapshot.get().is_none() {
        let initial = breditor_collab_relay::ServerLogGenerationRoomBackup::from_owned_bytes(
            current.to_bytes()?,
        )?;
        ready
            .initial_snapshot
            .set(Arc::new(initial))
            .map_err(|_| "initial serving cut already pinned")?;
    }
    let (previous_sequence, previous) = if let Some((sequence, archive)) = predecessor {
        (*sequence, archive)
    } else {
        (0, ready.initial_snapshot.get().ok_or("initial serving cut absent")?)
    };
    let continuation = host
        .verify_delivery_continuation(
            "owner",
            &ready.owner_token,
            breditor_collab_relay::ServerLogGenerationRoomBackup::from_owned_bytes(
                previous.to_bytes()?,
            )?,
            &previous.info()?.identity,
            native.clone(),
        )
        .await?;
    continuation.check_live(&host, "owner", &ready.owner_token).await?;
    let delivery_continuation = continuation.identity();
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = host
        .verify_recovery_asset_availability("owner", &ready.owner_token, native, provider.clone())
        .await?
    else {
        return Err("actual native raster provider required".into());
    };
    let (operators, operator_token) = authentication::operator()?;
    let (_, control) = prepare_log_generation_recovery_control(
        host,
        Arc::new(proof),
        provider,
        "owner",
        &ready.owner_token,
        operators,
    )
    .await?;
    let selected_current = control.identity();
    let (_, control) =
        prepare_log_generation_delivery_recovery_control(control, Arc::new(continuation)).await?;
    let selected_delivery = control.identity();
    let (router, control) =
        prepare_log_generation_delivery_path_recovery_control(control, Arc::new(path_proof))
            .await?;
    let selected_path = control.identity();
    let directory = ready.root.join("snapshots").join(format!("cut-{sequence}"));
    storage::directory(&directory)?;
    let fixture = json!({"format":"breditor/native-selected-delivery-fixture","formatVersion":1,
        "language":ready.spec.language,"standard":ready.spec.standard,"atomic":ready.spec.atomic,
        "configuration":ready.configuration,"inventoryJson":serde_json::to_string(&inventory.metadata().native)?,
        "generationRecoveryState":selected,"deliveryContinuation":delivery_continuation,"deliveryPath":delivery_path,"clients":ready.records,
        "clientEndpoint":client_endpoint,"retiredEndpoint":retired_endpoint,
        "registeredWriters":7,"registeredReviewActors":7,"protectedStreams":14}).to_string();
    let credentials: Vec<_> = ready
        .secrets
        .iter()
        .map(String::as_str)
        .chain([
            ready.owner_token.as_str(),
            ready.alice_token.as_str(),
            ready.old_alice_token.as_str(),
            operator_token.as_str(),
        ])
        .collect();
    let path = public_inputs::write(&public_inputs::PublicInputs {
        directory: &directory,
        fixture: &fixture,
        inventory: inventory.to_json(),
        origin: &ready.original.to_bytes()?,
        older: &ready.older.to_bytes()?,
        current: &current.to_bytes()?,
        credentials: &credentials,
    })?;
    let public = json!({"path":path,"selection":selected_current,"deliverySelection":selected_delivery,"deliveryPathSelection":selected_path,"sequence":sequence,"previousSequence":previous_sequence,
        "clientEndpoint":client_endpoint,"retiredEndpoint":retired_endpoint,
        "nativeProtectedStreamsVerified":true,"nativeProviderVerified":true,"nativeDeliveryContinuationVerified":true,"nativeDeliveryPathVerified":true});
    Ok(Snapshot { public, archive: Arc::new(current), operator_token, control, router })
}
