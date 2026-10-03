//! Shared, typed heading fixtures for experimental codec contracts.
use crate::{
    block::{HeadingLevel, TextBlockKind},
    document::{
        Document, ElementNode, Format, FormatSet, NodeRef, PropertyInteger, PropertyMap,
        PropertyValue, TextNode,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextBlockKindChange},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
};
use std::error::Error;

pub(crate) type TestResult = Result<(), Box<dyn Error>>;

pub(crate) fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    Ok(QualifiedName::try_new(value)?)
}
pub(crate) fn heading(rank: u32) -> Result<TextBlockKind, Box<dyn Error>> {
    Ok(TextBlockKind::Heading(HeadingLevel::try_new(rank)?))
}
pub(crate) fn extensions() -> Result<ExtensionSet, Box<dyn Error>> {
    let kind = name("example/link")?;
    let contract = InlineFormatPropertyContractV1::try_new(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name("example/href")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 2048)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    Ok(ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?)
}
pub(crate) fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    let schema = CompiledSchema::try_compile_text_block_profile(
        SchemaId::new(name("example/headings")?, SchemaVersion::one()),
        &extensions()?,
    )?;
    Ok(EditorContext::new(schema, limits))
}
pub(crate) fn formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![
        Format::new(name("breditor/strong")?, PropertyMap::default()),
        Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string("https://example.com/🙂"),
            )])?,
        ),
    ])?)
}
pub(crate) fn block(
    kind: TextBlockKind,
    text: &str,
    formats: FormatSet,
) -> Result<NodeRef, Box<dyn Error>> {
    let (kind, properties) = match kind {
        TextBlockKind::Paragraph => ("breditor/paragraph", PropertyMap::default()),
        TextBlockKind::Heading(level) => (
            "breditor/heading",
            PropertyMap::try_from_sorted(vec![(
                name("breditor/level")?,
                PropertyValue::from_integer(PropertyInteger::try_new(i64::from(level.get()))?),
            )])?,
        ),
    };
    let children = if text.is_empty() {
        vec![]
    } else {
        vec![NodeRef::text(TextNode::try_new(text.to_owned(), formats)?)]
    };
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, properties, children)?))
}
pub(crate) fn state(
    context: &EditorContext,
    blocks: Vec<NodeRef>,
    selection: impl Into<Option<Selection>>,
    pending: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let root = NodeRef::element(ElementNode::try_new(
        name("breditor/document")?,
        None,
        PropertyMap::default(),
        blocks,
    )?);
    let document = Document::try_new(context.schema(), root, context.limits())?;
    Ok(EditorState::try_new(
        context,
        LineageId::try_new("heading-tests")?,
        document,
        selection.into(),
        pending,
    )?)
}

pub(crate) fn fixture() -> Result<(EditorContext, EditorState, Operation), Box<dyn Error>> {
    let context = context(DocumentLimits::default())?;
    let selected = Selection::Range(RangeSelection::new(
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::Before,
        },
        Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::Before,
        },
    ));
    let state = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "a🙂e\u{301}", formats()?)?],
        selected,
        Some(formats()?),
    )?;
    let operation = Operation::TextBlockKindChange(TextBlockKindChange::capture(
        &context,
        state.document(),
        0..1,
        heading(2)?,
    )?);
    Ok((context, state, operation))
}
