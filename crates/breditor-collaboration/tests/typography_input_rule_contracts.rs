//! Shared optional `typography-v1`: original insert/format commands, isolated Undo, exact recovery.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedObservation, SharedRichProfile,
        actions::InsertText,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::{
    RichInputRuleOutcome, RichInputRuleSet, RichQuoteStyle, RichTypographyConfig,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const TYPOGRAPHY: RichInputRuleSet = RichInputRuleSet::TYPOGRAPHY_V1;

fn setup(root: &Value) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/typography","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/typography","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let owner = profile.create(&input, "101".into())?;
    Ok((profile, owner))
}
fn prose(children: Vec<Value>) -> Value {
    let mut r = fixture::element("document", "unused", children);
    r["properties"] = json!({"breditor/document-id":"room"});
    r
}
fn observed(owner: &RichReplica) -> Result<SharedObservation> {
    Ok(owner.observe()?)
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn select(owner: &mut RichReplica, block: &str, offset: u32) -> Result {
    let p = point(block, offset);
    owner.set_selection(Some(&Selection::TextRange { anchor: p.clone(), focus: p }))?;
    Ok(())
}
/// (text, sorted short format kinds) runs of one block from the published document JSON.
fn runs(owner: &RichReplica, id: &str) -> Result<Vec<(String, String)>> {
    let document: Value = serde_json::from_str(owner.document_json())?;
    let mut stack = vec![document];
    while let Some(value) = stack.pop() {
        if value["kind"] == "element" && value["properties"]["breditor/block-id"] == id {
            return Ok(value["children"]
                .as_array()
                .ok_or("children")?
                .iter()
                .map(|run| {
                    let kinds: Vec<_> = run["formats"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|f| f["type"].as_str())
                        .map(|k| k.trim_start_matches("breditor-inline/").to_owned())
                        .collect();
                    (run["text"].as_str().unwrap_or_default().to_owned(), kinds.join("+"))
                })
                .collect());
        }
        match value {
            Value::Array(items) => stack.extend(items),
            Value::Object(map) => stack.extend(map.into_iter().map(|(_, v)| v)),
            _ => {}
        }
    }
    Err("missing block".into())
}
fn text(owner: &RichReplica, id: &str) -> Result<String> {
    Ok(runs(owner, id)?.into_iter().map(|r| r.0).collect())
}
fn type_text(
    owner: &mut RichReplica,
    text: &str,
    rules: RichInputRuleSet,
) -> Result<RichInputRuleOutcome> {
    let mut last = RichInputRuleOutcome::Unchanged;
    for (clock, c) in text.chars().enumerate() {
        let key = c.to_string();
        let o = observed(owner)?;
        last = if owner.typing_history_enabled() {
            owner.insert_typing_text_with_input_rules_guarded(
                &o,
                &key,
                clock as u64 * 10_000,
                "ns",
                rules,
            )?
        } else {
            owner.insert_plain_text_with_input_rules_guarded(&o, &key, "ns", rules)?
        };
    }
    Ok(last)
}
fn save(owner: &RichReplica) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        owner.typing_checkpoint()?
    } else {
        owner.checkpoint()?
    })
}
fn future(profile: &SharedRichProfile, owner: &mut RichReplica) -> Result {
    let bytes = save(owner)?;
    let mut twin = if owner.typing_history_enabled() {
        profile.restore_typing("room", &bytes)?
    } else {
        profile.restore("room", &bytes)?
    };
    assert_eq!(save(&twin)?, bytes);
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

#[test]
fn typed_replacements_match_the_local_engine_and_undo_restores_typed_characters() -> Result {
    for natural in [false, true] {
        let (profile, mut owner) = setup(&prose(vec![fixture::paragraph("body", "")]))?;
        if natural {
            owner.enable_typing_history_guarded(&observed(&owner)?)?;
        }
        select(&mut owner, "body", 0)?;
        type_text(&mut owner, "\"It's 1/2 -- (c) wait...", TYPOGRAPHY)?;
        assert_eq!(text(&owner, "body")?, "“It’s ½ – © wait…");
        let pending = owner.caret_formats_json_guarded(&observed(&owner)?)?;
        assert_eq!(type_text(&mut owner, "\"", TYPOGRAPHY)?, RichInputRuleOutcome::Applied);
        assert_eq!(text(&owner, "body")?, "“It’s ½ – © wait…”");
        assert_eq!(owner.caret_formats_json_guarded(&observed(&owner)?)?, pending);
        assert_eq!(
            owner.selection()?,
            Some(Selection::TextRange { anchor: point("body", 18), focus: point("body", 18) })
        );
        owner.undo()?;
        assert_eq!(text(&owner, "body")?, "“It’s ½ – © wait…\"");
        owner.redo()?;
        assert_eq!(text(&owner, "body")?, "“It’s ½ – © wait…”");
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn replacement_keeps_formats_and_code_stays_literal() -> Result {
    let strong = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"body"},"children":[{"kind":"text","text":"a ","formats":[]},{"kind":"text","text":"(c","formats":[{"type":"breditor/strong","properties":{}}]}]});
    let code = json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":"code"},"children":[{"kind":"text","text":"(c","formats":[]}]});
    let inline = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"inline"},"children":[{"kind":"text","text":"(c","formats":[{"type":"breditor-inline/code","properties":{}}]}]});
    let (profile, mut owner) = setup(&prose(vec![strong, code, inline]))?;
    select(&mut owner, "body", 4)?;
    assert_eq!(type_text(&mut owner, ")", TYPOGRAPHY)?, RichInputRuleOutcome::Applied);
    assert_eq!(
        runs(&owner, "body")?,
        vec![("a ".into(), String::new()), ("©".into(), "breditor/strong".into())]
    );
    assert_eq!(type_text(&mut owner, "x", TYPOGRAPHY)?, RichInputRuleOutcome::Inserted);
    assert_eq!(runs(&owner, "body")?[1], ("©x".into(), "breditor/strong".into()));
    for id in ["code", "inline"] {
        select(&mut owner, id, 2)?;
        assert_eq!(type_text(&mut owner, ")", TYPOGRAPHY)?, RichInputRuleOutcome::Inserted, "{id}");
        assert_eq!(text(&owner, id)?, "(c)");
    }
    future(&profile, &mut owner)?;
    Ok(())
}

