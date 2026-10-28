//! Same metadata is not the same live owner. Proofs retain no native host custody.
use super::super::super::source::{POLICY, TestResult};
use super::{
    fixture::Fixture,
    provider::{mappings, provider},
};
use crate::{
    Error, OperationalLogGenerationServerRoom,
    server::{
        Authentication, PreparedLogGenerationRecoveryHost,
        ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryCoverage,
        prepare_log_generation_recovery_host,
    },
};
use std::sync::Arc;

fn auth(token: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(&serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,"origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":crate::credentials::hash(token)?}]}).to_string())?)
}
async fn prepare(
    fixture: &Fixture,
    operation: OperationalLogGenerationServerRoom,
) -> TestResult<PreparedLogGenerationRecoveryHost> {
    Ok(prepare_log_generation_recovery_host(
        operation,
        auth(&fixture.owner)?,
        fixture.source.local_copy()?,
        &fixture.source.local.info()?.identity,
        "owner",
        &fixture.owner,
    )
    .await?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn foreign_host_with_same_current_account_cannot_borrow_another_native_provider_proof()
-> TestResult {
    let fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    let state = mappings()?;
    let guard = provider(&state)?;
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
        .local()
        .verify_recovery_asset_availability("owner", &fixture.owner, native.clone(), guard.clone())
        .await?
    else {
        return Err("native generation provider proof absent".into());
    };
    let foreign =
        Box::pin(prepare(&fixture, fixture.source.operation("generation-foreign")?)).await?;
    let calls = state.lock().map_err(|_| "mapping guard")?.calls;
    assert!(matches!(
        proof.check_live(&foreign, "owner", &fixture.owner, guard.clone()).await,
        Err(Error::Contract("generation verification belongs to a different host"))
    ));
    assert!(matches!(
        foreign
            .verify_recovery_asset_availability("owner", &fixture.owner, native, guard.clone())
            .await,
        Err(Error::Contract("generation verification belongs to a different host"))
    ));
    assert_eq!(state.lock().map_err(|_| "mapping guard")?.calls, calls);
    proof.check_live(fixture.local(), "owner", &fixture.owner, guard).await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn proof_does_not_retain_native_host_or_revive_after_exact_cold_reopen() -> TestResult {
    let mut fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    let selected = native.identity();
    let state = mappings()?;
    let guard = provider(&state)?;
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
        .local()
        .verify_recovery_asset_availability("owner", &fixture.owner, native, guard.clone())
        .await?
    else {
        return Err("native generation provider proof absent".into());
    };
    fixture.stop();
    let operation = OperationalLogGenerationServerRoom::resume(
        &fixture.destination,
        &fixture.source.local,
        &fixture.source.local.info()?.identity,
        POLICY,
        "owner",
    )?;
    let reopened = Box::pin(prepare(&fixture, operation)).await?;
    let captured = reopened.capture_recovery_state("owner", &fixture.owner).await?;
    assert_eq!(captured.identity()?, selected, "actual reopened source must be byte-identical");
    let calls = state.lock().map_err(|_| "mapping guard")?.calls;
    assert!(matches!(
        proof.check_live(&reopened, "owner", &fixture.owner, guard.clone()).await,
        Err(Error::Contract("generation verification belongs to a different host"))
    ));
    assert_eq!(state.lock().map_err(|_| "mapping guard")?.calls, calls);
    let (_, inventory) = captured.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(current) = reopened
        .verify_selected_recovery_state(
            "owner",
            &fixture.owner,
            selected.clone(),
            inventory,
            fixture.credentials(),
        )
        .await?
    else {
        return Err("fresh current native owner failed".into());
    };
    let ServerLogGenerationRecoveryAssetCoverage::Verified(fresh) = reopened
        .verify_recovery_asset_availability(
            "owner",
            &fixture.owner,
            Arc::new(current),
            guard.clone(),
        )
        .await?
    else {
        return Err("fresh current provider proof failed".into());
    };
    fresh.check_live(&reopened, "owner", &fixture.owner, guard).await?;
    assert_eq!(fresh.identity(), selected);
    assert_eq!(proof.identity(), selected);
    Ok(())
}
