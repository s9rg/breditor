//! Optional typed autolink: safe canonical targets, exclusions and one isolated Undo group.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichInputRuleKind, RichInputRuleOutcome, RichInputRuleSet,
        RichInputRuleStep, RichLocalOutcome, RichLocalSession, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint,
        actions::{RichAction, SplitTextBlock},
        plan_rich_input_rule, rich_autolink_candidate, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const AUTOLINK: RichInputRuleSet = RichInputRuleSet::AUTOLINK_V1;

fn setup(
    children: Vec<Value>,
    natural: bool,
    standard: bool,
) -> Result<(EditorContext, RichLocalSession)> {
    let id = SchemaId::new(QualifiedName::try_new("example/autolink")?, SchemaVersion::try_new(1)?);
    let manifests = if standard { vec![standard_inline_extension_v1()] } else { vec![] };
    let extensions = ExtensionSet::try_new(manifests, ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/autolink","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?,
        context.limits(),
    )?;
    let mut owner =
        RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::try_new(128)?)?;
    if natural {
        owner.enable_typing_history(&owner.snapshot())?;
    }
    Ok((context, owner))
}
fn point(id: &str, offset: usize) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(
        BlockId::try_new(id)?,
        TextOffset::try_new(offset as u64)?,
        Affinity::After,
    ))
}
fn select(owner: &mut RichLocalSession, id: &str, offset: usize) -> Result {
    let p = point(id, offset)?;
    owner.set_selection(
        &owner.snapshot(),
        Some(RichSelectionKind::TextRange { anchor: p.clone(), focus: p }),
    )?;
    Ok(())
}
fn saved(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
/// Text runs of one current block as (text, link href; a new-window link is suffixed "|new").
fn runs(
    _context: &EditorContext,
    owner: &RichLocalSession,
    id: &str,
) -> Result<Vec<(String, String)>> {
    let document = owner.state().document();
    let node = document
        .document()
        .node_at(document.block_path(&BlockId::try_new(id)?).ok_or("missing block")?)?
        .as_element()
        .ok_or("wrong kind")?;
    let href = QualifiedName::try_new("breditor-inline/href")?;
    let new = QualifiedName::try_new("breditor-inline/new-window")?;
    node.children()
        .iter()
        .map(|run| {
            let text = run.as_text().ok_or("text")?;
            let link = text.formats().iter().find(|f| f.kind().as_str() == "breditor-inline/link");
            let value = link.map_or(String::new(), |f| {
                let target = f
                    .properties()
                    .get(&href)
                    .and_then(breditor_core::document::PropertyValue::as_string)
                    .unwrap_or("?");
                let blank = f
                    .properties()
                    .get(&new)
                    .and_then(breditor_core::document::PropertyValue::as_boolean)
                    == Some(true);
                format!("{target}{}", if blank { "|new" } else { "" })
            });
            Ok((text.text().to_owned(), value))
        })
        .collect()
}
fn type_text(
    owner: &mut RichLocalSession,
    text: &str,
    rules: RichInputRuleSet,
) -> Result<RichInputRuleOutcome> {
    let mut last = RichInputRuleOutcome::Unchanged;
    for (clock, c) in text.chars().enumerate() {
        let key = c.to_string();
        last = if owner.typing_history_enabled() {
            owner.insert_typing_text_with_input_rules(
                &owner.snapshot(),
                &key,
                clock as u64,
                "ns",
                rules,
            )?
        } else {
            owner.insert_plain_text_with_input_rules(&owner.snapshot(), &key, "ns", rules)?
        };
    }
    Ok(last)
}
fn pair(text: &str, href: &str) -> (String, String) {
    (text.to_owned(), href.to_owned())
}

#[test]
fn space_links_the_candidate_and_one_undo_keeps_the_typed_space() -> Result {
    for natural in [false, true] {
        let (context, mut owner) = setup(vec![fixture::paragraph("body", "")], natural, true)?;
        select(&mut owner, "body", 0)?;
        assert_eq!(
            type_text(&mut owner, "see https://example.com/a.", AUTOLINK)?,
            RichInputRuleOutcome::Inserted
        );
        let depth = owner.undo_depth();
        assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Applied);
        assert_eq!(
            runs(&context, &owner, "body")?,
            vec![
                pair("see ", ""),
                pair("https://example.com/a", "https://example.com/a"),
                pair(". ", "")
            ]
        );
        assert_eq!(
            owner.state().selection().map(|s| s.kind().clone()),
            Some(RichSelectionKind::TextRange {
                anchor: point("body", 27)?,
                focus: point("body", 27)?
            })
        );
        assert!(owner.undo_depth() > depth);
        owner.undo(&owner.snapshot())?;
        assert_eq!(runs(&context, &owner, "body")?, vec![pair("see https://example.com/a. ", "")]);
        owner.redo(&owner.snapshot())?;
        assert_eq!(
            runs(&context, &owner, "body")?[1],
            pair("https://example.com/a", "https://example.com/a")
        );
        // Following input is ordinary, unlinked text after the boundary.
        assert_eq!(type_text(&mut owner, "x", AUTOLINK)?, RichInputRuleOutcome::Inserted);
        assert_eq!(runs(&context, &owner, "body")?.last(), Some(&pair(". x", "")));
    }
    Ok(())
}

