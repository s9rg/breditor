//! Final provider callbacks cannot publish stale native coverage or repair altered fixture files.
use super::support::{Directory, Result, fill, source};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use breditor_collab_relay::{
    Error,
    server::{
        Authentication, ServerAssetAvailabilityCoverage, ServerRecoveryAssetProvider,
        router_with_server_backups,
    },
};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

struct FinalGuard {
    path: PathBuf,
    calls: AtomicUsize,
    mutate_at: AtomicUsize,
    mutated: AtomicBool,
}
impl ServerRecoveryAssetProvider for FinalGuard {
    fn check(&self) -> std::result::Result<(), Error> {
        let observed = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
        if observed == self.mutate_at.load(Ordering::SeqCst) {
            let mut file = fs::OpenOptions::new().append(true).open(&self.path)?;
            file.write_all(b"!")?;
            file.sync_all()?;
            self.mutated.store(true, Ordering::SeqCst);
        }
        Ok(())
    }
    fn resolve(&self, _: &VersionAssetReference) -> std::result::Result<Option<String>, Error> {
        Ok(None)
    }
}

async fn workflow(complete: bool, raster: bool) -> Result {
    let directory = Directory::new()?;
    let (_, room, mut assets) = source(&directory)?;
    if complete {
        fill(&room, &mut assets)?;
    }
    let (token, hash) = Authentication::issue_token()?;
    let auth = Authentication::from_json(
        &serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,
            "origins":["http://127.0.0.1:4187"],"accounts":[{"principal":"owner","tokenHash":hash}]}).to_string(),
    )?;
    let (_router, handle) = router_with_server_backups(room, auth, assets)?;
    let expected = handle.capture_asset_recovery_state("owner", &token).await?.current;
    let guard = Arc::new(FinalGuard {
        path: directory.0.join(if raster { "source-assets/store.json" } else { "source.log" }),
        calls: AtomicUsize::new(0),
        mutate_at: AtomicUsize::new(usize::MAX),
        mutated: AtomicBool::new(false),
    });
    match handle
        .verify_server_asset_availability("owner", &token, expected.clone(), guard.clone())
        .await?
    {
        ServerAssetAvailabilityCoverage::Verified(_) if complete => {}
        ServerAssetAvailabilityCoverage::Pending { missing, .. }
            if !complete && missing.len() == 1 => {}
        _ => return Err("baseline native byte coverage differs".into()),
    }
    // Count callbacks from a valid unchanged run, then alter the actual source on the final one.
    // No assumption about the number of references or the internal number of guard calls.
    let final_check = guard.calls.swap(0, Ordering::SeqCst);
    assert!(final_check > 0);
    guard.mutate_at.store(final_check, Ordering::SeqCst);
    let before = fs::read(&guard.path)?;
    let result =
        handle.verify_server_asset_availability("owner", &token, expected, guard.clone()).await;
    assert!(
        guard.mutated.load(Ordering::SeqCst),
        "provider callback must have synced its change and returned success"
    );
    let after = fs::read(&guard.path)?;
    assert_eq!(after, [before.as_slice(), b"!"].concat());
    assert!(
        result.is_err(),
        "changed source after final provider callback must refuse before Ready or Pending"
    );
    assert!(handle.capture_asset_recovery_state("owner", &token).await.is_err());
    assert_eq!(
        fs::read(&guard.path)?,
        after,
        "verification must never repair altered native or raster source"
    );
    Ok(())
}

#[tokio::test]
async fn final_provider_guard_cannot_publish_stale_verified_native_result() -> Result {
    Box::pin(workflow(true, false)).await
}
#[tokio::test]
async fn final_provider_guard_cannot_publish_stale_verified_raster_result() -> Result {
    Box::pin(workflow(true, true)).await
}
#[tokio::test]
async fn final_provider_guard_cannot_publish_stale_native_missing_byte_pending() -> Result {
    Box::pin(workflow(false, false)).await
}
#[tokio::test]
async fn final_provider_guard_cannot_publish_stale_raster_missing_byte_pending() -> Result {
    Box::pin(workflow(false, true)).await
}
