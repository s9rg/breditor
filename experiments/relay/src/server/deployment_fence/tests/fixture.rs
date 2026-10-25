//! Independently reserved test directories and small genuine native rooms.
use crate::{AtomicTransportProfile, Room, server::Authentication};
use breditor_collab_feasibility::rich_replica::{RichReplica, SharedRichProfile};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
pub(super) type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
pub(super) struct Directory(pub PathBuf);
impl Directory {
    pub fn new() -> TestResult<Self> {
        let root = std::env::temp_dir()
            .join(format!("breditor-deployment-test-{}", crate::credentials::issue()?));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
    pub fn authority(&self) -> PathBuf {
        self.0.join("authority")
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
pub(super) fn room(
    path: &Path,
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(Room, SharedRichProfile)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/deployment-fence","version":1},"extensions":[]}).to_string();
    let (profile, kind) = match (version, standard) {
        (1, false) => (
            SharedRichProfile::from_configuration_json(&configuration)?,
            AtomicTransportProfile::Original,
        ),
        (2, false) => (
            SharedRichProfile::from_configuration_json_v2(&configuration)?,
            AtomicTransportProfile::StructuralV2 { standard_inline_v1: false },
        ),
        (2, true) => (
            SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
            AtomicTransportProfile::StructuralV2 { standard_inline_v1: true },
        ),
        (3, false) => (
            SharedRichProfile::from_configuration_json_v3(&configuration)?,
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: false },
        ),
        (3, true) => (
            SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        ),
        _ => return Err("explicit native profile".into()),
    };
    let content: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    )))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/deployment-fence","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":content}).to_string();
    let room = if atomic {
        Room::create_atomic_transport_v2(path, &configuration, &document, "owner", kind)?
    } else {
        match (version, standard) {
            (1, false) => Room::create(path, &configuration, &document, "owner")?,
            (2, false) => Room::create_structural_v2(path, &configuration, &document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(path, &configuration, &document, "owner")?
            }
            (3, false) => Room::create_layout_v3(path, &configuration, &document, "owner")?,
            (3, true) => Room::create_standard_layout_v3(path, &configuration, &document, "owner")?,
            _ => return Err("explicit native profile".into()),
        }
    };
    Ok((room, profile))
}
pub(super) fn authentication(token: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":crate::credentials::hash(token)?}],"origins":[ORIGIN]}).to_string())?)
}
pub(super) fn groups(client: &RichReplica, after: &str, atomic: bool) -> TestResult<Value> {
    Ok(serde_json::from_str(&if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, after)?
    } else {
        client.writer_groups_guarded(&client.observe()?, after)?
    })?)
}