#[test]
fn www_and_bare_authorities_use_the_canonical_safe_target() -> Result {
    for (typed, linked, href) in [
        ("www.example.com", "www.example.com", "https://www.example.com/"),
        ("(https://example.com/x_(y))", "https://example.com/x_(y)", "https://example.com/x_(y)"),
        ("http://localhost:3000", "http://localhost:3000", "http://localhost:3000/"),
        ("猫🙂 https://example.com,", "https://example.com", "https://example.com/"),
    ] {
        let (context, mut owner) = setup(vec![fixture::paragraph("body", typed)], false, true)?;
        select(&mut owner, "body", typed.encode_utf16().count())?;
        assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Applied, "{typed}");
        let runs = runs(&context, &owner, "body")?;
        assert!(runs.contains(&pair(linked, href)), "{typed}: {runs:?}");
        let plain: String = runs.iter().map(|r| r.0.as_str()).collect();
        assert_eq!(plain, format!("{typed} "));
    }
    Ok(())
}

#[test]
fn unsafe_non_canonical_and_excluded_candidates_stay_literal() -> Result {
    let long_ok = format!("https://example.com/{}", "a".repeat(2048 - 20));
    let long_bad = format!("{long_ok}a");
    assert_eq!(rich_autolink_candidate(&long_ok).map(|c| c.href().len()), Some(2048));
    for typed in [
        "javascript:alert(1)",
        "data:text/html,hi",
        "HTTPS://EXAMPLE.COM",
        "https://user@example.com",
        "https://example.com/ü",
        "https://例え.jp",
        "example.com",
        "https://",
        long_bad.as_str(),
    ] {
        let (context, mut owner) = setup(vec![fixture::paragraph("body", typed)], true, true)?;
        select(&mut owner, "body", typed.encode_utf16().count())?;
        let before = owner.undo_depth();
        assert_eq!(
            type_text(&mut owner, " ", AUTOLINK)?,
            RichInputRuleOutcome::Inserted,
            "{typed}"
        );
        assert_eq!(runs(&context, &owner, "body")?, vec![pair(&format!("{typed} "), "")]);
        assert_eq!(owner.undo_depth(), before.max(1));
    }
    let (context, mut owner) = setup(vec![fixture::paragraph("body", &long_ok)], false, true)?;
    select(&mut owner, "body", long_ok.len())?;
    assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Applied);
    assert_eq!(runs(&context, &owner, "body")?[0], pair(&long_ok, &long_ok));
    Ok(())
}

#[test]
fn code_existing_links_policy_selection_and_missing_schema_do_not_autolink() -> Result {
    let url = "https://example.com";
    let code = json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":"code"},"children":[{"kind":"text","text":url,"formats":[]}]});
    let inline = |kind: &str, properties: Value| json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":format!("i{kind}")},"children":[{"kind":"text","text":url,"formats":[{"type":format!("breditor-inline/{kind}"),"properties":properties}]}]});
    let (context, mut owner) = setup(
        vec![
            code,
            inline("code", json!({})),
            inline(
                "link",
                json!({"breditor-inline/href":"https://other.test/","breditor-inline/new-window":true}),
            ),
        ],
        false,
        true,
    )?;
    for id in ["code", "icode", "ilink"] {
        select(&mut owner, id, url.len())?;
        let before = runs(&context, &owner, id)?;
        assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Inserted, "{id}");
        let after = runs(&context, &owner, id)?;
        let hrefs: Vec<_> = after.iter().map(|r| r.1.as_str()).filter(|h| !h.is_empty()).collect();
        assert!(hrefs.iter().all(|h| *h == "https://other.test/|new"), "{id}: {after:?}");
        assert_ne!(before, after);
    }
    // Markdown-only and empty sets never autolink; the union still does.
    for (rules, expected) in [
        (RichInputRuleSet::MARKDOWN_V1, RichInputRuleOutcome::Inserted),
        (RichInputRuleSet::NONE, RichInputRuleOutcome::Inserted),
        (RichInputRuleSet::MARKDOWN_V1.union(AUTOLINK), RichInputRuleOutcome::Applied),
    ] {
        let (context, mut owner) = setup(vec![fixture::paragraph("plain", url)], false, true)?;
        select(&mut owner, "plain", url.len())?;
        assert_eq!(type_text(&mut owner, " ", rules)?, expected);
        let linked = runs(&context, &owner, "plain")?.iter().any(|r| !r.1.is_empty());
        assert_eq!(linked, expected == RichInputRuleOutcome::Applied);
    }
    // Without the standard link declaration the policy is inactive, not refused.
    let (_, mut owner) = setup(vec![fixture::paragraph("plain", url)], false, false)?;
    select(&mut owner, "plain", url.len())?;
    assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Inserted);
    // Markdown shortcuts keep priority in the union.
    let (_, mut owner) = setup(vec![fixture::paragraph("plain", "-")], false, true)?;
    select(&mut owner, "plain", 1)?;
    assert_eq!(
        type_text(&mut owner, " ", RichInputRuleSet::MARKDOWN_V1.union(AUTOLINK))?,
        RichInputRuleOutcome::Applied
    );
    Ok(())
}

