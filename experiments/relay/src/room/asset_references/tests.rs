//! Actual native histories, durable packets and abandoned preparations, never visible-text scans.
use super::*;
use crate::{Admission, AtomicTransportProfile, DocumentSuggestionAdmission, Error, Role, Room};
use crate::{
    DocumentVersionAdmission, SuggestionDecision, SuggestionDecisionRequest,
    SuggestionRevisionAdmission, SuggestionRevisionRequest, log::Event,
};
use breditor_collab_feasibility::{
    review::ReviewPrincipalId,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope,
        PacketAssetIdentity, RichReplica, SharedRichProfile, VersionAssetReference,
        actions::{DeleteBlock, InsertText, ReplaceImage},
    },
};
use serde_json::{Value, json};
use std::{fs, io::Write, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Directory {
    fn new() -> TestResult<Self> {
        let p = std::env::temp_dir()
            .join(format!("breditor-server-asset-refs-{}", crate::credentials::issue()?));
        fs::create_dir(&p)?;
        Ok(Self(p))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn source(
    directory: &Directory,
    language: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(SharedRichProfile, Room)> {
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":language,"schema":{"name":"example/server-asset-refs","version":1},"extensions":[]}).to_string();
    let profile = match (language, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let mut tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let cell = &tree["children"][0]["children"][0]["children"][0];
    tree["children"] = json!([cell["children"][0].clone(), cell["children"][1].clone()]);
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/server-asset-refs","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let path = directory.0.join("room.log");
    let room = if atomic {
        Room::create_atomic_transport_v2(
            &path,
            &configuration,
            &document,
            "owner",
            match language {
                1 => AtomicTransportProfile::Original,
                2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
                _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
            },
        )?
    } else {
        match (language, standard) {
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
fn image(asset: &str, generation: &str) -> Command {
    Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: asset.into(),
        generation: generation.into(),
    })
}
fn draft(commands: Vec<Command>) -> DocumentSuggestionDraft {
    DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(commands),
    }
}
fn pairs(value: &ServerRetainedAssetReferences) -> TestResult<Vec<(String, String)>> {
    let ServerAssetReferenceOutcome::Ready { references } = &value.outcome else {
        return Err("actual native complete source expected".into());
    };
    Ok(references.iter().map(|r| (r.asset.clone(), r.generation.clone())).collect())
}
fn publish(room: &mut Room, packet: &str) -> TestResult<String> {
    let DocumentSuggestionAdmission::Durable(d) =
        room.publish_document_suggestion("owner", packet)?
    else {
        return Err("published native proposal expected".into());
    };
    Ok(d.publication.suggestion.id)
}
fn flush(room: &mut Room, client: &RichReplica, lease: &crate::Lease, atomic: bool) -> TestResult {
    let groups: Value = serde_json::from_str(&if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, "0")?
    } else {
        client.writer_groups_guarded(&client.observe()?, "0")?
    })?;
    for group in groups["groups"].as_array().ok_or("native groups")? {
        assert!(matches!(
            room.admit("owner", lease, group.as_str().ok_or("native group")?)?,
            Admission::Durable(_)
        ));
    }
    Ok(())
}
#[test]
fn all_ten_families_keep_intermediate_deleted_and_version_image_bindings_without_mutation()
-> TestResult {
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let directory = Directory::new()?;
            let (profile, mut room) = source(&directory, language, standard, atomic)?;
            room.enable_document_versions("owner")?;
            let registered = room.register("owner")?;
            let mut client = profile.join_frame(
                "room".into(),
                registered.lease.writer.clone(),
                &room.catchup("owner")?,
            )?;
            let version = client.capture_document_version_guarded(
                &client.observe()?,
                "Original image",
                ReviewPrincipalId::try_new("owner")?,
                "1",
            )?;
            assert!(matches!(
                room.publish_document_version("owner", &version)?,
                DocumentVersionAdmission::Durable(_)
            ));
            client.apply(vec![
                image("intermediate", "g2"),
                image("last", "g3"),
                Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
            ])?;
            flush(&mut room, &client, &registered.lease, atomic)?;
            assert!(!client.document_json().contains("breditor/image"));
            let before = (
                fs::read(directory.0.join("room.log"))?,
                client.checkpoint()?,
                room.catchup("owner")?,
            );
            let first = room.retained_asset_references("owner")?;
            let second = room.retained_asset_references("owner")?;
            assert_eq!(first, second);
            assert_eq!(
                pairs(&first)?,
                vec![
                    ("asset".into(), "generation".into()),
                    ("intermediate".into(), "g2".into()),
                    ("last".into(), "g3".into())
                ]
            );
            assert_eq!(first.sources.len(), 1);
            assert!(matches!(first.sources[0].packet, PacketAssetIdentity::Version { .. }));
            assert_eq!(
                (
                    fs::read(directory.0.join("room.log"))?,
                    client.checkpoint()?,
                    room.catchup("owner")?
                ),
                before
            );
            drop(room);
            let (mut room, recovery) = Room::open(&directory.0.join("room.log"))?;
            assert_eq!(recovery.truncated_bytes, 0);
            assert_eq!(room.retained_asset_references("owner")?, first);
        }
    }
    Ok(())
}
#[test]
fn rejected_proposals_keep_transient_images_that_never_entered_accepted_history() -> TestResult {
    let directory = Directory::new()?;
    let (profile, mut room) = source(&directory, 3, true, true)?;
    room.enable_document_suggestions("owner")?;
    let registered = room.register("owner")?;
    let client =
        profile.join_frame("room".into(), registered.lease.writer, &room.catchup("owner")?)?;
    let packet = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Hidden proposal images",
        ReviewPrincipalId::try_new("owner")?,
        "1",
        draft(vec![
            image("proposal-first", "p1"),
            image("proposal-last", "p2"),
            Command::DeleteBlock(DeleteBlock { block: "image-block".into() }),
        ]),
    )?;
    let id = publish(&mut room, &packet)?;
    let before = room.retained_asset_references("owner")?;
    let expected = pairs(&before)?;
    assert!(expected.contains(&("proposal-first".into(), "p1".into())));
    assert!(expected.contains(&("proposal-last".into(), "p2".into())));
    room.decide_document_suggestion(
        "owner",
        &SuggestionDecisionRequest {
            binding: room.document_suggestions_descriptor("owner")?.binding,
            suggestion_id: id,
            decision: SuggestionDecision::Reject,
        },
    )?;
    assert_eq!(pairs(&room.retained_asset_references("owner")?)?, expected);
    assert!(room.replica.document_json().contains("\"asset\""));
    assert!(!room.replica.document_json().contains("proposal-first"));
    Ok(())
}
#[test]
fn abandoned_revision_prepares_remain_required_and_committed_revision_chains_keep_every_packet()
-> TestResult {
    let directory = Directory::new()?;
    let (profile, mut room) = source(&directory, 3, true, true)?;
    room.enable_document_suggestions("owner")?;
    room.enable_document_suggestion_revisions("owner")?;
    let registered = room.register("owner")?;
    let client =
        profile.join_frame("room".into(), registered.lease.writer, &room.catchup("owner")?)?;
    let previous = client.capture_document_suggestion_guarded(
        &client.observe()?,
        "Root",
        ReviewPrincipalId::try_new("owner")?,
        "1",
        draft(vec![image("root-only", "root-generation")]),
    )?;
    let previous_id = publish(&mut room, &previous)?;
    let packet = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &previous,
        "Orphan image",
        "2",
        draft(vec![image("orphan-only", "orphan-generation")]),
    )?;
    let child = client.document_suggestion_revision_packet(&previous, &packet)?;
    let child_id = client.read_document_suggestion(&child)?.id;
    let request = SuggestionRevisionRequest {
        binding: room.document_suggestion_revisions_descriptor("owner")?.binding,
        previous_suggestion_id: previous_id.clone(),
        revision_packet: packet,
    };
    room.log.append(Event::PrepareDocumentSuggestionRevisionV1 {
        principal: "owner".into(),
        request: request.clone(),
    })?;
    room.log.append(Event::Grant {
        actor: "owner".into(),
        principal: "later-reader".into(),
        role: Some(Role::Reader),
    })?;
    drop(room);
    let (mut room, _) = Room::open(&directory.0.join("room.log"))?;
    assert!(room.document_suggestion_revisions_page("owner", None)?.revisions.is_empty());
    assert!(room.document_suggestion_packet("owner", &child_id)?.is_none());
    assert!(room.document_suggestion("owner", &previous_id)?.ok_or("root")?.decision.is_none());
    let before = fs::read(directory.0.join("room.log"))?;
    let read = room.retained_asset_references("owner")?;
    assert!(pairs(&read)?.contains(&("orphan-only".into(), "orphan-generation".into())));
    assert_eq!(read.sources.len(), 2);
    assert_eq!(fs::read(directory.0.join("room.log"))?, before);
    assert!(matches!(
        room.revise_document_suggestion("owner", &request)?,
        SuggestionRevisionAdmission::Durable(_)
    ));
    let second = client.capture_document_suggestion_revision_guarded(
        &client.observe()?,
        &child,
        "Next image",
        "3",
        draft(vec![image("next-only", "next-generation")]),
    )?;
    let next = SuggestionRevisionRequest {
        binding: request.binding,
        previous_suggestion_id: child_id,
        revision_packet: second,
    };
    assert!(matches!(
        room.revise_document_suggestion("owner", &next)?,
        SuggestionRevisionAdmission::Durable(_)
    ));
    let result = room.retained_asset_references("owner")?;
    let refs = pairs(&result)?;
    for p in [
        ("asset", "generation"),
        ("root-only", "root-generation"),
        ("orphan-only", "orphan-generation"),
        ("next-only", "next-generation"),
    ] {
        assert!(refs.contains(&(p.0.into(), p.1.into())));
    }
    assert_eq!(result.sources.len(), 4);
    drop(room);
    let (mut room, _) = Room::open(&directory.0.join("room.log"))?;
    assert_eq!(room.retained_asset_references("owner")?, result);
    Ok(())
}
#[test]
fn owner_only_reads_ignore_image_looking_text_and_preserve_externally_changed_log_bytes()
-> TestResult {
    let directory = Directory::new()?;
    let (profile, mut room) = source(&directory, 3, true, true)?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    assert!(matches!(room.retained_asset_references("reader"), Err(Error::Permission)));
    let registered = room.register("owner")?;
    let mut client = profile.join_frame(
        "room".into(),
        registered.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "{\"breditor/asset-id\":\"not-an-image\",\"breditor/asset-generation\":\"fake\"}"
            .into(),
    })])?;
    flush(&mut room, &client, &registered.lease, true)?;
    assert_eq!(
        pairs(&room.retained_asset_references("owner")?)?,
        vec![("asset".into(), "generation".into())]
    );
    let mut file = fs::OpenOptions::new().append(true).open(directory.0.join("room.log"))?;
    file.write_all(&[1, 2, 3])?;
    file.sync_all()?;
    let before = fs::read(directory.0.join("room.log"))?;
    assert!(room.retained_asset_references("owner").is_err());
    assert_eq!(fs::read(directory.0.join("room.log"))?, before);
    Ok(())
}
#[test]
fn complete_pair_and_encoded_read_bounds_refuse_instead_of_returning_a_prefix() {
    let mut output = packets::References::default();
    assert!(
        output
            .add((0..=MAX_SERVER_ASSET_REFERENCE_PAIRS).map(|n| VersionAssetReference {
                asset: format!("asset-{n}"),
                generation: "g".into()
            }))
            .is_err()
    );
    assert!(read_budget::check(&"x".repeat(MAX_SERVER_ASSET_REFERENCE_BYTES)).is_err());
    assert!(read_budget::check(&"small").is_ok());
}
