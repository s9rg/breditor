//! Shared native search, original-character bulk lowering, selected recovery and exact selective history.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command, ReviewedHistoryIdentity, RichReplica, SharedObservation, SharedRichProfile,
        SharedSearchResults, WriterGroupPreparation,
        actions::{
            InsertText, JoinTextBlocks, RangeTextRun, ReplaceTextRange, SetImageAlt, SplitTextBlock,
        },
        selection::{CellTarget, Selection, TextPoint},
    },
};
use breditor_core::{
    rich_content::{
        RICH_SEARCH_MAX_MATCHES, RICH_SEARCH_MAX_REPLACEMENT_BYTES, RichSearchMode,
        RichSearchQuery, RichSearchReplacement, RichSearchReplacementMode,
        review::ReviewPrincipalId,
    },
    schema::DocumentLimits,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn profile() -> Result<SharedRichProfile> {
    profile_version(3)
}
fn profile_version(version: u8) -> Result<SharedRichProfile> {
    let configuration = json!({
        "format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/shared-search","version":1},"extensions":[]
    })
    .to_string();
    Ok(match version {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    })
}
fn prose(text: &str) -> Value {
    let mut root = fixture::element("document", "unused", vec![fixture::paragraph("body", text)]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn setup(root: Value) -> Result<(SharedRichProfile, RichReplica)> {
    setup_profile(profile()?, root)
}
fn setup_profile(
    profile: SharedRichProfile,
    root: Value,
) -> Result<(SharedRichProfile, RichReplica)> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/shared-search","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":null});
    input["root"] = root;
    let input = input.to_string();
    let owner = profile.create(&input, "101".into())?;
    Ok((profile, owner))
}

#[test]
fn all_original_model_bindings_replay_search_without_cross_family_migration() -> Result {
    for version in 1..=3 {
        let (profile, mut owner) = setup_profile(profile_version(version)?, prose("cat🙂cat"))?;
        owner.enable_search_history_guarded(&observed(&owner)?)?;
        let found = query(&owner, "cat", RichSearchMode::Literal)?;
        owner.replace_search_all_guarded(&observed(&owner)?, &found, &replacement("犬")?)?;
        assert_eq!(text(&owner, "body")?, "犬🙂犬");
        future(&profile, &mut owner)?;
        let other = profile_version(if version == 3 { 1 } else { version + 1 })?;
        assert!(other.restore_search("room", &owner.search_checkpoint()?).is_err());
    }
    Ok(())
}

#[test]
fn zero_width_matches_empty_bodies_and_multiline_scalar_boundaries_match_native_preview() -> Result
{
    for source in ["", "a🙂", "a🙂\ncat\n", "\n"] {
        let (profile, mut owner) = setup(prose(source))?;
        owner.enable_search_history_guarded(&observed(&owner)?)?;
        let found = query(&owner, "(?m)^|$", RichSearchMode::Regex)?;
        let request = replacement("|")?;
        let plan =
            breditor_core::rich_content::plan_rich_search_replace_all(found.results(), &request)?;
        let context = breditor_core::state::EditorContext::new(
            profile.schema().clone(),
            profile.limits().clone(),
        );
        let expected = plan.preview(&context, owner.document())?;
        owner.replace_search_all_guarded(&observed(&owner)?, &found, &request)?;
        assert_eq!(owner.document().document(), expected.document());
        assert_eq!(owner.undo_count(), 1);
        future(&profile, &mut owner)?;
        owner.undo()?;
        assert_eq!(text(&owner, "body")?, source);
    }
    Ok(())
}

#[test]
fn search_across_split_then_joined_original_sources_keeps_exact_recovery() -> Result {
    let (profile, mut owner) = setup(prose("cat cat🙂cat"))?;
    owner.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "body".into(),
        offset: 4,
        right: "right".into(),
        right_heading: None,
    })])?;
    owner.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "body".into(),
        right: "right".into(),
    })])?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let found = query(&owner, "cat", RichSearchMode::Literal)?;
    assert_eq!(found.results().matches().len(), 3);
    owner.replace_search_all_guarded(&observed(&owner)?, &found, &replacement("犬")?)?;
    assert_eq!(text(&owner, "body")?, "犬 犬🙂犬");
    future(&profile, &mut owner)?;
    owner.undo()?;
    assert_eq!(text(&owner, "body")?, "cat cat🙂cat");
    Ok(())
}

