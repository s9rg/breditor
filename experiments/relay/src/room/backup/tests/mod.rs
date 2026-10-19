//! Native source, transport-only admission, replay-before-publication and filesystem races.
use super::{RoomBackup, RoomBackupIdentity, RoomRecoveryPolicy};
use crate::{AtomicTransportProfile, Error, Room};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
mod filesystem;
mod format;
mod identity;
mod revisions;
mod roundtrip;

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Directory {
    fn new() -> TestResult<Self> {
        let path = std::env::temp_dir()
            .join(format!("breditor-room-backup-{}", crate::credentials::issue()?));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn names(&self) -> TestResult<Vec<String>> {
        let mut names = fs::read_dir(&self.0)?
            .map(|entry| entry.map(|e| e.file_name().to_string_lossy().into_owned()))
            .collect::<std::io::Result<Vec<_>>>()?;
        names.sort();
        Ok(names)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        if let Ok(entries) = fs::read_dir(&self.0) {
            for entry in entries.flatten() {
                let path = entry.path();
                // This one newly created test directory never holds user files or nested trees.
                let _ = fs::remove_file(&path).or_else(|_| fs::remove_dir(&path));
            }
        }
        let _ = fs::remove_dir(&self.0);
    }
}

fn seed(version: u32, standard: bool) -> TestResult<(SharedRichProfile, String, String)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/server-backup","version":1},"extensions":[]})
    .to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("bad test profile".into()),
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/server-backup","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root})
    .to_string();
    Ok((profile, configuration, document))
}

fn start(
    directory: &Directory,
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(SharedRichProfile, Room)> {
    let (profile, configuration, document) = seed(version, standard)?;
    let path = directory.path("source.log");
    let room = if atomic {
        let kind = match version {
            1 => AtomicTransportProfile::Original,
            2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
            _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
        };
        Room::create_atomic_transport_v2(&path, &configuration, &document, "owner", kind)?
    } else {
        match (version, standard) {
            (1, false) => Room::create(&path, &configuration, &document, "owner")?,
            (2, false) => Room::create_structural_v2(&path, &configuration, &document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(&path, &configuration, &document, "owner")?
            }
            (3, false) => Room::create_layout_v3(&path, &configuration, &document, "owner")?,
            _ => Room::create_standard_layout_v3(&path, &configuration, &document, "owner")?,
        }
    };
    Ok((profile, room))
}
