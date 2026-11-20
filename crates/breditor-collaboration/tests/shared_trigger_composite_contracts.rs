//! Shared slash-command shape: an ordered `{commands:[...]}` batch removing the typed trigger and
//! then converting the block is already ONE writer-local history group (no new shared command).
use breditor_collaboration::rich_replica::{
    Command, RichReplica,
    actions::{DeleteText, InsertText, SetHeading},
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

fn replica() -> Result<RichReplica, Box<dyn std::error::Error>> {
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    Ok(RichReplica::new(codec, &input, "1".into())?)
}
fn p(owner: &RichReplica) -> Result<Value, Box<dyn std::error::Error>> {
    let value: Value = serde_json::from_str(owner.document_json())?;
    Ok(value.pointer("/root/children/0/children/0/children/0/children/0").ok_or("p")?.clone())
}

fn text(p: &Value) -> String {
    p["children"].as_array().into_iter().flatten().filter_map(|run| run["text"].as_str()).collect()
}

#[test]
fn trigger_removal_and_heading_in_one_batch_undo_and_redo_as_one_group() -> TestResult {
    let mut a = replica()?;
    // "a🙂b" is four UTF-16 units; the typed `/h` trigger is its own earlier group.
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 4,
        text: "/h".into(),
    })])?;
    let typed = p(&a)?;
    assert_eq!(text(&typed), "a🙂b/h");
    let groups = a.undo_count();
    a.apply(vec![
        Command::DeleteText(DeleteText { block: "p".into(), offset: 4, length: 2 }),
        Command::SetHeading(SetHeading { block: "p".into(), level: Some(1) }),
    ])?;
    let converted = p(&a)?;
    assert_eq!(converted["type"], "breditor/heading");
    assert_eq!(text(&converted), "a🙂b");
    assert_eq!(a.undo_count(), groups + 1);
    // One Undo restores the typed trigger and the paragraph; a second removes the typing.
    a.undo()?;
    assert_eq!(p(&a)?, typed);
    a.redo()?;
    assert_eq!(p(&a)?, converted);
    a.undo()?;
    a.undo()?;
    assert_eq!(text(&p(&a)?), "a🙂b");
    assert_eq!(p(&a)?["type"], "breditor/paragraph");
    Ok(())
}
