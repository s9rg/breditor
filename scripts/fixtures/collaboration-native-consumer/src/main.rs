//! External consumer: no research API, repository link or downstream patch declaration.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichAssetReference, SharedRichProfile,
        actions::ReplaceImage,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let profile = SharedRichProfile::from_standard_configuration_json_v1(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/native-consumer","version":1},"extensions":[]}"#,
    )?;
    let binding: Value = serde_json::from_str(&profile.descriptor_json())?;
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":binding["schema"],"schemaFingerprint":binding["schemaFingerprint"],
        "root":{"kind":"element","type":"breditor/document","entityId":null,
        "properties":{"breditor/document-id":"native-room"},"children":[{
        "kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{"breditor/block-id":"p"},"children":[]},
        {"kind":"element","type":"breditor/image","entityId":null,
        "properties":{"breditor/block-id":"image-block","breditor/image-id":"image",
        "breditor/asset-id":"native-asset","breditor/asset-generation":"native-generation",
        "breditor/decorative":true,"breditor/alt-text":""},"children":[]}]}})
    .to_string();
    let mut a = profile.create(&document, "101".into())?;
    let mut b = profile.join_frame("native-room".into(), "202".into(), &a.update_frame()?)?;
    let point = TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After };
    let caret = Selection::TextRange { anchor: point.clone(), focus: point };
    a.set_selection(Some(&caret))?;
    b.set_selection(Some(&caret))?;
    a.insert_plain_text_guarded(&a.observe()?, "Local ")?;
    b.insert_plain_text_guarded(&b.observe()?, "Peer🙂")?;
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    let after = a.document_json().to_owned();
    a.undo_guarded(&a.observe()?)?;
    assert!(a.document_json().contains("Peer🙂"));
    a.redo_guarded(&a.observe()?)?;
    assert_eq!(a.document_json(), after);
    let checkpoint = a.checkpoint()?;
    drop(a);
    let mut restored = profile.restore("native-room", &checkpoint)?;
    restored.undo_guarded(&restored.observe()?)?;
    restored.redo_guarded(&restored.observe()?)?;
    assert_eq!(restored.document_json(), after);
    restored.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: "replacement-asset".into(),
        generation: "replacement-generation".into(),
    })])?;
    restored.undo()?;
    assert!(!restored.document_json().contains("replacement-generation"));
    let observed = restored.observe()?;
    let before = (restored.checkpoint()?, restored.update_frame()?);
    let references: Vec<RichAssetReference> =
        restored.retained_asset_references_guarded(&observed)?;
    let encoded: Value =
        serde_json::from_str(&restored.retained_asset_references_json_guarded(&observed)?)?;
    assert_eq!(encoded["format"], "breditor/rich-retained-asset-references");
    assert_eq!(encoded["retention"], "shared-causal");
    assert_eq!(encoded["references"].as_array().map(Vec::len), Some(2));
    assert_eq!(references.len(), 2);
    assert!(references.iter().any(|r| r.asset().as_str() == "replacement-asset"
        && r.generation().as_str() == "replacement-generation"));
    restored.check(&observed)?;
    assert_eq!((restored.checkpoint()?, restored.update_frame()?), before);
    drop(restored);
    let mut recovered = profile.restore("native-room", &before.0)?;
    assert_eq!(recovered.retained_asset_references_guarded(&recovered.observe()?)?, references);
    recovered.redo()?;
    assert!(recovered.document_json().contains("replacement-generation"));
    println!(
        "Independent native configured profile, offline merge, retained image references and recovered future history passed"
    );
    Ok(())
}