#[test]
fn enabling_document_typing_and_review_after_saved_search_keeps_both_history_branches() -> Result {
    for undone in [false, true] {
        let (profile, mut owner) = setup(prose("cat cat"))?;
        owner.enable_search_history_guarded(&observed(&owner)?)?;
        owner.set_selection(Some(&range("body", 6, 1)))?;
        let found = query(&owner, "cat", RichSearchMode::Literal)?;
        owner.replace_search_all_guarded(&observed(&owner)?, &found, &replacement("dog")?)?;
        if undone {
            owner.undo()?;
        }
        let before = (
            owner.document_json().to_owned(),
            owner.selection()?,
            owner.undo_count(),
            owner.redo_count(),
            owner.causal_version(),
        );
        configure(&mut owner, 2, true, true)?;
        assert!(owner.search_history_enabled());
        assert_eq!(
            (
                owner.document_json().to_owned(),
                owner.selection()?,
                owner.undo_count(),
                owner.redo_count(),
                owner.causal_version()
            ),
            before
        );
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn concurrent_insertion_inside_a_replaced_range_survives_selective_undo_and_redo() -> Result {
    let mut ordinary_states = None;
    for search in [false, true] {
        let (profile, mut first) = setup(prose("cat dog"))?;
        let mut second = profile.join_frame("room".into(), "102".into(), &first.update_frame()?)?;
        first.enable_search_history_guarded(&observed(&first)?)?;
        second.enable_search_history_guarded(&observed(&second)?)?;
        if search {
            let found = query(&first, "cat", RichSearchMode::Literal)?;
            first.replace_search_all_guarded(&observed(&first)?, &found, &replacement("CAT")?)?;
        } else {
            let point =
                |offset| TextPoint { block: "body".into(), offset, affinity: Affinity::After };
            first.apply(vec![Command::ReplaceTextRange(ReplaceTextRange {
                anchor: point(0),
                focus: point(3),
                runs: vec![RangeTextRun { text: "CAT".into(), formats: vec![] }],
            })])?;
        }
        second.apply(vec![Command::InsertText(InsertText {
            block: "body".into(),
            offset: 1,
            text: "<peer>".into(),
        })])?;
        sync(&mut first, &mut second)?;
        let replaced = text(&first, "body")?;
        assert_eq!(replaced.matches("<peer>").count(), 1);
        first.undo()?;
        sync(&mut first, &mut second)?;
        let undone = text(&first, "body")?;
        assert_eq!(undone.matches("<peer>").count(), 1);
        assert_eq!(undone.replace("<peer>", ""), "cat dog");
        first.redo()?;
        sync(&mut first, &mut second)?;
        let redone = text(&first, "body")?;
        assert_eq!(redone.matches("<peer>").count(), 1);
        assert_eq!(redone.replace("<peer>", ""), "CAT dog");
        // Existing selective Undo restores a deleted local chunk contiguously;
        // it does not promise the pre-deletion per-character peer interleaving.
        let states = (replaced, undone, redone);
        if let Some(expected) = &ordinary_states {
            assert_eq!(&states, expected);
        } else {
            ordinary_states = Some(states);
        }
        future(&profile, &mut first)?;
        future(&profile, &mut second)?;
    }
    Ok(())
}
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(if owner.document_selection_enabled() {
        owner.observe_document()?
    } else {
        owner.observe()?
    })
}
fn query(owner: &RichReplica, pattern: &str, mode: RichSearchMode) -> Result<SharedSearchResults> {
    Ok(owner.find_text_guarded(
        &observed(owner)?,
        &RichSearchQuery::try_new(pattern, mode, true, false)?,
    )?)
}
fn replacement(text: &str) -> Result<RichSearchReplacement> {
    Ok(RichSearchReplacement::try_new(text, RichSearchReplacementMode::Literal)?)
}
fn range(block: &str, anchor: u32, focus: u32) -> Selection {
    let point = |offset| TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point(anchor), focus: point(focus) }
}
fn text(owner: &RichReplica, block: &str) -> Result<String> {
    let id = breditor_core::rich_content::BlockId::try_new(block)?;
    let node = owner
        .document()
        .block_path(&id)
        .and_then(|path| owner.document().document().node_at(path).ok())
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or("text block")?;
    node.children()
        .iter()
        .map(|node| {
            node.as_text()
                .map(breditor_core::document::TextNode::text)
                .ok_or_else(|| "text run".into())
        })
        .collect()
}
fn old_saved(owner: &RichReplica) -> Result<String> {
    Ok(if owner.reviewed_history_enabled() {
        owner.reviewed_checkpoint()?
    } else if owner.document_selection_enabled() {
        if owner.typing_history_enabled() {
            owner.document_typing_checkpoint()?
        } else {
            owner.document_checkpoint()?
        }
    } else if owner.general_ranges_enabled() {
        if owner.typing_history_enabled() {
            owner.general_typing_checkpoint()?
        } else {
            owner.general_checkpoint()?
        }
    } else if owner.typing_history_enabled() {
        owner.typing_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}
fn reviewed() -> Result<ReviewedHistoryIdentity> {
    Ok(ReviewedHistoryIdentity {
        binding: "1".repeat(64),
        principal: ReviewPrincipalId::try_new("reviewer")?,
        effect_writer: "901".into(),
    })
}
fn configure(owner: &mut RichReplica, scope: u8, natural: bool, review: bool) -> Result {
    if scope == 1 {
        owner.enable_general_ranges_guarded(&observed(owner)?)?;
    }
    if scope == 2 {
        owner.enable_document_selection_guarded(&observed(owner)?)?;
    }
    if natural {
        owner.enable_typing_history_guarded(&observed(owner)?)?;
    }
    if review {
        owner.enable_reviewed_history_guarded(&observed(owner)?, reviewed()?)?;
    }
    Ok(())
}
fn future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let mut restored = profile.restore_search("room", &owner.search_checkpoint()?)?;
    assert_eq!(restored.search_checkpoint()?, owner.search_checkpoint()?);
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { owner.redo()? } else { owner.undo()? },
            if redo { restored.redo()? } else { restored.undo()? }
        );
        assert_eq!(owner.search_checkpoint()?, restored.search_checkpoint()?);
        assert_eq!(owner.document_json(), restored.document_json());
    }
    Ok(())
}
fn sync(first: &mut RichReplica, second: &mut RichReplica) -> Result {
    let a = first.update_frame()?;
    let b = second.update_frame()?;
    first.receive_frame(&b)?;
    second.receive_frame(&a)?;
    assert_eq!(first.document_json(), second.document_json());
    Ok(())
}

