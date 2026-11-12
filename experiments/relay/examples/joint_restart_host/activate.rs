//! Durable native checkpoint and epoch commit; no source or credential shortcuts.
use super::{Result, storage};
use breditor_collab_relay::server::{
    ActivatedNativeLogGenerationHost, NativeGenerationActivationPrepareOptions,
    PreparedLogGenerationHandover, PreparedLogGenerationRecoveryHost,
    PreparedNativeGenerationActivation, RoomDeploymentAuthority,
    VerifiedServerLogGenerationRecoveryState,
};
use std::{path::Path, sync::Arc};

pub(super) async fn activate(
    directory: &Path,
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    source: Arc<PreparedLogGenerationHandover>,
    authority: RoomDeploymentAuthority,
    proof: VerifiedServerLogGenerationRecoveryState,
) -> Result<(ActivatedNativeLogGenerationHost, Arc<PreparedNativeGenerationActivation>)> {
    let prepared = Arc::new(
        host.prepare_durable_native_activation(
            "owner",
            token,
            source,
            &proof,
            NativeGenerationActivationPrepareOptions {
                root: directory.join("native-checkpoint"),
                authority: authority.clone(),
            },
        )
        .await?,
    );
    let choice = prepared.identity().clone();
    storage::write_new(&directory.join("activation-choice.json"), &serde_json::to_vec(&choice)?)?;
    let active = host
        .activate_durable_native_service("owner", token, authority, prepared.clone(), proof, choice)
        .await?;
    Ok((active, prepared))
}
