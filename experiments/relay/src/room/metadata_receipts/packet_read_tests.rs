//! Genuine accepted packets and inert native Prepares; no fabricated receipts.
use super::{MetadataPacketQuery, MetadataPageSelection, test_fixture};
use crate::{DocumentVersionAdmission, Room};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn room() -> Result<(std::path::PathBuf, Room), Box<dyn std::error::Error>> {
    let directory = std::env::temp_dir()
        .join(format!("breditor-metadata-packet-{}", crate::credentials::issue()?));
    std::fs::create_dir(&directory)?;
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/metadata-packet","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    let document_root: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/metadata-packet","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":document_root}).to_string();
    let room = Room::create_atomic_transport_v2(
        &directory.join("room.log"),
        &configuration,
        &document,
        "owner",
        crate::AtomicTransportProfile::Original,
    )?;
    Ok((directory, room))
}
fn pages(room: &Room) -> Result<Value, Box<dyn std::error::Error>> {
    let selection: MetadataPageSelection = serde_json::from_value(
        json!({"versions":{"kind":"start"},"suggestions":{"kind":"start"},"revisions":{"kind":"start"}}),
    )?;
    Ok(serde_json::to_value(room.recovery_metadata_page("owner", &selection)?)?)
}

#[test]
fn metadata_packet_literal_all_three_kinds_preserve_log_and_native_document() -> TestResult {
    let (directory, mut room) = room()?;
    test_fixture::seed(&mut room, 1, true)?;
    let before = pages(&room)?;
    let log = std::fs::read(directory.join("room.log"))?;
    let document = room.catchup("owner")?;
    for (kind, lane) in
        [("version", "versions"), ("suggestion", "suggestions"), ("revision", "revisions")]
    {
        let expected = before[lane]["packets"][0].clone();
        let query: MetadataPacketQuery =
            serde_json::from_value(json!({"kind":kind,"expected":expected}))?;
        let actual = room.recovery_metadata_packet("owner", &query)?;
        assert_eq!(serde_json::to_value(&actual.fingerprint)?, expected);
        assert_eq!(actual.text.len() as u64, expected["bytes"].as_u64().ok_or("bytes")?);
        assert_eq!(crate::assets::asset_id(actual.text.as_bytes()), expected["sha256"]);
        assert!(room.recovery_metadata_packet("reader", &query).is_err());
        let mut wrong = json!({"kind":kind,"expected":expected});
        wrong["expected"]["bytes"] = json!(actual.text.len() + 1);
        assert!(room.recovery_metadata_packet("owner", &serde_json::from_value(wrong)?).is_err());
    }
    assert_eq!(pages(&room)?, before);
    assert_eq!(room.catchup("owner")?, document);
    assert_eq!(std::fs::read(directory.join("room.log"))?, log);
    drop(room);
    std::fs::remove_dir_all(directory)?;
    Ok(())
}

#[test]
fn metadata_packet_native_valid_duplicate_keeps_first_literal_and_refuses_retry_byte_expectation()
-> TestResult {
    let (directory, mut room) = room()?;
    test_fixture::seed(&mut room, 1, true)?;
    let expected = pages(&room)?["versions"]["packets"][0].clone();
    let query: MetadataPacketQuery =
        serde_json::from_value(json!({"kind":"version","expected":expected}))?;
    let original = room.recovery_metadata_packet("owner", &query)?.text;
    let variant = serde_json::to_string_pretty(&serde_json::from_str::<Value>(&original)?)?;
    assert_ne!(variant, original);
    let DocumentVersionAdmission::Durable(duplicate) =
        room.publish_document_version("owner", &variant)?
    else {
        return Err("durable duplicate".into());
    };
    assert!(duplicate.duplicate);
    assert_eq!(room.recovery_metadata_packet("owner", &query)?.text, original);
    let mut wrong = json!({"kind":"version","expected":expected});
    wrong["expected"]["bytes"] = json!(variant.len());
    wrong["expected"]["sha256"] = json!(crate::assets::asset_id(variant.as_bytes()));
    assert!(room.recovery_metadata_packet("owner", &serde_json::from_value(wrong)?).is_err());
    drop(room);
    std::fs::remove_dir_all(directory)?;
    Ok(())
}

#[test]
fn metadata_packet_closed_query_and_fingerprint_budgets_refuse() -> TestResult {
    let base = json!({"kind":"version","expected":{"id":format!("sha256:{}", "a".repeat(64)),"bytes":1,"sha256":format!("sha256:{}", "b".repeat(64))}});
    assert!(serde_json::from_value::<MetadataPacketQuery>(base.clone())?.validate().is_ok());
    for value in [json!(0), json!(4 * 1024 * 1024 + 1)] {
        let mut bad = base.clone();
        bad["expected"]["bytes"] = value;
        assert!(serde_json::from_value::<MetadataPacketQuery>(bad)?.validate().is_err());
    }
    let mut extra = base.clone();
    extra["extra"] = json!(true);
    assert!(serde_json::from_value::<MetadataPacketQuery>(extra).is_err());
    let mut extra = base.clone();
    extra["expected"]["extra"] = json!(true);
    assert!(serde_json::from_value::<MetadataPacketQuery>(extra).is_err());
    let mut bad = base.clone();
    bad["kind"] = json!("prepared");
    assert!(serde_json::from_value::<MetadataPacketQuery>(bad).is_err());
    let mut bad = base;
    bad["expected"]["sha256"] = json!(format!("sha256:{}", "B".repeat(64)));
    assert!(serde_json::from_value::<MetadataPacketQuery>(bad)?.validate().is_err());
    Ok(())
}

#[test]
fn metadata_packet_inert_prepare_stays_unpublished_and_unreadable_as_committed_after_replay()
-> TestResult {
    let (directory, mut room) = room()?;
    let request = test_fixture::seed_with_request(&mut room, 0, false)?.ok_or("native Prepare")?;
    let parent = room
        .document_suggestion_packet("owner", &request.previous_suggestion_id)?
        .ok_or("native original proposal")?;
    let id = room.replica.read_document_suggestion_revision(&parent, &request.revision_packet)?.id;
    let query: MetadataPacketQuery = serde_json::from_value(
        json!({"kind":"revision","expected":{"id":id,"bytes":request.revision_packet.len(),"sha256":crate::assets::asset_id(request.revision_packet.as_bytes())}}),
    )?;
    assert!(room.recovery_metadata_packet("owner", &query).is_err());
    assert_eq!(pages(&room)?["revisions"]["catalog"]["revisions"], json!([]));
    let path = directory.join("room.log");
    let before = std::fs::read(&path)?;
    drop(room);
    let (room, recovery) = Room::open(&path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert!(room.recovery_metadata_packet("owner", &query).is_err());
    assert_eq!(pages(&room)?["revisions"]["catalog"]["revisions"], json!([]));
    assert_eq!(std::fs::read(&path)?, before);
    drop(room);
    std::fs::remove_dir_all(directory)?;
    Ok(())
}
