//! The operator owns a separate account configuration, never the native editor token.
use super::super::super::super::source::TestResult;
use super::super::{
    fixture::Fixture,
    provider::{Mapping, mappings, provider},
};
use crate::server::{
    Authentication, ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryControl,
    ServerRecoveryAssetProvider, VerifiedServerLogGenerationRecoveryAssets,
    prepare_log_generation_recovery_control,
};
use axum::Router;
use std::sync::{Arc, Mutex};

pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
pub(super) fn operators(token: &str) -> TestResult<Authentication> {
    let hash = crate::credentials::hash(token)?;
    Ok(Authentication::from_json(&serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,"origins":[ORIGIN],"accounts":[{"principal":"operator","tokenHash":hash}]}).to_string())?)
}
pub(super) struct Setup {
    pub fixture: Fixture,
    pub mapping: Arc<Mutex<Mapping>>,
    pub provider: Arc<dyn ServerRecoveryAssetProvider>,
    pub proof: Arc<VerifiedServerLogGenerationRecoveryAssets>,
    pub native: Arc<crate::server::VerifiedServerLogGenerationRecoveryState>,
    pub token: String,
    pub control: Option<ServerLogGenerationRecoveryControl>,
    pub router: Router,
}
impl Setup {
    pub async fn new(profile: (u32, bool), atomic: bool) -> TestResult<Self> {
        Box::pin(Self::with_histories(profile, atomic, true, true)).await
    }
    pub async fn with_histories(
        profile: (u32, bool),
        atomic: bool,
        document: bool,
        review: bool,
    ) -> TestResult<Self> {
        let fixture = Box::pin(Fixture::with_histories(profile, atomic, document, review)).await?;
        let native = super::super::generation_assets_fixture::native(&fixture).await?;
        let mapping = mappings()?;
        let provider = provider(&mapping)?;
        let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
            .local()
            .verify_recovery_asset_availability(
                "owner",
                &fixture.owner,
                native.clone(),
                provider.clone(),
            )
            .await?
        else {
            return Err("native assets".into());
        };
        let proof = Arc::new(proof);
        let (token, _) = Authentication::issue_token()?;
        let (router, control) = prepare_log_generation_recovery_control(
            fixture.local().clone(),
            proof.clone(),
            provider.clone(),
            "owner",
            &fixture.owner,
            operators(&token)?,
        )
        .await?;
        Ok(Self {
            fixture,
            mapping,
            provider,
            proof,
            native,
            token,
            control: Some(control),
            router,
        })
    }
    pub fn selection(&self) -> crate::server::ServerLogGenerationRecoveryControlIdentity {
        self.control.as_ref().expect("live test operator").identity()
    }
}
