//! A and B separately retained in C cannot stand in for complete A->B ancestry.
use super::{
    super::source::{Source, TestResult, authentication},
    fixture::add_raster,
};
use crate::{
    Error,
    server::{prepare_log_generation_recovery_host, prepare_physical_room_recovery_host},
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn newer_physical_or_raster_ancestor_refuses_even_when_both_sources_are_retained_in_current()
-> TestResult {
    for physical in [false, true] {
        let source = Source::new((3, true), true, true, true)?;
        let (auth, owner, _) = authentication()?;
        let local = prepare_log_generation_recovery_host(
            source.operation("older-local")?,
            auth,
            source.original_copy()?,
            &source.original.info()?.identity,
            "owner",
            &owner,
        )
        .await?;
        if physical {
            local
                .host
                .transaction(|room| {
                    room.rotate_log_generation("owner", "newer-ancestor").map(|_| ())
                })
                .await?;
        } else {
            let assets = local.host.assets.clone().ok_or("actual rasters")?;
            local
                .host
                .transaction(move |room| {
                    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                    add_raster(room, &mut assets, 7)
                })
                .await?;
        }
        let captured = local.capture_recovery_state("owner", &owner).await?;
        let before = captured.identity()?;
        let (newer, _) = captured.into_parts();
        let selected = newer.info()?.identity;
        assert_eq!(selected.native.source, source.original.info()?.identity.native.source);
        if physical {
            assert_ne!(selected.native.manifest, source.original.info()?.identity.native.manifest);
        } else {
            assert_eq!(selected.native, source.original.info()?.identity.native);
            assert_ne!(selected.assets, source.original.info()?.identity.assets);
        }
        newer.check_archive_ancestor(&source.original)?;
        assert!(source.original.check_archive_ancestor(&newer).is_err());
        assert!(
            prepare_physical_room_recovery_host(
                local.clone(),
                newer,
                &selected,
                &source.original.info()?.identity,
                "owner",
                &owner,
            )
            .await
            .is_err()
        );
        assert_eq!(local.capture_recovery_state("owner", &owner).await?.identity()?, before);
    }
    Ok(())
}
