//! External native consumers use real authority and capture handles, not private state.
#![cfg(all(feature = "server", unix))]
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{
    AtomicTransportProfile, Error, Room,
    assets::AssetStore,
    server::{
        Authentication, RoomDeploymentAuthority, RoomDeploymentIdentity, RoomDeploymentSelection,
        router_with_server_backups_and_deployment_lease,
    },
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Directory(PathBuf);
impl Directory {
    fn new() -> Result<Self> {
        let (nonce, _) = Authentication::issue_token()?;
        let root = std::env::temp_dir().join(format!("breditor-external-deployment-{nonce}"));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn detached_choices_never_restore_a_public_serving_lease() -> Result {
    let directory = Directory::new()?;
    let root = directory.0.join("authority");
    let original = RoomDeploymentAuthority::create(&root, &"a".repeat(64))?;
    let pin: RoomDeploymentIdentity =
        serde_json::from_slice(&serde_json::to_vec(&original.identity())?)?;
    let zero = original.current_selection()?;
    assert_eq!(zero.generation, "0");
    assert_eq!(zero.owner, None);
    let first = original.claim(&zero)?;
    let selected: RoomDeploymentSelection =
        serde_json::from_slice(&serde_json::to_vec(&first.selection())?)?;
    let other = RoomDeploymentAuthority::open(&root, &pin)?;
    assert_eq!(other.current_selection()?, selected);
    let second = other.claim(&selected)?;
    assert_eq!(second.selection().generation, "2");
    assert!(matches!(first.check(), Err(Error::Lease)));
    let before = fs::read(root.join("authority.log"))?;
    assert!(matches!(original.claim(&selected), Err(Error::Lease)));
    assert_eq!(fs::read(root.join("authority.log"))?, before);
    let clone = second.clone();
    second.close();
    assert!(matches!(clone.check(), Err(Error::Lease)));
    original.close()?;
    other.close()?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn external_fenced_backup_capture_preserves_the_native_cut_and_refuses_stale_reads() -> Result
{
    let directory = Directory::new()?;
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/external-deployment","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let content: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/external-deployment","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":content}).to_string();
    let path = directory.0.join("source.log");
    let room = Room::create_atomic_transport_v2(
        &path,
        &configuration,
        &document,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    let assets = AssetStore::open(&directory.0.join("assets"), room.asset_binding())?;
    let authority = RoomDeploymentAuthority::create(
        &directory.0.join("authority"),
        &room.deployment_binding()?,
    )?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (_, token_hash) = Authentication::issue_token()?;
    let authentication = Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":token_hash}],"origins":["http://127.0.0.1:4187"]}).to_string())?;
    let original = fs::read(&path)?;
    let (router, backups) =
        router_with_server_backups_and_deployment_lease(room, authentication, assets, lease)?;
    let captured = backups.capture().await?;
    assert_eq!(captured.info().format_version, 1);
    assert_eq!(fs::read(&path)?, original);
    let next = authority.claim(&authority.current_selection()?)?;
    next.check()?;
    assert!(matches!(backups.capture().await, Err(Error::Lease)));
    assert_eq!(fs::read(&path)?, original);
    drop(backups);
    drop(router);
    authority.close()?;
    Ok(())
}
