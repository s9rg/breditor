//! Operation contracts for sealed base-text profiles with extension formats.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{DocumentJsonCodecV2, OperationJsonCodecV2},
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1,
    },
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace,
        TextRange, TextSplice,
    },
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use serde_json::{Value, json};
use support::{TestResult, test_error};

const EMPHASIS: &str = "example/emphasis";

fn profile() -> Result<CompiledSchema, Box<dyn Error>> {
    let manifest = ExtensionManifest::try_new_with_inline_formats(
        ExtensionId::new(
            QualifiedName::try_new("example/emphasis-extension")?,
            ExtensionVersion::try_new(1)?,
        ),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(
            QualifiedName::try_new(EMPHASIS)?,
            PersistedTypeRevision::one(),
        )],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(
            QualifiedName::try_new("example/operation-profile")?,
            SchemaVersion::try_new(1)?,
        ),
        &extensions,
    )
    .map_err(Into::into)
}

fn text_node(text: &str, formats: &[&str]) -> Value {
    json!({
        "kind": "text",
        "text": text,
        "formats": formats
            .iter()
            .map(|kind| json!({ "type": kind, "properties": {} }))
            .collect::<Vec<_>>(),
    })
}

fn paragraph(children: &[Value]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": children,
    })
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let input = json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": context.schema().id().name().as_str(),
            "version": context.schema().id().version().get(),
        },
        "schemaFingerprint": context.schema().fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": paragraphs,
        },
    })
    .to_string();
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&input)?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn path(index: u32) -> Result<NodePath, Box<dyn Error>> {
    NodePath::try_from_indices(vec![index]).map_err(Into::into)
}

fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn root_range(
    start_paragraph: u32,
    start_offset: u64,
    end_paragraph: u32,
    end_offset: u64,
) -> Result<RootTextRange, Box<dyn Error>> {
    RootTextRange::try_new(
        RootTextBoundary::try_new(path(start_paragraph)?, offset(start_offset)?)?,
        RootTextBoundary::try_new(path(end_paragraph)?, offset(end_offset)?)?,
    )
    .map_err(Into::into)
}

fn fragment(text: &str, kinds: &[&str]) -> Result<TextFragment, Box<dyn Error>> {
    let formats = kinds
        .iter()
        .map(|kind| {
            QualifiedName::try_new(kind)
                .map(|kind| Format::new(kind, PropertyMap::default()))
                .map_err(Into::into)
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let formats = FormatSet::try_from_formats(formats)?;
    TextRun::try_new(text, formats).map(TextFragment::from).map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn apply_and_restore(
    context: &EditorContext,
    before: &EditorState,
    operation: Operation,
) -> Result<Commit, Box<dyn Error>> {
    operation.validate(context)?;
    let commit = committed(Transaction::new(before, vec![operation]).apply(context, before)?)?;
    for inverse in commit.inverse_operations() {
        inverse.validate(context)?;
    }
    let restored = committed(
        Transaction::new(commit.after(), commit.inverse_operations().to_vec())
            .apply(context, commit.after())?,
    )?;
    assert_eq!(restored.after().document(), before.document());
    Ok(commit)
}

fn assert_operation_v2_round_trip(
    context: &EditorContext,
    operation: &Operation,
) -> Result<(), Box<dyn Error>> {
    let codec = OperationJsonCodecV2::new(context.clone());
    let encoded = codec.encode(operation)?;
    assert!(encoded.contains(EMPHASIS));
    assert_eq!(codec.decode(&encoded)?, *operation);
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);
    Ok(())
}

fn assert_has_format(document: &Document, kind: &QualifiedName) -> TestResult {
    let root = document.root().as_element().ok_or_else(|| test_error("root was not an element"))?;
    let found = root.children().iter().any(|paragraph| {
        paragraph.as_element().is_some_and(|paragraph| {
            paragraph
                .children()
                .iter()
                .any(|child| child.as_text().is_some_and(|text| text.formats().get(kind).is_some()))
        })
    });
    assert!(found, "document lost expected format {kind}");
    Ok(())
}

#[test]
fn all_four_operations_accept_preserve_and_exactly_invert_extension_formats() -> TestResult {
    let schema = profile()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let emphasis = QualifiedName::try_new(EMPHASIS)?;

    let splice_source =
        state(&context, &[paragraph(&[text_node("ab", &[EMPHASIS])])], "extension-format-splice")?;
    let splice = TextSplice::capture(
        &context,
        splice_source.document(),
        TextRange::try_new(path(0)?, offset(1)?, offset(1)?)?,
        fragment("X", &["breditor/strong", EMPHASIS])?,
    )?;
    let splice = Operation::from(splice);
    assert_operation_v2_round_trip(&context, &splice)?;
    let splice_commit = apply_and_restore(&context, &splice_source, splice)?;
    assert_has_format(splice_commit.after().document(), &emphasis)?;

    let split_source =
        state(&context, &[paragraph(&[text_node("a😀b", &[EMPHASIS])])], "extension-format-split")?;
    let split = ParagraphSplit::capture(&context, split_source.document(), path(0)?, offset(3)?)?;
    let split_commit = apply_and_restore(&context, &split_source, split.into())?;
    assert_has_format(split_commit.after().document(), &emphasis)?;

    let join_source = state(
        &context,
        &[paragraph(&[text_node("ab", &[EMPHASIS])]), paragraph(&[text_node("cd", &[EMPHASIS])])],
        "extension-format-join",
    )?;
    let join = ParagraphJoin::capture(&context, join_source.document(), path(0)?)?;
    let join_commit = apply_and_restore(&context, &join_source, join.into())?;
    assert_has_format(join_commit.after().document(), &emphasis)?;

    let replace_source = state(
        &context,
        &[paragraph(&[text_node("ab", &[EMPHASIS])]), paragraph(&[text_node("cd", &[EMPHASIS])])],
        "extension-format-root-replace",
    )?;
    let replace = RootTextReplace::capture(
        &context,
        replace_source.document(),
        root_range(0, 1, 1, 1)?,
        vec![fragment("Z", &["breditor/strong", EMPHASIS])?],
    )?;
    let replace = Operation::from(replace);
    assert_operation_v2_round_trip(&context, &replace)?;
    let replace_commit = apply_and_restore(&context, &replace_source, replace)?;
    assert_has_format(replace_commit.after().document(), &emphasis)?;
    Ok(())
}
