//! Nested text edits must describe containing roots, never flat paragraph ordinals.
use super::{ProjectionImpact, classify};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    operation::{NestedListReframe, NestedListTextSplice, Operation, TextRange},
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

fn fixture() -> Result<(EditorContext, EditorState), Box<dyn Error>> {
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
        "root":element("breditor/document", vec![list.clone(), paragraph.clone(), list, paragraph])}).to_string();
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&source)?;
    let state =
        EditorState::try_new(&context, LineageId::try_new("nested-impact")?, document, None, None)?;
    Ok((context, state))
}

#[test]
fn nested_text_edit_reports_only_its_containing_root() -> Result<(), Box<dyn Error>> {
    let (context, state) = fixture()?;
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

/// The span must cover every edited root, regardless of operation order, while
/// leaving the intervening and trailing unedited roots byte-for-byte equivalent.
#[test]
fn nested_text_batch_spans_disjoint_roots_and_replays_exactly() -> Result<(), Box<dyn Error>> {
    for roots in [[0, 2], [2, 0]] {
        let (context, state) = fixture()?;
        let mut operations = Vec::new();
        for root in roots {
            let range = TextRange::try_new(
                NodePath::try_from_indices(vec![root, 0, 1, 0, 0])?,
                TextOffset::try_new(0)?,
                TextOffset::try_new(0)?,
            )?;
            operations.push(Operation::NestedListTextSplice(NestedListTextSplice::capture(
                &context,
                state.document(),
                range,
                TextFragment::from(TextRun::try_new("日本🦀", FormatSet::default())?),
            )?));
        }
        let commit = Transaction::new(&state, operations)
            .apply(&context, &state)?
            .into_commit()
            .ok_or("unchanged batch")?;
        assert_eq!(classify(&commit).root_splice(), Some((0, 3, 0, 3)));
        for root in [1, 3] {
            let path = NodePath::try_from_indices(vec![root])?;
            assert_eq!(state.document().node_at(&path)?, commit.after().document().node_at(&path)?);
        }
        let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec())
            .apply(&context, commit.after())?
            .into_commit()
            .ok_or("unchanged batch inverse")?;
        assert_eq!(classify(&inverse).root_splice(), Some((0, 3, 0, 3)));
        assert_eq!(inverse.after().document(), state.document());
        let replay = Transaction::new(inverse.after(), commit.forward_operations().to_vec())
            .apply(&context, inverse.after())?
            .into_commit()
            .ok_or("unchanged batch replay")?;
        assert_eq!(classify(&replay).root_splice(), Some((0, 3, 0, 3)));
        assert_eq!(replay.after().document(), commit.after().document());
    }
    Ok(())
}

/// A text-only root span cannot describe a second operation that shifts roots.
/// Both operation orders must fall back to a full update, including inverse/replay.
#[test]
fn mixed_nested_text_and_reframe_never_claim_text_only_impact() -> Result<(), Box<dyn Error>> {
    for reframe_first in [false, true] {
        let (context, state) = fixture()?;
        let text = Operation::NestedListTextSplice(NestedListTextSplice::capture(
            &context,
            state.document(),
            TextRange::try_new(
                NodePath::try_from_indices(vec![0, 0, 1, 0, 0])?,
                TextOffset::try_new(0)?,
                TextOffset::try_new(0)?,
            )?,
            TextFragment::from(TextRun::try_new("日本🦀", FormatSet::default())?),
        )?);
        let replacement = [vec![2, 0, 0], vec![2, 0, 1, 0, 0]]
            .into_iter()
            .map(|path| Ok(state.document().node_at(&NodePath::try_from_indices(path)?)?.clone()))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
        let reframe = Operation::NestedListReframe(NestedListReframe::capture(
            &context,
            state.document(),
            2,
            1,
            replacement,
        )?);
        let operations = if reframe_first { vec![reframe, text] } else { vec![text, reframe] };
        let commit = Transaction::new(&state, operations)
            .apply(&context, &state)?
            .into_commit()
            .ok_or("unchanged mixed batch")?;
        assert!(matches!(classify(&commit), ProjectionImpact::Root));
        let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec())
            .apply(&context, commit.after())?
            .into_commit()
            .ok_or("unchanged inverse")?;
        assert!(matches!(classify(&inverse), ProjectionImpact::Root));
        assert_eq!(inverse.after().document(), state.document());
        let replay = Transaction::new(inverse.after(), commit.forward_operations().to_vec())
            .apply(&context, inverse.after())?
            .into_commit()
            .ok_or("unchanged replay")?;
        assert!(matches!(classify(&replay), ProjectionImpact::Root));
        assert_eq!(replay.after().document(), commit.after().document());
    }
    Ok(())
}
