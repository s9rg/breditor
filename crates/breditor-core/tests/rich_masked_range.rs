//! Masked expected trees preserve unselected rich text and expose identity-preserving lowering work.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichSelection, RichSelectionKind, RichTextPoint,
        actions::{
            RichActionError, RichGeneralRangeKind, RichGeneralRangePlan,
            RichMaskedGeneralRangePlan, RichMaskedTextSpan,
        },
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn offset(value: u64) -> Result<TextOffset> {
    Ok(TextOffset::try_new(value)?)
}
fn mask(block: &str, start: u64, end: u64) -> Result<RichMaskedTextSpan> {
    Ok(RichMaskedTextSpan::try_new(id(block)?, offset(start)?, offset(end)?)?)
}
fn root(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn setup(root: Value) -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/masked-range")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let mut raw = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/masked-range","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":null});
    raw["root"] = root;
    let codec = DocumentJsonCodecV2::new(context.schema().clone());
    let document = RichDocument::try_admit(
        context.schema(),
        codec.decode(&raw.to_string())?,
        context.limits(),
    )?;
    Ok((context, document))
}
fn range(document: &RichDocument, a: &str, x: u64, b: &str, y: u64) -> Result<RichSelection> {
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::TextRange {
            anchor: RichTextPoint::new(id(a)?, offset(x)?, Affinity::After),
            focus: RichTextPoint::new(id(b)?, offset(y)?, Affinity::Before),
        },
    )?)
}
fn text(value: &str) -> Result<TextFragment> {
    Ok(if value.is_empty() {
        TextFragment::empty()
    } else {
        TextRun::try_new(value, FormatSet::try_from_formats(vec![])?)?.into()
    })
}
fn encoded(c: &EditorContext, d: &RichDocument) -> Result<Value> {
    Ok(serde_json::from_str(&DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?)?)
}
fn find<'a>(value: &'a Value, id: &str) -> Option<&'a Value> {
    if value["properties"]["breditor/block-id"] == id {
        Some(value)
    } else {
        value["children"].as_array()?.iter().find_map(|child| find(child, id))
    }
}
fn body(c: &EditorContext, d: &RichDocument, id: &str) -> Result<String> {
    let raw = encoded(c, d)?;
    Ok(find(&raw["root"], id).ok_or("text block")?["children"]
        .as_array()
        .ok_or("runs")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
fn image(caption: Value) -> Value {
    let mut image = fixture::element("image", "image", vec![caption]);
    image["properties"] = json!({"breditor/block-id":"image","breditor/image-id":"i","breditor/asset-id":"asset","breditor/asset-generation":"generation","breditor/decorative":false,"breditor/alt-text":"Keep metadata"});
    image
}
fn table() -> Value {
    let cells = [
        fixture::paragraph("p0", "aXb"),
        fixture::paragraph("p1", "mYn"),
        image(fixture::paragraph("caption", "xZy")),
    ]
    .into_iter()
    .enumerate()
    .map(|(i, node)| {
        let mut cell = fixture::element("table-cell", &format!("cell{i}"), vec![node]);
        cell["properties"]["breditor/column-id"] = json!(format!("c{i}"));
        cell["properties"]["breditor/header"] = json!(false);
        cell
    })
    .collect();
    let mut row = fixture::element("table-row", "row", cells);
    row["properties"]["breditor/row-id"] = json!("r");
    let mut table = fixture::element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":(0..3).map(|i|json!({"id":format!("c{i}"),"width":120})).collect::<Vec<_>>(),"breditor/merges":[],"breditor/retracted-merges":[]});
    table
}

#[test]
fn joined_masks_keep_intervening_text_and_place_caret_before_it() -> Result {
    let (c, d) = setup(root(vec![fixture::paragraph("p", "aX🙂Yb")]))?;
    let selection = range(&d, "p", 1, "p", 6)?;
    let before = encoded(&c, &d)?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &selection,
        &text("R")?,
        &[mask("p", 2, 4)?, mask("p", 5, 6)?],
    )?;
    assert_eq!(plan.kind(), RichGeneralRangeKind::Joined);
    assert_eq!(plan.joined_text_roots(), [id("p")?]);
    assert_eq!(plan.insertion_start().offset(), offset(1)?);
    assert_eq!(plan.insertion_end()?.offset(), offset(2)?);
    let after = plan.expected_document(&c, &[])?;
    assert_eq!(body(&c, &after, "p")?, "aRXY");
    assert_eq!(encoded(&c, &d)?, before);
    let ordinary = RichGeneralRangePlan::capture(&d, &selection, &text("R")?)?
        .action(&[])?
        .apply(&c, &d)?
        .ok_or("ordinary effect")?
        .document()
        .clone();
    assert_eq!(body(&c, &ordinary, "p")?, "aR");
    Ok(())
}
#[test]
fn joined_paragraphs_expose_all_retained_roots_in_source_order() -> Result {
    let (c, d) = setup(root(vec![
        fixture::paragraph("p", "aXb"),
        fixture::paragraph("mid", "mY🙂"),
        fixture::paragraph("q", "cZd"),
    ]))?;
    let selection = range(&d, "p", 1, "q", 2)?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &selection,
        &text("R")?,
        &[mask("p", 2, 3)?, mask("mid", 0, 1)?, mask("mid", 2, 4)?, mask("q", 0, 1)?],
    )?;
    assert_eq!(plan.joined_text_roots(), [id("p")?, id("mid")?, id("q")?]);
    let after = plan.expected_document(&c, &[])?;
    assert_eq!(body(&c, &after, "p")?, "aRXYZd");
    let raw = encoded(&c, &after)?;
    assert!(find(&raw["root"], "mid").is_none());
    assert!(find(&raw["root"], "q").is_none());
    Ok(())
}
#[test]
fn protected_peer_text_keeps_its_owner_and_removes_an_unnecessary_floor() -> Result {
    let (c, d) = setup(root(vec![table()]))?;
    for backward in [false, true] {
        let selection = if backward {
            range(&d, "caption", 2, "p0", 1)?
        } else {
            range(&d, "p0", 1, "caption", 2)?
        };
        let plan = RichMaskedGeneralRangePlan::capture(
            &d,
            &selection,
            &text("R")?,
            &[mask("p0", 2, 3)?, mask("p1", 0, 1)?, mask("p1", 2, 3)?, mask("caption", 0, 1)?],
        )?;
        assert_eq!(plan.kind(), RichGeneralRangeKind::PreservedBoundaries);
        assert_eq!(plan.empty_blocks().len(), 0);
        assert_eq!(plan.protected_deleted_blocks(), Some([].as_slice()));
        let after = plan.expected_document(&c, &[])?;
        assert_eq!(body(&c, &after, "p0")?, "aRX");
        assert_eq!(body(&c, &after, "p1")?, "Y");
        assert_eq!(body(&c, &after, "caption")?, "Zy");
        let before = encoded(&c, &d)?;
        let after = encoded(&c, &after)?;
        for target in ["table", "image"] {
            assert_eq!(
                find(&before["root"], target).ok_or("before")?["properties"],
                find(&after["root"], target).ok_or("after")?["properties"]
            );
        }
        assert_eq!(
            RichGeneralRangePlan::capture(&d, &selection, &text("R")?)?.empty_blocks().len(),
            1
        );
    }
    Ok(())
}
#[test]
fn truly_empty_protected_bodies_require_exact_fresh_floors_atomically() -> Result {
    let (c, d) = setup(root(vec![table()]))?;
    let selection = range(&d, "p0", 1, "caption", 2)?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &selection,
        &text("R")?,
        &[mask("p0", 2, 3)?, mask("p1", 0, 3)?, mask("caption", 0, 1)?],
    )?;
    assert_eq!(plan.empty_blocks().len(), 1);
    let before = encoded(&c, &d)?;
    assert!(plan.expected_document(&c, &[]).is_err());
    assert!(plan.expected_document(&c, &[id("p1")?]).is_err());
    let after = plan.expected_document(&c, &[id("fresh-floor")?])?;
    assert_eq!(body(&c, &after, "fresh-floor")?, "");
    assert_eq!(encoded(&c, &d)?, before);
    Ok(())
}
#[test]
fn whole_atoms_with_retained_text_refuse_without_flattening_it() -> Result {
    let (c, d) = setup(root(vec![
        fixture::paragraph("p", "ab"),
        image(fixture::paragraph("caption", "xYy")),
        fixture::paragraph("q", "cd"),
    ]))?;
    let selection = range(&d, "p", 1, "q", 1)?;
    let before = encoded(&c, &d)?;
    assert!(matches!(
        RichMaskedGeneralRangePlan::capture(
            &d,
            &selection,
            &text("R")?,
            &[mask("p", 1, 2)?, mask("caption", 0, 1)?, mask("caption", 2, 3)?, mask("q", 0, 1)?]
        ),
        Err(RichActionError::MaskedStructure)
    ));
    assert_eq!(encoded(&c, &d)?, before);
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &selection,
        &text("R")?,
        &[mask("p", 1, 2)?, mask("caption", 0, 3)?, mask("q", 0, 1)?],
    )?;
    assert_eq!(body(&c, &plan.expected_document(&c, &[])?, "p")?, "aRd");
    Ok(())
}
#[test]
fn ordinary_list_joins_keep_selected_peer_text_and_unselected_rich_tails() -> Result {
    let left = fixture::element(
        "list-item",
        "left",
        vec![fixture::paragraph("p", "aXb"), fixture::paragraph("tail-left", "L")],
    );
    let right = fixture::element(
        "list-item",
        "right",
        vec![fixture::paragraph("q", "cYd"), fixture::paragraph("tail-right", "T")],
    );
    let (c, d) = setup(root(vec![fixture::element("bullet-list", "list", vec![left, right])]))?;
    let selection = range(&d, "p", 1, "q", 2)?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &selection,
        &text("R")?,
        &[mask("p", 2, 3)?, mask("q", 0, 1)?],
    )?;
    assert_eq!(plan.kind(), RichGeneralRangeKind::Joined);
    let after = plan.expected_document(&c, &[])?;
    // L is inside the range but outside the removal mask. Joined (unprotected) flow
    // keeps its characters in reading order, while the unselected right tail stays a block.
    assert_eq!(body(&c, &after, "p")?, "aRXLYd");
    assert!(find(&encoded(&c, &after)?["root"], "tail-left").is_none());
    assert_eq!(plan.joined_text_roots(), [id("p")?, id("tail-left")?, id("q")?]);
    assert_eq!(body(&c, &after, "tail-right")?, "T");
    Ok(())
}
#[test]
fn collapsed_empty_masks_leave_a_complete_mixed_document_unchanged() -> Result {
    let (c, d) = setup(fixture::root())?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &d,
        &range(&d, "p-1-1", 1, "p-1-1", 1)?,
        &TextFragment::empty(),
        &[],
    )?;
    assert_eq!(encoded(&c, &plan.expected_document(&c, &[])?)?, encoded(&c, &d)?);
    Ok(())
}
#[test]
fn insertion_stays_at_the_logical_start_even_when_no_original_character_is_there() -> Result {
    let (c, d) = setup(root(vec![fixture::paragraph("p", "abc"), fixture::paragraph("q", "Ycd")]))?;
    let selection = range(&d, "p", 3, "q", 2)?;
    let plan =
        RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &[mask("q", 1, 2)?])?;
    let after = plan.expected_document(&c, &[])?;
    assert_eq!(body(&c, &after, "p")?, "abcRYd");
    assert_eq!(plan.insertion_start().block(), &id("p")?);
    assert_eq!(plan.insertion_end()?.offset(), offset(4)?);
    Ok(())
}
#[test]
fn masks_are_ordered_scalar_aligned_and_inside_the_explicit_selection() -> Result {
    let (_, d) = setup(root(vec![fixture::paragraph("p", "a🙂b")]))?;
    let selection = range(&d, "p", 0, "p", 4)?;
    for masks in [
        vec![mask("p", 0, 3)?, mask("p", 1, 4)?],
        vec![mask("p", 3, 4)?, mask("p", 0, 1)?],
        vec![mask("p", 2, 3)?],
        vec![mask("missing", 0, 1)?],
    ] {
        assert!(RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &masks).is_err());
    }
    assert!(RichMaskedTextSpan::try_new(id("p")?, offset(1)?, offset(1)?).is_err());
    let selection = range(&d, "p", 1, "p", 3)?;
    assert!(
        RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &[mask("p", 0, 1)?])
            .is_err()
    );
    Ok(())
}
#[test]
fn mask_budgets_refuse_complete_work_not_a_truncated_subset() -> Result {
    let (_, d) = setup(root(vec![fixture::paragraph("p", "ab")]))?;
    let selection = range(&d, "p", 0, "p", 2)?;
    let masks = vec![mask("p", 0, 1)?; 4097];
    assert!(matches!(
        RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &masks),
        Err(RichActionError::TooManyActions)
    ));
    let (c, d) = setup(root(vec![fixture::paragraph("p", &"a".repeat(65537))]))?;
    let selection = range(&d, "p", 0, "p", 65537)?;
    assert!(matches!(
        RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &[mask("p", 0, 65537)?]),
        Err(RichActionError::TooManyActions)
    ));
    let selection = range(&d, "p", 0, "p", 65536)?;
    let plan =
        RichMaskedGeneralRangePlan::capture(&d, &selection, &text("R")?, &[mask("p", 0, 65536)?])?;
    assert_eq!(body(&c, &plan.expected_document(&c, &[])?, "p")?, "Ra");
    Ok(())
}