#[test]
fn search_reads_need_no_history_upgrade_and_do_not_touch_locked_owner_or_redo() -> Result {
    let (_, mut owner) = setup(prose("cat cat"))?;
    owner.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 0,
        text: "X".into(),
    })])?;
    owner.undo()?;
    owner.set_read_only_guarded(&observed(&owner)?, true)?;
    let before = old_saved(&owner)?;
    let current = observed(&owner)?;
    let result = query(&owner, "cat", RichSearchMode::Literal)?;
    assert_eq!(result.results().matches().len(), 2);
    result.results().selection(1)?.resolve(owner.document())?;
    assert!(!owner.search_history_enabled());
    assert_eq!(old_saved(&owner)?, before);
    owner.check(&current)?;
    assert_eq!(owner.redo_count(), 1);
    assert!(matches!(
        owner.replace_search_all_guarded(&current, &result, &replacement("dog")?),
        Err(Error::ReadOnly)
    ));
    assert_eq!(old_saved(&owner)?, before);
    Ok(())
}

#[test]
fn explicit_upgrade_keeps_writer_content_stacks_and_both_enable_orders() -> Result {
    for first in [false, true] {
        let (profile, mut owner) = setup(prose("cat"))?;
        owner.apply(vec![Command::InsertText(InsertText {
            block: "body".into(),
            offset: 3,
            text: "!".into(),
        })])?;
        owner.undo()?;
        let before = (
            owner.document_json().to_owned(),
            owner.causal_version(),
            owner.writer_clock_v2("101")?,
            owner.undo_count(),
            owner.redo_count(),
        );
        let old = old_saved(&owner)?;
        if first {
            owner.enable_search_history_guarded(&observed(&owner)?)?;
        }
        configure(&mut owner, 2, true, true)?;
        if !first {
            owner.enable_search_history_guarded(&observed(&owner)?)?;
        }
        assert_eq!(
            (
                owner.document_json().to_owned(),
                owner.causal_version(),
                owner.writer_clock_v2("101")?,
                owner.undo_count(),
                owner.redo_count()
            ),
            before
        );
        assert!(profile.restore_search("room", &old).is_err());
        assert!(profile.restore("room", &owner.search_checkpoint()?).is_err());
        assert!(owner.checkpoint().is_err() && owner.typing_checkpoint().is_err());
        assert!(owner.general_checkpoint().is_err() && owner.general_typing_checkpoint().is_err());
        assert!(
            owner.document_checkpoint().is_err() && owner.document_typing_checkpoint().is_err()
        );
        assert!(owner.reviewed_checkpoint().is_err());
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn all_scope_typing_and_review_policies_keep_exact_bulk_recovery_and_actual_selection() -> Result {
    for scope in 0..3 {
        for natural in [false, true] {
            for review in [false, true] {
                let (profile, mut owner) = setup(fixture::root())?;
                configure(&mut owner, scope, natural, review)?;
                owner.set_selection(Some(&range("caption", 4, 2)))?;
                owner.enable_search_history_guarded(&observed(&owner)?)?;
                let before = owner.document_json().to_owned();
                let selection = owner.selection()?;
                let result = query(&owner, "🙂", RichSearchMode::Literal)?;
                assert_eq!(result.results().matches().len(), 14);
                assert!(owner.replace_search_all_guarded(
                    &observed(&owner)?,
                    &result,
                    &replacement("日本語")?
                )?);
                assert_eq!(owner.undo_count(), 1);
                assert_eq!(owner.history_step_count(), 1);
                assert_eq!(text(&owner, "caption")?, "xy日本語");
                assert_eq!(owner.selection()?, Some(range("caption", 5, 5)));
                let after = owner.document_json().to_owned();
                owner.undo()?;
                assert_eq!(owner.document_json(), before);
                assert_eq!(owner.selection()?, selection);
                owner.redo()?;
                assert_eq!(owner.document_json(), after);
                future(&profile, &mut owner)?;
            }
        }
    }
    Ok(())
}

#[test]
fn all_4096_hits_use_one_semantic_record_and_one_selective_undo_group() -> Result {
    for natural in [false, true] {
        let source = "x ".repeat(RICH_SEARCH_MAX_MATCHES);
        let (profile, mut owner) = setup(prose(&source))?;
        configure(&mut owner, 0, natural, false)?;
        owner.enable_search_history_guarded(&observed(&owner)?)?;
        let result = query(&owner, "x", RichSearchMode::Literal)?;
        assert_eq!(result.results().matches().len(), RICH_SEARCH_MAX_MATCHES);
        assert!(owner.replace_search_all_guarded(
            &observed(&owner)?,
            &result,
            &replacement("y")?
        )?);
        assert_eq!(text(&owner, "body")?, "y ".repeat(RICH_SEARCH_MAX_MATCHES));
        assert_eq!(owner.undo_count(), 1);
        assert_eq!(owner.history_step_count(), 1);
        let saved: Value = serde_json::from_str(&owner.search_checkpoint()?)?;
        assert_eq!(saved["journal"]["entries"].as_array().ok_or("entries")?.len(), 1);
        assert_eq!(saved["journal"]["entries"][0]["kind"], "search_v1");
        assert_eq!(
            saved["journal"]["entries"][0]["action"]["edits"].as_array().ok_or("edits")?.len(),
            RICH_SEARCH_MAX_MATCHES
        );
        future(&profile, &mut owner)?;
        owner.undo()?;
        assert_eq!(text(&owner, "body")?, source);
    }
    Ok(())
}

#[test]
fn shared_results_survive_ui_only_publications_but_not_new_causal_or_restored_owners() -> Result {
    let (profile, mut owner) = setup(prose("cat cat"))?;
    let result = query(&owner, "cat", RichSearchMode::Literal)?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    owner.set_selection(Some(&range("body", 7, 7)))?;
    let stale = observed(&owner)?;
    owner.set_selection(Some(&range("body", 0, 0)))?;
    assert!(owner.replace_search_one_guarded(&stale, &result, 0, &replacement("dog")?).is_err());
    assert!(owner.replace_search_one_guarded(
        &observed(&owner)?,
        &result,
        0,
        &replacement("dog")?
    )?);
    owner.undo()?;
    let before = owner.search_checkpoint()?;
    assert_eq!(text(&owner, "body")?, "cat cat");
    assert!(
        owner
            .replace_search_one_guarded(&observed(&owner)?, &result, 0, &replacement("fox")?)
            .is_err()
    );
    assert_eq!(owner.search_checkpoint()?, before);
    assert_eq!(owner.redo_count(), 1);
    let result = query(&owner, "cat", RichSearchMode::Literal)?;
    let mut restored = profile.restore_search("room", &before)?;
    assert!(
        restored
            .replace_search_all_guarded(&observed(&restored)?, &result, &replacement("dog")?)
            .is_err()
    );
    assert_eq!(restored.search_checkpoint()?, before);
    Ok(())
}

#[test]
fn peers_with_identical_visible_text_still_invalidate_an_old_search_causal_basis() -> Result {
    let (profile, mut owner) = setup(fixture::root())?;
    let mut peer = profile.join_frame("room".into(), "102".into(), &owner.update_frame()?)?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let result = query(&owner, "🙂", RichSearchMode::Literal)?;
    let before_doc = owner.document_json().to_owned();
    peer.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "image".into(),
        text: "Other".into(),
        decorative: false,
    })])?;
    peer.undo()?;
    owner.receive_frame(&peer.update_frame()?)?;
    assert_eq!(owner.document_json(), before_doc);
    let before = owner.search_checkpoint()?;
    assert!(
        owner.replace_search_all_guarded(&observed(&owner)?, &result, &replacement("X")?).is_err()
    );
    assert_eq!(owner.search_checkpoint()?, before);
    Ok(())
}

