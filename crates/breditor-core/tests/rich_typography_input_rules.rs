//! Optional `typography-v1`: typed replacements, exclusions, configuration and one isolated Undo group.
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
        RichInputRuleStep, RichLocalSession, RichQuoteStyle, RichSelectionKind, RichTextPoint,
        RichTypographyConfig, RichTypographyConfigError, RichTypographyRequest, RichTypographyRule,
        plan_rich_input_rule, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const TYPOGRAPHY: RichInputRuleSet = RichInputRuleSet::TYPOGRAPHY_V1;

fn setup(children: Vec<Value>, natural: bool) -> Result<(EditorContext, RichLocalSession)> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/typography")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/typography","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?,
        context.limits(),
    )?;
    let mut owner =
        RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::try_new(256)?)?;
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
fn caret(owner: &RichLocalSession) -> Option<u64> {
    match owner.state().selection().map(|s| s.kind().clone()) {
        Some(RichSelectionKind::TextRange { focus, .. }) => Some(focus.offset().get()),
        _ => None,
    }
}
/// Text runs of one block as (text, sorted format kinds joined with '+').
fn runs(owner: &RichLocalSession, id: &str) -> Result<Vec<(String, String)>> {
    let document = owner.state().document();
    let node = document
        .document()
        .node_at(document.block_path(&BlockId::try_new(id)?).ok_or("missing block")?)?
        .as_element()
        .ok_or("wrong kind")?;
    node.children()
        .iter()
        .map(|run| {
            let text = run.as_text().ok_or("text")?;
            let kinds: Vec<_> = text
                .formats()
                .iter()
                .map(|f| f.kind().as_str().trim_start_matches("breditor-inline/").to_owned())
                .collect();
            Ok((text.text().to_owned(), kinds.join("+")))
        })
        .collect()
}
fn text(owner: &RichLocalSession, id: &str) -> Result<String> {
    Ok(runs(owner, id)?.into_iter().map(|r| r.0).collect())
}
fn type_text(
    owner: &mut RichLocalSession,
    text: &str,
    rules: RichInputRuleSet,
) -> Result<Vec<RichInputRuleOutcome>> {
    let mut outcomes = vec![];
    for (clock, c) in text.chars().enumerate() {
        let key = c.to_string();
        outcomes.push(if owner.typing_history_enabled() {
            owner.insert_typing_text_with_input_rules(
                &owner.snapshot(),
                &key,
                clock as u64 * 10_000,
                "ns",
                rules,
            )?
        } else {
            owner.insert_plain_text_with_input_rules(&owner.snapshot(), &key, "ns", rules)?
        });
    }
    Ok(outcomes)
}
fn saved(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}

#[test]
fn typed_sentence_converts_and_each_undo_restores_the_typed_characters() -> Result {
    for natural in [false, true] {
        let (context, mut owner) = setup(vec![fixture::paragraph("body", "")], natural)?;
        select(&mut owner, "body", 0)?;
        type_text(&mut owner, "\"It's 1/2 -- (c) wait...\" a->b != c ", TYPOGRAPHY)?;
        assert_eq!(text(&owner, "body")?, "“It’s ½ – © wait…” a->b ≠ c ");
        assert_eq!(caret(&owner), Some(text(&owner, "body")?.encode_utf16().count() as u64));
        // Undo after the closing quote: the conversion group alone restores the straight quote.
        let (_, mut fresh) = setup(vec![fixture::paragraph("body", "")], natural)?;
        select(&mut fresh, "body", 0)?;
        type_text(&mut fresh, "say \"hi", TYPOGRAPHY)?;
        let depth = fresh.undo_depth();
        assert_eq!(type_text(&mut fresh, "\"", TYPOGRAPHY)?, vec![RichInputRuleOutcome::Applied]);
        assert_eq!(text(&fresh, "body")?, "say “hi”");
        assert!(fresh.undo_depth() > depth);
        fresh.undo(&fresh.snapshot())?;
        assert_eq!(text(&fresh, "body")?, "say “hi\"");
        assert_eq!(caret(&fresh), Some(8));
        fresh.redo(&fresh.snapshot())?;
        assert_eq!(text(&fresh, "body")?, "say “hi”");
        // Following input is ordinary and never reconverted.
        assert_eq!(type_text(&mut fresh, "x", TYPOGRAPHY)?, vec![RichInputRuleOutcome::Inserted]);
        assert_eq!(text(&fresh, "body")?, "say “hi”x");
        // A delimited rule keeps the typed space; Undo restores "--".
        type_text(&mut fresh, " -- ", TYPOGRAPHY)?;
        assert_eq!(text(&fresh, "body")?, "say “hi”x – ");
        fresh.undo(&fresh.snapshot())?;
        assert_eq!(text(&fresh, "body")?, "say “hi”x -- ");
        assert!(!saved(&context, &owner)?.is_empty());
    }
    Ok(())
}

