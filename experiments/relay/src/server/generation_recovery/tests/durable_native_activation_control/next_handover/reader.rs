//! Actual operator read and optional source/installed SDK against the same relay.
use super::{Authentication, Network, TestResult, operators};
use crate::server::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationDeliveryPathRecoveryControl,
    ServerRecoveryAssetProvider, VerifiedServerLogGenerationDeliveryContinuation,
    VerifiedServerLogGenerationHandoverDeliveryPath, VerifiedServerLogGenerationRecoveryAssets,
    generation_recovery::tests::operator_network::Request,
    prepare_log_generation_delivery_recovery_control,
    prepare_log_generation_handover_delivery_path_recovery_control,
    prepare_log_generation_recovery_control,
};
use std::sync::Arc;

const ENDPOINT: &str = "/recovery/generation-handover-delivery-path/v1/check";

pub(super) struct Reader {
    network: Network,
    control: ServerLogGenerationDeliveryPathRecoveryControl,
    operator: String,
    body: Vec<u8>,
}

impl Reader {
    fn request(&self) -> Request<'_> {
        Request { path: ENDPOINT, ..Request::check(&self.operator) }
    }

    pub(super) async fn check(&self) -> TestResult {
        let response = self.network.request(&self.request(), &self.body).await?;
        assert_eq!(response.status, 200);
        assert!(response.headers.contains("cache-control: no-store"));
        let receipt: serde_json::Value = serde_json::from_slice(&response.body)?;
        assert_eq!(receipt["scope"], "sealed-native-handover-path-and-current-provider");
        assert_eq!(receipt["selection"], serde_json::to_value(self.control.handover_identity())?);
        Ok(())
    }

    pub(super) async fn stale(self) -> TestResult {
        assert_ne!(self.network.request(&self.request(), &self.body).await?.status, 200);
        self.control.close();
        assert_eq!(self.network.request(&self.request(), &self.body).await?.status, 503);
        self.network.stop().await
    }
}

pub(super) async fn operator_read(
    successor: &PreparedLogGenerationRecoveryHost,
    token: &str,
    provider: Arc<dyn ServerRecoveryAssetProvider>,
    assets: Arc<VerifiedServerLogGenerationRecoveryAssets>,
    continuity: Arc<VerifiedServerLogGenerationDeliveryContinuation>,
    proof: Arc<VerifiedServerLogGenerationHandoverDeliveryPath>,
) -> TestResult<Reader> {
    let (operator, _) = Authentication::issue_token()?;
    let (_, current) = prepare_log_generation_recovery_control(
        successor.clone(),
        assets,
        provider,
        "owner",
        token,
        operators(&operator)?,
    )
    .await?;
    let (_, current) =
        prepare_log_generation_delivery_recovery_control(current, continuity).await?;
    let (router, control) =
        prepare_log_generation_handover_delivery_path_recovery_control(current, proof).await?;
    let body = serde_json::to_vec(&control.handover_identity().ok_or("missing handover read")?)?;
    let network = Network::start(router).await?;
    let reader = Reader { network, control, operator, body };
    let foreign = Request { token, ..reader.request() };
    assert_eq!(reader.network.request(&foreign, &reader.body).await?.status, 403);
    assert_eq!(reader.network.request(&reader.request(), b"{}").await?.status, 400);
    let ordinary =
        Request { path: "/recovery/generation-delivery-path/v1/check", ..reader.request() };
    assert_eq!(
        reader
            .network
            .request(&ordinary, &serde_json::to_vec(&reader.control.identity())?)
            .await?
            .status,
        200
    );
    reader.check().await?;
    if let Some(script) = std::env::var_os("BREDITOR_HANDOVER_SDK_CHECK") {
        let input = serde_json::to_vec(&serde_json::json!({
            "base": format!("http://{}", reader.network.address),
            "token": reader.operator,
            "expected": reader.control.handover_identity(),
        }))?;
        tokio::task::spawn_blocking(move || run_sdk(script, &input)).await??;
        println!("HANDOVER_SDK_ACTUAL_CONTROL_OK");
    }
    Ok(reader)
}

fn run_sdk(script: std::ffi::OsString, input: &[u8]) -> std::io::Result<()> {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };
    let mut child = Command::new("node").arg(script).stdin(Stdio::piped()).spawn()?;
    child
        .stdin
        .take()
        .ok_or(std::io::Error::other("missing SDK fixture stdin"))?
        .write_all(input)?;
    if !child.wait()?.success() {
        return Err(std::io::Error::other("actual handover SDK fixture failed"));
    }
    Ok(())
}
