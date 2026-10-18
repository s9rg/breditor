//! Native search order, Unicode positions, source proofs and unchanged owner history.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RICH_SEARCH_MAX_MATCHES, RICH_SEARCH_MAX_PATTERN_BYTES,
        RICH_SEARCH_MAX_TEXT_BYTES, RichDocument, RichLocalSession, RichSearchDirection,
        RichSearchError, RichSearchMode, RichSearchQuery, RichSearchResults, RichSelectionKind,
        RichTextPoint,
        actions::{ReplaceText, RichAction},
        find_rich_text, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use proptest::prelude::*;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn root(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn setup_with(root: Value, limits: DocumentLimits) -> Result<(EditorContext, RichDocument)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/search")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, limits);
    let mut input = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/search","version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),"root":null});
    input["root"] = root;
    let input = input.to_string();
    let codec =
        DocumentJsonCodecV2::new(context.schema().clone()).with_limits(context.limits().clone());
    let document =
        RichDocument::try_admit(context.schema(), codec.decode(&input)?, context.limits())?;
    Ok((context, document))
}
fn setup(root: Value) -> Result<(EditorContext, RichDocument)> {
    setup_with(root, DocumentLimits::default())
}
fn prose(text: &str) -> Value {
    root(vec![fixture::paragraph("body", text)])
}
fn query(
    pattern: &str,
    mode: RichSearchMode,
    case_sensitive: bool,
    whole_words: bool,
) -> Result<RichSearchQuery> {
    Ok(RichSearchQuery::try_new(pattern, mode, case_sensitive, whole_words)?)
}
fn literal(document: &RichDocument, pattern: &str) -> Result<RichSearchResults> {
    Ok(find_rich_text(document, &query(pattern, RichSearchMode::Literal, true, false)?)?)
}
fn coordinates(result: &RichSearchResults) -> Vec<(u64, u64)> {
    result.matches().iter().map(|found| (found.start().get(), found.end().get())).collect()
}

#[test]
fn run_boundaries_are_transparent_but_unicode_offsets_remain_scalar_aligned() -> Result {
    let mut paragraph = fixture::paragraph("body", "unused");
    paragraph["children"] = json!([
        {"kind":"text","text":"fo","formats":[]},
        {"kind":"text","text":"o🙂","formats":[{"type":"breditor/strong","properties":{}}]},
        {"kind":"text","text":"bar","formats":[]}
    ]);
    let (_, document) = setup(root(vec![paragraph]))?;
    let result = literal(&document, "foo🙂")?;
    assert_eq!(coordinates(&result), [(0, 5)]);
    assert_eq!(result.capture_text(0, 0)?, Some("foo🙂".into()));
    result.selection(0)?.resolve(&document)?;
    assert_eq!(result.matches()[0].capture_count(), 1);
    Ok(())
}

#[test]
fn literal_metacharacters_never_change_mode_even_with_case_folding() -> Result {
    let (_, document) = setup(prose("a+b x[y] X[Y]"))?;
    assert_eq!(coordinates(&literal(&document, "+")?), [(1, 2)]);
    let result = find_rich_text(&document, &query("X[Y]", RichSearchMode::Literal, false, false)?)?;
    assert_eq!(result.matches().len(), 2);
    assert_eq!(result.matches()[0].capture_count(), 1);
    assert!(matches!(
        find_rich_text(&document, &query("+", RichSearchMode::Regex, true, false)?),
        Err(RichSearchError::Pattern)
    ));
    Ok(())
}

#[test]
fn unicode_simple_folding_does_not_normalize_or_expand_full_case_folds() -> Result {
    let (_, document) = setup(prose("Σ σ ς \u{212a} K k Straße STRASSE é e\u{301}"))?;
    for (pattern, count) in [("σ", 3), ("k", 3), ("straße", 1), ("é", 1)] {
        let result =
            find_rich_text(&document, &query(pattern, RichSearchMode::Literal, false, false)?)?;
        assert_eq!(result.matches().len(), count, "{pattern}");
        for index in 0..count {
            result.selection(index)?.resolve(&document)?;
        }
    }
    Ok(())
}