#[test]
fn independent_offline_replacements_merge_and_undo_never_delete_peer_insertions() -> Result {
    let (profile, mut first) = setup(prose("cat dog tail"))?;
    let mut second = profile.join_frame("room".into(), "102".into(), &first.update_frame()?)?;
    first.enable_search_history_guarded(&observed(&first)?)?;
    second.enable_search_history_guarded(&observed(&second)?)?;
    let a = query(&first, "cat", RichSearchMode::Literal)?;
    let b = query(&second, "dog", RichSearchMode::Literal)?;
    first.replace_search_all_guarded(&observed(&first)?, &a, &replacement("CAT")?)?;
    second.replace_search_all_guarded(&observed(&second)?, &b, &replacement("DOG")?)?;
    second.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 12,
        text: " PEER".into(),
    })])?;
    sync(&mut first, &mut second)?;
    assert_eq!(text(&first, "body")?, "CAT DOG tail PEER");
    first.undo()?;
    second.receive_frame(&first.update_frame()?)?;
    assert_eq!(text(&first, "body")?, "cat DOG tail PEER");
    assert_eq!(first.document_json(), second.document_json());
    first.redo()?;
    sync(&mut first, &mut second)?;
    assert_eq!(text(&first, "body")?, "CAT DOG tail PEER");
    future(&profile, &mut first)?;
    future(&profile, &mut second)?;
    Ok(())
}

