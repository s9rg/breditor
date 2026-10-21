//! All native grammars/transports retain actual decoded raster availability and old offline work.
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
    server::PhysicalServerRecoveryAssetCoverage,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ten_physical_modes_verify_three_actual_formats_and_keep_b_origin_offline_future_history()
-> TestResult {
    let mut count = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let mut fixture = Box::pin(Fixture::new(profile, atomic)).await?;
            let state = mappings()?;
            let provider = provider(&state)?;
            let PhysicalServerRecoveryAssetCoverage::Verified(proof) = fixture
                .host()
                .verify_recovery_asset_availability(
                    "owner",
                    &fixture.owner,
                    fixture.native.clone(),
                    provider.clone(),
                )
                .await?
            else {
                return Err("actual three-format bytes did not verify".into());
            };
            assert_eq!(proof.identity(), fixture.expected);
            let read = proof.metadata();
            assert_eq!(read.format, "breditor/physical-server-asset-availability");
            assert_eq!(read.format_version, 1);
            assert_eq!(read.state.current, fixture.expected);
            assert_eq!(read.state.references.source, fixture.expected.server.native);
            assert_eq!(read.resolutions.len(), 4);
            assert_eq!(read.assets.len(), 3);
            for format in
                [image::ImageFormat::Png, image::ImageFormat::Jpeg, image::ImageFormat::WebP]
            {
                assert!(
                    read.assets.iter().any(
                        |asset| asset.asset == asset_id(&raster(format).expect("actual image"))
                    )
                );
            }
            proof.check_live(fixture.host(), "owner", &fixture.owner, provider.clone()).await?;
            // Neither native/provider verification proof is a strong native host lease.
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
                fixture.expected,
                "detached metadata does not advance with later state"
            );
            count += 1;
        }
    }
    assert_eq!(count, 10);
    Ok(())
}
