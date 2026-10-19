//! Missing causal inputs must never be silently treated as a complete retention closure.
use super::*;
use crate::rich_replica::{
    Command, SharedRichProfile,
    actions::{InsertText, ReplaceImage},
};
use loro::ExportMode;
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn metadata_topology_rejects_inline_alias_and_wrong_slot_markers() -> Result {
    use loro::loro_value;
    use loro_internal::loro_common::mergeable_marker;
    let directory = ContainerID::new_root("metadata", ContainerType::Map);
    let owner = ContainerID::new_mergeable(&directory, "image-block", ContainerType::Map);
    let effects = ContainerID::new_mergeable(&owner, "effects", ContainerType::Map);
    for (container, key) in
        [(directory, "image-block"), (owner, "effects"), (effects, "image-asset")]
    {
        let valid = mergeable_marker(&container, key, ContainerType::Map);
        check_metadata_slot(&container, key, &valid)?;
        for value in [
            loro_value!({"PRIVATE_SECRET":"not-a-native-map-marker"}),
            LoroValue::Container(ContainerID::new_root("foreign", ContainerType::Map)),
            mergeable_marker(&container, key, ContainerType::List),
            mergeable_marker(&container, "another-slot", ContainerType::Map),
        ] {
            let result = check_metadata_slot(&container, key, &value);
            assert!(matches!(result, Err(Error::Contract("retained asset metadata topology"))));
            assert!(!format!("{result:?}").contains("PRIVATE_SECRET"));
        }
    }
    Ok(())
}

#[test]
fn admitted_aliased_metadata_refuses_completeness_without_losing_exact_recovery() -> Result {
    use crate::register::read_contribution;
    use loro::{LoroMap, ToJson};
    let (profile, mut receiver) = setup()?;
    let mut source = profile.join_frame("room".into(), "202".into(), &receiver.update_frame()?)?;
    source.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: "visible-asset".into(),
        generation: "visible-generation".into(),
    })])?;
    let producer = LoroDoc::new();
    producer.import(&source.updates()?)?;
    producer.set_peer_id(303)?;
    let effects = producer
        .get_map("metadata")
        .ensure_mergeable_map("image-block")?
        .ensure_mergeable_map("effects")?;
    let original = effects.ensure_mergeable_map("image-asset")?.get_deep_value().to_json_value();
    let mut stamps = std::collections::BTreeMap::new();
    for (key, value) in original.as_object().ok_or("contributions")? {
        let (stamp, raw) = read_contribution(&producer, key, value)?;
        let patch: Value = serde_json::from_str(raw.as_str().ok_or("patch")?)?;
        stamps
            .insert(patch["sets"]["breditor/asset-id"].as_str().ok_or("asset")?.to_owned(), stamp);
    }
    let earlier = *stamps.get("asset").ok_or("seed stamp")?;
    let later = *stamps.get("visible-asset").ok_or("replacement stamp")?;
    let alias = effects.insert_container("zz-aliased-assets", LoroMap::new())?;
    let patch = |asset: &str, generation: &str| {
        json!({"sets":{"breditor/asset-id":asset,"breditor/asset-generation":generation},"removes":[]}).to_string()
    };
    alias.insert(
        &earlier.key(),
        earlier.contribution(patch("aliased-asset", "aliased-generation").into()),
    )?;
    alias.insert(
        &later.key(),
        later.contribution(patch("visible-asset", "visible-generation").into()),
    )?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("visible-generation"));
    assert!(!receiver.document_json().contains("aliased-generation"));
    let exact = (receiver.checkpoint()?, receiver.update_frame()?, receiver.view_json()?);
    let before = receiver.retained_asset_references_guarded(&receiver.observe()?);
    assert_eq!((receiver.checkpoint()?, receiver.update_frame()?, receiver.view_json()?), exact);
    let recovered = profile.restore("room", &exact.0)?;
    assert_eq!(recovered.checkpoint()?, exact.0);
    let recovered_read = recovered.retained_asset_references_guarded(&recovered.observe()?);
    alias.delete(&later.key())?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("aliased-generation"));
    assert!(
        matches!(before, Err(Error::Contract("retained asset metadata topology"))),
        "Aliased metadata was reported as a complete inventory despite its latent image binding"
    );
    assert!(matches!(recovered_read, Err(Error::Contract("retained asset metadata topology"))));
    Ok(())
}

