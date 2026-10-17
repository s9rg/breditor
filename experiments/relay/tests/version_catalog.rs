//! Shared immutable versions prove real accepted revisions and retain exact durable identity.
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{Command, RichReplica, SharedRichProfile, actions::InsertText},
};
use breditor_collab_relay::{
    Admission, AtomicTransportProfile, DocumentVersionAdmission, DurableDocumentVersion, Error,
    Registration, Role, Room,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Files {
    dir: PathBuf,
    path: PathBuf,
}
impl Files {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "breditor-version-catalog-{}-{now}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir)?;
        Ok(Self { path: dir.join("room.log"), dir })
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_dir(&self.dir);
    }
}
fn start(files: &Files, atomic: bool) -> Result<(SharedRichProfile, Room)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/version-catalog","version":1},"extensions":[]}).to_string();
    let p = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/version-catalog","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":tree}).to_string();
    let room = if atomic {
        Room::create_atomic_transport_v2(
            &files.path,
            &configuration,
            &document,
            "owner",
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        )?
    } else {
        Room::create_standard_layout_v3(&files.path, &configuration, &document, "owner")?
    };
    Ok((p, room))
}
fn author(p: &SharedRichProfile, room: &mut Room) -> Result<(Registration, RichReplica)> {
    room.grant("owner", "alice", Some(Role::Editor))?;
    let registration = room.register("alice")?;
    let a =
        p.join_frame("room".into(), registration.lease.writer.clone(), &room.catchup("alice")?)?;
    Ok((registration, a))
}
fn saved(a: &RichReplica, name: &str, principal: &str) -> Result<String> {
    Ok(a.capture_document_version_guarded(
        &a.observe()?,
        name,
        ReviewPrincipalId::try_new(principal)?,
        "1792200000000",
    )?)
}
fn ack(outcome: DocumentVersionAdmission) -> Result<DurableDocumentVersion> {
    let DocumentVersionAdmission::Durable(ack) = outcome else {
        return Err("expected durable version".into());
    };
    Ok(ack)
}
fn insert(value: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: value.into() })
}
fn flush(
    room: &mut Room,
    registration: &Registration,
    a: &RichReplica,
    after: &str,
) -> Result<String> {
    let batch: Value = serde_json::from_str(&if room.writer_transport_version() == 2 {
        a.writer_groups_v2_guarded(&a.observe()?, after)?
    } else {
        a.writer_groups_guarded(&a.observe()?, after)?
    })?;
    for group in batch["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit("alice", &registration.lease, group.as_str().ok_or("group")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(batch["through"].as_str().ok_or("through")?.into())
}

#[test]
fn opt_in_catalog_preserves_old_room_defaults_and_requires_current_editor_authorship() -> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files, false)?;
    let (_, a) = author(&p, &mut room)?;
    let packet = saved(&a, "Initial 日本 🙂", "alice")?;
    let before = fs::read(&files.path)?;
    assert!(room.document_versions_descriptor("alice").is_err());
    assert!(room.publish_document_version("alice", &packet).is_err());
    assert_eq!(fs::read(&files.path)?, before);
    assert!(matches!(room.enable_document_versions("alice"), Err(Error::Permission)));
    let descriptor = room.enable_document_versions("owner")?;
    assert_eq!(descriptor, room.enable_document_versions("owner")?);
    room.grant("owner", "reader", Some(Role::Reader))?;
    let before = fs::read(&files.path)?;
    assert!(matches!(
        room.publish_document_version("reader", &saved(&a, "Denied", "reader")?),
        Err(Error::Permission)
    ));
    assert!(matches!(
        room.publish_document_version("alice", &saved(&a, "Forged attribution", "owner")?),
        Err(Error::Permission)
    ));
    assert!(room.document_versions_descriptor("stranger").is_err());
    assert_eq!(fs::read(&files.path)?, before);
    let frame = room.catchup("alice")?;
    let exact = a.checkpoint()?;
    let receipt = ack(room.publish_document_version("alice", &packet)?)?;
    assert_eq!(receipt.descriptor, descriptor);
    assert!(!receipt.duplicate);
    assert_eq!(receipt.entry.version.author.as_str(), "alice");
    assert_eq!(room.catchup("alice")?, frame);
    assert_eq!(a.checkpoint()?, exact);
    assert_eq!(
        room.document_version_packet("reader", &receipt.entry.version.id)?.as_deref(),
        Some(packet.as_str())
    );
    room.grant("owner", "alice", Some(Role::Reader))?;
    assert!(matches!(room.publish_document_version("alice", &packet), Err(Error::Permission)));
    assert_eq!(room.document_versions_page("alice", None)?.entries.len(), 1);
    room.grant("owner", "reader", None)?;
    assert!(room.document_version_packet("reader", &receipt.entry.version.id).is_err());
    drop(room);
    let (room, recovery) = Room::open(&files.path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.document_versions_page("alice", None)?.entries[0], receipt.entry);
    Ok(())
}

