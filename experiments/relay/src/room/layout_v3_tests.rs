//! Durable tags, not configuration inspection, select a replay compiler.
use super::{Room, SharedRichProfile};
use crate::log::{Event, Log};
use serde_json::{Value, json};
use std::{fs, io::Write};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn seed(version: u32) -> Result<(String, String)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/relay-tag","version":1},"extensions":[]}).to_string();
    let profile = match version {
        2 => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        3 => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        _ => return Err("unsupported test revision".into()),
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let source=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/relay-tag","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok((configuration, profile.create(&source, "1".into())?.checkpoint()?))
}

#[test]
fn incompatible_durable_seed_tags_never_upgrade_a_log_or_truncate_on_failed_recovery() -> Result {
    let (v3, j3) = seed(3)?;
    let (v2, j2) = seed(2)?;
    let events = [
        Event::Seed {
            configuration: v3.clone(),
            room: "room".into(),
            owner: "owner".into(),
            journal: j3.clone(),
        },
        Event::SeedStructuralV2 {
            configuration: v3,
            standard_inline_v1: false,
            room: "room".into(),
            owner: "owner".into(),
            journal: j3,
        },
        Event::SeedLayoutV3 {
            configuration: v2,
            standard_inline_v1: false,
            room: "room".into(),
            owner: "owner".into(),
            journal: j2,
        },
    ];
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let directory = std::env::temp_dir()
        .join(format!("breditor-relay-seed-tags-{}-{nonce}", std::process::id()));
    fs::create_dir(&directory)?;
    for (index, event) in events.into_iter().enumerate() {
        let path = directory.join(format!("room-{index}.log"));
        drop(Log::create(&path, event)?);
        // A recoverable torn tail must survive when the complete seed's binding is invalid.
        fs::OpenOptions::new().append(true).open(&path)?.write_all(&[0, 1, 2])?;
        let before = fs::read(&path)?;
        assert!(Room::open(&path).is_err());
        assert_eq!(fs::read(&path)?, before);
        fs::remove_file(&path)?;
    }
    fs::remove_dir(&directory)?;
    Ok(())
}
