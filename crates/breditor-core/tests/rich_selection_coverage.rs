//! Coverage and selection-level formatting across real protected and transparent structures.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, RichCoverageDomain, RichCoverageExtent, RichDocument,
        RichInlineFormatState, RichLocalOutcome, RichLocalSession, RichSelection,
        RichSelectionCoverage, RichSelectionError, RichSelectionFormatChange, RichSelectionKind,
        RichTextPoint, RowId, TableId, inspect_inline_format, inspect_selection_format,
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(s: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(s)?)
}
fn caret(id: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(a: &str, start: u64, b: &str, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: caret(a, start)?, focus: caret(b, end)? })
}
fn cell(r: u32, c: u32) -> Result<CellId> {
    Ok(CellId::new(
        TableId::try_new("t")?,
        RowId::try_new(format!("r{r}"))?,
        ColumnId::try_new(format!("c{c}"))?,
    ))
}
fn setup() -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(
        SchemaId::new(QualifiedName::try_new("example/coverage")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/coverage","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    Ok((context, document))
}
fn cover(d: &RichDocument, s: RichSelectionKind) -> Result<RichSelectionCoverage> {
    Ok(RichSelectionCoverage::capture(d, &RichSelection::try_new(d, s)?)?)
}
fn bold() -> Result<Format> {
    Ok(Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::try_from_sorted(vec![])?,
    ))
}
fn saved(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
#[test]
fn cross_container_text_coverage_preserves_direction_topology_and_scalar_fragments() -> Result {
    let (_, d) = setup()?;
    let forward = cover(&d, range("z-intro", 1, "q2", 2)?)?;
    let backward = cover(&d, range("q2", 2, "z-intro", 1)?)?;
    assert_eq!(forward.nodes(), backward.nodes());
    assert_eq!(forward.text(), backward.text());
    assert_eq!(forward.is_backward(), Some(false));
    assert_eq!(backward.is_backward(), Some(true));
    assert_eq!(forward.text().first().ok_or("first")?.block().as_str(), "z-intro");
    assert_eq!(forward.text().first().ok_or("first")?.start().get(), 1);
    assert_eq!(forward.text().last().ok_or("last")?.block().as_str(), "q2");
    assert_eq!(forward.text().last().ok_or("last")?.end().get(), 2);
    let table = forward.nodes().iter().find(|n| n.block().as_str() == "table").ok_or("table")?;
    assert_eq!(table.extent(), RichCoverageExtent::Whole);
    assert_eq!(
        forward.nodes().iter().find(|n| n.block().as_str() == "quote").ok_or("quote")?.extent(),
        RichCoverageExtent::Partial
    );
    assert!(
        forward
            .nodes()
            .iter()
            .all(|n| n.block().as_str() != "lead" && n.block().as_str() != "list")
    );
    assert_eq!(forward.text().len(), 16);
    assert_eq!(forward.selected_utf16(), 62);
    Ok(())
}
#[test]
fn caption_and_source_cell_domains_are_not_flattened_or_repeated() -> Result {
    let (_, d) = setup()?;
    let c = cover(&d, range("p-2-0", 1, "caption", 4)?)?;
    let s = c.text();
    assert_eq!(s.len(), 3);
    assert_eq!(s[0].domain(), &RichCoverageDomain::Cell(cell(2, 0)?));
    assert_eq!(s[1].domain(), &RichCoverageDomain::Cell(cell(2, 1)?));
    assert_eq!(s[2].domain(), &RichCoverageDomain::Caption(id("image")?));
    assert_eq!(
        c.nodes().iter().find(|n| n.block().as_str() == "image").ok_or("image")?.extent(),
        RichCoverageExtent::Partial
    );
    let n = cover(&d, RichSelectionKind::Node(id("image")?))?;
    assert_eq!(n.text().len(), 1);
    assert_eq!(n.text()[0].block().as_str(), "caption");
    assert_eq!(
        n.nodes().iter().find(|n| n.block().as_str() == "image").ok_or("image")?.extent(),
        RichCoverageExtent::Whole
    );
    assert!(!n.text().iter().any(|s| s.block().as_str() == "p-2-1"));
    Ok(())
}
#[test]
fn merge_closed_grid_coverage_includes_every_base_body_once_without_intervening_cells() -> Result {
    let (_, d) = setup()?;
    let c = cover(&d, RichSelectionKind::Grid { anchor: cell(1, 1)?, focus: cell(1, 1)? })?;
    assert_eq!(
        c.text().iter().map(|s| s.block().as_str()).collect::<Vec<_>>(),
        vec!["p-0-0", "p-0-1", "p-1-0", "p-1-1"]
    );
    assert_eq!(c.selected_utf16(), 16);
    assert_eq!(
        c.nodes().iter().find(|n| n.block().as_str() == "table").ok_or("table")?.extent(),
        RichCoverageExtent::Partial
    );
    assert_eq!(c.nodes().iter().filter(|n| n.kind().as_str() == "breditor/table-cell").count(), 4);
    Ok(())
}
#[test]
fn document_coverage_includes_unreachable_atoms_hidden_tables_empty_blocks_and_code() -> Result {
    let (_, d) = setup()?;
    let c = RichSelectionCoverage::document(&d)?;
    assert!(c.selection().is_none());
    assert_eq!(c.nodes().first().ok_or("first")?.block().as_str(), "lead");
    assert_eq!(c.nodes().last().ok_or("last")?.block().as_str(), "hidden");
    assert!(c.nodes().last().ok_or("hidden")?.is_hidden_table());
    assert!(c.nodes().iter().all(|n| n.extent() == RichCoverageExtent::Whole));
    assert_eq!(
        c.text().iter().find(|s| s.block().as_str() == "empty").ok_or("empty")?.start(),
        TextOffset::ZERO
    );
    assert!(c.text().iter().any(|s| s.kind().as_str() == "breditor/code-block"));
    assert!(RichSelection::try_new(&d, RichSelectionKind::Node(id("hidden")?)).is_err());
    Ok(())
}
#[test]
fn stale_foreign_and_half_surrogate_inputs_cannot_create_plausible_coverage() -> Result {
    let (c, d) = setup()?;
    let proof = RichSelection::try_new(&d, range("z-intro", 1, "q2", 2)?)?;
    let coverage = RichSelectionCoverage::capture(&d, &proof)?;
    let codec = DocumentJsonCodecV2::new(c.schema().clone());
    let json = codec.encode(d.document())?;
    let equal = RichDocument::try_admit(c.schema(), codec.decode(&json)?, c.limits())?;
    coverage.validate_document(&equal)?;
    let mut raw: Value = serde_json::from_str(&json)?;
    raw["root"]["properties"]["breditor/document-id"] = json!("foreign");
    let foreign = RichDocument::try_admit(c.schema(), codec.decode(&raw.to_string())?, c.limits())?;
    assert_eq!(coverage.validate_document(&foreign), Err(RichSelectionError::Binding));
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(range("z-intro", 1, "z-intro", 1)?),
        HistoryCapacity::default(),
    )?;
    a.insert_plain_text(&a.snapshot(), "Q")?;
    assert_eq!(
        coverage.validate_document(a.state().document()),
        Err(RichSelectionError::StaleSnapshot)
    );
    assert!(RichSelectionCoverage::capture(a.state().document(), &proof).is_err());
    assert!(RichSelection::try_new(&equal, range("z-intro", 2, "q2", 2)?).is_err());
    Ok(())
}
#[test]
fn native_formatting_owns_cross_container_node_and_grid_targets_and_exact_history() -> Result {
    for s in [
        range("q1", 1, "task-head", 2)?,
        RichSelectionKind::Node(id("list")?),
        RichSelectionKind::Node(id("image")?),
        RichSelectionKind::Grid { anchor: cell(1, 1)?, focus: cell(1, 1)? },
    ] {
        for natural in [false, true] {
            let (c, d) = setup()?;
            let before = d.document().clone();
            let mut a = RichLocalSession::try_new(
                c.clone(),
                d,
                Some(s.clone()),
                HistoryCapacity::default(),
            )?;
            if natural {
                a.enable_typing_history(&a.snapshot())?;
            }
            let old = saved(&c, &a)?;
            assert_eq!(
                a.change_selection_formats(
                    &a.snapshot(),
                    &[RichSelectionFormatChange::Set(bold()?)]
                )?,
                RichLocalOutcome::ContentCommitted
            );
            assert_eq!(a.undo_depth(), 1);
            assert_eq!(a.state().selection().ok_or("selection")?.kind(), &s);
            let selection = a.state().selection();
            assert_eq!(
                inspect_selection_format(
                    &c,
                    a.state().document(),
                    selection,
                    None,
                    bold()?.kind()
                )?,
                RichInlineFormatState::Uniform(bold()?)
            );
            if matches!(s, RichSelectionKind::Node(_) | RichSelectionKind::Grid { .. }) {
                assert_eq!(
                    inspect_inline_format(
                        &c,
                        a.state().document(),
                        selection,
                        None,
                        bold()?.kind()
                    )?,
                    RichInlineFormatState::Unavailable
                );
            }
            let after = saved(&c, &a)?;
            assert_eq!(
                a.change_selection_formats(
                    &a.snapshot(),
                    &[RichSelectionFormatChange::Set(bold()?)]
                )?,
                RichLocalOutcome::Unchanged
            );
            assert_eq!(saved(&c, &a)?, after);
            let mut b = if natural {
                RichTypingSessionJsonCodec::new(c.clone()).decode(&after)?
            } else {
                RichSessionJsonCodec::new(c.clone()).decode(&after)?
            };
            for redo in [false, true, false, true] {
                if redo {
                    a.redo(&a.snapshot())?;
                    b.redo(&b.snapshot())?;
                } else {
                    a.undo(&a.snapshot())?;
                    b.undo(&b.snapshot())?;
                    assert_eq!(a.state().document().document(), &before);
                }
                assert_eq!(saved(&c, &a)?, saved(&c, &b)?);
            }
            assert_ne!(old, after);
        }
    }
    Ok(())
}
#[test]
fn caret_changes_pending_only_and_code_duplicate_policy_and_budget_failures_are_atomic() -> Result {
    let (c, d) = setup()?;
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(range("empty", 0, "empty", 0)?),
        HistoryCapacity::default(),
    )?;
    let before = a.state().document().document().clone();
    assert_eq!(
        a.change_selection_formats(&a.snapshot(), &[RichSelectionFormatChange::Set(bold()?)])?,
        RichLocalOutcome::TypingStateOnly
    );
    assert_eq!(a.undo_depth(), 0);
    assert_eq!(a.state().document().document(), &before);
    for s in [range("task-head", 1, "code", 1)?, RichSelectionKind::Node(id("code")?)] {
        a.set_selection(&a.snapshot(), Some(s))?;
        let before = saved(&c, &a)?;
        assert!(
            a.change_selection_formats(
                &a.snapshot(),
                &[RichSelectionFormatChange::Remove(bold()?)]
            )
            .is_err()
        );
        assert_eq!(saved(&c, &a)?, before);
    }
    a.set_selection(&a.snapshot(), Some(RichSelectionKind::Node(id("list")?)))?;
    let before = saved(&c, &a)?;
    assert!(a.change_selection_formats(&a.snapshot(), &[]).is_err());
    assert!(
        a.change_selection_formats(
            &a.snapshot(),
            &[RichSelectionFormatChange::Set(bold()?), RichSelectionFormatChange::Remove(bold()?)]
        )
        .is_err()
    );
    assert_eq!(saved(&c, &a)?, before);
    let stale = a.snapshot();
    a.set_read_only(&a.snapshot(), true)?;
    let before = saved(&c, &a)?;
    assert!(
        a.change_selection_formats(&stale, &[RichSelectionFormatChange::Set(bold()?)]).is_err()
    );
    assert!(
        a.change_selection_formats(&a.snapshot(), &[RichSelectionFormatChange::Set(bold()?)])
            .is_err()
    );
    assert_eq!(saved(&c, &a)?, before);
    let (c, d) = setup()?;
    let c = c.with_max_operations_per_transaction(1);
    let mut a = RichLocalSession::try_new(
        c.clone(),
        d,
        Some(RichSelectionKind::Node(id("list")?)),
        HistoryCapacity::default(),
    )?;
    let before = saved(&c, &a)?;
    assert!(
        a.change_selection_formats(&a.snapshot(), &[RichSelectionFormatChange::Set(bold()?)])
            .is_err()
    );
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}
#[test]
fn every_fixture_endpoint_pair_has_symmetric_unique_checked_coverage() -> Result {
    let (_, d) = setup()?;
    let all = RichSelectionCoverage::document(&d)?;
    for first in all.text() {
        for last in all.text() {
            let a = first.block().as_str();
            let b = last.block().as_str();
            let forward = cover(&d, range(a, 0, b, last.end().get())?)?;
            let backward = cover(&d, range(b, last.end().get(), a, 0)?)?;
            assert_eq!(forward.text(), backward.text());
            assert_eq!(forward.nodes(), backward.nodes());
            let ids = forward
                .text()
                .iter()
                .map(breditor_core::rich_content::RichCoveredText::block)
                .collect::<std::collections::BTreeSet<_>>();
            assert_eq!(ids.len(), forward.text().len());
            assert_eq!(
                forward.selected_utf16(),
                forward.text().iter().map(|s| s.end().get() - s.start().get()).sum::<u64>()
            );
        }
    }
    Ok(())
}
#[test]
fn strict_intent_decoder_rejects_duplicates_unknowns_bad_patch_fields_and_oversize() -> Result {
    use breditor_core::codec::decode_rich_selection_format_changes as decode;
    let (c, _) = setup()?;
    let change =
        json!({"kind":"set","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"});
    assert_eq!(decode(&c, &json!({"changes":[change.clone()]}).to_string())?.len(), 1);
    let field = serde_json::to_string(&change)?;
    for input in [
        format!("{{\"changes\":[{field}],\"changes\":[{field}]}}"),
        "{\"changes\":[{\"kind\":\"set\",\"kind\":\"remove\",\"formatsJson\":\"[]\"}]}".into(),
        json!({"changes":[change.clone(),change.clone()]}).to_string(),
        json!({"changes":[change.clone()],"targets":[]}).to_string(),
        json!({"changes":[{"kind":"patch","formatsJson":change["formatsJson"],"properties":[]}]}).to_string(),
        json!({"changes":[{"kind":"patch","formatsJson":change["formatsJson"],"properties":["breditor-inline/href"]}]}).to_string(),
        json!({"changes":[{"kind":"set","formatsJson":"[]"}]}).to_string(),
        json!({"changes":[{"kind":"set","formatsJson":format!("[{}]", " ".repeat(65_536))}]}).to_string(),
    ] {
        assert!(decode(&c, &input).is_err(), "Accepted invalid intent");
    }
    Ok(())
}
#[test]
fn coverage_encoder_distinguishes_no_selection_and_document_and_never_truncates_budget() -> Result {
    use breditor_core::codec::encode_rich_selection_coverage as encode;
    let (c, d) = setup()?;
    let none: Value = serde_json::from_str(&encode(&c, &d, None)?)?;
    let all: Value =
        serde_json::from_str(&encode(&c, &d, Some(&RichSelectionCoverage::document(&d)?))?)?;
    assert_eq!(none["scope"], "none");
    assert_eq!(none["selectedUtf16"], "0");
    assert_eq!(all["scope"], "document");
    assert!(
        all["nodes"].as_array().ok_or("nodes")?.last().ok_or("last")?["hiddenTable"]
            .as_bool()
            .ok_or("hidden")?
    );
    let codec = DocumentJsonCodecV2::new(c.schema().clone());
    let mut raw: Value = serde_json::from_str(&codec.encode(d.document())?)?;
    // Long legal parent/child IDs make the repeated read exceed 4 MiB while
    // staying below default property-value, property-string and child limits.
    raw["root"]["children"] = Value::Array(
        (0..3)
            .map(|group| {
                fixture::element(
                    "blockquote",
                    &format!("group-{group}-{}", "y".repeat(100)),
                    (0..3_000)
                        .map(|i| {
                            fixture::paragraph(&format!("{}-{group}-{i}", "x".repeat(100)), "x")
                        })
                        .collect(),
                )
            })
            .collect(),
    );
    let wide = RichDocument::try_admit(c.schema(), codec.decode(&raw.to_string())?, c.limits())?;
    let coverage = RichSelectionCoverage::document(&wide)?;
    assert_eq!(coverage.text().len(), 9_000);
    assert_eq!(coverage.selected_utf16(), 9_000);
    assert!(encode(&c, &wide, Some(&coverage)).is_err());
    Ok(())
}