#[test]
fn whole_words_use_unicode_segments_and_do_not_reorder_regex_alternatives() -> Result {
    let (_, document) = setup(prose("cat scatter cat's cat ab"))?;
    let result = find_rich_text(&document, &query("cat", RichSearchMode::Literal, true, true)?)?;
    assert_eq!(coordinates(&result), [(0, 3), (18, 21)]);
    let result = find_rich_text(&document, &query("a|ab", RichSearchMode::Regex, true, true)?)?;
    assert!(
        result.matches().is_empty(),
        "whole-word filtering does not rewrite regex alternatives"
    );
    Ok(())
}

#[test]
fn merged_cell_sources_follow_visible_master_order_once_and_metadata_is_excluded() -> Result {
    let (_, document) = setup(fixture::root())?;
    let result = literal(&document, "🙂")?;
    let blocks = result.matches().iter().map(|found| found.block().as_str()).collect::<Vec<_>>();
    assert_eq!(
        blocks,
        [
            "z-intro", "p-0-0", "p-0-1", "p-1-0", "p-1-1", "p-0-2", "p-0-3", "p-1-2", "p-1-3",
            "p-2-0", "p-2-1", "caption", "p-2-2", "p-2-3"
        ]
    );
    for index in 0..blocks.len() {
        result.selection(index)?.resolve(&document)?;
    }
    assert!(literal(&document, "Diagram")?.matches().is_empty());
    assert!(literal(&document, "Hidden table")?.matches().is_empty());
    Ok(())
}

#[test]
fn regex_anchors_keep_original_context_and_do_not_join_text_domains() -> Result {
    let (_, document) = setup(prose("aaa"))?;
    let result = find_rich_text(&document, &query("^a|a$", RichSearchMode::Regex, true, false)?)?;
    assert_eq!(coordinates(&result), [(0, 1), (2, 3)]);
    let code = fixture::element(
        "code-block",
        "code",
        vec![json!({"kind":"text","text":"line\nline","formats":[]})],
    );
    let (_, document) = setup(root(vec![
        fixture::paragraph("first", "line"),
        fixture::paragraph("second", "line"),
        code,
    ]))?;
    let result =
        find_rich_text(&document, &query("ne\nli", RichSearchMode::Literal, true, false)?)?;
    assert_eq!(result.matches().len(), 1);
    assert_eq!(result.matches()[0].block().as_str(), "code");
    let result =
        find_rich_text(&document, &query("(?m)^line$", RichSearchMode::Regex, true, false)?)?;
    assert_eq!(result.matches().len(), 4);
    Ok(())
}

#[test]
fn zero_width_matches_advance_by_scalars_and_suppress_adjacent_empty_duplicates() -> Result {
    let (_, document) = setup(prose("a🙂b"))?;
    let result = find_rich_text(&document, &query("(?:)", RichSearchMode::Regex, true, false)?)?;
    assert_eq!(coordinates(&result), [(0, 0), (1, 1), (3, 3), (4, 4)]);
    for index in 0..result.matches().len() {
        result.selection(index)?.resolve(&document)?;
        assert_eq!(result.capture_text(index, 0)?, Some(String::new()));
    }
    let (_, document) = setup(prose("ab"))?;
    assert_eq!(
        coordinates(&find_rich_text(&document, &query("a*", RichSearchMode::Regex, true, false)?)?),
        [(0, 1), (2, 2)]
    );
    Ok(())
}

#[test]
fn named_and_optional_captures_retain_exact_source_and_reject_bad_indices() -> Result {
    let (_, document) = setup(prose("a🙂b b"))?;
    let result = find_rich_text(
        &document,
        &query("(?P<lead>a🙂)?(?P<tail>b)", RichSearchMode::Regex, true, false)?,
    )?;
    assert_eq!(result.capture_index("lead"), Some(1));
    assert_eq!(result.capture_index("tail"), Some(2));
    assert_eq!(result.capture_index("missing"), None);
    assert_eq!(result.capture_text(0, 1)?, Some("a🙂".into()));
    assert_eq!(result.capture_text(1, 1)?, None);
    assert_eq!(result.capture_text(1, 2)?, Some("b".into()));
    assert_eq!(result.capture_text(0, 3), Err(RichSearchError::Index));
    assert!(matches!(result.selection(2), Err(RichSearchError::Index)));
    Ok(())
}

