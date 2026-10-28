//! Current auth, provider epochs and exact guard identity remain independent of equal bytes.
use super::super::super::source::TestResult;
use super::{
    fixture::Fixture,
    provider::{mappings, provider},
};
use crate::server::ServerLogGenerationRecoveryAssetCoverage;
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wrong_auth_equal_looking_provider_and_changed_epoch_cannot_reuse_a_generation_proof()
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
        return Err("complete generation bytes did not verify".into());
    };
    let before = state.lock().map_err(|_| "mapping guard")?.calls;
    for (principal, token) in [
        ("owner", fixture.reader.as_str()),
        ("reader", fixture.reader.as_str()),
        ("owner", "wrong"),
    ] {
        assert!(proof.check_live(fixture.local(), principal, token, guard.clone()).await.is_err());
        assert!(
            fixture
                .local()
                .verify_recovery_asset_availability(principal, token, native.clone(), guard.clone())
                .await
                .is_err()
        );
    }
    assert_eq!(state.lock().map_err(|_| "mapping guard")?.calls, before);
    let other = provider(&state)?;
    assert!(proof.check_live(fixture.local(), "owner", &fixture.owner, other).await.is_err());
    proof.check_live(fixture.local(), "owner", &fixture.owner, guard.clone()).await?;
    state.lock().map_err(|_| "mapping guard")?.allowed = false;
    assert!(
        proof.check_live(fixture.local(), "owner", &fixture.owner, guard.clone()).await.is_err()
    );
    {
        let mut value = state.lock().map_err(|_| "mapping guard")?;
        value.allowed = true;
        value.epoch += 1;
    }
    assert!(
        proof.check_live(fixture.local(), "owner", &fixture.owner, guard.clone()).await.is_err()
    );
    let current = provider(&state)?;
    let ServerLogGenerationRecoveryAssetCoverage::Verified(fresh) = fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &fixture.owner,
            native.clone(),
            current.clone(),
        )
        .await?
    else {
        return Err("fresh explicit guard did not verify".into());
    };
    fresh.check_live(fixture.local(), "owner", &fixture.owner, current).await?;
    let weak = Arc::downgrade(&guard);
    drop(guard);
    assert!(weak.upgrade().is_none(), "proof must not retain a stopped provider");
    assert!(
        proof
            .check_live(fixture.local(), "owner", &fixture.owner, provider(&state)?)
            .await
            .is_err()
    );
    Ok(())
}
