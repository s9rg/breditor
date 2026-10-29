//! Actual native generations, separately owned rasters and private per-test directories.
use crate::{AtomicTransportProfile, Room, ServerLogGenerationOptions, server::Authentication};
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
pub(super) type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
pub(super) struct Directory(pub PathBuf);
impl Directory {
    pub fn new() -> TestResult<Self> {
        let path = std::env::temp_dir()
            .join(format!("breditor-live-generation-fence-{}", crate::credentials::issue()?));
        fs::create_dir(&path)?;
        Ok(Self(path))
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
pub(super) fn source(
    d: &Directory,
    version: u32,
    standard: bool,
    atomic: bool,
    generation: bool,
) -> TestResult<(Room, SharedRichProfile)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/live-generation-fence","version":1},"extensions":[]}).to_string();
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
        _ => return Err("explicit profile".into()),
    };
    let document_root: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    )))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/live-generation-fence","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":document_root}).to_string();
    let options = ServerLogGenerationOptions { root: "root".into(), active: "one".into() };
    let mut room = if generation {
        if atomic {
            Room::create_atomic_log_generations_v2(
                &d.0.join("source"),
                &configuration,
                &document,
                "owner",
                kind,
                &options,
            )?
        } else {
            Room::create_log_generations(
                &d.0.join("source"),
                &configuration,
                &document,
                "owner",
                kind,
                &options,
            )?
        }
    } else if atomic {
        Room::create_atomic_transport_v2(
            &d.0.join("original.log"),
            &configuration,
            &document,
            "owner",
            kind,
        )?
    } else {
        Room::create_standard_layout_v3(
            &d.0.join("original.log"),
            &configuration,
            &document,
            "owner",
        )?
    };
    room.register("owner")?;
    room.grant("owner", "reader", Some(crate::Role::Reader))?;
    Ok((room, profile))
}
pub(super) fn authentication(owner: &str, reader: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(&json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":[{"principal":"owner","tokenHash":crate::credentials::hash(owner)?},{"principal":"reader","tokenHash":crate::credentials::hash(reader)?}],"origins":["http://127.0.0.1:4187"]}).to_string())?)
}
