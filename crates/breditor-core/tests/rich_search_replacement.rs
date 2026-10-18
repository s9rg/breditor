//! Native replacement plans, one-step local history and exact recovered future replay.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichDocumentSessionJsonCodec, RichDocumentTypingSessionJsonCodec,
        RichSessionJsonCodec, RichTypingSessionJsonCodec,
    },
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, RICH_SEARCH_MAX_INSERTED_BYTES, RICH_SEARCH_MAX_MATCHES,
        RICH_SEARCH_MAX_REPLACEMENT_BYTES, RichDocument, RichLocalOutcome, RichLocalSession,
        RichLocalSessionError, RichSearchError, RichSearchMode, RichSearchQuery,
        RichSearchReplacePlan, RichSearchReplacement, RichSearchReplacementMode, RichSearchResults,
        RichSearchTextReplacement, RichSelection, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint, RowId, TableId,
        actions::{ReplaceText, RichAction},
        find_rich_text, plan_rich_search_replace_all, plan_rich_search_replace_one,
        standard_inline_extension_v1,
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
        SchemaId::new(
            QualifiedName::try_new("example/search-replacement")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, limits);
    let mut input = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/search-replacement","version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),"root":null});
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
fn setup(root: Value) -> Result<(EditorContext, RichDocument)> {
    setup_with(root, DocumentLimits::default())
}
fn prose(text: &str) -> Value {
    root(vec![fixture::paragraph("body", text)])
}
fn search(
    document: &RichDocument,
    pattern: &str,
    mode: RichSearchMode,
) -> Result<RichSearchResults> {
    Ok(find_rich_text(document, &RichSearchQuery::try_new(pattern, mode, true, false)?)?)
}
fn replacement(text: &str, mode: RichSearchReplacementMode) -> Result<RichSearchReplacement> {
    Ok(RichSearchReplacement::try_new(text, mode)?)
}
fn literal(text: &str) -> Result<RichSearchReplacement> {
    replacement(text, RichSearchReplacementMode::Literal)
}
fn captures(text: &str) -> Result<RichSearchReplacement> {
    replacement(text, RichSearchReplacementMode::Captures)
}
fn runs(document: &RichDocument, id: &str) -> Result<Vec<(String, FormatSet)>> {
    let path = document.block_path(&BlockId::try_new(id)?).ok_or("missing block")?;
    document
        .document()
        .node_at(path)?
        .as_element()
        .ok_or("wrong kind")?
        .children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(|text| (text.text().to_owned(), text.formats().clone()))
                .ok_or_else(|| "wrong text kind".into())
        })
        .collect()
}
fn text(document: &RichDocument, id: &str) -> Result<String> {
    Ok(runs(document, id)?.into_iter().map(|(text, _)| text).collect())
}
fn point(id: &str, offset: u64, affinity: Affinity) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(offset)?, affinity))
}
fn range(id: &str, anchor: u64, focus: u64, affinity: Affinity) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange {
        anchor: point(id, anchor, affinity)?,
        focus: point(id, focus, affinity)?,
    })
}
fn new_owner(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<RichSelectionKind>,
    capacity: u32,
) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        context.clone(),
        document.clone(),
        selection,
        HistoryCapacity::try_new(capacity)?,
    )?)
}
fn saved(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichDocumentTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichDocumentSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
fn reopen(context: &EditorContext, owner: &RichLocalSession) -> Result<RichLocalSession> {
    Ok(if owner.typing_history_enabled() {
        RichDocumentTypingSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    } else {
        RichDocumentSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    })
}

#[test]
fn literal_replacement_keeps_dollar_signs_and_inherits_only_the_first_matched_scalar() -> Result {
    let mut paragraph = fixture::paragraph("body", "unused");
    paragraph["children"] = json!([
        {"kind":"text","text":"A🙂fo","formats":[{"type":"breditor/strong","properties":{}}]},
        {"kind":"text","text":"oBfooC","formats":[{"type":"breditor-inline/italic","properties":{}}]}
    ]);
    let (context, document) = setup(root(vec![paragraph]))?;
    let original = runs(&document, "body")?;
    let results = search(&document, "foo", RichSearchMode::Literal)?;
    let plan = plan_rich_search_replace_all(&results, &literal("x$1")?)?;
    assert_eq!(plan.selected_matches(), 2);
    assert_eq!(
        plan.edits().iter().map(|edit| (edit.start().get(), edit.end().get())).collect::<Vec<_>>(),
        [(3, 6), (7, 10)]
    );
    let after = plan.preview(&context, &document)?;
    assert_eq!(
        runs(&after, "body")?,
        [("A🙂x$1".into(), original[0].1.clone()), ("Bx$1C".into(), original[1].1.clone())]
    );
    assert_eq!(text(&document, "body")?, "A🙂fooBfooC");
    Ok(())
}

#[test]
fn named_numeric_optional_and_escaped_captures_expand_explicitly() -> Result {
    let (context, document) = setup(prose("cats cat"))?;
    let results = search(&document, "(?P<word>cat)(s)?", RichSearchMode::Regex)?;
    assert_eq!(results.capture_count(), 3);
    let plan = plan_rich_search_replace_all(&results, &captures("${word}:$2:$$:${0}")?)?;
    assert_eq!(text(&plan.preview(&context, &document)?, "body")?, "cat:s:$:cats cat::$:cat");
    let single = plan_rich_search_replace_one(&results, 1, &captures("$1!")?)?;
    assert_eq!(single.selected_matches(), 1);
    assert_eq!(text(&single.preview(&context, &document)?, "body")?, "cats cat!");
    assert_eq!(
        plan_rich_search_replace_one(&results, 2, &literal("x")?).err(),
        Some(RichSearchError::Index)
    );
    Ok(())
}

#[test]
fn template_references_are_checked_without_hits_and_never_silently_drop_unknown_groups() -> Result {
    let (context, document) = setup(prose("dog"))?;
    let results = search(&document, "(?P<word>cat)(s)?", RichSearchMode::Regex)?;
    assert!(results.matches().is_empty());
    assert_eq!(results.capture_count(), 3);
    for invalid in ["$", "$word", "${}", "${missing}", "${", "$99", "$184467440737095516160"] {
        assert_eq!(
            plan_rich_search_replace_all(&results, &captures(invalid)?).err(),
            Some(RichSearchError::Template),
            "{invalid}"
        );
    }
    let plan = plan_rich_search_replace_all(&results, &captures("${word}$2$$")?)?;
    assert!(plan.edits().is_empty());
    assert_eq!(plan.selected_matches(), 0);
    assert_eq!(plan.preview(&context, &document)?.document(), document.document());
    let inactive = search(&document, "", RichSearchMode::Regex)?;
    assert!(plan_rich_search_replace_all(&inactive, &captures("$1")?).is_err());
    Ok(())
}

#[test]
fn zero_width_replacement_advances_by_scalars_and_uses_following_or_final_run_formats() -> Result {
    let mut paragraph = fixture::paragraph("body", "unused");
    paragraph["children"] = json!([
        {"kind":"text","text":"🙂\n","formats":[]},
        {"kind":"text","text":"B","formats":[{"type":"breditor/strong","properties":{}}]}
    ]);
    let (context, document) = setup(root(vec![paragraph]))?;
    let marks = runs(&document, "body")?[1].1.clone();
    let results = search(&document, "(?m)^|$", RichSearchMode::Regex)?;
    let plan = plan_rich_search_replace_all(&results, &literal("X")?)?;
    assert_eq!(
        plan.edits().iter().map(|edit| edit.start().get()).collect::<Vec<_>>(),
        [0, 2, 3, 4]
    );
    let after = plan.preview(&context, &document)?;
    assert_eq!(
        runs(&after, "body")?,
        [("X🙂X\n".into(), FormatSet::default()), ("XBX".into(), marks)]
    );
    let (context, document) = setup(prose(""))?;
    let plan = plan_rich_search_replace_all(
        &search(&document, "^$", RichSearchMode::Regex)?,
        &literal("🙂")?,
    )?;
    assert_eq!(
        runs(&plan.preview(&context, &document)?, "body")?,
        [("🙂".into(), FormatSet::default())]
    );
    Ok(())
}

#[test]
fn all_4096_matches_form_one_undo_group_and_recover_without_query_replay() -> Result {
    for natural in [false, true] {
        let source = "x ".repeat(RICH_SEARCH_MAX_MATCHES);
        let (context, document) = setup(prose(&source))?;
        let mut owner =
            new_owner(&context, &document, Some(range("body", 0, 0, Affinity::After)?), 10)?;
        if natural {
            owner.enable_typing_history(&owner.snapshot())?;
        }
        let results = search(owner.state().document(), "x", RichSearchMode::Literal)?;
        let before = owner.state().revision();
        assert_eq!(
            owner.replace_search_all(&owner.snapshot(), &results, &literal("y🙂")?)?,
            RichLocalOutcome::ContentCommitted
        );
        assert_eq!(owner.state().revision(), before.successor()?);
        assert_eq!(owner.undo_depth(), 1);
        assert_eq!(owner.history_step_count(), 1);
        assert_eq!(text(owner.state().document(), "body")?, "y🙂 ".repeat(RICH_SEARCH_MAX_MATCHES));
        let encoded = saved(&context, &owner)?;
        assert!(!encoded.contains("RichSearch") && !encoded.contains("search-replacement-plan"));
        let mut recovered = reopen(&context, &owner)?;
        assert_eq!(saved(&context, &recovered)?, encoded);
        assert_eq!(recovered.undo(&recovered.snapshot())?, RichLocalOutcome::UndoApplied);
        assert_eq!(recovered.state().document().document(), document.document());
        let mut redo = reopen(&context, &recovered)?;
        assert_eq!(redo.redo(&redo.snapshot())?, RichLocalOutcome::RedoApplied);
        assert_eq!(text(redo.state().document(), "body")?, "y🙂 ".repeat(RICH_SEARCH_MAX_MATCHES));
    }
    Ok(())
}

fn replace_fixture_text(node: &mut Value) {
    if let Some(text) = node.get("text").and_then(Value::as_str).map(str::to_owned) {
        node["text"] = json!(text.replace('🙂', "日本"));
    }
    if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
        for child in children {
            replace_fixture_text(child);
        }
    }
}

