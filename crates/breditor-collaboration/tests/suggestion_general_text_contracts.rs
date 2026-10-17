//! Pure protected-range proposal planning uses native coverage, namespaces and original packets.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
        RichReplica, SharedRichProfile,
        actions::{InsertBlocks, InsertText},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::review::ReviewPrincipalId,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn owner() -> Result<(SharedRichProfile, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/suggestion-range-planner","version":1},"extensions":[]}"#,
    )?;
    let source = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/suggestion-range-planner","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":fixture::root()});
    let owner = profile.create(&source.to_string(), "101".into())?;
    Ok((profile, owner))
}
fn target(a: &str, x: u32, b: &str, y: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: x, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: y, affinity: Affinity::After },
    }
}
fn inserted() -> Result<TextFragment> {
    Ok(TextRun::try_new("Proposed 🙂", FormatSet::default())?.into())
}
fn configure(a: &mut RichReplica, scope: u8, typing: bool) -> Result {
    match scope {
        0 => {}
        1 => {
            a.enable_general_ranges_guarded(&a.observe()?)?;
        }
        2 => {
            a.enable_document_selection_guarded(&a.observe()?)?;
        }
        _ => return Err("test policy".into()),
    }
    if typing {
        a.enable_typing_history_guarded(&a.observe()?)?;
    }
    Ok(())
}
fn save(a: &RichReplica, scope: u8, typing: bool) -> Result<String> {
    Ok(match (scope, typing) {
        (0, false) => a.checkpoint()?,
        (0, true) => a.typing_checkpoint()?,
        (1, false) => a.general_checkpoint()?,
        (1, true) => a.general_typing_checkpoint()?,
        (2, false) => a.document_checkpoint()?,
        (2, true) => a.document_typing_checkpoint()?,
        _ => return Err("test policy".into()),
    })
}
fn restore(p: &SharedRichProfile, source: &str, scope: u8, typing: bool) -> Result<RichReplica> {
    Ok(match (scope, typing) {
        (0, false) => p.restore("room", source)?,
        (0, true) => p.restore_typing("room", source)?,
        (1, false) => p.restore_general("room", source)?,
        (1, true) => p.restore_general_typing("room", source)?,
        (2, false) => p.restore_document("room", source)?,
        (2, true) => p.restore_document_typing("room", source)?,
        _ => return Err("test policy".into()),
    })
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        Some(node)
    } else {
        node["children"].as_array()?.iter().find_map(|child| find(child, id))
    }
}
fn preview(a: &RichReplica, draft: DocumentSuggestionDraft) -> Result<String> {
    let observed = a.observe()?;
    let packet = a.capture_document_suggestion_guarded(
        &observed,
        "Protected text proposal",
        ReviewPrincipalId::try_new("alice")?,
        "1792200000000",
        draft,
    )?;
    let value: Value = serde_json::from_str(&packet)?;
    assert_eq!(value["data"]["format"], "breditor/document-suggestion");
    assert_eq!(value["data"]["formatVersion"], 1);
    match a.prepare_document_suggestion_guarded(&observed, &packet)? {
        DocumentSuggestionPreparation::Ready(preview) => Ok(preview.document_json().into()),
        _ => Err("expected original ready preview".into()),
    }
}

#[test]
fn native_floor_plans_are_pure_in_all_six_readonly_history_policies_and_both_directions() -> Result
{
    for scope in 0..=2 {
        for typing in [false, true] {
            for backward in [false, true] {
                let (p, mut a) = owner()?;
                configure(&mut a, scope, typing)?;
                a.apply(vec![Command::InsertText(InsertText {
                    block: "z-intro".into(),
                    offset: 0,
                    text: "Undo branch ".into(),
                })])?;
                a.undo()?;
                a.set_selection(Some(&Selection::Node { block: "image".into() }))?;
                a.set_read_only_guarded(&a.observe()?, true)?;
                let exact = (save(&a, scope, typing)?, a.update_frame()?, a.view_json()?);
                let range = if backward {
                    target("p-1-1", 3, "p-0-0", 1)
                } else {
                    target("p-0-0", 1, "p-1-1", 3)
                };
                let draft = a.plan_suggestion_general_text_guarded(
                    &a.observe()?,
                    &range,
                    &inserted()?,
                    "reserved",
                )?;
                let DocumentSuggestionEdit::GeneralText(action) = &draft.edit else {
                    return Err("general intent".into());
                };
                assert_eq!(
                    action.empty,
                    (0..4).map(|i| format!("reserved:range:{i}")).collect::<Vec<_>>()
                );
                let after: Value = serde_json::from_str(&preview(&a, draft.clone())?)?;
                let before: Value = serde_json::from_str(a.document_json())?;
                assert_eq!(
                    find(&after["root"], "table").ok_or("table")?["properties"],
                    find(&before["root"], "table").ok_or("table")?["properties"]
                );
                assert_eq!(find(&after["root"], "p-2-2"), find(&before["root"], "p-2-2"));
                assert!(find(&after["root"], "reserved:range:0").is_some());
                assert_eq!((save(&a, scope, typing)?, a.update_frame()?, a.view_json()?), exact);
                let recovered = restore(&p, &exact.0, scope, typing)?;
                assert_eq!(
                    recovered.plan_suggestion_general_text_guarded(
                        &recovered.observe()?,
                        &range,
                        &inserted()?,
                        "reserved"
                    )?,
                    draft
                );
                a.set_read_only_guarded(&a.observe()?, false)?;
                // Host permissions are deliberately not serialized. Compare future native bytes
                // from the same unlocked publication, not two different policy transitions.
                let mut recovered = restore(&p, &save(&a, scope, typing)?, scope, typing)?;
                a.redo()?;
                recovered.redo()?;
                assert_eq!(save(&a, scope, typing)?, save(&recovered, scope, typing)?);
            }
        }
    }
    Ok(())
}

