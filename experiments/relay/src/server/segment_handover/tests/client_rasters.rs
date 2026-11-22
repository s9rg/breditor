use super::{POLICY, Source, TestResult, auth};
use crate::{
    RecoveryRegistrationCredentials, RelaySegmentClientRaster,
    assets::{asset_id, prepare_asset},
    server::{
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage,
        ServerRecoveryAssetProvider,
    },
};
use std::{
    fs::{self, File},
    io::Cursor,
    sync::Arc,
};

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
fn selected_client_raster_is_bound_to_the_target_and_required_after_commit() -> TestResult {
    struct Mapping(String);
    impl ServerRecoveryAssetProvider for Mapping {
        fn check(&self) -> crate::Result<()> {
            Ok(())
        }
        fn resolve(
            &self,
            pair: &breditor_collab_feasibility::rich_replica::VersionAssetReference,
        ) -> crate::Result<Option<String>> {
            Ok((pair.asset == "asset" && pair.generation == "generation").then(|| self.0.clone()))
        }
    }

    let source = Source::open()?;
    let backup = source.capture("before")?;
    let mut png = Cursor::new(Vec::new());
    let expected = image::DynamicImage::new_rgba8(1, 1);
    expected.write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let id = asset_id(&png);
    let info = prepare_asset(&id, "image/png", png.clone())?.info().clone();
    let input = source.parent.join("client.png");
    fs::write(&input, &png)?;
    let raster = || RelaySegmentClientRaster::open(File::open(&input)?, info.clone());
    let duplicate_path = source.parent.join("duplicates");
    assert!(
        backup
            .restore_with_client_rasters(&duplicate_path, "new", POLICY, &[raster()?, raster()?],)
            .is_err()
    );
    assert!(!duplicate_path.exists());

    let bad_path = source.parent.join("wrong-payload");
    let mut corrupt = png.clone();
    corrupt[0] ^= 1;
    fs::write(&input, corrupt)?;
    assert!(backup.restore_with_client_rasters(&bad_path, "new", POLICY, &[raster()?]).is_err());
    assert!(backup.reopen(&bad_path, POLICY).is_err());
    source.lease.check()?;

    fs::write(&input, &png)?;
    let path = source.parent.join("restored");
    let mut target = backup.restore_with_client_rasters(&path, "new", POLICY, &[raster()?])?;
    assert!(
        RelaySegmentHandoverApproval::select(
            &target,
            backup.identity().clone(),
            source.lease.selection(),
        )
        .is_err()
    );
    assert_eq!(target.components().1.get(&id)?.ok_or("installed payload")?.bytes, png);
    fs::remove_file(input)?;
    // The unit source intentionally has an opaque image. Map its binding to this exact raster
    // to verify the restored bytes as a genuine dependency as well as a client payload.
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(Mapping(id.clone()));
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?
    else {
        return Err("selected mapped raster was not verified".into());
    };
    assert_eq!(inputs.report().assets, vec![info]);
    assert_eq!(inputs.report().client_rasters, vec![id.clone()]);
    let approval =
        RelaySegmentHandoverApproval::select_verified(&target, &inputs, source.lease.selection())?;
    let (_, handle, epoch) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
        &inputs,
    )?;
    drop(handle);
    let stored_path = path.join("rasters").join(format!("{}.asset", &id[7..]));
    let moved = source.parent.join("moved-raster");
    fs::rename(&stored_path, &moved)?;
    assert!(backup.reopen(&path, POLICY).is_err());
    assert!(!stored_path.exists());
    assert_eq!(source.authority.current_selection()?, epoch);
    fs::rename(&moved, &stored_path)?;
    let target = backup.reopen(&path, POLICY)?;
    fs::rename(&stored_path, &moved)?;
    assert!(
        target
            .resume_handover(
                auth(&source.token)?,
                "owner",
                &source.token,
                &source.authority,
                &approval,
                &epoch,
            )
            .is_err()
    );
    assert_eq!(source.authority.current_selection()?, epoch);
    fs::rename(moved, stored_path)?;
    let target = backup.reopen(&path, POLICY)?;
    assert_eq!(target.components().1.get(&id)?.ok_or("retained payload")?.bytes, png);
    let (_, _, resumed) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &source.authority,
        &approval,
        &epoch,
    )?;
    assert_ne!(resumed, epoch);
    Ok(())
}
