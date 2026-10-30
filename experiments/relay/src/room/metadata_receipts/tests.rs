//! Exact receipts differ across metadata-only log cuts with identical native heads.
use super::*;
use crate::Room;
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn metadata_receipts_inert_prepare_survives_replay_without_invented_publication() -> TestResult {
    let directory = std::env::temp_dir()
        .join(format!("breditor-metadata-page-{}", crate::credentials::issue()?));
    std::fs::create_dir(&directory)?;
    let path = directory.join("room.log");
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/metadata-page","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/metadata-page","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let mut room = Room::create_atomic_transport_v2(
        &path,
        &configuration,
        &document,
        "owner",
        crate::AtomicTransportProfile::Original,
    )?;
    test_fixture::seed(&mut room, 2, false)?;
    let selected: MetadataPageSelection = serde_json::from_value(
        json!({"versions":{"kind":"start"},"suggestions":{"kind":"start"},"revisions":{"kind":"start"}}),
    )?;
    let before = serde_json::to_value(room.recovery_metadata_page("owner", &selected)?)?;
    assert_eq!(before["versions"]["catalog"]["entries"].as_array().ok_or("versions")?.len(), 2);
    assert_eq!(before["suggestions"]["catalog"]["updates"].as_array().ok_or("proposals")?.len(), 1);
    assert_eq!(before["revisions"]["catalog"]["revisions"], json!([]));
    assert_eq!(before["revisions"]["packets"], json!([]));
    drop(room);
    let (mut room, recovery) = Room::open(&path)?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(serde_json::to_value(room.recovery_metadata_page("owner", &selected)?)?, before);
    let native = room.catchup("owner")?;
    test_fixture::publish_version(&mut room, "Later metadata only")?;
    assert_eq!(room.catchup("owner")?, native);
    let later = serde_json::to_value(room.recovery_metadata_page("owner", &selected)?)?;
    assert_ne!(later["versions"], before["versions"]);
    assert_eq!(later["suggestions"], before["suggestions"]);
    assert_eq!(later["revisions"], before["revisions"]);
    assert!(room.recovery_metadata_page("reader", &selected).is_err());
    drop(room);
    std::fs::remove_dir_all(directory)?;
    Ok(())
}