#[test]
fn admitted_partial_asset_patch_refuses_completeness_without_changing_recoverable_history() -> Result
{
    use crate::register::{Stamp, write};
    let (profile, mut receiver) = setup()?;
    let producer = LoroDoc::new();
    producer.import(&receiver.updates()?)?;
    producer.set_peer_id(202)?;
    let effects = producer
        .get_map("metadata")
        .ensure_mergeable_map("image-block")?
        .ensure_mergeable_map("effects")?;
    effects.ensure_mergeable_map("zz-partial-asset")?;
    producer.commit();
    let stamp = Stamp::next(&producer)?;
    write(
        &effects,
        "zz-partial-asset",
        stamp,
        json!({"sets":{"breditor/asset-id":"partial-asset"},"removes":[]}).to_string().into(),
    )?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("partial-asset"));
    let exact = (receiver.checkpoint()?, receiver.update_frame()?, receiver.view_json()?);
    assert!(matches!(
        receiver.retained_asset_references_guarded(&receiver.observe()?),
        Err(Error::Contract("retained asset atomic patch"))
    ));
    assert_eq!((receiver.checkpoint()?, receiver.update_frame()?, receiver.view_json()?), exact);
    let recovered = profile.restore("room", &exact.0)?;
    assert_eq!(recovered.checkpoint()?, exact.0);
    assert!(recovered.retained_asset_references_guarded(&recovered.observe()?).is_err());
    Ok(())
}

#[test]
fn admitted_identity_properties_are_inventoried_before_effect_retractions_reveal_them() -> Result {
    use loro::ToJson;
    let (profile, mut receiver) = setup()?;
    let mut source = profile.join_frame("room".into(), "202".into(), &receiver.update_frame()?)?;
    source.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: "visible-asset".into(),
        generation: "visible-generation".into(),
    })])?;
    let producer = LoroDoc::new();
    producer.import(&source.updates()?)?;
    producer.set_peer_id(303)?;
    let owner = producer.get_map("metadata").ensure_mergeable_map("image-block")?;
    owner.insert("identity",json!({"breditor/image-id":"image","breditor/asset-id":"identity-asset","breditor/asset-generation":"identity-generation"}).to_string())?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("visible-generation"));
    assert!(!receiver.document_json().contains("identity-generation"));
    let before = receiver.retained_asset_references_guarded(&receiver.observe()?)?;
    let contributions =
        owner.ensure_mergeable_map("effects")?.ensure_mergeable_map("image-asset")?;
    let active = contributions.get_deep_value().to_json_value();
    for key in active.as_object().ok_or("contributions")?.keys() {
        contributions.delete(key)?;
    }
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("identity-generation"));
    assert!(before.iter().any(|r| r.asset().as_str() == "identity-asset"
        && r.generation().as_str() == "identity-generation"));
    Ok(())
}

fn setup() -> Result<(SharedRichProfile, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/pending-assets","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/pending-assets","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = profile.create(&input, "101".into())?;
    Ok((profile, a))
}
#[test]
fn pending_image_operations_refuse_until_dependencies_arrive_and_survive_recovery() -> Result {
    let (profile, mut a) = setup()?;
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Missing dependency".into(),
    })])?;
    let middle = b.doc.oplog_vv();
    b.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: "pending-asset".into(),
        generation: "pending-generation".into(),
    })])?;
    let pending = b.doc.export(ExportMode::updates(&middle))?;
    a.receive(pending)?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(matches!(
        a.retained_asset_references_guarded(&a.observe()?),
        Err(Error::Contract("retained asset pending causal dependencies"))
    ));
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    let mut restored = profile.restore("room", &exact.0)?;
    assert!(restored.retained_asset_references_guarded(&restored.observe()?).is_err());
    for owner in [&mut a, &mut restored] {
        owner.receive(b.updates()?)?;
        let references = owner.retained_asset_references_guarded(&owner.observe()?)?;
        assert!(references.iter().any(|r| r.asset().as_str() == "pending-asset"
            && r.generation().as_str() == "pending-generation"));
    }
    assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    Ok(())
}

#[test]
fn shallow_history_never_masquerades_as_a_complete_retention_inventory() -> Result {
    let (_, mut a) = setup()?;
    let observation = a.observe()?;
    let frontiers = a.doc.oplog_frontiers();
    let bytes = a.doc.export(ExportMode::shallow_snapshot(&frontiers))?;
    let shallow = LoroDoc::new();
    shallow.import(&bytes)?;
    assert!(shallow.is_shallow());
    // Inject only the private engine storage for this negative guard test. No public admission
    // path is weakened and this deliberately inconsistent owner is never published or saved.
    a.doc = shallow;
    assert!(matches!(
        a.retained_asset_references_guarded(&observation),
        Err(Error::Contract("retained asset complete causal history"))
    ));
    Ok(())
}

