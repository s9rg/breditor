//! Explicit rich-language V4 relay rooms: every frozen slice replicates, replays durably and
//! restores exactly; V1–V3 rooms and writers never mix with V4.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{InsertRow, InsertText},
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
            "breditor-relay-language-v4-{}-{nonce}-{}",
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
    json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/relay-v4","version":4},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, children: Value) -> Value {
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":children})
}
fn text(value: &str, formats: Value) -> Value {
    json!({"kind":"text","text":value,"formats":formats})
}
/// Mention, bookmark, internal link, text language, list numbering, image link, section,
/// page break and table caption in one room.
fn v4_root(standard: bool) -> Value {
    let mention = json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":"Ann"}});
    // Internal links need the standard inline link declaration.
    let link = json!([{"type":"breditor-inline/link","properties":{"breditor-inline/href":"#top","breditor-inline/new-window":false}}]);
    let lang = json!({"type":"breditor/text-language","properties":{"breditor/language-tag":"fr"}});
    let mut heading = el("heading", "top", json!([text("Top", json!([]))]));
    heading["properties"]["breditor/level"] = json!(1);
    heading["properties"]["breditor/bookmark"] = json!("top");
    let mut list = el(
        "ordered-list",
        "list",
        json!([el(
            "list-item",
            "item",
            json!([el("paragraph", "item-text", json!([text("x", json!([]))]))])
        )]),
    );
    list["properties"]["breditor/start"] = json!(2);
    list["properties"]["breditor/list-style"] = json!(2);
    let mut image =
        el("image", "fig", json!([el("paragraph", "fig-cap", json!([text("Fig", json!([]))]))]));
    image["properties"] = json!({"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Fig","breditor/image-href":"https://example.com/"});
    let mut details = el(
        "details",
        "sec",
        json!([
            el("details-summary", "sum", json!([text("More", json!([]))])),
            el("paragraph", "body", json!([text("Body", json!([]))]))
        ]),
    );
    details["properties"]["breditor/details-open"] = json!(true);
    let mut cell = el(
        "table-cell",
        "cell",
        json!([el("paragraph", "cell-text", json!([text("1", json!([]))]))]),
    );
    cell["properties"]["breditor/column-id"] = json!("c");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = el("table-row", "row", json!([cell]));
    row["properties"]["breditor/row-id"] = json!("r");
    let mut table = el(
        "table",
        "table",
        json!([row, el("paragraph", "tcap", json!([text("Totals", json!([]))]))]),
    );
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"c","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut root = el(
        "document",
        "unused",
        json!([
            heading,
            el(
                "paragraph",
                "people",
                if standard {
                    json!([
                        text("Hi ", json!([])),
                        text("@Ann", json!([mention])),
                        text(" see ", json!([])),
                        text("top", link),
                        text(" salut", json!([lang]))
                    ])
                } else {
                    json!([
                        text("Hi ", json!([])),
                        text("@Ann", json!([mention])),
                        text(" see top", json!([])),
                        text(" salut", json!([lang]))
                    ])
                }
            ),
            list,
            image,
            details,
            el("page-break", "pb", json!([])),
            table,
        ]),
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn document(profile: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/relay-v4","version":4},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn group(replica: &RichReplica) -> Result<String> {
    let value: Value =
        serde_json::from_str(&replica.writer_groups_guarded(&replica.observe()?, "0")?)?;
    Ok(value["groups"][0].as_str().ok_or("writer group")?.into())
}
fn insert(block: &str, offset: u32, value: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: value.into() })
}

