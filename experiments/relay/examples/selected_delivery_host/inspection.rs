//! Private test fixture for actual replay into an authenticated inactive host.
//! It exposes only recovery operator routes, never an editor router or old tokens.
use super::{Result, authentication, credentials, setup::Ready};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup,
    server::{
        ContentAddressedServerAssets, ServerLogGenerationRecoveryAssetCoverage,
        ServerLogGenerationRecoveryControl, ServerRecoveryAssetProvider,
        prepare_log_generation_recovery_control, reconstruct_log_generation_recovery_host,
    },
};
use serde_json::{Value, json};
use std::sync::Arc;

pub(super) struct Inspection {
    control: ServerLogGenerationRecoveryControl,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
}
impl Inspection {
    pub async fn close(self) {
        self.control.close();
        self.task.abort();
        let _ = self.task.await;
    }
}
pub(super) async fn prepare(
    ready: &Ready,
    request: u64,
    source: u64,
    archive: &ServerLogGenerationRoomBackup,
) -> Result<(Inspection, Value)> {
    let expected = archive.info()?.identity;
    let accounts = authentication::accounts()?;
    let host = reconstruct_log_generation_recovery_host(
        &ready.root.join(format!("inspection-{request}")),
        accounts.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(archive.to_bytes()?)?,
        &expected,
        "owner",
        &accounts.owner,
    )
    .await?;
    let state = host.capture_recovery_state("owner", &accounts.owner).await?;
    let identity = state.identity()?;
    if identity.origin != expected || identity.server != expected {
        return Err("actual reconstructed origin/current differs".into());
    }
    let native = Arc::new(credentials::verify(&host, &accounts.owner, &ready.protected).await?);
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = host
        .verify_recovery_asset_availability("owner", &accounts.owner, native, provider.clone())
        .await?
    else {
        return Err("actual reconstructed Native/provider closure absent".into());
    };
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_log_generation_recovery_control(
        host,
        Arc::new(proof),
        provider,
        "owner",
        &accounts.owner,
        operators,
    )
    .await?;
    let selection = control.identity();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/recovery/generations/v1/check", listener.local_addr()?);
    let task = tokio::spawn(async move { axum::serve(listener, router).await });
    Ok((
        Inspection { control, task },
        json!({"kind":"inspection","request":request,"source":source,"endpoint":endpoint,"selection":selection,"privateOperatorToken":token}),
    ))
}