#[test]
fn empty_queries_are_inactive_and_navigation_wraps_only_when_requested() -> Result {
    let (_, document) = setup(prose("a a"))?;
    let empty = literal(&document, "")?;
    assert!(empty.matches().is_empty());
    assert_eq!(empty.navigate(None, RichSearchDirection::Next, true)?, None);
    assert_eq!(
        empty.navigate(Some(0), RichSearchDirection::Next, true),
        Err(RichSearchError::Index)
    );
    let result = literal(&document, "a")?;
    assert_eq!(result.navigate(None, RichSearchDirection::Next, false)?, Some(0));
    assert_eq!(result.navigate(None, RichSearchDirection::Previous, false)?, Some(1));
    assert_eq!(result.navigate(Some(1), RichSearchDirection::Next, false)?, None);
    assert_eq!(result.navigate(Some(1), RichSearchDirection::Next, true)?, Some(0));
    assert_eq!(result.navigate(Some(0), RichSearchDirection::Previous, true)?, Some(1));
    Ok(())
}

#[test]
fn source_guards_reject_unmatched_changes_but_accept_independently_equal_trees() -> Result {
    let source =
        root(vec![fixture::paragraph("body", "match"), fixture::paragraph("other", "old")]);
    let (_, first) = setup(source.clone())?;
    let result = literal(&first, "match")?;
    let (_, equal) = setup(source.clone())?;
    result.validate_for(&equal)?;
    let mut changed = source.clone();
    changed["children"][1]["children"][0]["text"] = json!("new");
    let (_, changed) = setup(changed)?;
    assert_eq!(result.validate_for(&changed), Err(RichSearchError::StaleSource));
    let mut foreign = source;
    foreign["properties"]["breditor/document-id"] = json!("foreign");
    let (_, foreign) = setup(foreign)?;
    assert_eq!(result.validate_for(&foreign), Err(RichSearchError::Binding));
    Ok(())
}

#[test]
fn search_and_navigation_do_not_change_read_only_owner_or_its_redo_branch() -> Result {
    let (context, document) = setup(prose("hello hello"))?;
    let block = BlockId::try_new("body")?;
    let point = RichTextPoint::new(block.clone(), TextOffset::ZERO, Affinity::After);
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
        HistoryCapacity::default(),
    )?;
    let inserted: TextFragment = TextRun::try_new("X", FormatSet::default())?.into();
    let action = ReplaceText::capture(
        owner.state().document(),
        &block,
        TextOffset::ZERO,
        TextOffset::ZERO,
        &inserted,
    )?;
    owner.dispatch(
        &owner.snapshot(),
        &[RichAction::ReplaceText(action)],
        breditor_core::rich_content::RichSelectionUpdate::Map,
    )?;
    owner.undo(&owner.snapshot())?;
    owner.set_read_only(&owner.snapshot(), true)?;
    let codec = RichSessionJsonCodec::new(context);
    let before = codec.encode(&owner)?;
    let result = literal(owner.state().document(), "hello")?;
    assert_eq!(result.matches().len(), 2);
    result.selection(1)?.resolve(owner.state().document())?;
    result.navigate(Some(0), RichSearchDirection::Next, true)?;
    assert!(owner.is_read_only());
    assert_eq!(codec.encode(&owner)?, before);
    owner.set_read_only(&owner.snapshot(), false)?;
    owner.redo(&owner.snapshot())?;
    assert_eq!(literal(owner.state().document(), "Xhello")?.matches().len(), 1);
    Ok(())
}

