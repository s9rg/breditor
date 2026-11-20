//! Shared rich V4 inline commands: text language, mentions (with the `@` trigger replacement)
//! and image links. Every command is one writer-local Undo step, converges across peers,
//! replays exactly from checkpoints and keeps the local V4 semantics.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedRichProfile,
        actions::{
            DeleteText, InsertMention, InsertText, MentionEntity, SetImageAlt, SetImageLink,
        },
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-v4-inline";
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":SCHEMA,"version":1},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn run(text: &str, formats: Vec<Value>) -> Value {
    let mut run = json!({"kind":"text","text":text,"formats":[]});
    run["formats"] = Value::Array(formats);
    run
}
fn para(id: &str, text: &str) -> Value {
    el("paragraph", id, if text.is_empty() { vec![] } else { vec![run(text, vec![])] })
}
fn mention(label: &str) -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":label}})
}
fn language(tag: &str) -> Value {
    json!({"type":"breditor/text-language","properties":{"breditor/language-tag":tag}})
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn image(id: &str, image: &str, link: Option<(&str, bool)>, decorative: bool) -> Value {
    let mut node = el("image", id, vec![para(&format!("{id}-cap"), "Chart")]);
    node["properties"] = json!({"breditor/block-id":id,"breditor/image-id":image,"breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":decorative,"breditor/alt-text":if decorative {""} else {"Chart"}});
    if let Some((href, new_window)) = link {
        node["properties"]["breditor/image-href"] = json!(href);
        if new_window {
            node["properties"]["breditor/image-link-new-window"] = json!(true);
        }
    }
    node
}
fn root() -> Value {
    let mut details = el(
        "details",
        "sec",
        vec![el("details-summary", "sum", vec![run("More", vec![])]), para("body", "Body")],
    );
    details["properties"]["breditor/details-open"] = json!(true);
    let mut root = el(
        "document",
        "unused",
        vec![
            el(
                "paragraph",
                "people",
                vec![
                    run("Hi ", vec![]),
                    run("@Ann", vec![mention("Ann")]),
                    run(" and ", vec![]),
                    run("bold", vec![strong()]),
                ],
            ),
            para("tail", "Tail text"),
            image("fig", "img", Some(("https://example.com/chart", true)), false),
            image("deco", "img-deco", None, true),
            details,
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v4(&config(4))?;
    let a = p.create(&source(&p, &root()), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    Ok((p, a, b, c))
}
fn ast(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"].clone())
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
fn node(a: &RichReplica, id: &str) -> Result<Value> {
    Ok(find(&ast(a)?, id).ok_or_else(|| format!("missing block {id}"))?.clone())
}
fn runs(node: &Value) -> Vec<Value> {
    node["children"].as_array().cloned().unwrap_or_default()
}
fn plain(node: &Value) -> String {
    runs(node).iter().filter_map(|r| r["text"].as_str()).collect()
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(block: &str, start: u32, end: u32) -> Selection {
    Selection::TextRange { anchor: point(block, start), focus: point(block, end) }
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn sync(peers: &mut [&mut RichReplica]) -> Result {
    let frames =
        peers.iter().map(|p| p.update_frame()).collect::<std::result::Result<Vec<_>, _>>()?;
    for (i, peer) in peers.iter_mut().enumerate() {
        for (j, frame) in frames.iter().enumerate() {
            if i != j {
                peer.receive_frame(frame)?;
            }
        }
    }
    for peer in peers.iter() {
        assert_eq!(peer.document_json(), peers[0].document_json());
    }
    Ok(())
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &saved(a)?)?
    } else {
        p.restore("room", &saved(a)?)?
    })
}
/// Exact restart, then identical Undo/Redo on the original and the restored owner.
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let mut b = restore(p, a)?;
    assert_eq!(saved(a)?, saved(&b)?);
    assert_eq!(a.document_json(), b.document_json());
    let count = a.undo_count() + 1;
    for redo in [false, true, false, true] {
        for _ in 0..count {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(saved(a)?, saved(&b)?);
        }
    }
    Ok(())
}
fn set_language(a: &mut RichReplica, selection: &Selection, tag: Option<&str>) -> Result<bool> {
    a.set_selection(Some(selection))?;
    Ok(a.set_text_language_json_guarded(&a.observe()?, &json!({ "language": tag }).to_string())?)
}
fn mention_input(selection: &Selection, label: &str) -> String {
    json!({"selection":selection,"mention":{"kind":"user","id":format!("u-{}", label.to_lowercase()),"label":label}}).to_string()
}
fn link_input(image: &str, href: Option<&str>, new_window: Option<bool>) -> String {
    let mut input = json!({"image":image,"href":href});
    if let Some(flag) = new_window {
        input["newWindow"] = json!(flag);
    }
    input.to_string()
}
fn link_of(a: &RichReplica, block: &str) -> Result<(Value, Value)> {
    let image = node(a, block)?;
    Ok((
        image["properties"].get("breditor/image-href").cloned().unwrap_or(Value::Null),
        image["properties"].get("breditor/image-link-new-window").cloned().unwrap_or(Value::Null),
    ))
}
/// Every maximal equal-mention stretch must be whole `@label` units (the V4 law).
fn mentions_are_whole(a: &RichReplica) -> Result {
    fn walk(node: &Value) {
        let mut stretch: Option<(Value, String)> = None;
        let check = |stretch: &Option<(Value, String)>| {
            if let Some((value, text)) = stretch {
                let unit = format!(
                    "@{}",
                    value["properties"]["breditor/mention-label"].as_str().unwrap_or("")
                );
                assert!(
                    !text.is_empty()
                        && text.len() % unit.len() == 0
                        && *text == unit.repeat(text.len() / unit.len()),
                    "partial mention {text}"
                );
            }
        };
        if let Some(children) = node["children"].as_array() {
            for child in children {
                if child["kind"] == "text" {
                    let value = child["formats"]
                        .as_array()
                        .and_then(|f| f.iter().find(|f| f["type"] == "breditor/mention"))
                        .cloned();
                    match (&mut stretch, value) {
                        (Some((current, text)), Some(value)) if *current == value => {
                            text.push_str(child["text"].as_str().unwrap_or(""));
                        }
                        (_, value) => {
                            check(&stretch);
                            stretch =
                                value.map(|v| (v, child["text"].as_str().unwrap_or("").to_owned()));
                        }
                    }
                } else {
                    walk(child);
                }
            }
            check(&stretch);
        }
    }
    walk(&ast(a)?);
    Ok(())
}

#[test]
fn text_language_sets_replaces_and_clears_in_one_undo_step_and_converges() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    let before = a.undo_count();
    // Any letter case at the boundary; stored canonical.
    assert!(set_language(&mut a, &range("tail", 0, 9), Some("fr-ca"))?);
    assert_eq!(a.undo_count(), before + 1);
    assert_eq!(runs(&node(&a, "tail")?), [run("Tail text", vec![language("fr-CA")])]);
    // Identical value: exact no-op without a history step.
    assert!(!set_language(&mut a, &range("tail", 0, 9), Some("fr-CA"))?);
    assert_eq!(a.undo_count(), before + 1);
    // Concurrent, overlapping: B tags "text" (5..9), C tags the bold word and the mention.
    assert!(set_language(&mut b, &range("tail", 5, 9), Some("de-CH-1996"))?);
    assert!(set_language(&mut c, &range("people", 3, 16), Some("zh-Hant-TW"))?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    let tail = runs(&node(&a, "tail")?);
    // Disjoint characters keep A's value; the overlap is one deterministic causal winner.
    assert_eq!(tail[0], run("Tail ", vec![language("fr-CA")]));
    assert_eq!(plain(&node(&a, "tail")?), "Tail text");
    let people = runs(&node(&a, "people")?);
    assert!(
        people
            .iter()
            .skip(1)
            .all(|r| r["formats"].as_array().is_some_and(|f| f.contains(&language("zh-Hant-TW"))))
    );
    // Other formats and the whole mention survive under the language.
    assert!(people[1]["formats"].as_array().ok_or("formats")?.contains(&mention("Ann")));
    assert!(
        people.last().ok_or("bold")?["formats"].as_array().ok_or("formats")?.contains(&strong())
    );
    mentions_are_whole(&a)?;
    // Clearing keeps other formats; one Undo step restores the language exactly.
    let tagged = ast(&c)?;
    assert!(set_language(&mut c, &range("people", 0, 16), None)?);
    assert!(runs(&node(&c, "people")?).iter().all(|r| {
        !r["formats"]
            .as_array()
            .is_some_and(|f| f.iter().any(|f| f["type"] == "breditor/text-language"))
    }));
    c.undo()?;
    assert_eq!(ast(&c)?, tagged);
    c.redo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    for peer in [&mut a, &mut b, &mut c] {
        future(&p, peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Selective Undo of every writer converges back to the exact seed.
    for peer in [&mut a, &mut b, &mut c] {
        while peer.undo()? {}
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(ast(&a)?, root());
    Ok(())
}

#[test]
fn text_language_at_a_caret_changes_pending_formats_and_refuses_bad_input() -> Result {
    let (p, mut a, ..) = setup()?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    let before = saved(&a)?;
    let undo = a.undo_count();
    assert!(set_language(&mut a, &range("tail", 4, 4), Some("en"))?);
    assert_eq!(a.undo_count(), undo);
    assert!(a.pending_formats().ok_or("pending")?.contains(&language("en")));
    a.insert_plain_text("!")?;
    assert_eq!(runs(&node(&a, "tail")?)[1], run("!", vec![language("en")]));
    // Malformed, private-use and wrong-shape intents publish nothing.
    let current = saved(&a)?;
    a.set_selection(Some(&range("tail", 0, 4)))?;
    for input in [
        r#"{"language":"en_US"}"#,
        r#"{"language":"x-none"}"#,
        r#"{"language":"en","extra":1}"#,
        r"{}",
        r#"["en"]"#,
    ] {
        assert!(a.set_text_language_json_guarded(&a.observe()?, input).is_err(), "{input}");
    }
    a.set_selection(Some(&range("tail", 4, 4)))?;
    assert_eq!(a.document_json(), restore(&p, &a)?.document_json());
    assert_ne!(current, before);
    // A V3 owner has no text language command.
    let v3 = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    let mut old = v3.create(
        &json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":v3.schema().fingerprint().to_string(),
            "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[para("p","Text")]}}).to_string(),
        "404".into(),
    )?;
    old.set_selection(Some(&range("p", 0, 4)))?;
    assert!(old.set_text_language_json_guarded(&old.observe()?, r#"{"language":"en"}"#).is_err());
    assert!(
        old.insert_mention_json_guarded(&old.observe()?, &mention_input(&range("p", 0, 0), "Ann"))
            .is_err()
    );
    assert!(
        old.set_image_link_json_guarded(&old.observe()?, &link_input("img", None, None)).is_err()
    );
    future(&p, &mut a)
}

#[test]
fn a_mention_replaces_the_typed_trigger_in_one_undo_step_after_its_typing_group() -> Result {
    let (p, mut a, mut b, _) = setup()?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.set_selection(Some(&range("tail", 9, 9)))?;
    a.insert_plain_text(" @an")?;
    let typed = ast(&a)?;
    let groups = a.undo_count();
    assert!(a.insert_mention_json_guarded(
        &a.observe()?,
        &mention_input(&range("tail", 10, 13), "Ann")
    )?);
    assert_eq!(a.undo_count(), groups + 1);
    let tail = node(&a, "tail")?;
    assert_eq!(plain(&tail), "Tail text @Ann ");
    assert_eq!(runs(&tail)[1]["text"], "@Ann");
    assert_eq!(
        runs(&tail)[1]["formats"],
        json!([{"type":"breditor/mention","properties":{"breditor/mention-id":"u-ann","breditor/mention-kind":"user","breditor/mention-label":"Ann"}}])
    );
    // The caret lands after the plain space; typing there is plain text.
    assert_eq!(a.selection()?, Some(range("tail", 15, 15)));
    a.insert_plain_text("ok")?;
    assert_eq!(runs(&node(&a, "tail")?)[2], run(" ok", vec![]));
    a.undo()?;
    // One Undo restores the typed trigger exactly; the typing burst is its own group.
    a.undo()?;
    assert_eq!(ast(&a)?, typed);
    a.undo()?;
    assert_eq!(plain(&node(&a, "tail")?), "Tail text");
    a.redo()?;
    a.redo()?;
    assert_eq!(plain(&node(&a, "tail")?), "Tail text @Ann ");
    sync(&mut [&mut a, &mut b])?;
    mentions_are_whole(&b)?;
    future(&p, &mut a)?;
    // Deleting is whole-unit: the whole mention deletes, a partial deletion is refused.
    let before = saved(&b)?;
    assert!(
        b.apply(vec![Command::DeleteText(DeleteText {
            block: "tail".into(),
            offset: 11,
            length: 2
        })])
        .is_err()
    );
    assert_eq!(saved(&b)?, before);
    b.apply(vec![Command::DeleteText(DeleteText { block: "tail".into(), offset: 10, length: 4 })])?;
    assert_eq!(plain(&node(&b, "tail")?), "Tail text  ");
    future(&p, &mut b)
}

#[test]
fn mentions_keep_trigger_styles_snap_out_of_mentions_and_work_in_summaries() -> Result {
    let (p, mut a, mut b, _) = setup()?;
    // The trigger's own styles (bold), never a mention, carry onto the unit and the space.
    a.apply(vec![insert("people", 15, "@bo")])?;
    let input = mention_input(&range("people", 15, 18), "Bo");
    assert!(a.insert_mention_json_guarded(&a.observe()?, &input)?);
    let people = runs(&node(&a, "people")?);
    let unit = people.iter().find(|r| r["text"] == "@Bo").ok_or("unit")?;
    assert!(unit["formats"].as_array().ok_or("formats")?.contains(&strong()));
    assert_eq!(a.pending_formats(), Some(&[strong()][..]));
    // A collapsed target inserts at the caret; a summary is phrasing content.
    assert!(
        a.insert_mention_json_guarded(&a.observe()?, &mention_input(&range("sum", 4, 4), "Cy"))?
    );
    assert_eq!(plain(&node(&a, "sum")?), "More@Cy ");
    // A range inside an existing mention snaps outward and replaces the whole unit.
    assert!(a.insert_mention_json_guarded(
        &a.observe()?,
        &mention_input(&range("people", 4, 5), "Dee")
    )?);
    assert_eq!(plain(&node(&a, "people")?).get(..9), Some("Hi @Dee  "));
    mentions_are_whole(&a)?;
    // Refusals publish nothing: cross-block, image caption-less targets, bad labels/kinds.
    let before = saved(&a)?;
    let cross = Selection::TextRange { anchor: point("people", 0), focus: point("tail", 1) };
    for input in [
        mention_input(&cross, "Ann"),
        mention_input(&range("tail", 0, 0), " Ann"),
        json!({"selection":range("tail",0,0),"mention":{"kind":"team","id":"t","label":"T"}}).to_string(),
        json!({"selection":range("tail",0,0),"mention":{"kind":"user","id":"-bad","label":"T"}}).to_string(),
        json!({"selection":{"kind":"node","block":"tail"},"mention":{"kind":"user","id":"u","label":"T"}}).to_string(),
        json!({"selection":range("tail",0,0),"mention":{"kind":"user","id":"u","label":"T"},"extra":true}).to_string(),
    ] {
        assert!(a.insert_mention_json_guarded(&a.observe()?, &input).is_err(), "{input}");
        assert_eq!(saved(&a)?, before);
    }
    // The command replays from the journal and peers adopt it exactly.
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut a)?;
    // A direct shared command dispatch has the same semantics.
    b.apply(vec![Command::InsertMention(InsertMention {
        anchor: point("body", 0),
        focus: point("body", 0),
        mention: MentionEntity { kind: "page".into(), id: "p-1".into(), label: "Roadmap".into() },
    })])?;
    assert_eq!(plain(&node(&b, "body")?), "@Roadmap Body");
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut b)
}

#[test]
fn a_mention_racing_peer_edits_at_its_trigger_converges_and_undoes_per_writer() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    a.apply(vec![insert("tail", 9, " @an")])?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    // A chooses a mention for "@an" (10..13) while B types inside the trigger and C
    // edits the same block before it and another block (disjoint).
    assert!(a.insert_mention_json_guarded(
        &a.observe()?,
        &mention_input(&range("tail", 10, 13), "Ann")
    )?);
    b.apply(vec![insert("tail", 12, "x")])?;
    c.apply(vec![insert("tail", 0, ">> "), insert("people", 0, "Hey. ")])?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    mentions_are_whole(&a)?;
    let tail = plain(&node(&a, "tail")?);
    assert!(tail.starts_with(">> Tail text "), "{tail}");
    assert!(tail.contains("@Ann") && tail.contains('x'), "{tail}");
    assert!(plain(&node(&a, "people")?).starts_with("Hey. Hi @Ann"));
    for peer in [&a, &b, &c] {
        assert_eq!(restore(&p, peer)?.document_json(), a.document_json());
    }
    // Undo of A's mention alone restores the trigger text around B's concurrent character.
    a.undo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Undo re-creates the removed trigger characters; B's character stays beside them.
    let restored = plain(&node(&a, "tail")?);
    assert!(restored == ">> Tail text @axn" || restored == ">> Tail text @anx", "{restored}");
    a.redo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    mentions_are_whole(&c)?;
    // A peer deleting the whole trigger concurrently leaves only A's whole mention.
    let (_, mut left, mut right, _) = setup()?;
    left.apply(vec![insert("tail", 9, " @an")])?;
    sync(&mut [&mut left, &mut right])?;
    assert!(left.insert_mention_json_guarded(
        &left.observe()?,
        &mention_input(&range("tail", 10, 13), "Ann")
    )?);
    right.apply(vec![Command::DeleteText(DeleteText {
        block: "tail".into(),
        offset: 9,
        length: 4,
    })])?;
    sync(&mut [&mut left, &mut right])?;
    assert_eq!(plain(&node(&left, "tail")?), "Tail text@Ann ");
    mentions_are_whole(&left)?;
    for peer in [&mut a, &mut b, &mut c, &mut left, &mut right] {
        future(&p, peer)?;
    }
    Ok(())
}

#[test]
fn image_links_set_replace_and_clear_as_one_paired_field_with_one_undo_step() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    let seed = link_of(&a, "fig")?;
    assert_eq!(seed, (json!("https://example.com/chart"), json!(true)));
    let undo = a.undo_count();
    // Same window removes the flag in the same paired write.
    assert!(a.set_image_link_json_guarded(
        &a.observe()?,
        &link_input("img", Some("https://example.org/a"), None)
    )?);
    assert_eq!(a.undo_count(), undo + 1);
    assert_eq!(link_of(&a, "fig")?, (json!("https://example.org/a"), Value::Null));
    // Identical intent is an exact no-op.
    assert!(!a.set_image_link_json_guarded(
        &a.observe()?,
        &link_input("img", Some("https://example.org/a"), Some(false))
    )?);
    assert_eq!(a.undo_count(), undo + 1);
    // Concurrent: B sets a new-window link, C replaces the alt text (a disjoint field).
    assert!(b.set_image_link_json_guarded(
        &b.observe()?,
        &link_input("img", Some("https://example.net/b"), Some(true))
    )?);
    c.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "fig".into(),
        text: "Bars".into(),
        decorative: false,
    })])?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Never half applied: one writer's complete pair wins.
    let merged = link_of(&a, "fig")?;
    assert!(
        merged == (json!("https://example.org/a"), Value::Null)
            || merged == (json!("https://example.net/b"), json!(true)),
        "{merged:?}"
    );
    assert_eq!(node(&a, "fig")?["properties"]["breditor/alt-text"], "Bars");
    // Selective Undo of each writer removes only that writer's pair.
    a.undo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(link_of(&a, "fig")?, (json!("https://example.net/b"), json!(true)));
    b.undo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(link_of(&a, "fig")?, seed);
    a.redo()?;
    b.redo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(link_of(&a, "fig")?, merged);
    // Clearing removes both properties at once; one Undo restores both.
    let linked = link_of(&c, "fig")?;
    assert!(c.set_image_link_json_guarded(&c.observe()?, &link_input("img", None, None))?);
    assert_eq!(link_of(&c, "fig")?, (Value::Null, Value::Null));
    c.undo()?;
    assert_eq!(link_of(&c, "fig")?, linked);
    c.redo()?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    for peer in [&mut a, &mut b, &mut c] {
        future(&p, peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    for peer in [&mut a, &mut b, &mut c] {
        while peer.undo()? {}
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(ast(&a)?, root());
    Ok(())
}

#[test]
fn image_links_refuse_decorative_images_and_non_canonical_targets() -> Result {
    let (p, mut a, mut b, _) = setup()?;
    let before = saved(&a)?;
    let error = a
        .set_image_link_json_guarded(
            &a.observe()?,
            &link_input("img-deco", Some("https://example.org/"), None),
        )
        .err()
        .ok_or("decorative link admitted")?;
    assert!(error.to_string().contains("decorative image cannot be linked"), "{error}");
    // The direct shared command refuses it as well.
    let error = a
        .apply(vec![Command::SetImageLink(SetImageLink {
            block: "deco".into(),
            href: Some("https://example.org/".into()),
            new_window: false,
        })])
        .err()
        .ok_or("decorative command admitted")?;
    assert!(error.to_string().contains("decorative image cannot be linked"), "{error}");
    for input in [
        link_input("img", Some("HTTPS://Example.com/"), None),
        link_input("img", Some("javascript:alert(1)"), None),
        link_input("img", Some("https://user@example.com/"), None),
        link_input("img", None, Some(true)),
        link_input("missing", Some("https://example.org/"), None),
        r#"{"image":"img"}"#.to_owned(),
        r#"{"image":"img","href":null,"extra":1}"#.to_owned(),
    ] {
        assert!(a.set_image_link_json_guarded(&a.observe()?, &input).is_err(), "{input}");
    }
    for command in [
        SetImageLink { block: "fig".into(), href: None, new_window: true },
        SetImageLink {
            block: "fig".into(),
            href: Some("http://Example.com".into()),
            new_window: false,
        },
        SetImageLink {
            block: "tail".into(),
            href: Some("https://example.org/".into()),
            new_window: false,
        },
    ] {
        assert!(a.apply(vec![Command::SetImageLink(command)]).is_err());
    }
    assert_eq!(saved(&a)?, before);
    // Clearing a decorative image's (absent) link is an admitted no-op.
    assert!(!a.set_image_link_json_guarded(&a.observe()?, &link_input("img-deco", None, None))?);
    // Concurrent decorative + link: the accessible-name rule wins in the projection, nothing
    // is half applied, and undoing the decorative change shows the retained link again.
    a.set_image_link_json_guarded(&a.observe()?, &link_input("img", None, None))?;
    sync(&mut [&mut a, &mut b])?;
    assert!(a.set_image_link_json_guarded(
        &a.observe()?,
        &link_input("img", Some("https://example.org/x"), Some(true))
    )?);
    b.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "fig".into(),
        text: String::new(),
        decorative: true,
    })])?;
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(node(&a, "fig")?["properties"]["breditor/decorative"], true);
    assert_eq!(link_of(&a, "fig")?, (Value::Null, Value::Null));
    // Locally, linking the now decorative image is refused.
    assert!(
        a.set_image_link_json_guarded(
            &a.observe()?,
            &link_input("img", Some("https://example.org/y"), None)
        )
        .is_err()
    );
    b.undo()?;
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(link_of(&a, "fig")?, (json!("https://example.org/x"), json!(true)));
    future(&p, &mut a)?;
    future(&p, &mut b)
}

