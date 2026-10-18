//! Pure accepted-document utilities: Unicode runs, merged reading order and exact history.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RICH_WRITING_MAX_TEXT_BLOCKS, RICH_WRITING_MAX_TEXT_BYTES,
        RICH_WRITING_OUTLINE_LABEL_BYTES, RichDocument, RichLocalSession, RichSelectionKind,
        RichTextPoint, RichWritingError, inspect_rich_writing_tools, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use proptest::prelude::*;
use serde_json::{Value, json};
use unicode_segmentation::UnicodeSegmentation;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn root(children: Vec<Value>) -> Value {
    let mut value = fixture::element("document", "unused", children);
    value["properties"] = json!({"breditor/document-id":"room"});
    value
}
fn setup(
    version: u8,
    root: Value,
    limits: DocumentLimits,
) -> Result<(EditorContext, RichDocument)> {
    let id = SchemaId::new(QualifiedName::try_new("example/writing")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = match version {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        _ => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
    };
    let context = EditorContext::new(schema, limits);
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/writing","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":null});
    input["root"] = root;
    let codec =
        DocumentJsonCodecV2::new(context.schema().clone()).with_limits(context.limits().clone());
    let document = RichDocument::try_admit(
        context.schema(),
        codec.decode(&input.to_string())?,
        context.limits(),
    )?;
    Ok((context, document))
}
fn heading(id: &str, level: u8, text: &str) -> Value {
    let mut value = fixture::paragraph(id, text);
    value["type"] = json!("breditor/heading");
    value["properties"]["breditor/level"] = json!(level);
    value
}

#[test]
fn unicode_clusters_and_words_cross_format_runs_without_changing_position_units() -> Result {
    let text = "e\u{301} 👩\u{200d}💻 🇨🇦";
    let mut split = fixture::paragraph("body", "");
    split["children"] = Value::Array(text.chars().enumerate().map(|(index, ch)| json!({"kind":"text","text":ch.to_string(),"formats":if index%2==0 {json!([])} else {json!([{"type":"breditor/strong","properties":{}}])}})).collect());
    for version in 1..=3 {
        let (_, a) = setup(version, root(vec![split.clone()]), DocumentLimits::default())?;
        let (_, b) = setup(
            version,
            root(vec![fixture::paragraph("body", text)]),
            DocumentLimits::default(),
        )?;
        let result = inspect_rich_writing_tools(&a)?;
        assert_eq!(result, inspect_rich_writing_tools(&b)?);
        let counts = result.counts();
        assert_eq!((counts.words(), counts.graphemes(), counts.unicode_scalars()), (1, 5, 9));
        assert_eq!((counts.utf16_units(), counts.utf8_bytes(), counts.text_blocks()), (13, 24, 1));
        assert!(result.outline().is_empty());
    }
    Ok(())
}
#[test]
fn block_boundaries_do_not_invent_words_or_characters_and_empty_domains_count() -> Result {
    let (_, document) = setup(
        3,
        root(vec![
            fixture::paragraph("a", "hel"),
            fixture::paragraph("b", "lo"),
            fixture::paragraph("empty", ""),
        ]),
        DocumentLimits::default(),
    )?;
    let result = inspect_rich_writing_tools(&document)?;
    assert_eq!(
        (result.counts().words(), result.counts().graphemes(), result.counts().text_blocks()),
        (2, 5, 3)
    );
    let code = fixture::element(
        "code-block",
        "code",
        vec![json!({"kind":"text","text":"hi\nthere\t🙂","formats":[]})],
    );
    let (_, document) = setup(3, root(vec![code]), DocumentLimits::default())?;
    let result = inspect_rich_writing_tools(&document)?;
    assert_eq!(
        (
            result.counts().words(),
            result.counts().graphemes(),
            result.counts().utf16_units(),
            result.counts().utf8_bytes()
        ),
        (2, 10, 11, 13)
    );
    Ok(())
}
#[test]
fn atom_only_documents_have_no_invented_text_and_words_are_not_language_morphology() -> Result {
    let (_, document) = setup(
        3,
        root(vec![fixture::element("horizontal-rule", "rule", vec![])]),
        DocumentLimits::default(),
    )?;
    let result = inspect_rich_writing_tools(&document)?;
    assert_eq!(
        (result.counts().words(), result.counts().graphemes(), result.counts().text_blocks()),
        (0, 0, 0)
    );
    assert!(result.outline().is_empty());
    for (text, words) in [("日本語", 3), ("cat's", 1), ("👩\u{200d}💻", 0)] {
        let (_, document) =
            setup(3, root(vec![fixture::paragraph("body", text)]), DocumentLimits::default())?;
        assert_eq!(inspect_rich_writing_tools(&document)?.counts().words(), words);
    }
    Ok(())
}
#[test]
fn outline_preserves_original_rank_visual_order_empty_headings_and_literal_labels() -> Result {
    let (_, document) = setup(
        3,
        root(vec![
            heading("z", 3, "<b>Literal</b>"),
            fixture::paragraph("middle", "ordinary"),
            heading("a", 6, ""),
            heading("m", 1, "Last"),
        ]),
        DocumentLimits::default(),
    )?;
    let result = inspect_rich_writing_tools(&document)?;
    assert_eq!(
        result
            .outline()
            .iter()
            .map(|h| (h.block().as_str(), h.level(), h.label(), h.label_truncated()))
            .collect::<Vec<_>>(),
        [("z", 3, "<b>Literal</b>", false), ("a", 6, "", false), ("m", 1, "Last", false)]
    );
    Ok(())
}
#[test]
fn merged_sources_captions_code_nested_lists_and_tasks_are_counted_once_without_metadata() -> Result
{
    fn promote(node: &mut Value) {
        if node["type"] == "breditor/paragraph"
            && node["properties"]["breditor/block-id"] != "caption"
        {
            node["type"] = json!("breditor/heading");
            node["properties"]["breditor/level"] = json!(2);
        }
        if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
            for child in children {
                promote(child);
            }
        }
    }
    let mut source = fixture::root();
    promote(&mut source);
    let (_, document) = setup(3, source, DocumentLimits::default())?;
    let result = inspect_rich_writing_tools(&document)?;
    assert_eq!(
        result.outline().iter().map(|h| h.block().as_str()).collect::<Vec<_>>(),
        [
            "z-intro",
            "p-0-0",
            "p-0-1",
            "p-1-0",
            "p-1-1",
            "p-0-2",
            "p-0-3",
            "p-1-2",
            "p-1-3",
            "p-2-0",
            "p-2-1",
            "p-2-2",
            "p-2-3",
            "q1",
            "q2",
            "head",
            "nested-text",
            "task-head",
            "empty"
        ]
    );
    let counts = result.counts();
    assert_eq!((counts.words(), counts.graphemes(), counts.unicode_scalars()), (34, 75, 75));
    assert_eq!((counts.utf16_units(), counts.utf8_bytes(), counts.text_blocks()), (89, 117, 21));
    assert!(!result.outline().iter().any(|h| h.label().contains("Diagram")));
    Ok(())
}
#[test]
fn outline_labels_truncate_only_at_grapheme_edges_while_counts_remain_complete() -> Result {
    for (text, expected_label) in [
        (
            "a".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES) + "🙂",
            "a".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES),
        ),
        (
            "a".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES - 1) + "e\u{301}",
            "a".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES - 1),
        ),
        ("e".to_owned() + &"\u{301}".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES), String::new()),
    ] {
        let (_, document) =
            setup(3, root(vec![heading("body", 1, &text)]), DocumentLimits::default())?;
        let result = inspect_rich_writing_tools(&document)?;
        assert_eq!(result.outline()[0].label(), expected_label);
        assert!(result.outline()[0].label_truncated());
        assert_eq!(result.counts().utf8_bytes(), u64::try_from(text.len())?);
        assert_eq!(result.counts().graphemes(), u64::try_from(text.graphemes(true).count())?);
    }
    let text = "a".repeat(RICH_WRITING_OUTLINE_LABEL_BYTES);
    let (_, document) = setup(3, root(vec![heading("body", 1, &text)]), DocumentLimits::default())?;
    assert!(!inspect_rich_writing_tools(&document)?.outline()[0].label_truncated());
    Ok(())
}
#[test]
fn reads_preserve_observation_read_only_redo_and_exact_saved_history_in_all_grammars() -> Result {
    for version in 1..=3 {
        for natural in [false, true] {
            let (context, document) =
                setup(version, root(vec![heading("body", 1, "Hello")]), DocumentLimits::default())?;
            let point =
                RichTextPoint::new(BlockId::try_new("body")?, TextOffset::ZERO, Affinity::After);
            let mut owner = RichLocalSession::try_new(
                context.clone(),
                document,
                Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
                HistoryCapacity::default(),
            )?;
            if natural {
                owner.enable_typing_history(&owner.snapshot())?;
                owner.insert_typing_text(&owner.snapshot(), "X", 100)?;
            } else {
                owner.insert_plain_text(&owner.snapshot(), "X")?;
            }
            owner.undo(&owner.snapshot())?;
            owner.set_read_only(&owner.snapshot(), true)?;
            let encode = |owner: &RichLocalSession| -> Result<String> {
                Ok(if natural {
                    RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
                } else {
                    RichSessionJsonCodec::new(context.clone()).encode(owner)?
                })
            };
            let before = encode(&owner)?;
            let snapshot = owner.snapshot();
            let retained = inspect_rich_writing_tools(owner.state().document())?;
            for _ in 0..4 {
                assert_eq!(inspect_rich_writing_tools(owner.state().document())?, retained);
            }
            owner.check_observation(&snapshot)?;
            assert_eq!(encode(&owner)?, before);
            assert!(owner.is_read_only());
            owner.set_read_only(&owner.snapshot(), false)?;
            owner.redo(&owner.snapshot())?;
            assert_eq!(
                inspect_rich_writing_tools(owner.state().document())?.counts().graphemes(),
                6
            );
            assert_eq!(retained.outline()[0].label(), "Hello");
            assert_eq!(retained.counts().graphemes(), 5);
        }
    }
    Ok(())
}
#[test]
fn aggregate_text_and_domain_limits_refuse_complete_reads_not_prefix_statistics() -> Result {
    let limits = DocumentLimits::default()
        .with_max_text_bytes(RICH_WRITING_MAX_TEXT_BYTES + 1)
        .with_max_total_text_bytes(8 * 1024 * 1024)
        .with_max_json_bytes(16 * 1024 * 1024);
    for extra in [0, 1] {
        let (_, document) = setup(
            3,
            root(vec![fixture::paragraph(
                "body",
                &"x".repeat(RICH_WRITING_MAX_TEXT_BYTES + extra),
            )]),
            limits.clone(),
        )?;
        let result = inspect_rich_writing_tools(&document);
        if extra == 0 {
            assert_eq!(result?.counts().utf8_bytes(), u64::try_from(RICH_WRITING_MAX_TEXT_BYTES)?);
        } else {
            assert_eq!(result, Err(RichWritingError::DocumentLimit));
        }
    }
    let limits = DocumentLimits::default()
        .with_max_nodes(20_000)
        .with_max_children_per_element(10_000)
        .with_max_json_bytes(4 * 1024 * 1024);
    for extra in [0, 1] {
        let children = (0..RICH_WRITING_MAX_TEXT_BLOCKS + extra)
            .map(|i| fixture::paragraph(&format!("p-{i}"), ""))
            .collect();
        let (_, document) = setup(3, root(children), limits.clone())?;
        let result = inspect_rich_writing_tools(&document);
        if extra == 0 {
            assert_eq!(
                result?.counts().text_blocks(),
                u64::try_from(RICH_WRITING_MAX_TEXT_BLOCKS)?
            );
        } else {
            assert_eq!(result, Err(RichWritingError::DocumentLimit));
        }
    }
    assert!(
        !format!("{} {:?}", RichWritingError::DocumentLimit, RichWritingError::Invariant)
            .contains("PRIVATE-WRITING-CONTENT")
    );
    Ok(())
}
proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn scalar_partitioning_never_changes_native_text_metrics(text in proptest::collection::vec(any::<char>(),0..64).prop_map(|v|v.into_iter().collect::<String>())) {
        let mut split = fixture::paragraph("body","");
        split["children"] = Value::Array(text.chars().enumerate().map(|(i,ch)|json!({"kind":"text","text":ch.to_string(),"formats":if i%2==0 {json!([])}else{json!([{"type":"breditor/strong","properties":{}}])}})).collect());
        let (_, a) = setup(3,root(vec![split]),DocumentLimits::default()).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let (_, b) = setup(3,root(vec![fixture::paragraph("body",&text)]),DocumentLimits::default()).map_err(|e|TestCaseError::fail(e.to_string()))?;
        prop_assert_eq!(inspect_rich_writing_tools(&a).map_err(|e|TestCaseError::fail(e.to_string()))?,inspect_rich_writing_tools(&b).map_err(|e|TestCaseError::fail(e.to_string()))?);
    }
}