#[test]
fn resource_failures_return_no_partial_result_and_diagnostics_hide_payloads() -> Result {
    assert!(matches!(
        RichSearchQuery::try_new(
            "x".repeat(RICH_SEARCH_MAX_PATTERN_BYTES + 1),
            RichSearchMode::Literal,
            true,
            false
        ),
        Err(RichSearchError::QueryLimit)
    ));
    let (_, document) = setup(prose(&"a".repeat(RICH_SEARCH_MAX_MATCHES + 1)))?;
    assert!(matches!(
        find_rich_text(&document, &query("a", RichSearchMode::Literal, true, false)?),
        Err(RichSearchError::MatchLimit)
    ));
    let (_, document) = setup_with(
        prose(&"a".repeat(20_000)),
        DocumentLimits::default().with_max_text_bytes(32 * 1024),
    )?;
    assert!(matches!(
        find_rich_text(&document, &query("a", RichSearchMode::Regex, true, false)?),
        Err(RichSearchError::WorkLimit)
    ));
    for pattern in ["SECRET-(", r"a(?=b)", r"(a)\1", r"(?-u:\xFF)", "a{1000000}"] {
        let value = query(pattern, RichSearchMode::Regex, true, false)?;
        let error = find_rich_text(&document, &value).err().ok_or("expected pattern refusal")?;
        assert_eq!(error, RichSearchError::Pattern);
        assert!(!format!("{error:?} {error} {value:?}").contains("SECRET"));
    }
    let pattern = "()".repeat(65);
    assert!(matches!(
        find_rich_text(&document, &query(&pattern, RichSearchMode::Regex, true, false)?),
        Err(RichSearchError::CaptureLimit)
    ));
    Ok(())
}

#[test]
fn document_bytes_and_domain_counts_are_checked_without_returning_prefixes() -> Result {
    let limits = DocumentLimits::default()
        .with_max_text_bytes(RICH_SEARCH_MAX_TEXT_BYTES + 1)
        .with_max_total_text_bytes(8 * 1024 * 1024)
        .with_max_json_bytes(16 * 1024 * 1024);
    let (_, document) = setup_with(prose(&"x".repeat(RICH_SEARCH_MAX_TEXT_BYTES + 1)), limits)?;
    assert!(matches!(
        find_rich_text(&document, &query("absent", RichSearchMode::Literal, true, false)?),
        Err(RichSearchError::DocumentLimit)
    ));
    let children = (0..8193).map(|index| fixture::paragraph(&format!("p-{index}"), "")).collect();
    let limits = DocumentLimits::default()
        .with_max_nodes(20_000)
        .with_max_children_per_element(10_000)
        .with_max_json_bytes(4 * 1024 * 1024);
    let (_, document) = setup_with(root(children), limits)?;
    assert!(matches!(
        find_rich_text(&document, &query("absent", RichSearchMode::Literal, true, false)?),
        Err(RichSearchError::DocumentLimit)
    ));
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn literal_positions_match_exact_utf8_substrings_with_utf16_coordinates(
        text in proptest::collection::vec(any::<char>(),0..48).prop_map(|v|v.into_iter().collect::<String>()),
        needle in proptest::collection::vec(any::<char>(),1..4).prop_map(|v|v.into_iter().collect::<String>()),
    ) {
        let (_, document) = setup(prose(&text)).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let result = literal(&document,&needle).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let expected = text.match_indices(&needle).map(|(start,matched)|(
            u64::try_from(text[..start].encode_utf16().count()).map_err(|e|TestCaseError::fail(e.to_string())),
            u64::try_from(text[..start+matched.len()].encode_utf16().count()).map_err(|e|TestCaseError::fail(e.to_string())),
        )).map(|(start,end)|Ok((start?,end?))).collect::<std::result::Result<Vec<_>,TestCaseError>>()?;
        prop_assert_eq!(coordinates(&result),expected);
    }
    #[test]
    fn regex_scalar_iteration_matches_the_engine_without_context_slicing(
        text in proptest::collection::vec(any::<char>(),0..24).prop_map(|v|v.into_iter().collect::<String>()),
        pattern in prop::sample::select(vec!["a*","(?:)","^|$",r"\b","(?m)^|$","a|ab",".","(?s:.)"]),
    ) {
        let (_, document) = setup(prose(&text)).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let query = query(pattern,RichSearchMode::Regex,true,false).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let result = find_rich_text(&document,&query).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let regex = regex_automata::meta::Regex::new(pattern).map_err(|e|TestCaseError::fail(e.to_string()))?;
        let expected = regex.find_iter(text.as_bytes()).map(|found|(
            u64::try_from(text[..found.start()].encode_utf16().count()).map_err(|e|TestCaseError::fail(e.to_string())),
            u64::try_from(text[..found.end()].encode_utf16().count()).map_err(|e|TestCaseError::fail(e.to_string())),
        )).map(|(start,end)|Ok((start?,end?))).collect::<std::result::Result<Vec<_>,TestCaseError>>()?;
        prop_assert_eq!(coordinates(&result),expected);
    }
}
