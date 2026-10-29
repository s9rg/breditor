//! Fresh complete actual server/provider cuts; old snapshots are never overwritten.
use super::{Result, authentication, credentials, public_inputs, setup::Ready, storage};
use breditor_collab_relay::server::{
    ContentAddressedServerAssets, ServerLogGenerationRecoveryAssetCoverage,
    ServerLogGenerationRecoveryControl, ServerRecoveryAssetProvider,
    prepare_log_generation_recovery_control,
};
use serde_json::{Value, json};
use std::sync::Arc;

pub(super) struct Snapshot {
    pub public: Value,
    pub operator_token: String,
    pub control: ServerLogGenerationRecoveryControl,
    pub router: axum::Router,
}
pub(super) async fn capture(
    ready: &Ready,
    sequence: u64,
    client_endpoint: &str,
    retired_endpoint: &str,
) -> Result<Snapshot> {
    let host = ready.active.recovery_host();
    let capture = host.capture_recovery_state("owner", &ready.owner_token).await?;
    let selected = capture.identity()?;
    let (current, inventory) = capture.into_parts();
    let native = credentials::verify(&host, &ready.owner_token, &ready.protected).await?;
    if native.identity() != selected {
        return Err("native changed during fixture capture".into());
    }
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = host
        .verify_recovery_asset_availability(
            "owner",
            &ready.owner_token,
            Arc::new(native),
            provider.clone(),
        )
        .await?
    else {
        return Err("actual native raster provider required".into());
    };
    let (operators, operator_token) = authentication::operator()?;
    let (router, control) = prepare_log_generation_recovery_control(
        host,
        Arc::new(proof),
        provider,
        "owner",
        &ready.owner_token,
        operators,
    )
    .await?;
    let directory = ready.root.join("snapshots").join(format!("cut-{sequence}"));
    storage::directory(&directory)?;
    let fixture = json!({"format":"breditor/native-selected-delivery-fixture","formatVersion":1,
        "language":ready.spec.language,"standard":ready.spec.standard,"atomic":ready.spec.atomic,
        "configuration":ready.configuration,"inventoryJson":serde_json::to_string(&inventory.metadata().native)?,
        "generationRecoveryState":selected,"clients":ready.records,
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
    let public = json!({"path":path,"selection":control.identity(),"sequence":sequence,
        "clientEndpoint":client_endpoint,"retiredEndpoint":retired_endpoint,
        "nativeProtectedStreamsVerified":true,"nativeProviderVerified":true});
    Ok(Snapshot { public, operator_token, control, router })
}
