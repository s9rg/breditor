//! Explicit V2 room contract, durable receipts, exact recovery and general edits across cell boundaries.
#[path = "../../../crates/breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        RichReplica, SharedRichProfile,
        selection::{Selection, TextPoint},
    },
};
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
            "breditor-atomic-room-{}-{now}-{}",
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
fn configuration(version: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/atomic-relay","version":1},"extensions":[]}).to_string()
}
fn doc(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/atomic-relay","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn groups(a: &RichReplica, after: &str) -> Result<(String, Vec<String>)> {
    let v: Value = serde_json::from_str(&a.writer_groups_v2_guarded(&a.observe()?, after)?)?;
    assert_eq!(v["formatVersion"], 2);
    Ok((
        v["through"].as_str().ok_or("through")?.into(),
        v["groups"]
            .as_array()
            .ok_or("groups")?
            .iter()
            .map(|g| g.as_str().map(str::to_owned).ok_or("group".into()))
            .collect::<Result<Vec<_>>>()?,
    ))
}
#[test]
fn general_group_and_undo_redo_have_durable_v2_receipts_after_each_restart() -> Result {
    let files = Files::new()?;
    let config = configuration(3);
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config)?;
    let input = doc(&p, &fixture::root());
    let mut room = Room::create_atomic_transport_v2(
        &files.log,
        &config,
        &input,
        "owner",
        AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
    )?;
    assert_eq!(room.writer_transport_version(), 2);
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let mut a =
        p.join_frame("room".into(), registration.lease.writer.clone(), &room.catchup("alice")?)?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let target = Selection::TextRange {
        anchor: TextPoint { block: "p-0-0".into(), offset: 1, affinity: Affinity::After },
        focus: TextPoint { block: "p-1-1".into(), offset: 3, affinity: Affinity::After },
    };
    a.replace_general_range_plain_text_namespace_json_guarded(
        &a.observe()?,
        &json!({"selection":target,"text":"X🙂","prefix":"atomic"}).to_string(),
    )?;
    let original: Value = serde_json::from_str(&a.writer_groups_guarded(&a.observe()?, "0")?)?;
    assert!(
        room.admit("alice", &registration.lease, original["groups"][0].as_str().ok_or("original")?)
            .is_err()
    );
    let (mut through, packet) = groups(&a, "0")?;
    assert_eq!(packet.len(), 1);
    let first = packet[0].clone();
    let Admission::Durable(receipt) = room.admit("alice", &registration.lease, &first)? else {
        return Err("not durable".into());
    };
    assert!(!receipt.duplicate);
    let sequence = receipt.sequence;
    let server = p.join_frame("room".into(), "909".into(), &room.catchup("alice")?)?;
    assert_eq!(server.document_json(), a.document_json());
    drop(room);
    let (mut room, recovery) = Room::open(&files.log)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.writer_transport_version(), 2);
    assert!(room.admit("alice", &registration.lease, &first).is_err());
    let mut lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    let Admission::Durable(retry) = room.admit("alice", &lease, &first)? else {
        return Err("retry not durable".into());
    };
    assert!(retry.duplicate);
    assert_eq!(retry.sequence, sequence);
    for redo in [false, true, false, true] {
        if redo {
            a.redo()?;
        } else {
            a.undo()?;
        }
        let (next, packet) = groups(&a, &through)?;
        for group in packet {
            assert!(matches!(room.admit("alice", &lease, &group)?, Admission::Durable(_)));
        }
        through = next;
        assert_eq!(
            room.writer_clock("alice", a.writer())?,
            serde_json::to_value(a.writer_clock_v2(a.writer())?)?
        );
        let server = p.join_frame("room".into(), "909".into(), &room.catchup("alice")?)?;
        assert_eq!(server.document_json(), a.document_json());
        drop(room);
        room = Room::open(&files.log)?.0;
        lease = room.resume("alice", &registration.lease.writer, &registration.credential)?;
    }
    Ok(())
}
#[test]
fn explicit_profile_and_transport_choice_survives_reopen_without_migrating_old_seeds() -> Result {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        let files = Files::new()?;
        let config = configuration(version);
        let p = match (version, standard) {
            (1, _) => SharedRichProfile::from_configuration_json(&config)?,
            (2, false) => SharedRichProfile::from_configuration_json_v2(&config)?,
            (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
            (3, false) => SharedRichProfile::from_configuration_json_v3(&config)?,
            _ => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
        };
        let source: Value = serde_json::from_str(include_str!(
            "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
        ))?;
        let input = doc(&p, &source);
        let profile = match version {
            1 => AtomicTransportProfile::Original,
            2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
            _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
        };
        let room = Room::create_atomic_transport_v2(&files.log, &config, &input, "owner", profile)?;
        assert_eq!(room.writer_transport_version(), 2);
        let before = p
            .join_frame("room".into(), "909".into(), &room.catchup("owner")?)?
            .document_json()
            .to_owned();
        drop(room);
        let (room, _) = Room::open(&files.log)?;
        assert_eq!(room.writer_transport_version(), 2);
        assert_eq!(
            p.join_frame("room".into(), "909".into(), &room.catchup("owner")?)?.document_json(),
            before
        );
    }
    let files = Files::new()?;
    let config = configuration(1);
    let p = SharedRichProfile::from_configuration_json(&config)?;
    let input = doc(
        &p,
        &serde_json::from_str(include_str!(
            "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
        ))?,
    );
    let old = Room::create(&files.log, &config, &input, "owner")?;
    assert_eq!(old.writer_transport_version(), 1);
    drop(old);
    let (old, _) = Room::open(&files.log)?;
    assert_eq!(old.writer_transport_version(), 1);
    Ok(())
}
