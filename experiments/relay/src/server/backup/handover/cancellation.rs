//! Actual async cancellation does not roll back an already-entered native seal.
use super::super::ServerBackupHandle;
use crate::{
    Error, Room, RoomRecoveryPolicy, ServerRoomRecovery,
    assets::AssetStore,
    server::{
        Authentication, RoomDeploymentAuthority, router_with_server_backups_and_deployment_lease,
    },
};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::mpsc,
    time::{Duration, Instant},
};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn fixture() -> TestResult<(Directory, ServerBackupHandle, axum::Router, RoomDeploymentAuthority)> {
    let path =
        std::env::temp_dir().join(format!("breditor-seal-cancel-{}", crate::credentials::issue()?));
    fs::create_dir(&path)?;
    let d = Directory(path);
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/seal-cancellation","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&config)?;
    let tree: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    )))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/seal-cancellation","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let room = Room::create(&d.0.join("source.log"), &config, &document, "owner")?;
    let assets = AssetStore::open(&d.0.join("assets"), room.asset_binding())?;
    let authority =
        RoomDeploymentAuthority::create(&d.0.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, hash) = Authentication::issue_token()?;
    assert!(!token.is_empty());
    let auth=Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":hash}],"origins":["http://127.0.0.1:4187"]}).to_string())?;
    let (router, handle) =
        router_with_server_backups_and_deployment_lease(room, auth, assets, lease)?;
    Ok((d, handle, router, authority))
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dropping_awaiting_task_preserves_original_sources_and_finishes_durable_fence() -> TestResult
{
    let (d, handle, router, authority) = fixture()?;
    let backup = handle.capture().await?;
    let selected = backup.info().identity;
    let before = fs::read(d.0.join("source.log"))?;
    let observer = RoomDeploymentAuthority::open(&d.0.join("authority"), &authority.identity())?;
    let native = handle.host.room.clone();
    let (entered, entry) = mpsc::channel();
    let (release, exit) = mpsc::channel();
    let holder = std::thread::spawn(move || {
        let _guard = native.lock().expect("actual source room mutex");
        entered.send(()).expect("entry receiver");
        let _ = exit.recv_timeout(Duration::from_secs(10));
    });
    entry.recv_timeout(Duration::from_secs(5))?;
    let source = handle.clone();
    let expected = selected.clone();
    let task = tokio::spawn(async move {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match source.seal_for_handover(expected.clone()).await {
                Err(Error::Locked) if Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
                result => return result,
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let exclusive = loop {
        match observer.current_selection() {
            Err(Error::Locked) => break true,
            Ok(_) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            _ => break false,
        }
    };
    task.abort();
    let cancelled = task.await;
    let _ = release.send(());
    holder.join().map_err(|_| "holder panic")?;
    assert!(exclusive, "actual worker never entered exclusive native seal");
    assert!(cancelled.is_err_and(|error| error.is_cancelled()));
    let deadline = Instant::now() + Duration::from_secs(5);
    let sealed = loop {
        match observer.current_selection() {
            Ok(row) if row.generation == "2" => break row,
            Err(Error::Locked) if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
            other => return Err(format!("native fence did not settle: {other:?}").into()),
        }
    };
    assert_eq!(sealed, authority.current_selection()?);
    assert!(matches!(handle.capture().await, Err(Error::Lease)));
    assert_eq!(fs::read(d.0.join("source.log"))?, before);
    let recovered = ServerRoomRecovery::begin(
        &d.0.join("restored"),
        &backup,
        &selected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&backup)?;
    assert_eq!(fs::read(recovered.root().join("room.log"))?, before);
    drop(recovered);
    drop(handle);
    drop(router);
    Ok(())
}