#[test]
fn replacements_keep_the_formats_of_the_replaced_characters() -> Result {
    let node = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":[{"kind":"text","text":"a ","formats":[]},{"kind":"text","text":"(c","formats":[{"type":"breditor/strong","properties":{}}]}]});
    for natural in [false, true] {
        let (_, mut owner) = setup(vec![node.clone()], natural)?;
        select(&mut owner, "body", 4)?;
        assert_eq!(type_text(&mut owner, ")", TYPOGRAPHY)?, vec![RichInputRuleOutcome::Applied]);
        assert_eq!(
            runs(&owner, "body")?,
            vec![("a ".to_owned(), String::new()), ("©".to_owned(), "breditor/strong".to_owned())]
        );
        // The pending formats continue: the next character is still strong.
        type_text(&mut owner, "x", TYPOGRAPHY)?;
        assert_eq!(runs(&owner, "body")?[1], ("©x".to_owned(), "breditor/strong".to_owned()));
        owner.undo(&owner.snapshot())?;
        owner.undo(&owner.snapshot())?;
        assert_eq!(
            runs(&owner, "body")?,
            vec![
                ("a ".to_owned(), String::new()),
                ("(c)".to_owned(), "breditor/strong".to_owned())
            ]
        );
    }
    Ok(())
}

#[test]
fn code_blocks_inline_code_and_unselected_sets_stay_literal() -> Result {
    let code = json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":"code"},"children":[{"kind":"text","text":"x (c","formats":[]}]});
    let inline = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"inline"},"children":[{"kind":"text","text":"a ","formats":[]},{"kind":"text","text":"(c","formats":[{"type":"breditor-inline/code","properties":{}}]}]});
    let (_, mut owner) = setup(vec![code, inline, fixture::paragraph("plain", "(c")], false)?;
    for (id, at) in [("code", 4), ("inline", 4)] {
        select(&mut owner, id, at)?;
        assert_eq!(type_text(&mut owner, ")", TYPOGRAPHY)?, vec![RichInputRuleOutcome::Inserted]);
        assert!(text(&owner, id)?.ends_with("(c)"), "{id}");
    }
    for rules in
        [RichInputRuleSet::NONE, RichInputRuleSet::MARKDOWN_V1, RichInputRuleSet::AUTOLINK_V1]
    {
        let (_, mut owner) = setup(vec![fixture::paragraph("plain", "(c")], false)?;
        select(&mut owner, "plain", 2)?;
        assert_eq!(type_text(&mut owner, ")", rules)?, vec![RichInputRuleOutcome::Inserted]);
        assert_eq!(text(&owner, "plain")?, "(c)");
    }
    Ok(())
}

#[test]
fn markdown_keeps_priority_in_the_union() -> Result {
    let both = RichInputRuleSet::MARKDOWN_V1.union(TYPOGRAPHY);
    // "--- " at the start of a block is a Markdown rule (typography would make an em dash).
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "--- ", both)?;
    assert!(owner.state().document().block_path(&BlockId::try_new("ns:rule:hr")?).is_some());
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "--- ", TYPOGRAPHY)?;
    assert_eq!(text(&owner, "body")?, "— ");
    // Both policies apply in one paragraph.
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "a *\"b\"* ", both)?;
    assert_eq!(runs(&owner, "body")?[1], ("“b”".to_owned(), "italic".to_owned()));
    Ok(())
}

#[test]
fn locale_quotes_and_rule_selection() -> Result {
    let german = RichInputRuleSet::typography_with(RichTypographyConfig::try_new(
        None,
        &[],
        RichQuoteStyle::GERMAN,
    )?);
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "Er sagt \"geht's\" und 'so'.", german)?;
    assert_eq!(text(&owner, "body")?, "Er sagt „geht’s“ und ‚so‘.");
    let french = RichInputRuleSet::typography_with(RichTypographyConfig::try_new(
        Some(&["quotes"]),
        &[],
        RichQuoteStyle::FRENCH,
    )?);
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "Il dit \"oui\" (c)", french)?;
    assert_eq!(text(&owner, "body")?, "Il dit «\u{a0}oui\u{a0}» (c)");
    assert_eq!(caret(&owner), Some(text(&owner, "body")?.encode_utf16().count() as u64));
    owner.undo(&owner.snapshot())?;
    // Undo of the last conversion restores the straight closing quote only.
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "\u{ab}\u{a0}oui")], false)?;
    select(&mut owner, "body", 5)?;
    type_text(&mut owner, "\"", french)?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(text(&owner, "body")?, "«\u{a0}oui\"");
    let misc_only = RichInputRuleSet::typography_with(RichTypographyConfig::try_new(
        Some(&["misc", "ellipsis"]),
        &["laquo"],
        RichQuoteStyle::ENGLISH,
    )?);
    let (_, mut owner) = setup(vec![fixture::paragraph("body", "")], false)?;
    select(&mut owner, "body", 0)?;
    type_text(&mut owner, "m^2 +/- << (c) \"x... ", misc_only)?;
    assert_eq!(text(&owner, "body")?, "m² ± << (c) \"x… ");
    Ok(())
}

