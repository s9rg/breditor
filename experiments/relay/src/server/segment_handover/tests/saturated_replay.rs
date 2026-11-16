//! Cold recovery of a complete 64-WAL portable successor under a process-local file limit.
use super::{POLICY, Source, TestResult};
use crate::{
    Admission, Role,
    server::{RelaySegmentPortableBackupIdentity, RelaySegmentRetainedBackup},
};
use breditor_collab_feasibility::rich_replica::{Command, SharedRichProfile, actions::InsertText};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{fs, path::PathBuf, process::Command as Process};

#[derive(Deserialize, Serialize)]
struct OfflineWork {
    writer: String,
    credential: String,
    before: String,
    steps: Vec<(Vec<String>, String)>,
}

#[tokio::test]
async fn a_saturated_relocated_relay_cold_reopens_and_accepts_offline_undo() -> TestResult {
    let source = Source::open()?;
    let (registered, frame) = source
        .handle
        .host
        .transaction(|room| Ok((room.register("owner")?, room.catchup("owner")?)))
        .await?;
    let packed = source.parent.join("packed-before-full");
    let selected = source.handle.capture_fully_packed_portable_relay_segment(
        "owner",
        &source.token,
        &packed,
    )?;
    let bundle = RelaySegmentRetainedBackup::open_portable(&packed, &selected)?;
    let path = source.parent.join("relocated-full");
    let mut target = bundle.restore(&path, "reloc-wal-1", POLICY)?;
    let room = target.components_mut().0;
    for next in 2..=64 {
        room.grant("owner", "saved-reader", Some(Role::Reader))?;
        room.rotate_log_generation("owner", &format!("reloc-wal-{next}"))?;
    }
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    assert!(room.pack_sealed_wal("owner", "reloc-wal-1")?.packed);
    assert!(room.pack_sealed_wal("owner", "reloc-wal-2")?.packed);
    room.archive_sealed_wal("owner", &checkpoint, "reloc-wal-1")?;
    room.archive_sealed_wal("owner", &checkpoint, "reloc-wal-3")?;
    assert_eq!(room.log_generation_descriptor("owner")?.sealed, 63);
    let before = room.catchup("saved-reader")?;
    drop((target, bundle));

    let writer = registered.lease.writer;
    let mut client = source.profile.join_frame("room".into(), writer.clone(), &frame)?;
    let mut through = "0".to_owned();
    let mut steps = Vec::new();
    for step in ["edit", "undo", "redo"] {
        match step {
            "edit" => assert!(client.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 0,
                text: "offline before full relay recovery ".into(),
            })])?),
            "undo" => assert!(client.undo()?),
            "redo" => assert!(client.redo()?),
            _ => unreachable!(),
        }
        let frames: serde_json::Value =
            serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, &through)?)?;
        let groups = serde_json::from_value(frames["groups"].clone())?;
        through = frames["through"].as_str().ok_or("client operation cut")?.into();
        steps.push((groups, client.document_json().into()));
    }
    fs::write(source.parent.join("full-relay-selection.json"), serde_json::to_vec(&selected)?)?;
    fs::write(
        source.parent.join("offline-work.json"),
        serde_json::to_vec(&OfflineWork {
            writer,
            credential: registered.credential,
            before,
            steps,
        })?,
    )?;
    let worker = Process::new("/bin/sh")
        .args(["-c", "ulimit -n 160 && exec \"$@\"", "sh"])
        .arg(std::env::current_exe()?)
        .args([
            "--exact",
            "server::segment_handover::tests::saturated_replay::cold_full_relay_worker",
            "--nocapture",
        ])
        .env("BREDITOR_FULL_RELAY_FIXTURE", &source.parent)
        .output()?;
    assert!(
        worker.status.success(),
        "{} {}",
        String::from_utf8_lossy(&worker.stdout),
        String::from_utf8_lossy(&worker.stderr)
    );
    Ok(())
}

#[test]
fn cold_full_relay_worker() -> TestResult {
    let Some(root) = std::env::var_os("BREDITOR_FULL_RELAY_FIXTURE") else {
        return Ok(());
    };
    let root = PathBuf::from(root);
    let selected: RelaySegmentPortableBackupIdentity =
        serde_json::from_slice(&fs::read(root.join("full-relay-selection.json"))?)?;
    let work: OfflineWork = serde_json::from_slice(&fs::read(root.join("offline-work.json"))?)?;
    let bundle =
        RelaySegmentRetainedBackup::open_portable(&root.join("packed-before-full"), &selected)?;
    let path = root.join("relocated-full");
    let mut target = bundle.backup().reopen(&path, POLICY)?;
    let room = target.components_mut().0;
    assert_eq!(room.catchup("saved-reader")?, work.before);
    let lease = room.resume("owner", &work.writer, &work.credential)?;
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        &json!({
            "format":"breditor/shared-rich-profile", "formatVersion":3,
            "schema":{"name":"example/rotation-prefix", "version":1}, "extensions":[],
        })
        .to_string(),
    )?;
    for (groups, expected) in &work.steps {
        assert!(!groups.is_empty());
        for group in groups {
            let Admission::Durable(accepted) = room.admit("owner", &lease, group)? else {
                return Err("expected durable offline receipt".into());
            };
            assert!(!accepted.duplicate);
        }
        let observer = profile.join_frame("room".into(), "901".into(), &room.catchup("owner")?)?;
        assert_eq!(observer.document_json(), expected);
    }
    let after = room.catchup("owner")?;
    drop(target);
    let target = bundle.backup().reopen(&path, POLICY)?;
    assert_eq!(target.components().0.catchup("owner")?, after);
    assert_eq!(target.components().0.log_generation_descriptor("owner")?.sealed, 63);
    Ok(())
}