#[test]
fn plain_and_standard_v4_rooms_replicate_every_slice_and_replay_durably() -> Result {
    for standard in [false, true] {
        let files = Files::new()?;
        let config = configuration(4);
        let profile = if standard {
            SharedRichProfile::from_standard_configuration_json_v4(&config)?
        } else {
            SharedRichProfile::from_configuration_json_v4(&config)?
        };
        let seed = document(&profile, &v4_root(standard));
        assert!(Room::create(&files.log, &config, &seed, "owner").is_err());
        assert!(Room::create_structural_v2(&files.log, &config, &seed, "owner").is_err());
        assert!(Room::create_layout_v3(&files.log, &config, &seed, "owner").is_err());
        assert!(Room::create_standard_layout_v3(&files.log, &config, &seed, "owner").is_err());
        assert!(!files.log.exists());
        let mut room = if standard {
            Room::create_standard_language_v4(&files.log, &config, &seed, "owner")?
        } else {
            Room::create_language_v4(&files.log, &config, &seed, "owner")?
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
        assert_eq!(serde_json::from_str::<Value>(a.document_json())?["root"], v4_root(standard));
        a.apply(vec![insert("sum", 4, " info"), insert("tcap", 6, "!")])?;
        b.apply(vec![
            insert("people", 7, ","),
            Command::InsertRow(InsertRow {
                block: "table".into(),
                row_block: "row-2".into(),
                row: "r2".into(),
                before: None,
            }),
        ])?;
        let ag = group(&a)?;
        let bg = group(&b)?;
        let Admission::Durable(receipt) = room.admit("alice", &ra.lease, &ag)? else {
            return Err("durable V4 A".into());
        };
        assert!(matches!(room.admit("bob", &rb.lease, &bg)?, Admission::Durable(_)));
        let frame = room.catchup("alice")?;
        a.receive_frame(&frame)?;
        b.receive_frame(&frame)?;
        assert_eq!(a.document_json(), b.document_json());
        for fragment in [
            "More info",
            "Totals!",
            "\"text\":\"@Ann\"",
            "\"breditor/bookmark\":\"top\"",
            "\"breditor/list-style\":2",
            "\"breditor/image-href\":\"https://example.com/\"",
            "\"breditor/details-open\":true",
            "breditor/page-break",
            "\"breditor/language-tag\":\"fr\"",
        ] {
            assert!(a.document_json().contains(fragment), "{fragment}");
        }
        let ast: Value = serde_json::from_str(a.document_json())?;
        let table = &ast["root"]["children"][6];
        let kinds: Vec<_> =
            table["children"].as_array().ok_or("rows")?.iter().map(|n| n["type"].clone()).collect();
        assert_eq!(kinds, ["breditor/table-row", "breditor/table-row", "breditor/paragraph"]);
        let mut restored = profile.restore("room", &a.checkpoint()?)?;
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        assert!(a.redo()?);
        assert!(restored.redo()?);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
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
        let observer = profile.join_frame("room".into(), "999".into(), &room.catchup("alice")?)?;
        assert_eq!(observer.document_json(), b.document_json());
        let descriptor: Value = serde_json::from_str(&descriptor)?;
        assert_eq!(descriptor["richLanguageVersion"], 4);
        assert_eq!(descriptor["modelVersion"], 14);
        assert_eq!(descriptor["journalVersion"], 15);
        assert_eq!(descriptor["blockLayoutVersion"], 1);
        assert_eq!(descriptor["mentionVersion"], 1);
    }
    Ok(())
}

#[test]
fn older_configurations_and_writers_never_enter_a_v4_room_and_v4_never_enters_v3() -> Result {
    for revision in [1, 2, 3] {
        let files = Files::new()?;
        let config = configuration(revision);
        assert!(
            Room::create_language_v4(&files.log, &config, "invalid document", "owner").is_err()
        );
        assert!(
            Room::create_standard_language_v4(&files.log, &config, "invalid document", "owner")
                .is_err()
        );
        assert!(!files.log.exists());
    }
    let files = Files::new()?;
    let config = configuration(4);
    let profile = SharedRichProfile::from_configuration_json_v4(&config)?;
    let mut plain = v4_root(false);
    plain["children"] = json!([el("paragraph", "p", json!([text("x", json!([]))]))]);
    let mut room =
        Room::create_language_v4(&files.log, &config, &document(&profile, &plain), "owner")?;
    let registration = room.register("owner")?;
    let old = SharedRichProfile::from_configuration_json_v3(&configuration(3))?;
    let mut writer = old.create(&document(&old, &plain), registration.lease.writer.clone())?;
    writer.apply(vec![insert("p", 0, "Old ")])?;
    let before = fs::read(&files.log)?;
    assert!(room.admit("owner", &registration.lease, &group(&writer)?).is_err());
    assert_eq!(fs::read(&files.log)?, before);
    // A V3 room refuses a V4 writer group just the same.
    let v3_files = Files::new()?;
    let v3_config = configuration(3);
    let mut v3_room =
        Room::create_layout_v3(&v3_files.log, &v3_config, &document(&old, &plain), "owner")?;
    let v3_registration = v3_room.register("owner")?;
    let mut v4_writer =
        profile.create(&document(&profile, &plain), v3_registration.lease.writer.clone())?;
    v4_writer.apply(vec![insert("p", 0, "New ")])?;
    let before = fs::read(&v3_files.log)?;
    assert!(v3_room.admit("owner", &v3_registration.lease, &group(&v4_writer)?).is_err());
    assert_eq!(fs::read(&v3_files.log)?, before);
    Ok(())
}