#[test]
fn configuration_and_requests_are_validated() -> Result {
    use RichTypographyConfigError as E;
    let english = RichQuoteStyle::ENGLISH;
    assert_eq!(RichTypographyConfig::try_new(Some(&["nope"]), &[], english), Err(E::UnknownName));
    assert_eq!(
        RichTypographyConfig::try_new(Some(&["quotes", "quotes"]), &[], english),
        Err(E::Duplicate)
    );
    assert_eq!(RichTypographyConfig::try_new(Some(&[]), &[], english), Err(E::Empty));
    assert_eq!(
        RichTypographyConfig::try_new(
            None,
            &["typography", "quotes", "symbols", "mathematical"],
            english
        ),
        Err(E::Empty)
    );
    assert_eq!(RichTypographyConfig::try_new(None, &[], english)?, RichTypographyConfig::DEFAULT);
    let default = RichTypographyConfig::DEFAULT;
    let selected: Vec<_> = default.rules().map(RichTypographyRule::name).collect();
    assert_eq!(selected.len(), 18);
    assert!(default.rules().all(|r| r.group() != "misc"));
    assert_eq!(RichQuoteStyle::try_new(['"', '”'], ['‘', '’'], None), Err(E::QuoteCharacter));
    assert_eq!(RichQuoteStyle::try_new(['“', ' '], ['‘', '’'], None), Err(E::QuoteCharacter));
    assert_eq!(RichQuoteStyle::try_new(['“', '”'], ['‘', '’'], Some(' ')), Err(E::QuoteSpace));
    let parse = |value: Value| -> std::result::Result<RichTypographyConfig, String> {
        serde_json::from_value::<RichTypographyRequest>(value)
            .map_err(|e| e.to_string())?
            .into_config()
            .map_err(|e| e.to_string())
    };
    assert_eq!(parse(json!({}))?, default);
    assert_eq!(parse(json!({"quotes":"german"}))?.quotes(), &RichQuoteStyle::GERMAN);
    let custom = parse(
        json!({"include":["quotes"],"quotes":{"double":["»","«"],"single":["›","‹"],"space":"narrow-nbsp"}}),
    )?;
    assert_eq!(custom.quotes().double(), ['»', '«']);
    assert_eq!(custom.quotes().space(), Some('\u{202f}'));
    assert_eq!(custom.rules().count(), 2);
    for bad in [
        json!({"quotes":"klingon"}),
        json!({"include":["x"]}),
        json!({"exclude":["quotes","quotes"]}),
        json!({"other":true}),
        json!({"quotes":{"double":["««","»"],"single":["‹","›"]}}),
        json!({"quotes":{"double":["«","»"],"single":["‹","›"],"space":"tab"}}),
        json!({"include":"quotes"}),
    ] {
        assert!(parse(bad.clone()).is_err(), "{bad}");
    }
    Ok(())
}

#[test]
fn plan_is_a_pure_delete_and_insert_over_typed_characters() -> Result {
    let (context, mut owner) = setup(vec![fixture::paragraph("body", "a ... b...")], false)?;
    select(&mut owner, "body", 10)?;
    let before = saved(&context, &owner)?;
    let plan = plan_rich_input_rule(
        &context,
        owner.state().document(),
        owner.state().selection(),
        ".",
        "ns",
        TYPOGRAPHY,
    )?
    .ok_or("missing plan")?;
    assert_eq!(plan.kind(), &RichInputRuleKind::Typography(RichTypographyRule::Ellipsis));
    assert_eq!(
        plan.steps(),
        &[
            RichInputRuleStep::Delete {
                start: TextOffset::try_new(7)?,
                end: TextOffset::try_new(10)?
            },
            RichInputRuleStep::Insert {
                at: TextOffset::try_new(7)?,
                text: "…".into(),
                formats: breditor_core::document::FormatSet::default(),
            }
        ]
    );
    assert_eq!(plan.caret().offset().get(), 8);
    assert_eq!(saved(&context, &owner)?, before);
    // Other triggers at this caret do not match.
    for trigger in [" ", ")", "\"", "*", "\n"] {
        assert!(
            plan_rich_input_rule(
                &context,
                owner.state().document(),
                owner.state().selection(),
                trigger,
                "ns",
                TYPOGRAPHY
            )?
            .is_none(),
            "{trigger}"
        );
    }
    Ok(())
}

#[test]
fn read_only_and_stale_observations_reject_before_input() -> Result {
    let (context, mut owner) = setup(vec![fixture::paragraph("body", "(c")], false)?;
    select(&mut owner, "body", 2)?;
    let stale = owner.snapshot();
    select(&mut owner, "body", 1)?;
    select(&mut owner, "body", 2)?;
    let before = saved(&context, &owner)?;
    assert!(owner.insert_plain_text_with_input_rules(&stale, ")", "ns", TYPOGRAPHY).is_err());
    assert_eq!(saved(&context, &owner)?, before);
    owner.set_read_only(&owner.snapshot(), true)?;
    assert!(
        owner.insert_plain_text_with_input_rules(&owner.snapshot(), ")", "ns", TYPOGRAPHY).is_err()
    );
    assert_eq!(text(&owner, "body")?, "(c");
    Ok(())
}
