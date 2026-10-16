//! V3 relay construction and exact durable replay retain independent layout ownership.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile,
    actions::{InsertText, SetBlockLayout},
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
            "breditor-relay-layout-{}-{nonce}-{}",
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
    json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/relay-layout","version":3},"extensions":[]}).to_string()
}
fn document(profile: &SharedRichProfile) -> Result<String> {
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/relay-layout","version":3},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string())
}
fn layout(patch: &str) -> Command {
    Command::SetBlockLayout(SetBlockLayout { block: "caption".into(), patch_json: patch.into() })
}
fn group(replica: &RichReplica) -> Result<String> {
    let value: Value =
        serde_json::from_str(&replica.writer_groups_guarded(&replica.observe()?, "0")?)?;
    Ok(value["groups"][0].as_str().ok_or("writer group")?.into())
}
#[test]
fn plain_and_standard_v3_relay_replay_preserves_offline_fields_peer_text_and_duplicate_receipts()
-> Result {
    for standard in [false, true] {
        let files = Files::new()?;
        let config = configuration(3);
        let profile = if standard {
            SharedRichProfile::from_standard_configuration_json_v3(&config)?
        } else {
            SharedRichProfile::from_configuration_json_v3(&config)?
        };
        let seed = document(&profile)?;
        assert!(Room::create(&files.log, &config, &seed, "owner").is_err());
        assert!(Room::create_structural_v2(&files.log, &config, &seed, "owner").is_err());
        assert!(!files.log.exists());
        let mut room = if standard {
            Room::create_standard_layout_v3(&files.log, &config, &seed, "owner")?
        } else {
            Room::create_layout_v3(&files.log, &config, &seed, "owner")?
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
        a.apply(vec![layout(r#"{"alignment":"start","indent":2}"#)])?;
        b.apply(vec![
            layout(r#"{"direction":"rtl","lineHeightPercent":150}"#),
            Command::InsertText(InsertText {
                block: "caption".into(),
                offset: 0,
                text: "Peer ".into(),
            }),
        ])?;
        let ag = group(&a)?;
        let bg = group(&b)?;
        let Admission::Durable(receipt) = room.admit("alice", &ra.lease, &ag)? else {
            return Err("durable layout A".into());
        };
        assert!(matches!(room.admit("bob", &rb.lease, &bg)?, Admission::Durable(_)));
        let frame = room.catchup("alice")?;
        a.receive_frame(&frame)?;
        b.receive_frame(&frame)?;
        assert_eq!(a.document_json(), b.document_json());
        for field in [
            "\"breditor/block-align\":1",
            "\"breditor/block-direction\":2",
            "\"breditor/block-indent\":2",
            "\"breditor/line-height-percent\":150",
        ] {
            assert!(a.document_json().contains(field));
        }
        let saved = a.checkpoint()?;
        let mut restored = profile.restore("room", &saved)?;
        assert!(a.undo()?);
        assert!(restored.undo()?);
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        assert!(!a.document_json().contains("breditor/block-align"));
        assert!(!a.document_json().contains("breditor/block-indent"));
        assert!(a.document_json().contains("Peer "));
        assert!(a.document_json().contains("\"breditor/block-direction\":2"));
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
        assert_eq!(duplicate.receipt, receipt.receipt);
        let observer = profile.join_frame("room".into(), "999".into(), &room.catchup("alice")?)?;
        assert_eq!(observer.document_json(), b.document_json());
        let descriptor: Value = serde_json::from_str(&descriptor)?;
        assert_eq!(descriptor["richLanguageVersion"], 3);
        assert_eq!(descriptor["modelVersion"], 13);
        assert_eq!(descriptor["journalVersion"], 14);
        assert_eq!(descriptor["blockLayoutVersion"], 1);
    }
    Ok(())
}
#[test]
fn wrong_version_creation_and_old_writer_admission_leave_logs_untouched() -> Result {
    for revision in [1, 2] {
        let files = Files::new()?;
        let config = configuration(revision);
        assert!(Room::create_layout_v3(&files.log, &config, "invalid document", "owner").is_err());
        assert!(!files.log.exists());
        assert!(
            Room::create_standard_layout_v3(&files.log, &config, "invalid document", "owner")
                .is_err()
        );
        assert!(!files.log.exists());
    }
    let files = Files::new()?;
    let config = configuration(3);
    let profile = SharedRichProfile::from_configuration_json_v3(&config)?;
    let mut room = Room::create_layout_v3(&files.log, &config, &document(&profile)?, "owner")?;
    let registration = room.register("owner")?;
    for revision in [1, 2] {
        let old = if revision == 1 {
            SharedRichProfile::from_configuration_json(&configuration(1))?
        } else {
            SharedRichProfile::from_configuration_json_v2(&configuration(2))?
        };
        let mut writer = old.create(&document(&old)?, registration.lease.writer.clone())?;
        writer.apply(vec![Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Old ".into(),
        })])?;
        let before = fs::read(&files.log)?;
        assert!(room.admit("owner", &registration.lease, &group(&writer)?).is_err());
        assert_eq!(fs::read(&files.log)?, before);
    }
    Ok(())
}