#[test]
fn malformed_retained_patches_are_rejected_without_echoing_private_fields() -> Result {
    use crate::register::Stamp;
    use loro::{ContainerType, JsonMapOp};
    let doc = LoroDoc::new();
    doc.set_peer_id(101)?;
    let metadata = doc.get_map("metadata").ensure_mergeable_map("image")?;
    let effects = metadata.ensure_mergeable_map("effects")?.ensure_mergeable_map("image-asset")?;
    doc.commit();
    let owner = ContainerID::new_mergeable(
        &ContainerID::new_root("metadata", ContainerType::Map),
        "image",
        ContainerType::Map,
    );
    let container = ContainerID::new_mergeable(
        &ContainerID::new_mergeable(&owner, "effects", ContainerType::Map),
        "image-asset",
        ContainerType::Map,
    );
    for raw in [
        r#"{"sets":{"breditor/asset-id":"asset","breditor/asset-generation":"generation"},"removes":[],"PRIVATE_SECRET":true}"#,
        r#"{"sets":{"breditor/asset-id":"asset"},"removes":[]}"#,
        r#"{"sets":{"different":"PRIVATE_SECRET","other":"value"},"removes":[]}"#,
        r#"{"sets":{"breditor/asset-id":"PRIVATE_SECRET/bad","breditor/asset-generation":"generation"},"removes":[]}"#,
    ] {
        let stamp = Stamp::next(&doc)?;
        let value = stamp.contribution(raw.into());
        effects.insert(&stamp.key(), value.clone())?;
        doc.commit();
        let operation = JsonOpContent::Map(JsonMapOp::Insert { key: stamp.key(), value });
        let mut output = BTreeSet::new();
        let result = read_operation(&doc, &container, &operation, &mut output);
        assert!(result.is_err());
        assert!(!format!("{result:?}").contains("PRIVATE_SECRET"));
        assert!(output.is_empty());
    }
    Ok(())
}

#[test]
fn result_budget_counts_unique_pairs_and_never_silently_truncates() -> Result {
    let mut output = BTreeSet::new();
    for i in 0..RICH_ASSET_REFERENCE_MAX_BINDINGS {
        let properties = json!({"breditor/asset-id":format!("asset-{i}"),"breditor/asset-generation":"generation"});
        insert(&mut output, properties.as_object().ok_or("properties")?)?;
    }
    let duplicate = json!({"breditor/asset-id":"asset-0","breditor/asset-generation":"generation"});
    insert(&mut output, duplicate.as_object().ok_or("properties")?)?;
    assert_eq!(output.len(), RICH_ASSET_REFERENCE_MAX_BINDINGS);
    let overflow =
        json!({"breditor/asset-id":"new-asset","breditor/asset-generation":"generation"});
    assert!(matches!(
        insert(&mut output, overflow.as_object().ok_or("properties")?),
        Err(Error::Limit("retained asset reference count"))
    ));
    Ok(())
}

#[test]
fn alternate_metadata_field_retains_a_losing_binding_before_a_native_receive_reveals_it() -> Result
{
    use crate::register::{Stamp, read_contribution};
    use loro::ToJson;
    let (profile, mut receiver) = setup()?;
    let mut source = profile.join_frame("room".into(), "202".into(), &receiver.update_frame()?)?;
    for (asset, generation) in
        [("first-asset", "first-generation"), ("visible-asset", "visible-generation")]
    {
        source.apply(vec![Command::ReplaceImage(ReplaceImage {
            block: "image-block".into(),
            asset: asset.into(),
            generation: generation.into(),
        })])?;
    }
    // A separate raw-update fixture uses a distinct writer, never a clone of a live author.
    let producer = LoroDoc::new();
    producer.import(&source.updates()?)?;
    producer.set_peer_id(303)?;
    let owner = producer.get_map("metadata").ensure_mergeable_map("image-block")?;
    let effects = owner.ensure_mergeable_map("effects")?;
    let original = effects.ensure_mergeable_map("image-asset")?.get_deep_value().to_json_value();
    let stamp_for = |asset: &str| -> Result<Stamp> {
        for (key, value) in original.as_object().ok_or("contributions")? {
            let (stamp, raw) = read_contribution(&producer, key, value)?;
            let patch: Value = serde_json::from_str(raw.as_str().ok_or("patch")?)?;
            if patch["sets"]["breditor/asset-id"] == asset {
                return Ok(stamp);
            }
        }
        Err("missing contribution".into())
    };
    let earlier = stamp_for("first-asset")?;
    let later = stamp_for("visible-asset")?;
    let alternate = effects.ensure_mergeable_map("zz-retained-assets")?;
    let patch = |asset: &str, generation: &str| {
        json!({"sets":{"breditor/asset-id":asset,"breditor/asset-generation":generation},"removes":[]}).to_string()
    };
    alternate.insert(
        &earlier.key(),
        earlier.contribution(patch("latent-asset", "latent-generation").into()),
    )?;
    alternate.insert(
        &later.key(),
        later.contribution(patch("visible-asset", "visible-generation").into()),
    )?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("visible-generation"));
    assert!(!receiver.document_json().contains("latent-generation"));
    let before = receiver.retained_asset_references_guarded(&receiver.observe()?)?;
    // Existing native materialization admits this alternate field and can reveal its losing pair.
    alternate.delete(&later.key())?;
    producer.commit();
    receiver.receive(producer.export(ExportMode::all_updates())?)?;
    assert!(receiver.document_json().contains("latent-generation"));
    assert!(
        before.iter().any(|r| r.asset().as_str() == "latent-asset"
            && r.generation().as_str() == "latent-generation"),
        "The pre-reveal inventory omitted an already retained latent image binding"
    );
    Ok(())
}