#[test]
fn merged_cells_captions_and_structures_keep_the_exact_original_identity_graph() -> Result {
    let (context, document) = setup(fixture::root())?;
    let mut expected = fixture::root();
    replace_fixture_text(&mut expected);
    let (_, expected) = setup(expected)?;
    let selections = [
        RichSelectionKind::Document,
        RichSelectionKind::Node(BlockId::try_new("image")?),
        RichSelectionKind::Grid {
            anchor: CellId::new(
                TableId::try_new("t")?,
                RowId::try_new("r2")?,
                ColumnId::try_new("c3")?,
            ),
            focus: CellId::new(
                TableId::try_new("t")?,
                RowId::try_new("r0")?,
                ColumnId::try_new("c0")?,
            ),
        },
        RichSelectionKind::TextRange {
            anchor: point("caption", 4, Affinity::After)?,
            focus: point("z-intro", 1, Affinity::Before)?,
        },
    ];
    for selection in selections {
        let mut owner = new_owner(&context, &document, Some(selection.clone()), 10)?;
        let results = search(&document, "🙂", RichSearchMode::Literal)?;
        assert_eq!(results.matches().len(), 14);
        owner.replace_search_all(&owner.snapshot(), &results, &literal("日本")?)?;
        assert_eq!(owner.state().document().document(), expected.document());
        owner.state().selection().ok_or("missing selection")?.resolve(owner.state().document())?;
        let after = saved(&context, &owner)?;
        let mut recovered = reopen(&context, &owner)?;
        recovered.undo(&recovered.snapshot())?;
        assert_eq!(recovered.state().document().document(), document.document());
        assert_eq!(recovered.state().selection().ok_or("missing selection")?.kind(), &selection);
        recovered.redo(&recovered.snapshot())?;
        assert_eq!(recovered.state().document().document(), expected.document());
        // Revision differs after Undo/Redo; exact immediately reopened state does not.
        assert_eq!(saved(&context, &reopen(&context, &owner)?)?, after);
    }
    Ok(())
}

