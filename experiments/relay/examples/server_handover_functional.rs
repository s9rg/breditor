//! External-crate public API consumer: persisted source seal and INACTIVE recovery/replay.
//! Creates only absent private fixture files and retains them for inspection. No serving starts.
#[path = "participant_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
use breditor_collab_feasibility::rich_replica::{Command, RichReplica, actions::InsertText};
use breditor_collab_relay::{
    Admission, Error, Lease, Room, RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, RoomDeploymentAuthority, router_with_server_backups_and_deployment_lease,
    },
};
use serde_json::{Value, json};
use std::{fs, io::Cursor};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn deliver(room: &mut Room, client: &RichReplica, lease: &Lease, after: &str) -> Result<String> {
    let groups: Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, after)?)?;
    for frame in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit("owner", lease, frame.as_str().ok_or("frame")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("through")?.to_owned())
}
#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let [parent] = args.as_slice() else {
        return Err("expected existing private proof parent".into());
    };
    let parent = fs::canonicalize(parent)?;
    let directory = parent.join("original-server-handover");
    storage::directory(&directory)?;
    let spec = source::Spec { language: 3, standard: true, atomic: true };
    let source = source::create(&directory, spec)?;
    let profile = source.profile;
    let mut room = source.room;
    let registered = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "accepted before seal ".into(),
    })])?;
    let through = deliver(&mut room, &client, &registered.lease, "0")?;
    let mut assets = AssetStore::open(&directory.join("source-assets"), room.asset_binding())?;
    let mut image = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut image, image::ImageFormat::Png)?;
    let image = image.into_inner();
    let raster = asset_id(&image);
    assets.put(prepare_asset(&raster, "image/png", image)?)?;
    let authority =
        RoomDeploymentAuthority::create(&directory.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, hash) = Authentication::issue_token()?;
    assert!(!token.is_empty());
    let auth=Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":hash}],"origins":["http://127.0.0.1:4187"]}).to_string())?;
    let (router, handle) =
        router_with_server_backups_and_deployment_lease(room, auth, assets, lease.clone())?;
    let selected = handle.capture().await?;
    let expected = selected.info().identity;
    let encoded = selected.to_bytes()?;
    storage::write_new(&directory.join("selected-server-backup.brd"), &encoded)?;
    fs::File::open(&directory)?.sync_all()?;
    let native = fs::read(directory.join("source.log"))?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "offline after cut ".into(),
    })])?;
    let pending = client.checkpoint()?;
    let sealed = handle.seal_for_handover(expected.clone()).await?;
    assert_eq!(sealed.backup().to_bytes()?, encoded);
    assert_eq!(fs::read(directory.join("source.log"))?, native);
    assert_eq!(client.checkpoint()?, pending);
    assert!(lease.check().is_err());
    assert!(handle.capture().await.is_err());
    let epoch = sealed.sealed_selection().clone();
    assert_eq!(epoch, authority.current_selection()?);
    let persisted =
        ServerRoomBackup::from_bytes(&fs::read(directory.join("selected-server-backup.brd"))?)?;
    assert_eq!(persisted.info().identity, expected);
    let recovered = ServerRoomRecovery::begin(
        &directory.join("inactive-recovery"),
        &persisted,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&persisted)?;
    let (mut restored, rasters) = recovered.into_parts();
    assert_eq!(rasters.count(), 1);
    assert!(restored.read_asset("owner", &rasters, &raster)?.is_some());
    assert!(matches!(restored.validate_lease("owner", &registered.lease), Err(Error::Lease)));
    let session = restored.resume("owner", &registered.lease.writer, &registered.credential)?;
    let final_through = deliver(&mut restored, &client, &session, &through)?;
    let groups: Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, &through)?)?;
    for frame in groups["groups"].as_array().ok_or("pending groups")? {
        let Admission::Durable(reply) =
            restored.admit("owner", &session, frame.as_str().ok_or("pending frame")?)?
        else {
            return Err("duplicate not durable".into());
        };
        assert!(reply.duplicate);
    }
    let document = client.document_json().to_owned();
    assert!(client.undo()?);
    let undo_through = deliver(&mut restored, &client, &session, &final_through)?;
    assert!(client.redo()?);
    deliver(&mut restored, &client, &session, &undo_through)?;
    let observer = profile.join_frame("room".into(), "99".into(), &restored.catchup("owner")?)?;
    assert_eq!(client.document_json(), document);
    assert_eq!(observer.document_json(), document);
    assert_eq!(fs::read(directory.join("source.log"))?, native);
    println!(
        "{}",
        json!({"format":"breditor/server-handover-functional","formatVersion":1,"kind":"original-source-sealed-inactive-replay","profile":spec.name(),"profileBytes":source.configuration.len(),"sealedEpoch":epoch.generation,"rasters":rasters.count(),"futureUndoRedoSteps":2,"directory":directory})
    );
    drop(router);
    drop(handle);
    Ok(())
}
