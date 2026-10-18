//! Native causal shortcuts use original commands, exact old-family recovery and peer-preserving Undo.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, ReviewedHistoryIdentity, RichReplica, SharedObservation, SharedRichProfile,
        actions::{InsertText, SetFormat},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::RichInputRuleOutcome;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u8, root: &Value) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/input-rules","version":1},"extensions":[]}).to_string();
    let profile = match version {
        1 => SharedRichProfile::from_standard_configuration_json_v1(&configuration)?,
        2 => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
    };
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let owner = profile.create(&input, "101".into())?;
    Ok((profile, owner))
}
fn root(children: Vec<Value>) -> Value {
    let mut r = fixture::element("document", "unused", children);
    r["properties"] = json!({"breditor/document-id":"room"});
    r
}
fn prose(text: &str) -> Value {
    root(vec![fixture::paragraph("body", text)])
}
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(if owner.document_selection_enabled() {
        owner.observe_document()?
    } else {
        owner.observe()?
    })
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn select(owner: &mut RichReplica, block: &str, offset: u32) -> Result {
    let p = point(block, offset);
    owner.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
    Ok(())
}
fn text(owner: &RichReplica, id: &str) -> Result<String> {
    let block = breditor_core::rich_content::BlockId::try_new(id)?;
    let path = owner.document().block_path(&block).ok_or("missing node")?;
    Ok(owner
        .document()
        .document()
        .node_at(path)?
        .as_element()
        .ok_or("wrong kind")?
        .children()
        .iter()
        .map(|n| n.as_text().map_or("", |t| t.text()))
        .collect())
}
fn save(owner: &RichReplica) -> Result<String> {
    Ok(if owner.search_history_enabled() {
        owner.search_checkpoint()?
    } else if owner.reviewed_history_enabled() {
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
fn restore(profile: &SharedRichProfile, owner: &RichReplica) -> Result<RichReplica> {
    let bytes = save(owner)?;
    Ok(if owner.search_history_enabled() {
        profile.restore_search("room", &bytes)?
    } else if owner.reviewed_history_enabled() {
        profile.restore_reviewed("room", &bytes)?
    } else if owner.document_selection_enabled() {
        if owner.typing_history_enabled() {
            profile.restore_document_typing("room", &bytes)?
        } else {
            profile.restore_document("room", &bytes)?
        }
    } else if owner.general_ranges_enabled() {
        if owner.typing_history_enabled() {
            profile.restore_general_typing("room", &bytes)?
        } else {
            profile.restore_general("room", &bytes)?
        }
    } else if owner.typing_history_enabled() {
        profile.restore_typing("room", &bytes)?
    } else {
        profile.restore("room", &bytes)?
    })
}
fn future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let mut twin = restore(profile, owner)?;
    assert_eq!(save(&twin)?, save(owner)?);
    for undo in [true, false, true, false] {
        if undo {
            owner.undo()?;
            twin.undo()?;
        } else {
            owner.redo()?;
            twin.redo()?;
        }
        assert_eq!(save(&twin)?, save(owner)?);
    }
    Ok(())
}
fn type_key(owner: &mut RichReplica, key: &str) -> Result {
    if owner.typing_history_enabled() {
        owner.insert_typing_text_guarded(&observed(owner)?, key, 100)?;
    } else {
        owner.insert_plain_text_guarded(&observed(owner)?, key)?;
    }
    Ok(())
}

fn type_and_rule(
    owner: &mut RichReplica,
    key: &str,
    ns: &str,
    clock: u64,
) -> Result<RichInputRuleOutcome> {
    Ok(if owner.typing_history_enabled() {
        owner.insert_typing_text_with_markdown_rules_guarded(&observed(owner)?, key, clock, ns)?
    } else {
        owner.insert_plain_text_with_markdown_rules_guarded(&observed(owner)?, key, ns)?
    })
}

#[test]
fn exclusive_typing_matches_original_native_commands_in_all_scope_and_history_families() -> Result {
    for scope in 0..3 {
        for natural in [false, true] {
            for search in [false, true] {
                for (source, key) in [
                    ("#", " "),
                    ("-", " "),
                    (">", " "),
                    ("[x]", " "),
                    ("```rust", " "),
                    ("---", " "),
                    ("**猫🙂*", "*"),
                ] {
                    let (profile, mut owner) = setup(3, &prose(source))?;
                    if scope == 1 {
                        owner.enable_general_ranges_guarded(&observed(&owner)?)?;
                    } else if scope == 2 {
                        owner.enable_document_selection_guarded(&observed(&owner)?)?;
                    }
                    if natural {
                        owner.enable_typing_history_guarded(&observed(&owner)?)?;
                    }
                    if search {
                        owner.enable_search_history_guarded(&observed(&owner)?)?;
                    }
                    select(&mut owner, "body", u32::try_from(source.encode_utf16().count())?)?;
                    let mut control = restore(&profile, &owner)?;
                    assert_eq!(
                        type_and_rule(&mut owner, key, "fresh", 100)?,
                        RichInputRuleOutcome::Applied
                    );
                    type_key(&mut control, key)?;
                    control.apply_markdown_input_rule_guarded(
                        &observed(&control)?,
                        key,
                        "fresh",
                    )?;
                    assert_eq!(save(&owner)?, save(&control)?);
                    owner.undo()?;
                    assert_eq!(text(&owner, "body")?, format!("{source}{key}"));
                    owner.redo()?;
                    future(&profile, &mut owner)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn exclusive_refusal_retains_input_including_after_causal_identity_reuse() -> Result {
    for natural in [false, true] {
        let (profile, mut owner) = setup(3, &prose("-"))?;
        if natural {
            owner.enable_typing_history_guarded(&observed(&owner)?)?;
        }
        select(&mut owner, "body", 1)?;
        assert_eq!(
            type_and_rule(&mut owner, " ", "bad namespace", 100)?,
            RichInputRuleOutcome::Refused
        );
        assert_eq!(text(&owner, "body")?, "- ");
        assert_eq!(owner.undo_count(), 1);
        owner.undo()?;
        assert_eq!(type_and_rule(&mut owner, " ", "fresh", 200)?, RichInputRuleOutcome::Applied);
        owner.undo()?;
        owner.undo()?;
        assert_eq!(text(&owner, "body")?, "-");
        assert_eq!(type_and_rule(&mut owner, " ", "fresh", 300)?, RichInputRuleOutcome::Refused);
        assert_eq!(text(&owner, "body")?, "- ");
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn exclusive_nonmatches_keep_natural_continuation_and_empty_input_keeps_redo() -> Result {
    let (profile, mut owner) = setup(3, &prose(""))?;
    owner.enable_typing_history_guarded(&observed(&owner)?)?;
    select(&mut owner, "body", 0)?;
    for (clock, key) in [(1, "h"), (2, "i")] {
        assert_eq!(
            type_and_rule(&mut owner, key, "unused", clock)?,
            RichInputRuleOutcome::Inserted
        );
    }
    assert_eq!(owner.undo_count(), 1);
    owner.undo()?;
    let before = save(&owner)?;
    assert_eq!(type_and_rule(&mut owner, "", "bad namespace", 3)?, RichInputRuleOutcome::Unchanged);
    assert_eq!(save(&owner)?, before);
    owner.redo()?;
    assert_eq!(text(&owner, "body")?, "hi");
    future(&profile, &mut owner)?;
    Ok(())
}

#[test]
fn exclusive_typing_rejects_stale_range_readonly_and_document_targets_before_mutation() -> Result {
    let (_, mut owner) = setup(3, &prose("#"))?;
    select(&mut owner, "body", 1)?;
    let stale = observed(&owner)?;
    owner.set_selection(Some(&Selection::TextRange {
        anchor: point("body", 0),
        focus: point("body", 1),
    }))?;
    let before = save(&owner)?;
    assert!(owner.insert_plain_text_with_markdown_rules_guarded(&stale, " ", "fresh").is_err());
    assert!(
        owner
            .insert_plain_text_with_markdown_rules_guarded(&observed(&owner)?, " ", "fresh")
            .is_err()
    );
    assert_eq!(save(&owner)?, before);
    select(&mut owner, "body", 1)?;
    let before = save(&owner)?;
    assert!(
        owner
            .insert_typing_text_with_markdown_rules_guarded(&observed(&owner)?, " ", 1, "fresh")
            .is_err()
    );
    assert_eq!(save(&owner)?, before);
    owner.enable_document_selection_guarded(&observed(&owner)?)?;
    owner.select_document_guarded(&observed(&owner)?)?;
    let before = save(&owner)?;
    assert!(
        owner
            .insert_plain_text_with_markdown_rules_guarded(&observed(&owner)?, " ", "fresh")
            .is_err()
    );
    assert_eq!(save(&owner)?, before);
    owner.set_read_only_guarded(&observed(&owner)?, true)?;
    let before = save(&owner)?;
    assert!(
        owner
            .insert_plain_text_with_markdown_rules_guarded(&observed(&owner)?, " ", "fresh")
            .is_err()
    );
    assert_eq!(save(&owner)?, before);
    Ok(())
}

#[test]
fn all_grammars_and_histories_replay_structural_shortcuts_as_original_semantic_commands() -> Result
{
    for version in 1..=3 {
        for natural in [false, true] {
            let mut markers = vec!["#", "######", "-", "+", "*", "17.", "2147483647)"];
            if version >= 2 {
                markers.extend([">", "[ ]", "[x]", "[X]", "```", "```rust", "---", "***", "___"]);
            }
            for marker in markers {
                let (profile, mut owner) = setup(version, &prose(marker))?;
                if natural {
                    owner.enable_typing_history_guarded(&observed(&owner)?)?;
                }
                select(&mut owner, "body", u32::try_from(marker.len())?)?;
                type_key(&mut owner, " ")?;
                let literal = owner.document_json().to_owned();
                let before_selection = owner.selection()?;
                let depth = owner.undo_count();
                assert!(
                    owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "rule")?,
                    "{marker}"
                );
                assert_eq!(text(&owner, "body")?, "");
                assert_eq!(owner.undo_count(), depth + 1);
                let transformed = owner.document_json().to_owned();
                owner.undo()?;
                assert_eq!(owner.document_json(), literal);
                assert_eq!(owner.selection()?, before_selection);
                assert_eq!(text(&owner, "body")?, format!("{marker} "));
                owner.redo()?;
                assert_eq!(owner.document_json(), transformed);
                future(&profile, &mut owner)?;
            }
        }
    }
    Ok(())
}

#[test]
fn inline_rules_preserve_formats_unicode_caret_and_exact_recovered_selective_history() -> Result {
    for natural in [false, true] {
        for (source, key, format) in [
            ("**猫🙂*", "*", "breditor/strong"),
            ("__猫🙂_", "_", "breditor/strong"),
            ("*猫🙂", "*", "breditor-inline/italic"),
            ("_猫🙂", "_", "breditor-inline/italic"),
            ("~~猫🙂~", "~", "breditor-inline/strike"),
            ("`猫🙂", "`", "breditor-inline/code"),
        ] {
            let (profile, mut owner) = setup(3, &prose(&format!("🙂 {source}")))?;
            if natural {
                owner.enable_typing_history_guarded(&observed(&owner)?)?;
            }
            let length = u32::try_from(text(&owner, "body")?.encode_utf16().count())?;
            select(&mut owner, "body", length)?;
            type_key(&mut owner, key)?;
            let pending = owner.caret_formats_json_guarded(&observed(&owner)?)?;
            owner.apply_markdown_input_rule_guarded(&observed(&owner)?, key, "unused")?;
            assert_eq!(text(&owner, "body")?, "🙂 猫🙂");
            assert!(owner.document_json().contains(format));
            assert_eq!(owner.caret_formats_json_guarded(&observed(&owner)?)?, pending);
            future(&profile, &mut owner)?;
        }
    }
    Ok(())
}

#[test]
fn original_general_document_search_and_reviewed_policies_keep_their_exact_family() -> Result {
    for scope in 0..3 {
        for natural in [false, true] {
            for reviewed in [false, true] {
                for search in [false, true] {
                    let (profile, mut owner) = setup(3, &prose("- "))?;
                    if scope == 1 {
                        owner.enable_general_ranges_guarded(&observed(&owner)?)?;
                    } else if scope == 2 {
                        owner.enable_document_selection_guarded(&observed(&owner)?)?;
                    }
                    if natural {
                        owner.enable_typing_history_guarded(&observed(&owner)?)?;
                    }
                    if reviewed {
                        owner.enable_reviewed_history_guarded(
                            &observed(&owner)?,
                            ReviewedHistoryIdentity {
                                binding: "a".repeat(64),
                                principal:
                                    breditor_core::rich_content::review::ReviewPrincipalId::try_new(
                                        "alice",
                                    )?,
                                effect_writer: "303".into(),
                            },
                        )?;
                    }
                    if search {
                        owner.enable_search_history_guarded(&observed(&owner)?)?;
                    }
                    select(&mut owner, "body", 2)?;
                    let format: Value = serde_json::from_str(&save(&owner)?)?;
                    owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "rule")?;
                    let after: Value = serde_json::from_str(&save(&owner)?)?;
                    assert_eq!(after["format"], format["format"]);
                    future(&profile, &mut owner)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn peer_insertions_inside_retained_rule_content_survive_undo_redo_and_converge() -> Result {
    for (source, key) in [("# ", " "), ("- ", " "), ("> ", " "), ("[x] ", " "), ("**猫🙂**", "*")]
    {
        let (profile, mut a) = setup(3, &prose(source))?;
        select(&mut a, "body", u32::try_from(source.encode_utf16().count())?)?;
        let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
        a.apply_markdown_input_rule_guarded(&observed(&a)?, key, "rule")?;
        b.apply(vec![Command::InsertText(InsertText {
            block: "body".into(),
            offset: u32::try_from(source.encode_utf16().count())?,
            text: "PEER".into(),
        })])?;
        a.receive_frame(&b.update_frame()?)?;
        b.receive_frame(&a.update_frame()?)?;
        assert_eq!(a.document_json(), b.document_json());
        assert!(text(&a, "body")?.contains("PEER"));
        for undo in [true, false] {
            if undo {
                a.undo()?;
            } else {
                a.redo()?;
            }
            b.receive_frame(&a.update_frame()?)?;
            assert_eq!(a.document_json(), b.document_json());
            assert!(text(&a, "body")?.contains("PEER"));
        }
        future(&profile, &mut a)?;
    }
    Ok(())
}

#[test]
fn stale_readonly_reused_historical_ids_and_no_matches_never_change_source_or_redo() -> Result {
    let (profile, mut owner) = setup(3, &prose("- "))?;
    select(&mut owner, "body", 2)?;
    let old = observed(&owner)?;
    owner.apply_markdown_input_rule_guarded(&old, " ", "rule")?;
    owner.undo()?;
    let before = save(&owner)?;
    assert!(owner.apply_markdown_input_rule_guarded(&old, " ", "fresh").is_err());
    assert_eq!(save(&owner)?, before);
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "rule").is_err());
    assert_eq!(save(&owner)?, before);
    assert!(!owner.apply_markdown_input_rule_guarded(&observed(&owner)?, "!", "unused")?);
    assert_eq!(save(&owner)?, before);
    owner.set_read_only_guarded(&observed(&owner)?, true)?;
    let before = save(&owner)?;
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "fresh").is_err());
    assert_eq!(save(&owner)?, before);
    let peer = profile.join_frame("room".into(), "202".into(), &owner.update_frame()?)?;
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&peer)?, " ", "fresh").is_err());
    assert_eq!(save(&owner)?, before);
    Ok(())
}

#[test]
fn cell_rules_use_the_real_parent_and_captions_never_become_structural_wrappers() -> Result {
    let mut tree = fixture::root();
    tree["children"][2]["children"][0]["children"][0]["children"][0] =
        fixture::paragraph("p-0-0", "--- ");
    tree["children"][2]["children"][2]["children"][1]["children"][1]["children"][0] =
        fixture::paragraph("caption", "# ");
    let (profile, mut owner) = setup(3, &tree)?;
    select(&mut owner, "caption", 2)?;
    let before = save(&owner)?;
    assert!(!owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "caption")?);
    assert_eq!(save(&owner)?, before);
    select(&mut owner, "p-0-0", 4)?;
    owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "cell")?;
    assert_eq!(text(&owner, "p-0-0")?, "");
    future(&profile, &mut owner)?;
    Ok(())
}

#[test]
fn formatted_code_suffix_rejects_without_partial_marker_deletion() -> Result {
    let (_, mut owner) = setup(3, &prose("``` text"))?;
    select(&mut owner, "body", 4)?;
    owner.apply(vec![Command::SetFormat(SetFormat {
        block: "body".into(),
        offset: 4,
        length: 4,
        format: json!({"type":"breditor/strong","properties":{}}),
        enabled: true,
    })])?;
    let before = save(&owner)?;
    assert!(owner.apply_markdown_input_rule_guarded(&observed(&owner)?, " ", "rule").is_err());
    assert_eq!(save(&owner)?, before);
    Ok(())
}