#[test]
fn final_admission_is_atomic_and_does_not_check_transient_grow_then_shrink_states() -> Result {
    let limits = DocumentLimits::default().with_max_total_text_bytes(4);
    let (context, document) = setup_with(
        root(vec![fixture::paragraph("first", "x"), fixture::paragraph("second", "xxx")]),
        limits,
    )?;
    let results = search(&document, "^x$|xxx$", RichSearchMode::Regex)?;
    let mut owner = new_owner(&context, &document, None, 10)?;
    owner.replace_search_all(&owner.snapshot(), &results, &literal("zz")?)?;
    assert_eq!(text(owner.state().document(), "first")?, "zz");
    assert_eq!(text(owner.state().document(), "second")?, "zz");
    assert_eq!(owner.undo_depth(), 1);
    let (context, document) =
        setup_with(prose("xx"), DocumentLimits::default().with_max_text_bytes(3))?;
    let mut owner = new_owner(&context, &document, None, 10)?;
    let before = saved(&context, &owner)?;
    let snapshot = owner.snapshot();
    let results = search(&document, "x", RichSearchMode::Literal)?;
    assert!(matches!(
        owner.replace_search_all(&snapshot, &results, &literal("ab")?),
        Err(RichLocalSessionError::Search(RichSearchError::Admission))
    ));
    assert_eq!(saved(&context, &owner)?, before);
    owner.validate_observation(&snapshot)?;
    Ok(())
}