#[test]
fn inline_code_paragraph_stays_literal() -> Result {
    let url = "https://example.com";
    let node = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":[{"kind":"text","text":"x ","formats":[]},{"kind":"text","text":url,"formats":[{"type":"breditor-inline/code","properties":{}}]}]});
    let (context, mut owner) = setup(vec![node], false, true)?;
    select(&mut owner, "body", url.len() + 2)?;
    assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Inserted);
    assert!(runs(&context, &owner, "body")?.iter().all(|r| r.1.is_empty()));
    Ok(())
}

#[test]
fn read_only_and_stale_observations_reject_before_input() -> Result {
    let (context, mut owner) =
        setup(vec![fixture::paragraph("body", "https://example.com")], false, true)?;
    select(&mut owner, "body", 19)?;
    let stale = owner.snapshot();
    select(&mut owner, "body", 18)?;
    select(&mut owner, "body", 19)?;
    let before = saved(&context, &owner)?;
    assert!(owner.insert_plain_text_with_input_rules(&stale, " ", "ns", AUTOLINK).is_err());
    assert_eq!(saved(&context, &owner)?, before);
    owner.set_read_only(&owner.snapshot(), true)?;
    assert!(
        owner.insert_plain_text_with_input_rules(&owner.snapshot(), " ", "ns", AUTOLINK).is_err()
    );
    assert!(owner.apply_input_rule(&owner.snapshot(), " ", "ns", AUTOLINK).is_err());
    assert_eq!(runs(&context, &owner, "body")?, vec![pair("https://example.com", "")]);
    assert_eq!(owner.undo_depth(), 0);
    Ok(())
}

#[test]
fn enter_split_links_the_retained_left_block_and_undo_keeps_the_split() -> Result {
    for natural in [false, true] {
        let (context, mut owner) =
            setup(vec![fixture::paragraph("body", "go www.example.com/a.")], natural, true)?;
        select(&mut owner, "body", 21)?;
        let end = point("body", 21)?;
        let right = BlockId::try_new("right")?;
        let split = SplitTextBlock::capture(owner.state().document(), &end, &right, None)?;
        let caret = point("right", 0)?;
        owner.dispatch(
            &owner.snapshot(),
            &[RichAction::SplitTextBlock(split)],
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret.clone(),
            })),
        )?;
        let depth = owner.undo_depth();
        assert_eq!(
            owner.apply_paragraph_autolink_input_rule(&owner.snapshot(), &end)?,
            RichLocalOutcome::ContentCommitted
        );
        assert_eq!(owner.undo_depth(), depth + 1);
        assert_eq!(
            runs(&context, &owner, "body")?,
            vec![
                pair("go ", ""),
                pair("www.example.com/a", "https://www.example.com/a"),
                pair(".", "")
            ]
        );
        assert_eq!(
            owner.state().selection().map(|s| s.kind().clone()),
            Some(RichSelectionKind::TextRange { anchor: caret.clone(), focus: caret })
        );
        owner.undo(&owner.snapshot())?;
        assert_eq!(runs(&context, &owner, "body")?, vec![pair("go www.example.com/a.", "")]);
        assert!(owner.state().document().block_path(&right).is_some());
        // A point that is not the end of its block never links.
        assert_eq!(
            owner.apply_paragraph_autolink_input_rule(&owner.snapshot(), &point("body", 20)?)?,
            RichLocalOutcome::Unchanged
        );
    }
    Ok(())
}

#[test]
fn plan_is_a_pure_link_step_over_retained_characters() -> Result {
    let (context, mut owner) =
        setup(vec![fixture::paragraph("body", "a https://example.com/ ")], false, true)?;
    select(&mut owner, "body", 23)?;
    let before = saved(&context, &owner)?;
    let plan = plan_rich_input_rule(
        &context,
        owner.state().document(),
        owner.state().selection(),
        " ",
        "ns",
        AUTOLINK,
    )?
    .ok_or("missing plan")?;
    assert_eq!(plan.kind(), &RichInputRuleKind::Link);
    assert_eq!(
        plan.steps(),
        &[RichInputRuleStep::Link {
            start: TextOffset::try_new(2)?,
            end: TextOffset::try_new(22)?,
            href: "https://example.com/".into()
        }]
    );
    assert_eq!(saved(&context, &owner)?, before);
    for trigger in [".", ")", "\n", "*"] {
        assert!(
            plan_rich_input_rule(
                &context,
                owner.state().document(),
                owner.state().selection(),
                trigger,
                "ns",
                AUTOLINK
            )?
            .is_none()
        );
    }
    Ok(())
}
