//! Construction-only internals keep deep-tree proof separate from public JSON parser budgets.
use crate::{
    document::{Document, FormatSet, PropertyValue, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichBlockDraft, RichDocument, RichSelection, RichSelectionKind, RichTextPoint,
        actions::RichGeneralRangePlan, drafts::element,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
#[test]
fn iterative_plan_handles_admitted_depth_beyond_default_without_flattening_owners() -> Result {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/deep-range")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default().with_max_node_depth(200));
    let fragment: TextFragment =
        TextRun::try_new("Text", FormatSet::try_from_formats(vec![])?)?.into();
    let intro = BlockId::try_new("intro")?;
    let deep = BlockId::try_new("deep")?;
    let mut nested = RichBlockDraft::paragraph(&deep, &fragment)?.into_node();
    for index in 0..160 {
        nested = element(
            "blockquote",
            vec![("block-id", PropertyValue::from_string(format!("quote-{index}")))],
            vec![nested],
        )?;
    }
    let root = element(
        "document",
        vec![("document-id", PropertyValue::from_string("room"))],
        vec![RichBlockDraft::paragraph(&intro, &fragment)?.into_node(), nested],
    )?;
    let document = RichDocument::try_admit(
        context.schema(),
        Document::try_new(context.schema(), root, context.limits())?,
        context.limits(),
    )?;
    let selection = RichSelection::try_new(
        &document,
        RichSelectionKind::TextRange {
            anchor: RichTextPoint::new(intro, TextOffset::try_new(1)?, Affinity::After),
            focus: RichTextPoint::new(deep, TextOffset::try_new(2)?, Affinity::After),
        },
    )?;
    let plan = RichGeneralRangePlan::capture(&document, &selection, &fragment)?;
    let edit = plan.action(&[])?.apply(&context, &document)?.ok_or("deep edit")?;
    assert!(edit.document().block_path(&BlockId::try_new("quote-0")?).is_some());
    assert_eq!(
        edit.inverse().apply(&context, edit.document())?.ok_or("inverse")?.document().document(),
        document.document()
    );
    Ok(())
}
