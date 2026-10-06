//! Nested text edits must describe containing roots, never flat paragraph ordinals.
use super::{ProjectionImpact, classify};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    operation::{NestedListTextSplice, Operation, TextRange},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::{EditorContext, EditorState, LineageId},
    transaction::Transaction,
};
use std::error::Error;

fn element(kind: &str, children: Vec<serde_json::Value>) -> serde_json::Value {
    let mut value =
        serde_json::json!({"kind":"element", "type":kind, "entityId":null, "properties":{}});
    value["children"] = serde_json::Value::Array(children);
    value
}

#[test]
fn nested_text_edit_reports_only_its_containing_root() -> Result<(), Box<dyn Error>> {
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_nested_list_profile(
        SchemaId::new(QualifiedName::try_new("test/nested-impact")?, SchemaVersion::try_new(1)?),
        &extensions,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let paragraph = element("breditor/paragraph", vec![]);
    let nested = element(
        "breditor/bullet-list",
        vec![element("breditor/list-item", vec![paragraph.clone()])],
    );
    let list = element(
        "breditor/bullet-list",
        vec![element("breditor/list-item", vec![paragraph.clone(), nested])],
    );
    let source = serde_json::json!({"format":"breditor/document", "formatVersion":2,
        "schema":{"name":"test/nested-impact", "version":1}, "schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":element("breditor/document", vec![list, paragraph])}).to_string();
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&source)?;
    let state =
        EditorState::try_new(&context, LineageId::try_new("nested-impact")?, document, None, None)?;
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0, 0, 1, 0, 0])?,
        TextOffset::try_new(0)?,
        TextOffset::try_new(0)?,
    )?;
    let operation = NestedListTextSplice::capture(
        &context,
        state.document(),
        range,
        TextFragment::from(TextRun::try_new("X", FormatSet::default())?),
    )?;
    let commit = Transaction::new(&state, vec![Operation::NestedListTextSplice(operation)])
        .apply(&context, &state)?
        .into_commit()
        .ok_or("unchanged")?;
    assert!(matches!(
        classify(&commit),
        ProjectionImpact::RootSplice { old_start: 0, old_end: 1, new_start: 0, new_end: 1 }
    ));
    let untouched = NodePath::try_from_indices(vec![1])?;
    assert_eq!(
        state.document().node_at(&untouched)?,
        commit.after().document().node_at(&untouched)?
    );
    let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec())
        .apply(&context, commit.after())?
        .into_commit()
        .ok_or("inverse unchanged")?;
    assert!(matches!(
        classify(&inverse),
        ProjectionImpact::RootSplice { old_start: 0, old_end: 1, new_start: 0, new_end: 1 }
    ));
    assert_eq!(inverse.after().document(), state.document());
    Ok(())
}
