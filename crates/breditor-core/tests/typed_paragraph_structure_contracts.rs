//! Typed-property contracts for direct-root paragraph structure operations.

mod support;

use std::error::Error;

use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{
        Operation, OperationFragmentSliceRole, OperationKind, OperationValidationError,
        ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextFragmentRole, RootTextRange,
        RootTextReplace, RootTextReplaceApplyError,
    },
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use serde_json::{Value, json};
use support::{TestResult, test_error};

const LINK_FORMAT: &str = "example/link";
const HREF_PROPERTY: &str = "example/href";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_schema(id: &str) -> Result<CompiledSchema, Box<dyn Error>> {
    let format_kind = name(LINK_FORMAT)?;
    let contract = InlineFormatPropertyContractV1::try_new(
        format_kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name(HREF_PROPERTY)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 64)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/typed-paragraph-structure")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(format_kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name(id)?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn link_formats(href: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties = PropertyMap::try_from_sorted(vec![(
        name(HREF_PROPERTY)?,
        PropertyValue::from_string(href),
    )])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK_FORMAT)?, properties)])
        .map_err(Into::into)
}

fn typed_fragment(text: &str, href: &str) -> Result<TextFragment, Box<dyn Error>> {
    Ok(TextFragment::from(TextRun::try_new(text, link_formats(href)?)?))
}

fn fragment(runs: &[(&str, &str)]) -> Result<TextFragment, Box<dyn Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, href)| TextRun::try_new(*text, link_formats(href)?).map_err(Into::into))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?,
    )
    .map_err(Into::into)
}

fn text_node(text: &str, href: Option<&str>) -> Value {
    let formats = href.map_or_else(Vec::new, |href| {
        vec![json!({
            "type": LINK_FORMAT,
            "properties": { HREF_PROPERTY: href },
        })]
    });
    json!({ "kind": "text", "text": text, "formats": formats })
}