#[test]
fn offline_publication_waits_for_document_groups_and_exact_retries_recover_under_both_transports()
-> Result {
    for atomic in [false, true] {
        for document in [false, true] {
            for natural in [false, true] {
                let files = Files::new()?;
                let (p, mut room) = start(&files, atomic)?;
                room.enable_document_versions("owner")?;
                let (registration, mut a) = author(&p, &mut room)?;
                if document {
                    a.enable_document_selection_guarded(&a.observe()?)?;
                }
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let baseline = saved(&a, "Before offline work", "alice")?;
                let initial = ack(room.publish_document_version("alice", &baseline)?)?;
                a.apply(vec![insert("Offline edit ")])?;
                let offline = saved(&a, "Offline named draft", "alice")?;
                let before = fs::read(&files.path)?;
                assert!(
                    matches!(room.publish_document_version("alice",&offline)?,DocumentVersionAdmission::Pending {missing} if missing.len()==1&&missing[0].writer==a.writer())
                );
                assert_eq!(fs::read(&files.path)?, before);
                let through = flush(&mut room, &registration, &a, "0")?;
                let accepted = ack(room.publish_document_version("alice", &offline)?)?;
                assert!(!accepted.duplicate);
                assert_ne!(accepted.entry.sequence, initial.entry.sequence);
                let before = fs::read(&files.path)?;
                let reordered =
                    serde_json::to_string_pretty(&serde_json::from_str::<Value>(&offline)?)?;
                let duplicate = ack(room.publish_document_version("alice", &reordered)?)?;
                assert!(duplicate.duplicate);
                assert_eq!(duplicate.entry, accepted.entry);
                assert_eq!(fs::read(&files.path)?, before);
                let saved_doc = if document {
                    if natural { a.document_typing_checkpoint()? } else { a.document_checkpoint()? }
                } else if natural {
                    a.typing_checkpoint()?
                } else {
                    a.checkpoint()?
                };
                drop(room);
                let (mut room, recovery) = Room::open(&files.path)?;
                assert_eq!(recovery.truncated_bytes, 0);
                let retry = ack(room.publish_document_version("alice", &offline)?)?;
                assert!(retry.duplicate);
                assert_eq!(retry.entry, accepted.entry);
                assert_eq!(retry.descriptor, accepted.descriptor);
                assert_eq!(
                    room.document_version_packet("alice", &accepted.entry.version.id)?.as_deref(),
                    Some(offline.as_str())
                );
                let mut recovered = if document {
                    if natural {
                        p.restore_document_typing("room", &saved_doc)?
                    } else {
                        p.restore_document("room", &saved_doc)?
                    }
                } else if natural {
                    p.restore_typing("room", &saved_doc)?
                } else {
                    p.restore("room", &saved_doc)?
                };
                a.undo()?;
                recovered.undo()?;
                assert_eq!(a.document_json(), recovered.document_json());
                assert_eq!(room.writer_clock("alice", a.writer())?["through"], through);
                let plan = recovered.prepare_document_version_restore_guarded(
                    &recovered.observe()?,
                    &offline,
                    "remote-version-restore",
                )?;
                let preview = plan.document_json().to_owned();
                recovered.apply_document_version_restore(&plan)?;
                assert_eq!(recovered.document_json(), preview);
                assert!(preview.contains("Offline edit "));
            }
        }
    }
    Ok(())
}

