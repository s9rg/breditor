//! Opaque mappings and actual missing payloads stay Pending; source selections are never retargeted.
use super::super::super::source::TestResult;
use super::{
    fixture::Fixture,
    provider::{mappings, provider},
};
use crate::{
    ServerAssetReferenceOutcome,
    server::{
        ContentAddressedServerAssets, ServerAssetAvailabilityMissing,
        ServerLogGenerationRecoveryAssetCoverage,
    },
};
use std::{io::Cursor, sync::Arc};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn missing_exact_opaque_mappings_or_actual_payloads_do_not_create_a_generation_proof()
-> TestResult {
    let fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    let ServerLogGenerationRecoveryAssetCoverage::Pending { state, missing } = fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &fixture.owner,
            native.clone(),
            Arc::new(ContentAddressedServerAssets),
        )
        .await?
    else {
        return Err("missing opaque mappings produced a proof".into());
    };
    assert_eq!(state.current, native.identity());
    assert!(matches!(state.references.outcome, ServerAssetReferenceOutcome::Ready { .. }));
    assert_eq!(missing.len(), 2);
    assert!(
        missing.iter().all(|row| matches!(row, ServerAssetAvailabilityMissing::Mapping { .. }))
    );
    let state = mappings()?;
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(9, 11).write_to(&mut bytes, image::ImageFormat::Png)?;
    let absent = crate::assets::asset_id(&bytes.into_inner());
    for content in state.lock().map_err(|_| "mapping guard")?.pairs.values_mut() {
        *content = absent.clone();
    }
    let ServerLogGenerationRecoveryAssetCoverage::Pending { state: selected, missing } = fixture
        .local()
        .verify_recovery_asset_availability(
            "owner",
            &fixture.owner,
            native.clone(),
            provider(&state)?,
        )
        .await?
    else {
        return Err("missing actual payloads produced a proof".into());
    };
    assert_eq!(selected.current, native.identity());
    assert_eq!(missing.len(), 2);
    assert!(missing.iter().all(|row| matches!(row, ServerAssetAvailabilityMissing::Bytes { .. })));
    assert_eq!(
        fixture.local().capture_recovery_state("owner", &fixture.owner).await?.identity()?,
        native.identity()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalid_divergent_or_changing_opaque_mappings_refuse_without_changing_native_sources()
-> TestResult {
    let fixture = Box::pin(Fixture::new((3, true), true)).await?;
    let native = super::generation_assets_fixture::native(&fixture).await?;
    for wrong in ["invalid", "divergent", "changing"] {
        let state = mappings()?;
        {
            let mut value = state.lock().map_err(|_| "mapping guard")?;
            if wrong == "invalid" {
                value.pairs.insert(
                    ("asset".into(), "generation".into()),
                    "private-invalid-mapping".into(),
                );
            } else if wrong == "divergent" {
                let different = value.flip_target.clone();
                value.pairs.insert(("asset".into(), "generation".into()), different);
            } else {
                value.flip_on = Some(1);
            }
        }
        assert!(
            fixture
                .local()
                .verify_recovery_asset_availability(
                    "owner",
                    &fixture.owner,
                    native.clone(),
                    provider(&state)?,
                )
                .await
                .is_err(),
            "{wrong}"
        );
        assert_eq!(
            fixture.local().capture_recovery_state("owner", &fixture.owner).await?.identity()?,
            native.identity()
        );
        native.check_live(fixture.local(), "owner", &fixture.owner).await?;
    }
    Ok(())
}
