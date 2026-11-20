//! Shared optional typed autolink: one original link annotation, isolated Undo, exact recovery.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
        SharedRichProfile,
        actions::{InsertText, SplitTextBlock},
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::{RichInputRuleOutcome, RichInputRuleSet};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const AUTOLINK: RichInputRuleSet = RichInputRuleSet::AUTOLINK_V1;

fn setup(root: &Value) -> Result<(SharedRichProfile, RichReplica)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/autolink","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_standard_configuration_json_v3(&configuration)?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/autolink","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
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
/// (text, href) runs of one block from the published document JSON.
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
                    let href = run["formats"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .find(|f| f["type"] == "breditor-inline/link")
                        .map_or(String::new(), |f| {
                            format!(
                                "{}{}",
                                f["properties"]["breditor-inline/href"].as_str().unwrap_or("?"),
                                if f["properties"]["breditor-inline/new-window"] == true {
                                    "|new"
                                } else {
                                    ""
                                }
                            )
                        });
                    (run["text"].as_str().unwrap_or_default().to_owned(), href)
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
fn pair(text: &str, href: &str) -> (String, String) {
    (text.into(), href.into())
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
                clock as u64,
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
fn space_links_with_one_original_annotation_and_one_undo_keeps_the_space() -> Result {
    for natural in [false, true] {
        let (profile, mut owner) = setup(&prose(vec![fixture::paragraph("body", "")]))?;
        if natural {
            owner.enable_typing_history_guarded(&observed(&owner)?)?;
        }
        select(&mut owner, "body", 0)?;
        assert_eq!(
            type_text(&mut owner, "go www.example.com/a).", AUTOLINK)?,
            RichInputRuleOutcome::Inserted
        );
        let pending = owner.caret_formats_json_guarded(&observed(&owner)?)?;
        assert_eq!(type_text(&mut owner, " ", AUTOLINK)?, RichInputRuleOutcome::Applied);
        assert_eq!(
            runs(&owner, "body")?,
            vec![
                pair("go ", ""),
                pair("www.example.com/a", "https://www.example.com/a"),
                pair("). ", "")
            ]
        );
        assert_eq!(owner.caret_formats_json_guarded(&observed(&owner)?)?, pending);
        owner.undo()?;
        assert_eq!(runs(&owner, "body")?, vec![pair("go www.example.com/a). ", "")]);
        owner.redo()?;
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn enter_split_links_the_left_block_and_undo_keeps_the_split() -> Result {
    for natural in [false, true] {
        let (profile, mut owner) =
            setup(&prose(vec![fixture::paragraph("body", "see https://example.com")]))?;
        if natural {
            owner.enable_typing_history_guarded(&observed(&owner)?)?;
        }
        select(&mut owner, "body", 23)?;
        let split = |offset| {
            vec![Command::SplitTextBlock(SplitTextBlock {
                block: "body".into(),
                offset,
                right: "right".into(),
                right_heading: None,
            })]
        };
        let caret = Selection::TextRange { anchor: point("right", 0), focus: point("right", 0) };
        // Only one split at the exact caret is accepted.
        assert!(
            owner
                .split_with_autolink_guarded(
                    &observed(&owner)?,
                    split(22),
                    SelectionUpdate::Set(Some(caret.clone())),
                    PendingFormatsUpdate::Map
                )
                .is_err()
        );
        assert_eq!(
            owner.split_with_autolink_guarded(
                &observed(&owner)?,
                split(23),
                SelectionUpdate::Set(Some(caret.clone())),
                PendingFormatsUpdate::Map
            )?,
            RichInputRuleOutcome::Applied
        );
        assert_eq!(
            runs(&owner, "body")?,
            vec![pair("see ", ""), pair("https://example.com", "https://example.com/")]
        );
        assert_eq!(owner.selection()?, Some(caret));
        owner.undo()?;
        assert_eq!(runs(&owner, "body")?, vec![pair("see https://example.com", "")]);
        assert_eq!(runs(&owner, "right")?, vec![]);
        owner.redo()?;
        future(&profile, &mut owner)?;
    }
    Ok(())
}

#[test]
fn unsafe_code_policy_and_remote_input_never_autolink() -> Result {
    for typed in [
        "javascript:alert(1)",
        "https://user@example.com",
        "HTTPS://EXAMPLE.COM",
        "https://例え.jp",
    ] {
        let (_, mut owner) = setup(&prose(vec![fixture::paragraph("body", typed)]))?;
        select(&mut owner, "body", u32::try_from(typed.encode_utf16().count())?)?;
        assert_eq!(
            type_text(&mut owner, " ", AUTOLINK)?,
            RichInputRuleOutcome::Inserted,
            "{typed}"
        );
        assert!(runs(&owner, "body")?.iter().all(|r| r.1.is_empty()));
    }
    let url = "https://example.com";
    let code = json!({"kind":"element","type":"breditor/code-block","entityId":null,"properties":{"breditor/block-id":"code"},"children":[{"kind":"text","text":url,"formats":[]}]});
    let (profile, mut a) = setup(&prose(vec![code, fixture::paragraph("body", url)]))?;
    select(&mut a, "code", 19)?;
    assert_eq!(type_text(&mut a, " ", AUTOLINK)?, RichInputRuleOutcome::Inserted);
    select(&mut a, "body", 19)?;
    assert_eq!(
        type_text(&mut a, " ", RichInputRuleSet::MARKDOWN_V1)?,
        RichInputRuleOutcome::Inserted
    );
    assert!(runs(&a, "body")?.iter().all(|r| r.1.is_empty()));
    // A remote peer's typed space is applied literally; only local exclusive calls recognize.
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 20,
        text: "www.example.com ".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    assert!(runs(&a, "body")?.iter().all(|r| r.1.is_empty()));
    // A local conversion converges at the peer as an ordinary format annotation.
    select(&mut a, "body", 19)?;
    a.apply_input_rule_guarded(&observed(&a)?, " ", "ns", AUTOLINK)?;
    let length =
        u32::try_from(runs(&a, "body")?.iter().map(|r| r.0.encode_utf16().count()).sum::<usize>())?;
    select(&mut a, "body", length)?;
    assert_eq!(type_text(&mut a, "x", AUTOLINK)?, RichInputRuleOutcome::Inserted);
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    // Read-only rejects before input.
    a.set_read_only_guarded(&observed(&a)?, true)?;
    let before = a.document_json().to_owned();
    assert!(
        a.insert_plain_text_with_input_rules_guarded(&observed(&a)?, " ", "ns", AUTOLINK).is_err()
    );
    assert_eq!(a.document_json(), before);
    Ok(())
}