#[test]
fn scalar_safe_large_capture_expansion_is_not_limited_to_one_old_insertion_chunk() -> Result {
    let source = format!("a{}", "🙂".repeat(20_000));
    let (profile, mut owner) = setup(prose(&source))?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let result = query(&owner, "(?s)(.+)", RichSearchMode::Regex)?;
    let request = RichSearchReplacement::try_new("$1$1", RichSearchReplacementMode::Captures)?;
    owner.replace_search_all_guarded(&observed(&owner)?, &result, &request)?;
    assert_eq!(text(&owner, "body")?, source.repeat(2));
    assert_eq!(owner.undo_count(), 1);
    future(&profile, &mut owner)?;
    Ok(())
}

#[test]
fn malformed_templates_expansion_limits_and_true_identities_leave_exact_redo_and_tokens() -> Result
{
    let (_, mut owner) = setup(prose("x ".repeat(17).as_str()))?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let result = query(&owner, "x", RichSearchMode::Literal)?;
    owner.replace_search_one_guarded(&observed(&owner)?, &result, 0, &replacement("y")?)?;
    owner.undo()?;
    let result = query(&owner, "x", RichSearchMode::Literal)?;
    let current = observed(&owner)?;
    let before = owner.search_checkpoint()?;
    let invalid =
        RichSearchReplacement::try_new("${missing}", RichSearchReplacementMode::Captures)?;
    assert!(owner.replace_search_all_guarded(&current, &result, &invalid).is_err());
    assert!(
        owner
            .replace_search_all_guarded(
                &current,
                &result,
                &replacement(&"A".repeat(RICH_SEARCH_MAX_REPLACEMENT_BYTES))?
            )
            .is_err()
    );
    assert!(!owner.replace_search_all_guarded(&current, &result, &replacement("x")?)?);
    assert_eq!(owner.search_checkpoint()?, before);
    owner.check(&current)?;
    assert_eq!(owner.redo_count(), 1);
    let absent = query(&owner, "absent", RichSearchMode::Literal)?;
    assert!(!owner.replace_search_all_guarded(&current, &absent, &replacement("anything")?)?);
    assert_eq!(owner.search_checkpoint()?, before);
    Ok(())
}