#[test]
fn the_dispatched_insert_mention_command_equals_the_native_mention_command() -> Result {
    // The browser `@` menu publishes `{commands:[insert_mention], selectionUpdate:set(caret)}`
    // through the ordinary guarded dispatch; it must equal the native command exactly.
    let caret = range("people", 17 + 2 + 3, 17 + 2 + 3);
    let input = json!({"selection":range("people",17,20),"mention":{"kind":"user","id":"u-zoe","label":"Zoë"}}).to_string();
    let (_, mut a, mut b, _) = setup()?;
    for peer in [&mut a, &mut b] {
        peer.enable_typing_history_guarded(&peer.observe()?)?;
        peer.apply(vec![insert("people", 16, " @zo")])?;
        peer.set_selection(Some(&range("people", 20, 20)))?;
    }
    assert!(a.insert_mention_json_guarded(&a.observe()?, &input)?);
    assert!(b.apply_with_state(
        vec![Command::InsertMention(InsertMention {
            anchor: point("people", 17),
            focus: point("people", 20),
            mention: MentionEntity {
                kind: "user".into(), id: "u-zoe".into(), label: "Zoë".into()
            },
        })],
        SelectionUpdate::Set(Some(caret.clone())),
        PendingFormatsUpdate::Map,
    )?);
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(a.selection()?, Some(caret));
    assert_eq!(a.selection()?, b.selection()?);
    assert_eq!((a.undo_count(), a.redo_count()), (b.undo_count(), b.redo_count()));
    for peer in [&mut a, &mut b] {
        peer.insert_plain_text("!")?;
    }
    assert_eq!(a.document_json(), b.document_json());
    assert_eq!(runs(&node(&a, "people")?).last().ok_or("tail")?, &run(" !", vec![]));
    Ok(())
}