#[test]
fn metadata_pages_freeze_their_terminal_cut_and_refuse_foreign_future_or_noncanonical_cursors()
-> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files, true)?;
    let (_, a) = author(&p, &mut room)?;
    let descriptor = room.enable_document_versions("owner")?;
    let empty = room.document_versions_page("alice", None)?;
    assert!(empty.entries.is_empty());
    assert_eq!(empty.cursor.after, empty.cursor.through);
    assert!(!empty.more);
    for i in 0..66 {
        ack(room.publish_document_version("alice", &saved(&a, &format!("Draft {i}"), "alice")?)?)?;
    }
    let first = room.document_versions_page("alice", None)?;
    assert_eq!(first.entries.len(), 64);
    assert!(first.more);
    let first_cut = first.cursor.through.clone();
    let late = ack(
        room.publish_document_version("alice", &saved(&a, "Concurrent later version", "alice")?)?
    )?;
    let last = room.document_versions_page("alice", Some(&first.cursor))?;
    assert_eq!(last.entries.len(), 2);
    assert_eq!(last.cursor.through, first_cut);
    assert!(!last.more);
    assert!(!last.entries.iter().any(|e| e.version.id == late.entry.version.id));
    let next = room.document_versions_page("alice", None)?;
    let final_page = room.document_versions_page("alice", Some(&next.cursor))?;
    assert_eq!(final_page.entries.len(), 3);
    assert_eq!(final_page.entries.last(), Some(&late.entry));
    for variant in 0..4 {
        let mut cursor = first.cursor.clone();
        match variant {
            0 => cursor.binding = "0".repeat(64),
            1 => cursor.after = "01".into(),
            2 => cursor.through = u64::MAX.to_string(),
            _ => {
                cursor.after = late.entry.sequence.clone();
                cursor.through = first_cut.clone();
            }
        }
        assert!(room.document_versions_page("alice", Some(&cursor)).is_err());
    }
    let original = fs::read(&files.path)?;
    drop(room);
    let (room, _) = Room::open(&files.path)?;
    assert_eq!(room.document_versions_descriptor("alice")?, descriptor);
    assert_eq!(room.document_versions_page("alice", Some(&first.cursor))?, last);
    assert_eq!(fs::read(&files.path)?, original);
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionData {
    format: String,
    format_version: u32,
    name: String,
    author: String,
    created_at_ms: String,
    source_anchor_json: String,
    document_json: String,
}
fn rehash_version(packet: &Value) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let data: VersionData = serde_json::from_value(packet["data"].clone())?;
    let bytes = serde_json::to_vec(&data)?;
    let mut id = String::from("sha256:");
    for byte in
        Sha256::new().chain_update(b"breditor/document-version/1\0").chain_update(bytes).finalize()
    {
        write!(id, "{byte:02x}")?;
    }
    Ok(json!({"id":id,"data":data}).to_string())
}

#[test]
fn rehashed_content_mismatches_and_valid_native_mid_group_snapshots_never_enter_the_catalog()
-> Result {
    let files = Files::new()?;
    let (p, mut room) = start(&files, true)?;
    room.enable_document_versions("owner")?;
    let (registration, mut a) = author(&p, &mut room)?;
    let baseline = saved(&a, "Original source", "alice")?;
    let mut witness = p.join_frame("room".into(), "888".into(), &room.catchup("alice")?)?;
    witness.apply(vec![insert("One ")])?;
    let intermediate = witness.document_json().to_owned();
    a.apply(vec![insert("One "), insert("Two ")])?;
    let through = flush(&mut room, &registration, &a, "0")?;
    let final_packet = saved(&a, "Final source", "alice")?;
    let mut forged: Value = serde_json::from_str(&final_packet)?;
    let base: Value = serde_json::from_str(&baseline)?;
    forged["data"]["sourceAnchorJson"] = base["data"]["sourceAnchorJson"].clone();
    let before = fs::read(&files.path)?;
    let mismatch = rehash_version(&forged)?;
    assert!(a.read_document_version(&mismatch).is_ok());
    assert!(room.publish_document_version("alice", &mismatch).is_err());
    let final_value: Value = serde_json::from_str(&final_packet)?;
    let original_anchor: Value =
        serde_json::from_str(final_value["data"]["sourceAnchorJson"].as_str().ok_or("source")?)?;
    let mut refused = 0;
    for counter in 1..through.parse::<u32>()? {
        for snapshot in [
            a.document_json(),
            witness.document_json(),
            base["data"]["documentJson"].as_str().ok_or("snapshot")?,
        ] {
            let mut anchor = original_anchor.clone();
            let clocks = anchor["clocks"].as_array_mut().ok_or("clocks")?;
            let clock = clocks
                .iter_mut()
                .find(|clock| clock["writer"] == a.writer())
                .ok_or("author clock")?;
            clock["counter"] = counter.to_string().into();
            let mut candidate = final_value.clone();
            candidate["data"]["sourceAnchorJson"] = anchor.to_string().into();
            candidate["data"]["documentJson"] = snapshot.into();
            let packet = rehash_version(&candidate)?;
            if matches!(
                a.verify_document_version_source(&packet),
                Ok(
                    breditor_collab_feasibility::rich_replica::DocumentVersionSource::Verified { .. }
                )
            ) {
                assert!(matches!(
                    room.publish_document_version("alice", &packet),
                    Err(Error::Contract("version source cuts an unaccepted semantic group"))
                ));
                refused += 1;
            }
        }
    }
    assert!(
        refused > 0,
        "Expected a valid historical AST inside the multi-command group ({through} operations, intermediate {intermediate})"
    );
    assert_eq!(fs::read(&files.path)?, before);
    assert!(room.document_versions_page("alice", None)?.entries.is_empty());
    Ok(())
}