#[test]
fn configured_quotes_converge_and_remote_input_never_converts() -> Result {
    let french = RichInputRuleSet::typography_with(RichTypographyConfig::try_new(
        Some(&["quotes"]),
        &[],
        RichQuoteStyle::FRENCH,
    )?);
    let (profile, mut a) = setup(&prose(vec![fixture::paragraph("body", "")]))?;
    select(&mut a, "body", 0)?;
    type_text(&mut a, "Il dit \"oui\" (c)", french)?;
    assert_eq!(text(&a, "body")?, "Il dit «\u{a0}oui\u{a0}» (c)");
    // A remote peer's typed characters are applied literally; only local exclusive calls recognize.
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 0,
        text: "\"x\" ... ".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert!(text(&a, "body")?.starts_with("\"x\" ... "));
    // A local conversion converges at the peer as ordinary insert/format commands.
    let end = u32::try_from(text(&a, "body")?.encode_utf16().count())?;
    select(&mut a, "body", end)?;
    assert_eq!(type_text(&mut a, " \"", french)?, RichInputRuleOutcome::Applied);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert!(text(&b, "body")?.ends_with("(c) «\u{a0}"));
    // Read-only rejects before input.
    a.set_read_only_guarded(&observed(&a)?, true)?;
    let before = a.document_json().to_owned();
    assert!(
        a.insert_plain_text_with_input_rules_guarded(&observed(&a)?, "\"", "ns", TYPOGRAPHY)
            .is_err()
    );
    assert_eq!(a.document_json(), before);
    Ok(())
}