fn state(
    context: &EditorContext,
    lineage: &str,
    paragraphs: &[Vec<(&str, Option<&str>)>],
) -> Result<EditorState, Box<dyn Error>> {
    let paragraphs = paragraphs
        .iter()
        .map(|runs| {
            json!({
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": runs
                    .iter()
                    .map(|(text, href)| text_node(text, *href))
                    .collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    let encoded = json!({
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
        .decode(&encoded)?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn paragraph_fragment(document: &Document, index: u32) -> Result<TextFragment, Box<dyn Error>> {
    let path = NodePath::try_from_indices(vec![index])?;
    let paragraph = document
        .node_at(&path)?
        .as_element()
        .ok_or_else(|| test_error("paragraph path did not resolve to an element"))?;
    let runs = paragraph
        .children()
        .iter()
        .map(|child| {
            let text = child
                .as_text()
                .ok_or_else(|| test_error("paragraph child did not resolve to text"))?;
            TextRun::try_new(text.text().to_owned(), text.formats().clone()).map_err(Into::into)
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    TextFragment::try_from_runs(runs).map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn boundary(paragraph: u32, value: u64) -> Result<RootTextBoundary, Box<dyn Error>> {
    RootTextBoundary::try_new(NodePath::try_from_indices(vec![paragraph])?, offset(value)?)
        .map_err(Into::into)
}

#[test]
fn split_join_and_root_replace_preserve_typed_properties_through_exact_replay() -> TestResult {
    let schema = typed_schema("example/typed-structure-replay")?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let initial = state(&context, "typed-split", &[vec![("abcd", Some("a"))]])?;

    let split = ParagraphSplit::capture(
        &context,
        initial.document(),
        NodePath::try_from_indices(vec![0])?,
        offset(2)?,
    )?;
    let split_operation: Operation = split.into();
    assert_eq!(split_operation.validate(&context), Ok(()));
    let split_commit =
        committed(Transaction::new(&initial, vec![split_operation]).apply(&context, &initial)?)?;
    assert_eq!(paragraph_fragment(split_commit.after().document(), 0)?, typed_fragment("ab", "a")?);
    assert_eq!(paragraph_fragment(split_commit.after().document(), 1)?, typed_fragment("cd", "a")?);
    assert_eq!(split_commit.after().document().summary().property_value_count(), 2);
    assert_eq!(split_commit.after().document().summary().total_property_string_bytes(), 2);

    let split_undo = committed(
        split_commit
            .undo_transaction(split_commit.after())?
            .apply(&context, split_commit.after())?,
    )?;
    assert_eq!(split_undo.after().document(), initial.document());

    let join = ParagraphJoin::capture(
        &context,
        split_commit.after().document(),
        NodePath::try_from_indices(vec![0])?,
    )?;
    let join_operation: Operation = join.into();
    assert_eq!(join_operation.validate(&context), Ok(()));
    let join_commit = committed(
        Transaction::new(split_commit.after(), vec![join_operation])
            .apply(&context, split_commit.after())?,
    )?;
    assert_eq!(join_commit.after().document(), initial.document());
    let join_undo = committed(
        join_commit.undo_transaction(join_commit.after())?.apply(&context, join_commit.after())?,
    )?;
    assert_eq!(join_undo.after().document(), split_commit.after().document());

    let root_initial =
        state(&context, "typed-root-replace", &[vec![("ab", Some("a"))], vec![("cd", Some("b"))]])?;
    let range = RootTextRange::try_new(boundary(0, 1)?, boundary(1, 1)?)?;
    let replacement = typed_fragment("X", "c")?;
    let replace =
        RootTextReplace::capture(&context, root_initial.document(), range, vec![replacement])?;
    let replace_operation: Operation = replace.into();
    assert_eq!(replace_operation.validate(&context), Ok(()));
    let replace_commit = committed(
        Transaction::new(&root_initial, vec![replace_operation]).apply(&context, &root_initial)?,
    )?;
    assert_eq!(
        paragraph_fragment(replace_commit.after().document(), 0)?,
        fragment(&[("a", "a"), ("X", "c"), ("d", "b")])?
    );
    assert_eq!(replace_commit.after().document().summary().property_value_count(), 3);
    assert_eq!(replace_commit.after().document().summary().total_property_string_bytes(), 3);
    let replace_undo = committed(
        replace_commit
            .undo_transaction(replace_commit.after())?
            .apply(&context, replace_commit.after())?,
    )?;
    assert_eq!(replace_undo.after().document(), root_initial.document());
    let replace_redo = committed(
        replace_commit
            .redo_transaction(replace_undo.after())?
            .apply(&context, replace_undo.after())?,
    )?;
    assert_eq!(replace_redo.after().document(), replace_commit.after().document());
    Ok(())
}

#[test]
fn structural_validation_accounts_for_typed_properties_across_whole_slices() -> TestResult {
    let schema = typed_schema("example/typed-structure-budgets")?;
    let value_limited =
        EditorContext::new(schema.clone(), DocumentLimits::default().with_max_property_values(1));

    let split: Operation = ParagraphSplit::try_new(
        NodePath::try_from_indices(vec![0])?,
        offset(1)?,
        typed_fragment("ab", "a")?,
    )?
    .into();
    assert_eq!(
        split.validate(&value_limited),
        Err(OperationValidationError::TotalPropertyValueCountLimit {
            kind: OperationKind::ParagraphSplit,
            role: OperationFragmentSliceRole::Result,
            actual: 2,
            maximum: 1,
        })
    );

    let join: Operation = ParagraphJoin::try_new(
        NodePath::try_from_indices(vec![0])?,
        typed_fragment("a", "a")?,
        typed_fragment("b", "b")?,
    )?
    .into();
    assert_eq!(
        join.validate(&value_limited),
        Err(OperationValidationError::TotalPropertyValueCountLimit {
            kind: OperationKind::ParagraphJoin,
            role: OperationFragmentSliceRole::Source,
            actual: 2,
            maximum: 1,
        })
    );

    let range = RootTextRange::try_new(boundary(0, 0)?, boundary(1, 1)?)?;
    let root: Operation = RootTextReplace::try_new(
        range,
        vec![typed_fragment("a", "a")?, typed_fragment("b", "b")?],
        vec![TextFragment::empty()],
    )?
    .into();
    assert_eq!(
        root.validate(&value_limited),
        Err(OperationValidationError::TotalPropertyValueCountLimit {
            kind: OperationKind::RootTextReplace,
            role: OperationFragmentSliceRole::Expected,
            actual: 2,
            maximum: 1,
        })
    );

    let derived_result_limited =
        EditorContext::new(schema, DocumentLimits::default().with_max_property_values(2));
    let derived_result: Operation = RootTextReplace::try_new(
        RootTextRange::try_new(boundary(0, 1)?, boundary(0, 2)?)?,
        vec![typed_fragment("abc", "source")?],
        vec![typed_fragment("X", "replacement-left")?, typed_fragment("Y", "replacement-right")?],
    )?
    .into();
    assert_eq!(
        derived_result.validate(&derived_result_limited),
        Err(OperationValidationError::TotalPropertyValueCountLimit {
            kind: OperationKind::RootTextReplace,
            role: OperationFragmentSliceRole::Result,
            actual: 4,
            maximum: 2,
        })
    );
    Ok(())
}

#[test]
fn root_replace_validates_typed_instances_and_aggregate_replacement_budgets() -> TestResult {
    let schema = typed_schema("example/typed-root-validation")?;
    let value_limited =
        EditorContext::new(schema.clone(), DocumentLimits::default().with_max_property_values(1));
    let value_state = state(&value_limited, "typed-root-value-budget", &[vec![("z", None)]])?;
    let collapsed = RootTextRange::try_new(boundary(0, 0)?, boundary(0, 0)?)?;
    assert!(matches!(
        RootTextReplace::capture(
            &value_limited,
            value_state.document(),
            collapsed.clone(),
            vec![typed_fragment("a", "a")?, typed_fragment("b", "b")?],
        ),
        Err(RootTextReplaceApplyError::PropertyValueCountLimit {
            role: RootTextFragmentRole::Replacement,
            actual: 2,
            maximum: 1,
        })
    ));

    let string_limited = EditorContext::new(
        schema.clone(),
        DocumentLimits::default().with_max_total_property_string_bytes(1),
    );
    let string_state = state(&string_limited, "typed-root-string-budget", &[vec![("z", None)]])?;
    assert!(matches!(
        RootTextReplace::capture(
            &string_limited,
            string_state.document(),
            collapsed.clone(),
            vec![typed_fragment("a", "a")?, typed_fragment("b", "b")?],
        ),
        Err(RootTextReplaceApplyError::PropertyStringBytesLimit {
            role: RootTextFragmentRole::Replacement,
            actual: 2,
            maximum: 1,
        })
    ));

    let context = EditorContext::new(schema, DocumentLimits::default());
    let invalid_state = state(&context, "typed-root-invalid-instance", &[vec![("z", None)]])?;
    let invalid_formats =
        FormatSet::try_from_formats(vec![Format::new(name(LINK_FORMAT)?, PropertyMap::default())])?;
    let invalid = TextFragment::from(TextRun::try_new("x", invalid_formats)?);
    assert!(matches!(
        RootTextReplace::capture(&context, invalid_state.document(), collapsed, vec![invalid],),
        Err(RootTextReplaceApplyError::InvalidFormatInstance {
            role: RootTextFragmentRole::Replacement,
            paragraph_index: 0,
            run_index: 0,
            format_index: 0,
            ..
        })
    ));
    Ok(())
}