#[test]
fn old_journal_names_never_admit_new_bulk_records_and_corrupt_search_records_fail_closed() -> Result
{
    let (profile, mut owner) = setup(prose("cat"))?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let result = query(&owner, "(?P<original>cat)", RichSearchMode::Regex)?;
    let request =
        RichSearchReplacement::try_new("${original}!", RichSearchReplacementMode::Captures)?;
    owner.replace_search_all_guarded(&observed(&owner)?, &result, &request)?;
    let saved = owner.search_checkpoint()?;
    assert!(!saved.contains("(?P<original>") && !saved.contains("${original}!"));
    let value: Value = serde_json::from_str(&saved)?;
    let mut old = value["journal"].clone();
    old["format"] = json!("breditor/rich-replica-journal");
    old["version"] = json!(owner.journal_version());
    assert!(matches!(
        profile.restore("room", &old.to_string()),
        Err(Error::Contract("search records require explicit history family"))
    ));
    for mutation in 0..6 {
        let mut altered = value.clone();
        match mutation {
            0 => altered["journal"]["entries"][0]["action"]["sourceDigest"] = json!("0".repeat(64)),
            1 => {
                altered["journal"]["entries"][0]["action"]["edits"][0]["anchor"]["offset"] =
                    json!("999");
            }
            2 => altered["journal"]["entries"][0]["action"]["query"] = json!("silently replay?"),
            3 => altered["scope"] = json!("unknown-v1"),
            4 => altered["surprise"] = json!(true),
            _ => altered["journal"]["entries"][0]["after_ui"]["pending"] = json!([]),
        }
        assert!(
            profile.restore_search("room", &altered.to_string()).is_err(),
            "mutation {mutation}"
        );
    }
    assert_eq!(owner.search_checkpoint()?, saved);
    Ok(())
}

#[test]
fn original_v2_receiver_admits_a_whole_bulk_group_without_selecting_search_history() -> Result {
    let (profile, mut server) = setup(prose("cat cat"))?;
    let mut author = profile.join_frame("room".into(), "102".into(), &server.update_frame()?)?;
    let from = author.writer_clock_v2("102")?.through;
    author.enable_search_history_guarded(&observed(&author)?)?;
    let result = query(&author, "cat", RichSearchMode::Literal)?;
    author.replace_search_all_guarded(&observed(&author)?, &result, &replacement("dog")?)?;
    let batch: Value =
        serde_json::from_str(&author.writer_groups_v2_guarded(&observed(&author)?, &from)?)?;
    assert_eq!(batch["groups"].as_array().ok_or("groups")?.len(), 1);
    let group = batch["groups"][0].as_str().ok_or("group")?;
    let WriterGroupPreparation::Prepared(prepared) =
        server.prepare_writer_group_v2("102", group)?
    else {
        return Err("prepared writer group".into());
    };
    assert_eq!(prepared.document_json(), author.document_json());
    assert!(prepared.search_checkpoint().is_err());
    assert!(profile.restore("room", &prepared.checkpoint()?).is_ok());
    server.commit_writer_group(*prepared)?;
    assert_eq!(server.document_json(), author.document_json());
    assert_eq!(server.undo_count(), 0);
    assert!(!server.search_history_enabled());
    Ok(())
}

