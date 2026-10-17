//! Complete record integrity cannot substitute for original authorization and source-cut replay.
use super::*;
use crate::{
    Role,
    log::{Event, Log},
};
use breditor_collab_feasibility::{review::ReviewPrincipalId, rich_replica::SharedRichProfile};
use serde_json::{Value, json};
use std::{fs, io::Write};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn checksum_valid_catalog_grant_forgery_and_duplicate_records_refuse_before_torn_tail_repair()
-> TestResult {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let directory =
        std::env::temp_dir().join(format!("breditor-version-replay-{}-{now}", std::process::id()));
    fs::create_dir(&directory)?;
    let original = directory.join("original.log");
    let config=json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/version-replay","version":1},"extensions":[]}).to_string();
    let p = SharedRichProfile::from_configuration_json(&config)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/version-replay","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":tree}).to_string();
    let mut room = Room::create(&original, &config, &document, "owner")?;
    room.enable_document_versions("owner")?;
    room.grant("owner", "alice", Some(Role::Editor))?;
    let a = p.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
    let packet = a.capture_document_version_guarded(
        &a.observe()?,
        "Durable version",
        ReviewPrincipalId::try_new("alice")?,
        "0",
    )?;
    room.publish_document_version("alice", &packet)?;
    drop(room);
    for variant in 0..3 {
        let (source, mut records, _) = Log::open(&original)?;
        drop(source);
        let path = directory.join(format!("wrong-{variant}.log"));
        let mut log = Log::create(&path, records.remove(0).event)?;
        for record in records {
            let mut event = record.event;
            if let Event::Grant { role, .. } = &mut event
                && variant == 0
            {
                *role = Some(Role::Reader);
            }
            if let Event::PublishDocumentVersionV1 { principal, packet } = &mut event {
                if variant == 1 {
                    *principal = "owner".into();
                }
                if variant == 2 {
                    log.append(Event::PublishDocumentVersionV1 {
                        principal: principal.clone(),
                        packet: packet.clone(),
                    })?;
                }
            }
            log.append(event)?;
        }
        drop(log);
        let mut file = fs::OpenOptions::new().append(true).open(&path)?;
        file.write_all(&[0, 1, 2])?;
        file.sync_all()?;
        drop(file);
        let before = fs::read(&path)?;
        assert!(Room::open(&path).is_err());
        assert_eq!(fs::read(&path)?, before);
        fs::remove_file(&path)?;
    }
    fs::remove_file(&original)?;
    fs::remove_dir(&directory)?;
    Ok(())
}
