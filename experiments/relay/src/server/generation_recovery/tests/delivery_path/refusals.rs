//! Valid latest or individually retained archives cannot hide a broken INTERMEDIATE link.
use super::{
    super::source::{POLICY, Source, TestResult},
    source,
};
use crate::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery};
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn literal_pins_auth_host_order_count_and_stale_current_are_all_required() -> TestResult {
    let seed = Source::new((3, true), true, true, true)?;
    let (handle, owner, reader) = source::host(&seed, "path").await?;
    source::middle(&handle).await?;
    let b = source::capture(&handle, &owner).await?;
    source::advance(&handle, &seed, true, true, true).await?;
    let c = source::capture(&handle, &owner).await?;
    let pins = vec![b.info()?.identity, c.info()?.identity];
    let current = source::proof(&handle, &owner, &seed).await?;
    let copy = || -> TestResult<Vec<ServerLogGenerationRoomBackup>> {
        Ok(vec![source::copy(&b)?, source::copy(&c)?])
    };
    for (principal, token) in [("owner", "wrong"), ("reader", reader.as_str())] {
        assert!(
            handle
                .verify_delivery_path(principal, token, copy()?, &pins, current.clone())
                .await
                .is_err()
        );
    }
    assert!(
        handle.verify_delivery_path("owner", &owner, vec![], &[], current.clone()).await.is_err()
    );
    assert!(
        handle
            .verify_delivery_path("owner", &owner, copy()?, &pins[..1], current.clone())
            .await
            .is_err()
    );
    let mut wrong = pins.clone();
    wrong[0].archive_sha256[0] ^= 1;
    assert!(
        handle
            .verify_delivery_path("owner", &owner, copy()?, &wrong, current.clone())
            .await
            .is_err()
    );
    let mut reversed = copy()?;
    reversed.reverse();
    let mut reversed_pins = pins.clone();
    reversed_pins.reverse();
    assert!(
        handle
            .verify_delivery_path("owner", &owner, reversed, &reversed_pins, current.clone())
            .await
            .is_err()
    );
    let (other, token, _) = source::host(&seed, "other").await?;
    assert!(
        other.verify_delivery_path("owner", &token, copy()?, &pins, current.clone()).await.is_err()
    );
    let proof = handle.verify_delivery_path("owner", &owner, copy()?, &pins, current).await?;
    let assets = handle.host.assets.clone().ok_or("rasters")?;
    let bytes = source::png(9, 10)?;
    handle
        .host
        .transaction(move |room| {
            let mut assets = assets.lock().map_err(|_| crate::Error::NeedsRecovery)?;
            room.put_asset(
                "owner",
                &mut assets,
                crate::assets::prepare_asset(&crate::assets::asset_id(&bytes), "image/png", bytes)?,
            )?;
            Ok(())
        })
        .await?;
    assert!(proof.check_live(&handle, "owner", &owner).await.is_err());
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn two_native_equal_middle_archives_both_retained_by_current_do_not_prove_their_raster_order()
-> TestResult {
    let seed = Source::new((3, true), true, true, true)?;
    let (handle, owner, _) = source::host(&seed, "path").await?;
    source::middle(&handle).await?;
    let b = source::capture(&handle, &owner).await?;
    let selected = b.info()?.identity;
    let mut cuts = Vec::new();
    for (i, size) in [(4, 5), (6, 7)].into_iter().enumerate() {
        let mut fork = ServerLogGenerationRoomRecovery::begin(
            &seed.directory.0.join(format!("raster-{i}")),
            &b,
            &selected,
            POLICY,
        )?
        .finish(&b)?
        .begin_operation(&b, &selected, POLICY, "owner")?;
        let (room, assets) = fork.components_mut();
        let bytes = source::png(size.0, size.1)?;
        room.put_asset(
            "owner",
            assets,
            crate::assets::prepare_asset(&crate::assets::asset_id(&bytes), "image/png", bytes)?,
        )?;
        let cut = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
        assert_eq!(cut.info()?.identity.native, selected.native);
        cut.check_archive_ancestor(&b)?;
        cuts.push(cut);
    }
    for size in [(4, 5), (6, 7)] {
        let assets = handle.host.assets.clone().ok_or("actual rasters")?;
        let bytes = source::png(size.0, size.1)?;
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| crate::Error::NeedsRecovery)?;
                room.put_asset(
                    "owner",
                    &mut assets,
                    crate::assets::prepare_asset(
                        &crate::assets::asset_id(&bytes),
                        "image/png",
                        bytes,
                    )?,
                )?;
                Ok(())
            })
            .await?;
    }
    let current = source::proof(&handle, &owner, &seed).await?;
    for cut in &cuts {
        let id = cut.info()?.identity;
        handle
            .verify_delivery_continuation("owner", &owner, source::copy(cut)?, &id, current.clone())
            .await?;
    }
    let pins = vec![b.info()?.identity, cuts[0].info()?.identity, cuts[1].info()?.identity];
    assert!(
        handle
            .verify_delivery_path(
                "owner",
                &owner,
                vec![source::copy(&b)?, source::copy(&cuts[0])?, source::copy(&cuts[1])?],
                &pins,
                current
            )
            .await
            .is_err()
    );
    Ok(())
}