#[test]
fn expansion_bounds_fail_without_partial_publication_and_identity_captures_do_not_allocate_insertions()
-> Result {
    assert_eq!(
        RichSearchReplacement::try_new(
            "x".repeat(RICH_SEARCH_MAX_REPLACEMENT_BYTES + 1),
            RichSearchReplacementMode::Literal
        )
        .err(),
        Some(RichSearchError::ReplacementLimit)
    );
    let (context, document) = setup(prose(&"x ".repeat(17)))?;
    let mut owner = new_owner(&context, &document, None, 10)?;
    let results = search(&document, "x", RichSearchMode::Literal)?;
    let before = saved(&context, &owner)?;
    let snapshot = owner.snapshot();
    assert!(matches!(
        owner.replace_search_all(
            &snapshot,
            &results,
            &literal(&"a".repeat(RICH_SEARCH_MAX_REPLACEMENT_BYTES))?
        ),
        Err(RichLocalSessionError::Search(RichSearchError::ReplacementLimit))
    ));
    assert_eq!(saved(&context, &owner)?, before);
    owner.validate_observation(&snapshot)?;
    assert_eq!(
        plan_rich_search_replace_all(&results, &captures(&"$0".repeat(1025))?).err(),
        Some(RichSearchError::ReplacementLimit)
    );
    let source = "a".repeat(RICH_SEARCH_MAX_INSERTED_BYTES + 1);
    let (context, document) =
        setup_with(prose(&source), DocumentLimits::default().with_max_text_bytes(source.len()))?;
    let results = search(&document, "a+", RichSearchMode::Regex)?;
    let plan = plan_rich_search_replace_all(&results, &captures("$0")?)?;
    assert_eq!(plan.selected_matches(), 1);
    assert_eq!(plan.inserted_bytes(), 0);
    assert!(plan.edits().is_empty());
    assert_eq!(plan.preview(&context, &document)?.document(), document.document());
    Ok(())
}

#[test]
fn direction_affinity_and_pending_formats_map_and_replay_exactly() -> Result {
    for affinity in [Affinity::Before, Affinity::After] {
        let (context, document) = setup(prose("x🙂x"))?;
        let mut owner = new_owner(&context, &document, Some(range("body", 4, 0, affinity)?), 10)?;
        let results = search(&document, "x", RichSearchMode::Literal)?;
        owner.replace_search_all(&owner.snapshot(), &results, &literal("yy")?)?;
        assert_eq!(
            owner.state().selection().ok_or("missing selection")?.kind(),
            &range("body", 6, if affinity == Affinity::Before { 0 } else { 2 }, affinity)?
        );
        owner.undo(&owner.snapshot())?;
        assert_eq!(
            owner.state().selection().ok_or("missing selection")?.kind(),
            &range("body", 4, 0, affinity)?
        );
    }
    let (context, document) = setup(prose("x🙂x"))?;
    let mut owner =
        new_owner(&context, &document, Some(range("body", 1, 1, Affinity::After)?), 10)?;
    owner.set_pending_formats(&owner.snapshot(), Some(FormatSet::default()))?;
    let before_selection = owner.state().selection().cloned();
    let results = search(&document, "x", RichSearchMode::Literal)?;
    owner.replace_search_one(&owner.snapshot(), &results, 0, &literal("abc")?)?;
    assert_eq!(
        owner.state().selection().ok_or("missing selection")?.kind(),
        &range("body", 3, 3, Affinity::After)?
    );
    assert_eq!(owner.state().pending_formats(), Some(&FormatSet::default()));
    let mut recovered = reopen(&context, &owner)?;
    recovered.undo(&recovered.snapshot())?;
    assert_eq!(recovered.state().selection(), before_selection.as_ref());
    assert_eq!(recovered.state().pending_formats(), Some(&FormatSet::default()));
    recovered.redo(&recovered.snapshot())?;
    assert_eq!(recovered.state().selection(), owner.state().selection());
    assert_eq!(recovered.state().pending_formats(), owner.state().pending_formats());
    Ok(())
}

