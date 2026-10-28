//! Public Rust consumer: genuine standalone provider proof and retained native offline histories.
//! No physical-recovery wrapper, network endpoint, serving epoch or activation is created.
#[path = "participant_inventory_fixture/clients.rs"]
mod clients;
#[path = "generation_assets_functional/prepare.rs"]
mod prepare;
#[path = "generation_assets_functional/provider.rs"]
mod provider;
#[path = "generation_assets_functional/replay.rs"]
mod replay;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RoomRecoveryPolicy,
    server::ServerLogGenerationRecoveryAssetCoverage,
};
use std::sync::{Arc, atomic::Ordering};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let [parent] = args.as_slice() else {
        return Err("expected existing private fixture output parent".into());
    };
    let parent = std::fs::canonicalize(parent)?;
    let case = Box::pin(prepare::generate(&parent)).await?;
    let guard = Arc::new(provider::Guard::new(case.raster.clone()));
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = case
        .host
        .verify_recovery_asset_availability("owner", &case.token, case.native, guard.clone())
        .await?
    else {
        return Err("actual provider bytes did not verify".into());
    };
    assert_eq!(proof.identity(), case.expected);
    assert_eq!(proof.metadata().state.current, case.expected);
    assert_eq!(proof.metadata().assets.len(), 1);
    assert_eq!(proof.metadata().resolutions.len(), 1);
    proof.check_live(&case.host, "owner", &case.token, guard.clone()).await?;
    let encoded = serde_json::to_string(proof.metadata())?;
    for secret in case.secrets.iter().chain([&case.token]) {
        assert!(!encoded.contains(secret), "private credential entered detached availability data");
    }
    let different = Arc::new(provider::Guard::new(case.raster));
    assert!(proof.check_live(&case.host, "owner", &case.token, different).await.is_err());
    guard.live.store(false, Ordering::Release);
    assert!(proof.check_live(&case.host, "owner", &case.token, guard).await.is_err());
    assert_eq!(
        case.host.capture_recovery_state("owner", &case.token).await?.identity()?,
        case.expected
    );
    drop(case.host);
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &case.directory.join("restored"),
        &case.original,
        &case.original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    case.saved.replay(&mut operation, &case.profile)?;
    operation.check_live_source(&case.original, "owner")?;
    assert_eq!(
        proof.identity(),
        case.expected,
        "detached proof metadata does not follow later replay"
    );
    println!(
        "{}",
        serde_json::json!({"format":"breditor/generation-provider-functional","formatVersion":1,"kind":"standalone-server-generation-native-provider-proof","requiredRasters":proof.metadata().assets.len(),"documentUndoRedoSteps":2,"reviewUndoRedoSteps":2,"coldOwnerReopenedWithProofAlive":true,"revokedProviderRefused":true,"activated":false,"profileBytes":case.profile_bytes,"directory":case.directory})
    );
    Ok(())
}
