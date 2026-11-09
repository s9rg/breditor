//! Explicit real native compilers and new physical storage; original fixture meanings are unchanged.
use super::Result;
use breditor_collab_feasibility::rich_replica::SharedRichProfile;
use breditor_collab_relay::{AtomicTransportProfile, Role, Room, ServerLogGenerationOptions};
use serde_json::{Value, json};
use std::path::Path;

#[derive(Clone, Copy)]
pub struct Spec {
    pub language: u32,
    pub standard: bool,
    pub atomic: bool,
}
pub struct Source {
    pub profile: SharedRichProfile,
    pub room: Room,
    pub configuration: String,
}
impl Spec {
    pub fn name(self) -> String {
        format!("language-{}-standard-{}-atomic-{}", self.language, self.standard, self.atomic)
    }
}
pub fn create(directory: &Path, spec: Spec, asset: Option<&str>) -> Result<Source> {
    create_with(spec, asset, |configuration, document, transport| {
        let options = ServerLogGenerationOptions { root: "root".into(), active: "one".into() };
        let path = directory.join("source-native");
        Ok(if spec.atomic {
            Room::create_atomic_log_generations_v2(
                &path,
                configuration,
                document,
                "owner",
                transport,
                &options,
            )?
        } else {
            Room::create_log_generations(
                &path,
                configuration,
                document,
                "owner",
                transport,
                &options,
            )?
        })
    })
}
pub fn create_with(
    spec: Spec,
    asset: Option<&str>,
    make_room: impl FnOnce(&str, &str, AtomicTransportProfile) -> Result<Room>,
) -> Result<Source> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":spec.language,"schema":{"name":"example/native-inventory-sdk","version":1},"extensions":[]}).to_string();
    let profile = match (spec.language, spec.standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("fixture compiler".into()),
    };
    let mut tree: Value = serde_json::from_str(include_str!(
        "../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let paragraph = tree["children"][0]["children"][0]["children"][0]["children"][0].clone();
    if let Some(asset) = asset {
        let mut image = tree["children"][0]["children"][0]["children"][0]["children"][1].clone();
        image["properties"]["breditor/asset-id"] = json!(asset);
        image["properties"]["breditor/asset-generation"] = json!("native-image-binding");
        tree["children"] = json!([paragraph, image]);
    } else {
        tree["children"] = json!([paragraph]);
    }
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/native-inventory-sdk","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let transport = match spec.language {
        1 => AtomicTransportProfile::Original,
        2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: spec.standard },
        _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: spec.standard },
    };
    let mut room = make_room(&configuration, &document, transport)?;
    room.enable_review("owner")?;
    room.enable_document_versions("owner")?;
    room.enable_document_history_generations(
        "owner",
        "document-root".into(),
        "document-one".into(),
    )?;
    room.enable_review_history_generations("owner", "review-root".into(), "review-one".into())?;
    if spec.atomic {
        room.enable_document_suggestions("owner")?;
        room.enable_document_suggestion_revisions("owner")?;
    }
    for (account, role) in [
        ("alice", Role::Editor),
        ("reader", Role::Reader),
        (" ", Role::Reader),
        ("\u{e000}", Role::Reader),
        ("\u{10000}", Role::Reader),
    ] {
        room.grant("owner", account, Some(role))?;
    }
    Ok(Source { profile, room, configuration })
}