#[test]
fn stale_foreign_policy_and_changed_source_fail_without_touching_owner_or_redo() -> Result {
    let (context, document) = setup(prose("cat"))?;
    let results = search(&document, "cat", RichSearchMode::Literal)?;
    let mut owner = new_owner(&context, &document, None, 10)?;
    let stale = owner.snapshot();
    owner.set_selection(&owner.snapshot(), Some(range("body", 0, 0, Affinity::After)?))?;
    let before = saved(&context, &owner)?;
    assert!(matches!(
        owner.replace_search_all(&stale, &results, &literal("dog")?),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    assert_eq!(saved(&context, &owner)?, before);
    let foreign = reopen(&context, &owner)?.snapshot();
    assert!(matches!(
        owner.replace_search_one(&foreign, &results, 0, &literal("dog")?),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    owner.set_read_only(&owner.snapshot(), true)?;
    let before = saved(&context, &owner)?;
    assert!(matches!(
        owner.replace_search_all(&owner.snapshot(), &results, &literal("cat")?),
        Err(RichLocalSessionError::ReadOnly)
    ));
    assert_eq!(saved(&context, &owner)?, before);
    owner.set_read_only(&owner.snapshot(), false)?;
    owner.replace_search_all(&owner.snapshot(), &results, &literal("dog")?)?;
    let before = saved(&context, &owner)?;
    assert!(matches!(
        owner.replace_search_all(&owner.snapshot(), &results, &literal("fox")?),
        Err(RichLocalSessionError::Search(RichSearchError::StaleSource))
    ));
    assert_eq!(saved(&context, &owner)?, before);
    owner.undo(&owner.snapshot())?;
    let before = saved(&context, &owner)?;
    assert_eq!(
        owner.replace_search_all(&owner.snapshot(), &results, &literal("cat")?)?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(saved(&context, &owner)?, before);
    assert_eq!(owner.redo_depth(), 1);
    owner.redo(&owner.snapshot())?;
    assert_eq!(text(owner.state().document(), "body")?, "dog");
    Ok(())
}

#[test]
fn actual_replacement_is_separate_from_typing_and_noop_does_not_break_continuation() -> Result {
    let (context, document) = setup(prose("x"))?;
    let mut owner =
        new_owner(&context, &document, Some(range("body", 1, 1, Affinity::After)?), 10)?;
    owner.enable_typing_history(&owner.snapshot())?;
    owner.insert_typing_text(&owner.snapshot(), "a", 100)?;
    let results = search(owner.state().document(), "x", RichSearchMode::Literal)?;
    assert_eq!(
        owner.replace_search_all(&owner.snapshot(), &results, &literal("x")?)?,
        RichLocalOutcome::Unchanged
    );
    owner.insert_typing_text(&owner.snapshot(), "b", 101)?;
    assert_eq!(owner.undo_depth(), 1);
    let results = search(owner.state().document(), "x", RichSearchMode::Literal)?;
    owner.replace_search_all(&owner.snapshot(), &results, &literal("y")?)?;
    owner.insert_typing_text(&owner.snapshot(), "c", 102)?;
    assert_eq!(owner.undo_depth(), 3);
    for expected in ["yab", "xab", "x"] {
        owner.undo(&owner.snapshot())?;
        assert_eq!(text(owner.state().document(), "body")?, expected);
    }
    Ok(())
}

#[test]
fn zero_capacity_still_publishes_the_complete_candidate_without_retained_history() -> Result {
    let (context, document) = setup(prose("cat cat"))?;
    let mut owner = new_owner(&context, &document, None, 0)?;
    owner.replace_search_all(
        &owner.snapshot(),
        &search(&document, "cat", RichSearchMode::Literal)?,
        &literal("dog")?,
    )?;
    assert_eq!(text(owner.state().document(), "body")?, "dog dog");
    assert_eq!(owner.undo_depth(), 0);
    assert_eq!(owner.redo_depth(), 0);
    assert_eq!(saved(&context, &reopen(&context, &owner)?)?, saved(&context, &owner)?);
    Ok(())
}

fn semantic(plan: &RichSearchReplacePlan) -> Result<Vec<RichSearchTextReplacement>> {
    plan.edits()
        .iter()
        .map(|edit| {
            let text: String = edit.inserted().iter().map(TextRun::text).collect();
            Ok(RichSearchTextReplacement::try_new(
                edit.block().clone(),
                edit.start(),
                edit.end(),
                text,
            )?)
        })
        .collect()
}

#[test]
fn semantic_replay_reconstructs_the_exact_query_plan_without_saving_query_or_formats() -> Result {
    for source in [prose("🙂a🙂\n🙂"), fixture::root()] {
        let (context, document) = setup(source)?;
        for pattern in ["🙂", "(?m)^|$"] {
            let results = search(&document, pattern, RichSearchMode::Regex)?;
            let original = plan_rich_search_replace_all(&results, &literal("日本")?)?;
            let replay = RichSearchReplacePlan::try_from_semantic_replacements(
                &document,
                &semantic(&original)?,
            )?;
            assert_eq!(replay.edits(), original.edits());
            assert_eq!(
                replay.preview(&context, &document)?.document(),
                original.preview(&context, &document)?.document()
            );
        }
    }
    Ok(())
}

#[test]
fn semantic_targets_reject_overlap_duplicate_empty_boundaries_and_half_surrogates() -> Result {
    let (_, document) = setup(prose("a🙂b"))?;
    let replacement = |block: &str, start, end| -> Result<RichSearchTextReplacement> {
        Ok(RichSearchTextReplacement::try_new(
            BlockId::try_new(block)?,
            TextOffset::try_new(start)?,
            TextOffset::try_new(end)?,
            "X",
        )?)
    };
    for invalid in [
        vec![replacement("body", 2, 3)?],
        vec![replacement("body", 0, 9)?],
        vec![replacement("missing", 0, 0)?],
        vec![replacement("body", 0, 3)?, replacement("body", 1, 4)?],
        vec![replacement("body", 0, 0)?, replacement("body", 0, 0)?],
        vec![replacement("body", 0, 1)?, replacement("body", 1, 1)?],
    ] {
        assert_eq!(
            RichSearchReplacePlan::try_from_semantic_replacements(&document, &invalid).err(),
            Some(RichSearchError::ReplacementTarget)
        );
    }
    let (_, document) =
        setup(root(vec![fixture::paragraph("first", "a"), fixture::paragraph("last", "b")]))?;
    assert!(
        RichSearchReplacePlan::try_from_semantic_replacements(
            &document,
            &[replacement("last", 0, 1)?, replacement("first", 0, 1)?]
        )
        .is_err()
    );
    assert!(
        RichSearchTextReplacement::try_new(
            BlockId::try_new("first")?,
            TextOffset::from(1u32),
            TextOffset::ZERO,
            "X"
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn semantic_replay_has_its_own_complete_count_and_aggregate_insertion_admission() -> Result {
    let (_, document) = setup(prose("aa"))?;
    let replacement = |start: u32, end: u32, text: &str| -> Result<RichSearchTextReplacement> {
        Ok(RichSearchTextReplacement::try_new(
            BlockId::try_new("body")?,
            TextOffset::from(start),
            TextOffset::from(end),
            text,
        )?)
    };
    let oversized = vec![replacement(0, 1, "x")?; RICH_SEARCH_MAX_MATCHES + 1];
    assert_eq!(
        RichSearchReplacePlan::try_from_semantic_replacements(&document, &oversized).err(),
        Some(RichSearchError::MatchLimit)
    );
    let text = "x".repeat(RICH_SEARCH_MAX_INSERTED_BYTES / 2 + 1);
    assert_eq!(
        RichSearchReplacePlan::try_from_semantic_replacements(
            &document,
            &[replacement(0, 1, &text)?, replacement(1, 2, &text)?]
        )
        .err(),
        Some(RichSearchError::ReplacementLimit)
    );
    assert_eq!(
        RichSearchTextReplacement::try_new(
            BlockId::try_new("body")?,
            TextOffset::ZERO,
            TextOffset::from(1u32),
            "x".repeat(RICH_SEARCH_MAX_INSERTED_BYTES + 1)
        )
        .err(),
        Some(RichSearchError::ReplacementLimit)
    );
    Ok(())
}

#[test]
fn public_preview_maps_only_its_proved_source_selection_and_redacts_its_tree() -> Result {
    let (context, document) = setup(prose("SECRET🙂x"))?;
    let plan = plan_rich_search_replace_all(
        &search(&document, "SECRET", RichSearchMode::Literal)?,
        &literal("replacement")?,
    )?;
    let selection = RichSelection::try_new(&document, range("body", 6, 6, Affinity::After)?)?;
    let preview = plan.preview_with_selection(&context, &document, Some(&selection))?;
    assert_eq!(
        preview.selection().ok_or("missing selection")?.kind(),
        &range("body", 11, 11, Affinity::After)?
    );
    preview.selection().ok_or("missing selection")?.resolve(preview.document())?;
    assert!(!format!("{preview:?}").contains("SECRET"));
    let (_, foreign) = setup(prose("foreign"))?;
    let foreign = RichSelection::try_new(&foreign, range("body", 0, 0, Affinity::After)?)?;
    assert_eq!(
        plan.preview_with_selection(&context, &document, Some(&foreign)).err(),
        Some(RichSearchError::Selection)
    );
    Ok(())
}

#[test]
fn original_local_checkpoint_families_keep_exact_replacement_undo_and_redo() -> Result {
    for natural in [false, true] {
        let (context, document) = setup(prose("cat cat"))?;
        let mut owner =
            new_owner(&context, &document, Some(range("body", 3, 3, Affinity::After)?), 10)?;
        if natural {
            owner.enable_typing_history(&owner.snapshot())?;
        }
        let results = search(&document, "(?P<needle>cat)", RichSearchMode::Regex)?;
        owner.replace_search_all(&owner.snapshot(), &results, &captures("$0-$0")?)?;
        let encode = |session: &RichLocalSession| -> Result<String> {
            Ok(if natural {
                RichTypingSessionJsonCodec::new(context.clone()).encode(session)?
            } else {
                RichSessionJsonCodec::new(context.clone()).encode(session)?
            })
        };
        let encoded = encode(&owner)?;
        assert!(!encoded.contains("(?P<needle>") && !encoded.contains("$0-$0"));
        let mut restored = if natural {
            RichTypingSessionJsonCodec::new(context.clone()).decode(&encoded)?
        } else {
            RichSessionJsonCodec::new(context.clone()).decode(&encoded)?
        };
        assert_eq!(encode(&restored)?, encoded);
        restored.undo(&restored.snapshot())?;
        assert_eq!(restored.state().document().document(), document.document());
        restored.redo(&restored.snapshot())?;
        assert_eq!(restored.state().document().document(), owner.state().document().document());
        assert_eq!(restored.state().selection(), owner.state().selection());
    }
    Ok(())
}

#[test]
fn identity_across_mixed_formats_keeps_every_source_run_and_publication_exact() -> Result {
    let mut paragraph = fixture::paragraph("body", "unused");
    paragraph["children"] = json!([
        {"kind":"text","text":"ca","formats":[]},
        {"kind":"text","text":"t","formats":[{"type":"breditor/strong","properties":{}}]}
    ]);
    let (context, document) = setup(root(vec![paragraph]))?;
    let mut owner = new_owner(&context, &document, None, 10)?;
    let before = saved(&context, &owner)?;
    let snapshot = owner.snapshot();
    let results = search(&document, "(cat)", RichSearchMode::Regex)?;
    assert_eq!(
        owner.replace_search_all(&snapshot, &results, &captures("$1")?)?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(owner.state().document().document(), document.document());
    assert_eq!(saved(&context, &owner)?, before);
    owner.validate_observation(&snapshot)?;
    Ok(())
}

#[test]
fn compound_operation_respects_zero_transaction_policy_and_active_receiving_limits() -> Result {
    let (context, document) = setup(prose("cat"))?;
    let plan = plan_rich_search_replace_all(
        &search(&document, "cat", RichSearchMode::Literal)?,
        &literal("dog")?,
    )?;
    assert_eq!(
        plan.preview(&context.clone().with_max_operations_per_transaction(0), &document).err(),
        Some(RichSearchError::Admission)
    );
    let tight = EditorContext::new(
        context.schema().clone(),
        context.limits().clone().with_max_total_text_bytes(2),
    );
    assert_eq!(plan.preview(&tight, &document).err(), Some(RichSearchError::Admission));
    let mut changed = prose("cat");
    changed["properties"]["breditor/document-id"] = json!("foreign");
    let (_, foreign) = setup(changed)?;
    assert_eq!(plan.validate_for(&foreign), Err(RichSearchError::Binding));
    let (_, altered) = setup(prose("cat!"))?;
    assert_eq!(plan.preview(&context, &altered).err(), Some(RichSearchError::StaleSource));
    Ok(())
}

#[test]
fn multiline_code_replacement_stays_plain_and_preserves_code_metadata() -> Result {
    let code = fixture::element(
        "code-block",
        "code",
        vec![json!({"kind":"text","text":"one\none","formats":[]})],
    );
    let (context, document) = setup(root(vec![code]))?;
    let mut owner =
        new_owner(&context, &document, Some(range("code", 7, 7, Affinity::After)?), 10)?;
    let results = search(&document, "(?m)^one$", RichSearchMode::Regex)?;
    owner.replace_search_all(&owner.snapshot(), &results, &literal("日本\n🙂")?)?;
    assert_eq!(
        runs(owner.state().document(), "code")?,
        [("日本\n🙂\n日本\n🙂".into(), FormatSet::default())]
    );
    owner.undo(&owner.snapshot())?;
    assert_eq!(owner.state().document().document(), document.document());
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn literal_bulk_preview_matches_original_nonoverlapping_string_replacement(
        pieces in prop::collection::vec(prop_oneof![Just("a"),Just("b"),Just("🙂"),Just("é"),Just("e\u{301}")],0..50),
        pattern in prop_oneof![Just("a"),Just("ab"),Just("🙂"),Just("é"),Just("e\u{301}")],
        inserted in prop_oneof![Just(""),Just("X"),Just("🙂x"),Just("$0"),Just("e\u{301}")],
    ) {
        let source = pieces.concat();
        let (context, document) = setup(prose(&source)).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let results = search(&document, pattern, RichSearchMode::Literal).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let request = literal(inserted).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let plan = plan_rich_search_replace_all(&results, &request).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let after = plan.preview(&context, &document).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let actual = text(&after, "body").map_err(|error| TestCaseError::fail(error.to_string()))?;
        prop_assert_eq!(actual, source.replace(pattern, inserted));
        prop_assert_eq!(plan.selected_matches(), source.match_indices(pattern).count());
    }

    #[test]
    fn bulk_selection_mapping_matches_witnessed_ordinary_splices(
        pieces in prop::collection::vec(prop_oneof![Just("a"), Just("b"), Just("🙂")], 0..30),
        index in 0usize..31,
        before in any::<bool>(),
        inserted in prop_oneof![Just(""), Just("xx"), Just("🙂")],
    ) {
        let check = || -> Result {
            let source = pieces.concat();
            let scalar = source.char_indices().nth(index % (source.chars().count() + 1)).map_or(source.len(), |(byte, _)| byte);
            let offset = u64::try_from(source[..scalar].encode_utf16().count())?;
            let affinity = if before { Affinity::Before } else { Affinity::After };
            let (context, document) = setup(prose(&source))?;
            let selection = Some(range("body", offset, offset, affinity)?);
            let mut bulk = new_owner(&context, &document, selection.clone(), 10)?;
            let mut ordinary = new_owner(&context, &document, selection, 10)?;
            let results = search(&document, "a", RichSearchMode::Literal)?;
            let fragment = if inserted.is_empty() { TextFragment::empty() }
                else { TextFragment::from(TextRun::try_new(inserted, FormatSet::default())?) };
            let mut staged = document.clone();
            let mut actions = Vec::new();
            for found in results.matches().iter().rev() {
                let action = ReplaceText::capture(&staged, found.block(), found.start(), found.end(), &fragment)?;
                if let Some(edit) = action.apply(&context, &staged)? { staged = edit.into_parts().0; }
                actions.push(RichAction::ReplaceText(action));
            }
            ordinary.dispatch(&ordinary.snapshot(), &actions, RichSelectionUpdate::Map)?;
            bulk.replace_search_all(&bulk.snapshot(), &results, &literal(inserted)?)?;
            assert_eq!(bulk.state().document().document(), ordinary.state().document().document());
            assert_eq!(bulk.state().selection(), ordinary.state().selection());
            Ok(())
        };
        check().map_err(|error| TestCaseError::fail(error.to_string()))?;
    }
}
