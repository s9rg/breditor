//! Equal native clocks or references do not preserve a stale complete generation byte proof.
use super::super::{super::source::TestResult, fixture::add_raster};
use super::{
    fixture::Fixture,
    provider::{mappings, provider},
};
use crate::{
    Error,
    server::{ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryCoverage},
};
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_only_and_raster_only_changes_require_a_fresh_current_native_proof() -> TestResult
{
    for physical in [false, true] {
        let fixture = Box::pin(Fixture::new((3, true), true)).await?;
        let native = super::generation_assets_fixture::native(&fixture).await?;
        let selected = native.identity();
        let state = mappings()?;
        let guard = provider(&state)?;
        let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
            .local()
            .verify_recovery_asset_availability(
                "owner",
                &fixture.owner,
                native.clone(),
                guard.clone(),
            )
            .await?
        else {
            return Err("complete generation bytes did not verify".into());
        };
        if physical {
            fixture
                .local()
                .host
                .transaction(|room| {
                    room.rotate_log_generation("owner", "provider-physical-only").map(|_| ())
                })
                .await?;
        } else {
            let assets = fixture.local().host.assets.clone().ok_or("actual raster owner")?;
            fixture
                .local()
                .host
                .transaction(move |room| {
                    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                    add_raster(room, &mut assets, 7)
                })
                .await?;
        }
        assert!(
            proof
                .check_live(fixture.local(), "owner", &fixture.owner, guard.clone())
                .await
                .is_err()
        );
        assert!(
            fixture
                .local()
                .verify_recovery_asset_availability(
                    "owner",
                    &fixture.owner,
                    native.clone(),
                    guard.clone()
                )
                .await
                .is_err()
        );
        let captured = fixture.local().capture_recovery_state("owner", &fixture.owner).await?;
        let expected = captured.identity()?;
        assert_eq!(expected.origin, selected.origin);
        if physical {
            assert_eq!(expected.server.native.source, selected.server.native.source);
            assert_ne!(expected.server.native.manifest, selected.server.native.manifest);
            assert_eq!(expected.server.assets, selected.server.assets);
        } else {
            assert_eq!(expected.server.native, selected.server.native);
            assert_ne!(expected.server.assets, selected.server.assets);
        }
        let (_, inventory) = captured.into_parts();
        let ServerLogGenerationRecoveryCoverage::Verified(native) = fixture
            .local()
            .verify_selected_recovery_state(
                "owner",
                &fixture.owner,
                expected.clone(),
                inventory,
                fixture.credentials(),
            )
            .await?
        else {
            return Err("fresh seven protected records did not verify".into());
        };
        let ServerLogGenerationRecoveryAssetCoverage::Verified(fresh) = fixture
            .local()
            .verify_recovery_asset_availability(
                "owner",
                &fixture.owner,
                Arc::new(native),
                guard.clone(),
            )
            .await?
        else {
            return Err("fresh exact source did not verify".into());
        };
        assert_eq!(fresh.identity(), expected);
        assert_eq!(fresh.metadata().resolutions, proof.metadata().resolutions);
        assert_eq!(fresh.metadata().assets, proof.metadata().assets);
        fresh.check_live(fixture.local(), "owner", &fixture.owner, guard).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn later_registration_cannot_use_an_old_byte_proof_or_skip_its_new_protected_record()
-> TestResult {
    let fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    let selected = native.identity();
    let state = mappings()?;
    let guard = provider(&state)?;
    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
        .local()
        .verify_recovery_asset_availability("owner", &fixture.owner, native.clone(), guard.clone())
        .await?
    else {
        return Err("complete generation bytes did not verify".into());
    };
    assert_eq!(proof.identity(), selected);
    let peer = fixture.local().host.transaction(|room| room.register("owner")).await?;
    assert!(
        proof.check_live(fixture.local(), "owner", &fixture.owner, guard.clone()).await.is_err()
    );
    assert!(
        fixture
            .local()
            .verify_recovery_asset_availability(
                "owner",
                &fixture.owner,
                native.clone(),
                guard.clone()
            )
            .await
            .is_err()
    );
    let captured = fixture.local().capture_recovery_state("owner", &fixture.owner).await?;
    let expected = captured.identity()?;
    let (_, inventory) = captured.into_parts();
    let ServerLogGenerationRecoveryCoverage::Pending { missing } = fixture
        .local()
        .verify_selected_recovery_state(
            "owner",
            &fixture.owner,
            expected.clone(),
            inventory.clone(),
            fixture.credentials(),
        )
        .await?
    else {
        return Err("new protected input was not required".into());
    };
    assert_eq!(missing.len(), 1);
    let mut complete = fixture.credentials();
    complete.documents.push(crate::RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: peer.lease.writer,
        credential: peer.credential,
    });
    let ServerLogGenerationRecoveryCoverage::Verified(native) = fixture
        .local()
        .verify_selected_recovery_state(
            "owner",
            &fixture.owner,
            expected.clone(),
            inventory,
            complete,
        )
        .await?
    else {
        return Err("all eight protected records did not verify".into());
    };
    let ServerLogGenerationRecoveryAssetCoverage::Verified(fresh) = fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &fixture.owner,
            Arc::new(native),
            guard.clone(),
        )
        .await?
    else {
        return Err("fresh current bytes did not verify".into());
    };
    assert_eq!(fresh.identity(), expected);
    fresh.check_live(fixture.local(), "owner", &fixture.owner, guard).await?;
    Ok(())
}