#[test]
fn explicit_caption_range_preserves_partial_image_and_does_not_restage_live_selection() -> Result {
    let (_, mut a) = owner()?;
    a.set_selection(Some(&target("z-intro", 0, "z-intro", 0)))?;
    let exact = a.checkpoint()?;
    let draft = a.plan_suggestion_general_text_guarded(
        &a.observe()?,
        &target("p-2-0", 1, "caption", 1),
        &inserted()?,
        "caption-proposal",
    )?;
    let after: Value = serde_json::from_str(&preview(&a, draft)?)?;
    let before: Value = serde_json::from_str(a.document_json())?;
    assert_eq!(
        find(&after["root"], "image").ok_or("image")?["properties"],
        find(&before["root"], "image").ok_or("image")?["properties"]
    );
    assert_eq!(find(&after["root"], "caption").ok_or("caption")?["children"][0]["text"], "y🙂");
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}

#[test]
fn closed_namespace_bridge_returns_the_exact_original_typed_draft_and_preserves_rich_runs() -> Result
{
    let (_, a) = owner()?;
    let input = json!({"selection":target("p-0-0",1,"p-1-1",3),"runs":[{"text":"Proposed 🙂","formatsJson":"[]"}],"prefix":"reserved"});
    let exact = a.checkpoint()?;
    let typed = a.plan_suggestion_general_text_guarded(
        &a.observe()?,
        &target("p-0-0", 1, "p-1-1", 3),
        &inserted()?,
        "reserved",
    )?;
    assert_eq!(
        a.plan_suggestion_general_text_namespace_json_guarded(&a.observe()?, &input.to_string())?,
        typed
    );
    let mut rich = input.clone();
    rich["runs"][0]["formatsJson"] = json!(r#"[{"type":"breditor/strong","properties":{}}]"#);
    let draft =
        a.plan_suggestion_general_text_namespace_json_guarded(&a.observe()?, &rich.to_string())?;
    let DocumentSuggestionEdit::GeneralText(action) = &draft.edit else {
        return Err("general intent".into());
    };
    assert_eq!(action.range.runs[0].formats[0]["type"], "breditor/strong");
    preview(&a, draft)?;
    for invalid in [
        {
            let mut x = input.clone();
            x["author"] = json!("ignored authority");
            x
        },
        {
            let mut x = input.clone();
            x["runs"][0]["unknown"] = json!(true);
            x
        },
        {
            let mut x = input.clone();
            x["runs"][0]["formatsJson"] = json!("not-json");
            x
        },
        {
            let mut x = input.clone();
            x["prefix"] = json!("invalid prefix");
            x
        },
        {
            let mut x = input.clone();
            x["selection"]["anchor"]["offset"] = json!("2");
            x
        },
    ] {
        assert!(
            a.plan_suggestion_general_text_namespace_json_guarded(
                &a.observe()?,
                &invalid.to_string()
            )
            .is_err()
        );
    }
    assert_eq!(a.checkpoint()?, exact);
    Ok(())
}

#[test]
fn hidden_historical_floor_births_are_not_reusable_even_after_undo() -> Result {
    let (_, mut a) = owner()?;
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: None,
        nodes: vec![fixture::paragraph("used:range:0", "")],
    })])?;
    a.undo()?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(
        a.plan_suggestion_general_text_guarded(
            &a.observe()?,
            &target("p-0-0", 1, "p-1-1", 3),
            &inserted()?,
            "used"
        )
        .is_err()
    );
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}

#[test]
fn noops_nontext_stale_foreign_and_invalid_namespaces_reject_purely() -> Result {
    let (_, mut a) = owner()?;
    let (_, b) = owner()?;
    let stale = a.observe()?;
    a.set_selection(Some(&target("z-intro", 0, "z-intro", 0)))?;
    let exact = (a.checkpoint()?, a.update_frame()?, a.view_json()?);
    assert!(a.plan_suggestion_general_text_namespace_json_guarded(&stale, "not-json").is_err());
    assert!(
        a.plan_suggestion_general_text_guarded(
            &b.observe()?,
            &target("z-intro", 0, "z-intro", 1),
            &inserted()?,
            "fresh"
        )
        .is_err()
    );
    assert!(
        a.plan_suggestion_general_text_guarded(
            &a.observe()?,
            &target("z-intro", 0, "z-intro", 0),
            &TextFragment::empty(),
            "fresh"
        )
        .is_err()
    );
    assert!(
        a.plan_suggestion_general_text_guarded(
            &a.observe()?,
            &Selection::Node { block: "image".into() },
            &inserted()?,
            "fresh"
        )
        .is_err()
    );
    for prefix in ["", "invalid prefix", &"x".repeat(91)] {
        assert!(
            a.plan_suggestion_general_text_guarded(
                &a.observe()?,
                &target("z-intro", 0, "z-intro", 1),
                &inserted()?,
                prefix
            )
            .is_err()
        );
    }
    assert_eq!((a.checkpoint()?, a.update_frame()?, a.view_json()?), exact);
    Ok(())
}