#[test]
fn receiving_document_limits_reject_the_complete_candidate_without_touching_source() -> Result {
    let base = profile()?;
    let profile = SharedRichProfile::from_schema_v3(
        base.schema().clone(),
        DocumentLimits::default().with_max_text_bytes(3),
    )?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-search","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":prose("xx")}).to_string();
    let mut owner = profile.create(&input, "101".into())?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    let result = query(&owner, "x", RichSearchMode::Literal)?;
    let current = observed(&owner)?;
    let before = owner.search_checkpoint()?;
    assert!(owner.replace_search_all_guarded(&current, &result, &replacement("ab")?).is_err());
    assert_eq!(owner.search_checkpoint()?, before);
    owner.check(&current)?;
    Ok(())
}

#[test]
fn actual_replacement_is_isolated_from_typing_while_search_and_identity_keep_the_burst() -> Result {
    let (profile, mut owner) = setup(prose("x"))?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    owner.enable_typing_history_guarded(&observed(&owner)?)?;
    owner.set_selection(Some(&range("body", 1, 1)))?;
    owner.insert_typing_text_guarded(&observed(&owner)?, "a", 100)?;
    let result = query(&owner, "x", RichSearchMode::Literal)?;
    assert!(!owner.replace_search_all_guarded(&observed(&owner)?, &result, &replacement("x")?)?);
    owner.insert_typing_text_guarded(&observed(&owner)?, "b", 101)?;
    assert_eq!(owner.undo_count(), 1);
    assert_eq!(owner.history_step_count(), 2);
    let result = query(&owner, "x", RichSearchMode::Literal)?;
    owner.replace_search_all_guarded(&observed(&owner)?, &result, &replacement("y")?)?;
    owner.insert_typing_text_guarded(&observed(&owner)?, "c", 102)?;
    assert_eq!(owner.undo_count(), 3);
    future(&profile, &mut owner)?;
    for expected in ["yab", "xab", "x"] {
        owner.undo()?;
        assert_eq!(text(&owner, "body")?, expected);
    }
    Ok(())
}

#[test]
fn pending_caret_formats_are_retained_separately_from_replacement_inheritance_and_reopen() -> Result
{
    let (profile, mut owner) = setup(prose("cat"))?;
    owner.enable_search_history_guarded(&observed(&owner)?)?;
    owner.set_selection(Some(&range("body", 1, 1)))?;
    let formats = vec![json!({"type":"breditor/strong","properties":{}})];
    owner.set_pending_formats_guarded(&observed(&owner)?, Some(&formats))?;
    let result = query(&owner, "cat", RichSearchMode::Literal)?;
    owner.replace_search_all_guarded(&observed(&owner)?, &result, &replacement("DOG")?)?;
    assert_eq!(owner.selection()?, Some(range("body", 3, 3)));
    assert_eq!(owner.pending_formats(), Some(formats.as_slice()));
    let value: Value = serde_json::from_str(owner.document_json())?;
    assert_eq!(value["root"]["children"][0]["children"][0]["formats"], json!([]));
    owner.undo()?;
    assert_eq!(owner.selection()?, Some(range("body", 1, 1)));
    assert_eq!(owner.pending_formats(), Some(formats.as_slice()));
    owner.redo()?;
    future(&profile, &mut owner)?;
    Ok(())
}

#[test]
fn node_grid_and_document_scopes_survive_bulk_text_edits_and_exact_future_history() -> Result {
    for mode in 0..3 {
        let (profile, mut owner) = setup(fixture::root())?;
        owner.enable_document_selection_guarded(&observed(&owner)?)?;
        owner.enable_search_history_guarded(&observed(&owner)?)?;
        let cell = |row: &str, column: &str| CellTarget {
            table: "t".into(),
            row: row.into(),
            column: column.into(),
        };
        match mode {
            0 => {
                owner.set_selection(Some(&Selection::Node { block: "image".into() }))?;
            }
            1 => {
                owner.set_selection(Some(&Selection::Grid {
                    anchor: cell("r2", "c3"),
                    focus: cell("r0", "c0"),
                }))?;
            }
            _ => {
                owner.select_document_guarded(&observed(&owner)?)?;
            }
        }
        let before = if mode == 2 { None } else { owner.selection()? };
        let result = query(&owner, "🙂", RichSearchMode::Literal)?;
        owner.replace_search_all_guarded(&observed(&owner)?, &result, &replacement("X")?)?;
        if mode == 2 {
            assert!(owner.document_selected());
        } else {
            assert_eq!(owner.selection()?, before);
        }
        future(&profile, &mut owner)?;
    }
    Ok(())
}
