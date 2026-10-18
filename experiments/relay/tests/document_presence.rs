//! Document-channel presence and whole-document V2 groups preserve old rooms, leases and recovery.
use breditor_collab_feasibility::rich_replica::{RichReplica, SharedRichProfile};
use breditor_collab_relay::{Admission, AtomicTransportProfile, Role, Room};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Files {
    directory: PathBuf,
    log: PathBuf,
}
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "breditor-document-presence-{}-{now}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&directory)?;
        Ok(Self { log: directory.join("room.log"), directory })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.log);
        let _ = fs::remove_dir(&self.directory);
    }
}
fn configuration() -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/document-relay","version":1},"extensions":[]}).to_string()
}
fn seed(p: &SharedRichProfile) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-relay","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},"children":[{"kind":"text","text":"Seed 🙂","formats":[]}]}]}}).to_string()
}
fn enable(a: &mut RichReplica) -> Result {
    a.enable_document_selection_guarded(&a.observe()?)?;
    a.select_document_guarded(&a.observe_document()?)?;
    Ok(())
}
fn packet(a: &RichReplica) -> Result<String> {
    Ok(a.document_presence_frame_guarded(&a.observe_document()?)?)
}
#[test]
fn document_presence_is_separate_ephemeral_and_bound_to_the_current_writer_lease() -> Result {
    let files = Files::new()?;
    let config = configuration();
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config)?;
    let mut room = Room::create_atomic_transport_v2(
        &files.log,
        &config,
        &seed(&p),
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    room.grant("owner", "bob", Some(Role::Editor))?;
    let alice = room.register("alice")?;
    let bob = room.register("bob")?;
    let mut a = p.join_frame("room".into(), alice.lease.writer.clone(), &room.catchup("alice")?)?;
    let b = p.join_frame("room".into(), bob.lease.writer.clone(), &room.catchup("bob")?)?;
    enable(&mut a)?;
    let frame = packet(&a)?;
    let before = (fs::read(&files.log)?, room.catchup("alice")?);
    assert!(room.publish_presence("alice", &alice.lease, "1", &frame).is_err());
    assert!(room.publish_document_presence("bob", &bob.lease, "1", &frame).is_err());
    assert!(
        room.publish_document_presence(
            "alice",
            &alice.lease,
            "1",
            &b.presence_frame_guarded(&b.observe()?)?
        )
        .is_err()
    );
    assert!(room.publish_document_presence("alice", &alice.lease, "1", &frame)?);
    assert!(room.presence_snapshot("alice", Some(&alice.lease))?.is_empty());
    let peers = room.document_presence_snapshot("bob", Some(&bob.lease))?;
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].frame, frame);
    assert_eq!(peers[0].label, "alice");
    assert_eq!((fs::read(&files.log)?, room.catchup("alice")?), before);
    let next = room.resume("alice", &alice.lease.writer, &alice.credential)?;
    assert!(room.document_presence_snapshot("bob", None)?.is_empty());
    assert!(room.publish_document_presence("alice", &alice.lease, "2", &frame).is_err());
    room.publish_document_presence("alice", &next, "1", &frame)?;
    room.release(&alice.lease);
    assert_eq!(room.document_presence_snapshot("bob", None)?.len(), 1);
    room.grant("owner", "alice", None)?;
    assert!(room.document_presence_snapshot("bob", None)?.is_empty());
    Ok(())
}
#[test]
fn document_replacement_and_future_history_cross_v2_room_restart_without_changing_server_save_family()
-> Result {
    let files = Files::new()?;
    let config = configuration();
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config)?;
    let mut room = Room::create_atomic_transport_v2(
        &files.log,
        &config,
        &seed(&p),
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let mut lease = registration.lease.clone();
    let mut a = p.join_frame("room".into(), lease.writer.clone(), &room.catchup("alice")?)?;
    enable(&mut a)?;
    a.replace_document_plain_text_json_guarded(
        &a.observe_document()?,
        &json!({"paragraph":"fresh","text":"Q🙂"}).to_string(),
    )?;
    a.select_document_guarded(&a.observe_document()?)?;
    let frame = packet(&a)?;
    let before = room.catchup("alice")?;
    room.publish_document_presence("alice", &lease, "1", &frame)?;
    assert_eq!(room.catchup("alice")?, before);
    let bytes = a.document_checkpoint()?;
    let mut copy = p.restore_document("room", &bytes)?;
    assert_eq!(copy.document_checkpoint()?, bytes);
    let mut through = "0".to_owned();
    for step in 0..5 {
        if step > 0 {
            if step % 2 == 1 {
                a.undo()?;
                copy.undo()?;
            } else {
                a.redo()?;
                copy.redo()?;
            }
        }
        assert_eq!(a.document_checkpoint()?, copy.document_checkpoint()?);
        let groups: Value =
            serde_json::from_str(&a.writer_groups_v2_guarded(&a.observe_document()?, &through)?)?;
        for group in groups["groups"].as_array().ok_or("groups")? {
            assert!(matches!(
                room.admit("alice", &lease, group.as_str().ok_or("group")?)?,
                Admission::Durable(_)
            ));
        }
        through = groups["through"].as_str().ok_or("through")?.into();
        let server = p.join_frame("room".into(), "909".into(), &room.catchup("alice")?)?;
        assert_eq!(server.document_json(), a.document_json());
        assert!(!server.document_selection_enabled());
        drop(room);
        room = Room::open(&files.log)?.0;
        assert!(room.document_presence_snapshot("alice", None)?.is_empty());
        lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    }
    Ok(())
}
#[test]
fn legacy_transport_rooms_reject_document_presence_without_migrating_their_log() -> Result {
    let files = Files::new()?;
    let config = configuration();
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config)?;
    let mut room = Room::create_standard_layout_v3(&files.log, &config, &seed(&p), "owner")?;
    let registration = room.register("owner")?;
    let mut a =
        p.join_frame("room".into(), registration.lease.writer.clone(), &room.catchup("owner")?)?;
    enable(&mut a)?;
    let before = fs::read(&files.log)?;
    assert!(
        room.publish_document_presence("owner", &registration.lease, "1", &packet(&a)?).is_err()
    );
    assert!(room.document_presence_snapshot("owner", None).is_err());
    assert_eq!(room.writer_transport_version(), 1);
    assert_eq!(fs::read(&files.log)?, before);
    Ok(())
}
