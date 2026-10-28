//! Forty independent native document/comment families keep provider bytes and future history.
use super::super::{
    super::source::{POLICY, TestResult},
    history::continue_history,
};
use super::{
    fixture::{Fixture, raster},
    provider::{mappings, provider},
};
use crate::{
    OperationalLogGenerationServerRoom, assets::asset_id,
    server::ServerLogGenerationRecoveryAssetCoverage,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_generation_modes_verify_bytes_without_relabeling_origins_or_retaining_native_owners()
-> TestResult {
    let mut count = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    let mut fixture =
                        Box::pin(Fixture::with_histories(profile, atomic, document, review))
                            .await?;
                    let native = super::generation_assets_fixture::native(&fixture).await?;
                    let expected = native.identity();
                    let state = mappings()?;
                    let guard = provider(&state)?;
                    let ServerLogGenerationRecoveryAssetCoverage::Verified(proof) = fixture
                        .local()
                        .verify_recovery_asset_availability(
                            "owner",
                            &fixture.owner,
                            native,
                            guard.clone(),
                        )
                        .await?
                    else {
                        return Err("complete generation bytes did not verify".into());
                    };
                    assert_eq!(proof.identity(), expected);
                    let read = proof.metadata();
                    assert_eq!(read.format, "breditor/server-log-generation-asset-availability");
                    assert_eq!(read.format_version, 1);
                    assert_eq!(read.state.current, expected);
                    assert_eq!(read.state.references.source, expected.server.native);
                    assert_eq!(read.resolutions.len(), 4);
                    assert_eq!(read.assets.len(), 3);
                    for format in [
                        image::ImageFormat::Png,
                        image::ImageFormat::Jpeg,
                        image::ImageFormat::WebP,
                    ] {
                        assert!(
                            read.assets.iter().any(|asset| asset.asset
                                == asset_id(&raster(format).expect("actual image")))
                        );
                    }
                    proof.check_live(fixture.local(), "owner", &fixture.owner, guard).await?;
                    assert_eq!(
                        fixture
                            .local()
                            .capture_asset_recovery_state("owner", &fixture.owner)
                            .await?,
                        read.state
                    );
                    fixture.stop();
                    let mut operation = OperationalLogGenerationServerRoom::resume(
                        &fixture.destination,
                        &fixture.source.local,
                        &fixture.source.local.info()?.identity,
                        POLICY,
                        "owner",
                    )?;
                    continue_history(
                        &mut operation,
                        &fixture.source.local,
                        &fixture.source.source,
                        atomic,
                    )?;
                    assert_eq!(
                        proof.identity(),
                        expected,
                        "detached metadata remains its selected old cut"
                    );
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 40);
    Ok(())
}
