//! Explicit V2 relay seed/recovery, offline task edits and unchanged original-room admission.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{IndentTaskItems, InsertText, SetTaskChecked},
};
use breditor_collab_relay::{Admission, Role, Room};
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
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "breditor-relay-v2-{}-{nonce}-{}",
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
fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn prose(id: &str, text: &str) -> Value {
    element("paragraph", id, vec![json!({"kind":"text","text":text,"formats":[]})])
}
fn configuration(version: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/relay-structural","version":2},"extensions":[]}).to_string()
}
fn document(profile: &SharedRichProfile, structural: bool) -> Result<String> {
    let mut root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    if structural {
        let task = |id: &str, text: &str| {
            let mut node = element("task-item", id, vec![prose(&format!("{id}-head"), text)]);
            node["properties"]["breditor/checked"] = json!(false);
            node
        };
        root["children"].as_array_mut().ok_or("root flow")?.extend([
            element("blockquote", "quote", vec![prose("quote-head", "Quote 🙂")]),
            element("task-list", "tasks", vec![task("ta", "First"), task("tb", "Second")]),
            element(
                "code-block",
                "code",
                vec![json!({"kind":"text","text":"\tcode\n🙂","formats":[]})],
            ),
            element("horizontal-rule", "rule", vec![]),
        ]);
    }
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/relay-structural","version":2},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string())
}
fn groups(owner: &RichReplica) -> Result<Vec<String>> {
    let value: Value = serde_json::from_str(&owner.writer_groups_guarded(&owner.observe()?, "0")?)?;
    value["groups"]
        .as_array()
        .ok_or("groups")?
        .iter()
        .map(|item| Ok(item.as_str().ok_or("group")?.to_owned()))
        .collect()
}

#[test]
fn explicit_plain_and_standard_v2_rooms_recover_offline_structural_groups_and_durable_duplicates()
-> Result {
    for standard in [false, true] {
        let files = Files::new()?;
        let config = configuration(2);
        let profile = if standard {
            SharedRichProfile::from_standard_configuration_json_v2(&config)?
        } else {
            SharedRichProfile::from_configuration_json_v2(&config)?
        };
        let seed = document(&profile, true)?;
        assert!(Room::create(&files.log, &config, &seed, "owner").is_err());
        assert!(!files.log.exists());
        let mut room = if standard {
            Room::create_standard_structural_v2(&files.log, &config, &seed, "owner")?
        } else {
            Room::create_structural_v2(&files.log, &config, &seed, "owner")?
        };
        for name in ["alice", "bob"] {
            room.grant("owner", name, Some(Role::Editor))?;
        }
        let ra = room.register("alice")?;
        let rb = room.register("bob")?;
        let mut a =
            profile.join_frame("room".into(), ra.lease.writer.clone(), &room.catchup("alice")?)?;
        let mut b =
            profile.join_frame("room".into(), rb.lease.writer.clone(), &room.catchup("bob")?)?;
        a.apply(vec![Command::IndentTaskItems(IndentTaskItems {
            container: "tasks".into(),
            first: "tb".into(),
            last: "tb".into(),
            new_nested: Some("nested-tasks".into()),
        })])?;
        b.apply(vec![
            Command::SetTaskChecked(SetTaskChecked { block: "tb".into(), checked: true }),
            Command::InsertText(InsertText {
                block: "caption".into(),
                offset: 0,
                text: "Peer ".into(),
            }),
        ])?;
        let ag = groups(&a)?.remove(0);
        let bg = groups(&b)?.remove(0);
        let Admission::Durable(receipt) = room.admit("alice", &ra.lease, &ag)? else {
            return Err("durable A".into());
        };
        assert!(matches!(room.admit("bob", &rb.lease, &bg)?, Admission::Durable(_)));
        let frame = room.catchup("alice")?;
        a.receive_frame(&frame)?;
        b.receive_frame(&frame)?;
        assert_eq!(a.document_json(), b.document_json());
        let checkpoint = a.checkpoint()?;
        assert!(a.undo()?);
        assert!(a.document_json().contains("Peer "));
        assert!(a.document_json().contains("\"breditor/checked\":true"));
        let undone = a.document_json().to_owned();
        let mut restored = profile.restore("room", &checkpoint)?;
        assert!(restored.undo()?);
        assert_eq!(restored.document_json(), undone);
        assert!(restored.redo()?);
        assert_eq!(restored.document_json(), b.document_json());
        let binding = room.asset_binding().to_owned();
        let descriptor = room.descriptor("alice")?;
        drop(room);
        let (mut room, recovery) = Room::open(&files.log)?;
        assert_eq!(recovery.truncated_bytes, 0);
        assert_eq!(room.asset_binding(), binding);
        assert_eq!(room.descriptor("alice")?, descriptor);
        let lease = room.resume("alice", &ra.lease.writer, &ra.credential)?;
        let Admission::Durable(duplicate) = room.admit("alice", &lease, &ag)? else {
            return Err("durable duplicate".into());
        };
        assert!(duplicate.duplicate);
        assert_eq!(duplicate.sequence, receipt.sequence);
        assert_eq!(duplicate.receipt, receipt.receipt);
        let observer = profile.join_frame("room".into(), "999".into(), &room.catchup("alice")?)?;
        assert_eq!(observer.document_json(), b.document_json());
        let binding: Value = serde_json::from_str(&descriptor)?;
        assert_eq!(binding["richLanguageVersion"], 2);
        assert_eq!(binding["modelVersion"], 12);
        assert_eq!(binding["journalVersion"], 13);
    }
    Ok(())
}

#[test]
fn original_writer_groups_cannot_enter_a_v2_room_or_change_its_durable_log() -> Result {
    let files = Files::new()?;
    let profile = SharedRichProfile::from_configuration_json_v2(&configuration(2))?;
    let mut room = Room::create_structural_v2(
        &files.log,
        &configuration(2),
        &document(&profile, true)?,
        "owner",
    )?;
    let registered = room.register("owner")?;
    let old = SharedRichProfile::from_configuration_json(&configuration(1))?;
    let mut writer = old.create(&document(&old, false)?, registered.lease.writer.clone())?;
    writer.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Old ".into(),
    })])?;
    let before = fs::read(&files.log)?;
    let frame = room.catchup("owner")?;
    assert!(room.admit("owner", &registered.lease, &groups(&writer)?.remove(0)).is_err());
    assert_eq!(fs::read(&files.log)?, before);
    assert_eq!(room.catchup("owner")?, frame);
    Ok(())
}
