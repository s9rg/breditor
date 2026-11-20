//! Explicit candidate V4 mention entities: grammar, atomicity, actions, history, search and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
#[path = "support/rich_v4_frozen.rs"]
mod frozen;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec, decode_rich_mention,
    },
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichLocalOutcome, RichLocalSession,
        RichLocalSessionError, RichMention, RichMentionError, RichMentionId, RichMentionKind,
        RichMentionLabel, RichSearchMode, RichSearchQuery, RichSelectionFormatChange,
        RichSelectionKind, RichTextPoint, RichTypingDeleteDirection, actions::RichActionError,
        find_rich_text, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use frozen::{FROZEN, V4_LAYOUT_FINGERPRINT as V4_FINGERPRINT};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn schema(revision: u32) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn context(revision: u32) -> Result<EditorContext> {
    Ok(EditorContext::new(schema(revision)?, DocumentLimits::default()))
}
fn admit(c: &EditorContext, root: &Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    input["root"] = root.clone();
    Ok(RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input.to_string())?,
        c.limits(),
    )?)
}
fn encode(c: &EditorContext, d: &RichDocument) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?,
    )?["root"]
        .clone())
}
fn mention_format(kind: &str, id: &str, label: &str) -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-id":id,"breditor/mention-kind":kind,"breditor/mention-label":label}})
}
fn ann() -> Value {
    mention_format("user", "u-1", "Ann")
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn run(text: &str, formats: &[Value]) -> Value {
    json!({"kind":"text","text":text,"formats":formats})
}
/// `p`: the given runs, `q`: "Other", `code`: a code block.
fn root_with(runs: Vec<Value>) -> Value {
    let p = fixture::element("paragraph", "p", runs);
    let code = fixture::element("code-block", "code", vec![run("let x", &[])]);
    let mut root =
        fixture::element("document", "unused", vec![p, fixture::paragraph("q", "Other"), code]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
/// "Hi @Ann and Ann" with the first "@Ann" a mention at UTF-16 [3, 7).
fn mentioned() -> Value {
    root_with(vec![run("Hi ", &[]), run("@Ann", &[ann()]), run(" and Ann", &[])])
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(block: &str, start: u64, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(block, start)?, focus: point(block, end)? })
}
fn owner(c: &EditorContext, raw: &Value, selection: RichSelectionKind) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(selection),
        HistoryCapacity::default(),
    )?)
}
fn mention(kind: RichMentionKind, id: &str, label: &str) -> Result<RichMention> {
    Ok(RichMention::new(kind, RichMentionId::try_new(id)?, RichMentionLabel::try_new(label)?))
}
fn runs(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(encode(c, a.state().document())?["children"][0]["children"].clone())
}
fn offsets(a: &RichLocalSession) -> Result<(u64, u64)> {
    let RichSelectionKind::TextRange { anchor, focus } =
        a.state().selection().ok_or("selection")?.kind()
    else {
        return Err("text selection".into());
    };
    Ok((anchor.offset().get(), focus.offset().get()))
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_the_format() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_mentions());
        assert!(old.inline_format_property_contract(&RichMention::format_kind()).is_none());
    }
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT, "{FROZEN}");
    assert!(d.supports_rich_mentions() && d.supports_rich_text_language());
    let contract =
        d.inline_format_property_contract(&RichMention::format_kind()).ok_or("contract")?;
    let names: Vec<&str> = contract.properties().iter().map(|p| p.name().as_str()).collect();
    assert_eq!(names, ["breditor/mention-id", "breditor/mention-kind", "breditor/mention-label"]);
    // V4 reserves a second inline-format slot: 253 extension formats remain.
    let id = SchemaId::new(QualifiedName::try_new("example/plain")?, SchemaVersion::try_new(1)?);
    let plain = CompiledSchema::try_compile_rich_content_profile_v4(
        id,
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert!(plain.inline_format_property_contract(&RichMention::format_kind()).is_some());
    Ok(())
}

#[test]
fn only_bounded_whole_label_mentions_are_admitted_and_only_in_v4() -> Result {
    let c = context(4)?;
    admit(&c, &mentioned())?;
    for (kind, id, label) in [
        ("user", "u-1", "Ann"),
        ("page", "Page:42", "Roadmap 2027"),
        ("tag", "t.release_1", "release"),
        ("user", "u", "Zoë 日本"),
    ] {
        let raw = root_with(vec![run(&format!("@{label}"), &[mention_format(kind, id, label)])]);
        admit(&c, &raw)?;
        for revision in [1, 2, 3] {
            assert!(admit(&context(revision)?, &raw).is_err(), "V{revision} must refuse");
        }
    }
    // Property domains.
    for (kind, id, label) in [
        ("team", "u-1", "Ann"),
        ("User", "u-1", "Ann"),
        ("user", "-u", "Ann"),
        ("user", "u 1", "Ann"),
        ("user", "u-1", " Ann"),
        ("user", "u-1", "An\u{7}n"),
        ("user", "u-1", "A\u{202E}nn"),
    ] {
        let raw = root_with(vec![run(&format!("@{label}"), &[mention_format(kind, id, label)])]);
        assert!(admit(&c, &raw).is_err(), "{kind} {id} {label:?}");
    }
    for format in [
        json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u","breditor/mention-kind":"user"}}),
        json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u","breditor/mention-kind":"user","breditor/mention-label":7}}),
        json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u","breditor/mention-kind":"user","breditor/mention-label":"Ann","breditor/x":"y"}}),
        json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u","breditor/mention-kind":"user","breditor/mention-label":""}}),
    ] {
        assert!(admit(&c, &root_with(vec![run("@Ann", &[format])])).is_err());
    }
    // Immutability law: the text is whole copies of "@" + label; other formats may vary inside.
    for bad in ["@An", "Ann", "@Ann ", "@Ann@An", "@ann"] {
        assert!(admit(&c, &root_with(vec![run(bad, &[ann()])])).is_err(), "{bad}");
    }
    admit(&c, &root_with(vec![run("@Ann@Ann", &[ann()])]))?;
    admit(&c, &root_with(vec![run("@A", &[ann()]), run("nn", &[ann(), strong()])]))?;
    assert!(
        admit(&c, &root_with(vec![run("@A", &[ann()]), run("x", &[]), run("nn", &[ann()])]))
            .is_err()
    );
    // Two different entities adjacent are two mentions, each whole.
    admit(
        &c,
        &root_with(vec![
            run("@Ann", &[ann()]),
            run("@Ann", &[mention_format("user", "u-2", "Ann")]),
        ]),
    )?;
    // Code blocks carry no inline formats at all.
    let mut raw = mentioned();
    raw["children"][2]["children"] = json!([run("@Ann", &[ann()])]);
    assert!(admit(&c, &raw).is_err());
    Ok(())
}

#[test]
fn inserting_replaces_the_trigger_in_one_history_group() -> Result {
    let c = context(4)?;
    let raw = root_with(vec![run("Hi @an", &[strong()])]);
    let mut a = owner(&c, &raw, range("p", 6, 6)?)?;
    let original = encode(&c, a.state().document())?;
    let m = mention(RichMentionKind::User, "u-1", "Ann")?;
    assert_eq!(
        a.insert_mention(&a.snapshot(), &range("p", 3, 6)?, &m)?,
        RichLocalOutcome::ContentCommitted
    );
    // The mention keeps the trigger's styles, then one plain space with them; caret after it.
    assert_eq!(
        runs(&c, &a)?,
        json!([run("Hi ", &[strong()]), run("@Ann", &[ann(), strong()]), run(" ", &[strong()])])
    );
    assert_eq!(offsets(&a)?, (8, 8));
    assert_eq!(a.undo_depth(), 1);
    // Pending typing formats never carry the mention.
    let pending = a.state().pending_formats().ok_or("pending")?;
    assert!(pending.iter().all(|format| format.kind().as_str() != "breditor/mention"));
    a.insert_plain_text(&a.snapshot(), "x")?;
    assert_eq!(
        runs(&c, &a)?,
        json!([run("Hi ", &[strong()]), run("@Ann", &[ann(), strong()]), run(" x", &[strong()])])
    );
    a.undo(&a.snapshot())?;
    let inserted = encode(&c, a.state().document())?;
    // A single Undo restores the typed trigger and the pre-edit caret exactly.
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, original);
    assert_eq!(offsets(&a)?, (6, 6));
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, inserted);
    // Checkpoint round trip keeps the exact mention and history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, inserted);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, original);
    Ok(())
}

#[test]
fn typed_trigger_and_mention_are_separate_undo_steps_under_typing_history() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root_with(vec![run("Hi ", &[])]), range("p", 3, 3)?)?;
    a.enable_typing_history(&a.snapshot())?;
    for (index, key) in ["@", "a", "n"].into_iter().enumerate() {
        a.insert_typing_text(&a.snapshot(), key, 10 + u64::try_from(index)?)?;
    }
    assert_eq!(runs(&c, &a)?, json!([run("Hi @an", &[])]));
    let typed = encode(&c, a.state().document())?;
    a.insert_mention(
        &a.snapshot(),
        &range("p", 3, 6)?,
        &mention(RichMentionKind::Page, "p:7", "Plan")?,
    )?;
    assert_eq!(
        runs(&c, &a)?,
        json!([
            run("Hi ", &[]),
            run("@Plan", &[mention_format("page", "p:7", "Plan")]),
            run(" ", &[])
        ])
    );
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, typed);
    a.undo(&a.snapshot())?;
    assert_eq!(runs(&c, &a)?, json!([run("Hi ", &[])]));
    Ok(())
}

#[test]
fn selections_snap_and_edits_cover_whole_mentions() -> Result {
    let c = context(4)?;
    // A caret inside snaps to the nearest edge; ranges expand outward, keeping direction.
    let mut a = owner(&c, &mentioned(), range("p", 4, 4)?)?;
    assert_eq!(offsets(&a)?, (3, 3));
    a.set_selection(&a.snapshot(), Some(range("p", 6, 6)?))?;
    assert_eq!(offsets(&a)?, (7, 7));
    a.set_selection(&a.snapshot(), Some(range("p", 5, 1)?))?;
    assert_eq!(offsets(&a)?, (7, 1));
    a.set_selection(&a.snapshot(), Some(range("p", 1, 5)?))?;
    assert_eq!(offsets(&a)?, (1, 7));
    // Backspace right after the mention deletes it whole, in one step.
    a.set_selection(&a.snapshot(), Some(range("p", 7, 7)?))?;
    a.enable_typing_history(&a.snapshot())?;
    a.delete_typing_range(
        &a.snapshot(),
        &range("p", 6, 7)?,
        RichTypingDeleteDirection::Backward,
        5,
    )?;
    assert_eq!(runs(&c, &a)?, json!([run("Hi  and Ann", &[])]));
    assert_eq!(offsets(&a)?, (3, 3));
    a.undo(&a.snapshot())?;
    assert_eq!(runs(&c, &a)?, encode(&c, &admit(&c, &mentioned())?)?["children"][0]["children"]);
    // Forward Delete before it does the same; an explicit partial target expands too.
    a.set_selection(&a.snapshot(), Some(range("p", 3, 3)?))?;
    a.replace_range_plain_text(&a.snapshot(), &range("p", 3, 4)?, "")?;
    assert_eq!(runs(&c, &a)?, json!([run("Hi  and Ann", &[])]));
    a.undo(&a.snapshot())?;
    // Typing at either edge never inherits the mention.
    a.set_selection(&a.snapshot(), Some(range("p", 7, 7)?))?;
    a.insert_plain_text(&a.snapshot(), "!")?;
    a.set_selection(&a.snapshot(), Some(range("p", 3, 3)?))?;
    a.insert_plain_text(&a.snapshot(), "(")?;
    assert_eq!(
        runs(&c, &a)?,
        json!([run("Hi (", &[]), run("@Ann", &[ann()]), run("! and Ann", &[])])
    );
    a.undo(&a.snapshot())?;
    a.undo(&a.snapshot())?;
    // Formatting part of a mention formats all of it.
    a.set_selection(&a.snapshot(), Some(range("p", 5, 9)?))?;
    let bold = Format::new(QualifiedName::try_new("breditor/strong")?, PropertyMap::default());
    a.change_selection_formats(&a.snapshot(), &[RichSelectionFormatChange::Set(bold)])?;
    assert_eq!(
        runs(&c, &a)?,
        json!([
            run("Hi ", &[]),
            run("@Ann", &[ann(), strong()]),
            run(" a", &[strong()]),
            run("nd Ann", &[])
        ])
    );
    // Splitting two equal adjacent mentions at their boundary keeps both whole.
    let twice = root_with(vec![run("@Ann@Ann", &[ann()])]);
    let b = owner(&c, &twice, range("p", 6, 6)?)?;
    assert_eq!(offsets(&b)?, (8, 8));
    let b = owner(&c, &twice, range("p", 5, 5)?)?;
    assert_eq!(offsets(&b)?, (4, 4));
    Ok(())
}

#[test]
fn search_never_matches_inside_a_mention() -> Result {
    let c = context(4)?;
    let document = admit(&c, &mentioned())?;
    for (pattern, mode) in [("Ann", RichSearchMode::Literal), ("A.n", RichSearchMode::Regex)] {
        let query = RichSearchQuery::try_new(pattern, mode, true, false)?;
        let found = find_rich_text(&document, &query)?;
        let spans: Vec<(u64, u64)> =
            found.matches().iter().map(|m| (m.start().get(), m.end().get())).collect();
        assert_eq!(spans, [(12, 15)], "{pattern}");
    }
    let query = RichSearchQuery::try_new("@Ann", RichSearchMode::Literal, true, false)?;
    assert!(find_rich_text(&document, &query)?.matches().is_empty());
    Ok(())
}

#[test]
fn read_only_stale_targets_and_old_profiles_refuse_atomically() -> Result {
    let c = context(4)?;
    let raw = root_with(vec![run("Hi @an", &[])]);
    let m = mention(RichMentionKind::User, "u-1", "Ann")?;
    let mut a = owner(&c, &raw, range("p", 6, 6)?)?;
    let original = encode(&c, a.state().document())?;
    a.set_read_only(&a.snapshot(), true)?;
    assert!(a.insert_mention(&a.snapshot(), &range("p", 3, 6)?, &m).is_err());
    a.set_read_only(&a.snapshot(), false)?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(range("p", 5, 5)?))?;
    assert!(a.insert_mention(&stale, &range("p", 3, 6)?, &m).is_err());
    let cross = RichSelectionKind::TextRange { anchor: point("p", 3)?, focus: point("q", 1)? };
    for target in [cross, range("code", 0, 1)?, range("missing", 0, 0)?] {
        assert!(a.insert_mention(&a.snapshot(), &target, &m).is_err());
    }
    assert_eq!(encode(&c, a.state().document())?, original);
    assert_eq!(a.undo_depth(), 0);
    let mut v3 = owner(&context(3)?, &raw, range("p", 6, 6)?)?;
    let error = v3.insert_mention(&v3.snapshot(), &range("p", 3, 6)?, &m).err().ok_or("refused")?;
    assert!(
        matches!(
            error,
            RichLocalSessionError::Action(RichActionError::Mention(RichMentionError::Profile))
        ),
        "{error:?}"
    );
    Ok(())
}

#[test]
fn intent_decoding_is_strict_and_exact() -> Result {
    let c = context(4)?;
    assert_eq!(
        decode_rich_mention(&c, r#"{"kind":"tag","id":"t-1","label":"Release"}"#)?,
        mention(RichMentionKind::Tag, "t-1", "Release")?
    );
    for bad in [
        r"{}",
        r#"{"kind":"user","id":"u"}"#,
        r#"{"kind":"user","id":"u","label":"A","extra":1}"#,
        r#"{"kind":"user","id":"u","label":"A","label":"B"}"#,
        r#"{"kind":"USER","id":"u","label":"A"}"#,
        r#"{"kind":"user","id":" u","label":"A"}"#,
        r#"{"kind":"user","id":"u","label":"A "}"#,
        r#"{"kind":"user","id":"u","label":7}"#,
        r#"["user","u","A"]"#,
    ] {
        assert!(decode_rich_mention(&c, bad).is_err(), "{bad}");
    }
    assert!(decode_rich_mention(&context(3)?, r#"{"kind":"user","id":"u","label":"A"}"#).is_err());
    let long = format!(r#"{{"kind":"user","id":"u","label":"{}"}}"#, "x".repeat(2100));
    assert!(decode_rich_mention(&c, &long).is_err());
    Ok(())
}

#[test]
fn native_clipboard_copy_and_paste_keep_the_exact_mention() -> Result {
    let c = context(4)?;
    // A partial copy range snaps outward to the whole mention.
    let a = owner(&c, &mentioned(), range("p", 1, 5)?)?;
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        a.state().document(),
        a.state().selection().ok_or("selection")?,
    )?
    .ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains(r#""breditor/mention-id":"u-1""#), "{json}");
    assert!(json.contains(r#""text":"@Ann""#), "{json}");
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(&json)?;
    let mut b = owner(&c, &mentioned(), range("q", 5, 5)?)?;
    b.paste_general_inline_clipboard(&b.snapshot(), &range("q", 5, 5)?, &decoded, &[])?;
    let pasted = encode(&c, b.state().document())?;
    assert_eq!(
        pasted["children"][1]["children"],
        json!([run("Otheri ", &[]), run("@Ann", &[ann()])])
    );
    // Typing after the pasted mention is plain text.
    b.insert_plain_text(&b.snapshot(), "!")?;
    let typed = encode(&c, b.state().document())?;
    assert_eq!(
        typed["children"][1]["children"],
        json!([run("Otheri ", &[]), run("@Ann", &[ann()]), run("!", &[])])
    );
    // A V3 owner refuses the V4 fragment outright.
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    Ok(())
}

/// A collapsed section whose summary is "Ask @an" and whose body holds a mention.
fn sectioned() -> Value {
    let summary = fixture::element("details-summary", "s", vec![run("Ask @an", &[])]);
    let body = fixture::element("paragraph", "b", vec![run("@Ann", &[ann()]), run(" Ann", &[])]);
    let details = fixture::element("details", "d", vec![summary, body]);
    let mut root = fixture::element("document", "unused", vec![details]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}

#[test]
fn section_summaries_take_mentions_and_search_and_clipboard_cross_sections() -> Result {
    let c = context(4)?;
    // A summary is phrasing content like a paragraph: it admits and inserts mentions.
    let mut a = owner(&c, &sectioned(), range("s", 7, 7)?)?;
    a.insert_mention(
        &a.snapshot(),
        &range("s", 4, 7)?,
        &mention(RichMentionKind::User, "u-1", "Ann")?,
    )?;
    let after = encode(&c, a.state().document())?;
    assert_eq!(
        after["children"][0]["children"][0]["children"],
        json!([run("Ask ", &[]), run("@Ann", &[ann()]), run(" ", &[])])
    );
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, encode(&c, &admit(&c, &sectioned())?)?);
    // Summary text keeps the immutability law.
    let mut broken = sectioned();
    broken["children"][0]["children"][0]["children"] = json!([run("@An", &[ann()])]);
    assert!(admit(&c, &broken).is_err());
    // Search traverses summary and (collapsed) body, never inside a mention.
    let document = admit(&c, &after)?;
    let query = RichSearchQuery::try_new("Ann", RichSearchMode::Literal, true, false)?;
    let found = find_rich_text(&document, &query)?;
    let spans: Vec<(String, u64)> =
        found.matches().iter().map(|m| (m.block().as_str().to_owned(), m.start().get())).collect();
    assert_eq!(spans, [("b".to_owned(), 5)]);
    // A copy of the summary keeps the exact mention; a V3 owner refuses the record.
    let b = owner(&c, &after, range("s", 2, 9)?)?;
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        b.state().document(),
        b.state().selection().ok_or("selection")?,
    )?
    .ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains(r#""breditor/mention-label":"Ann""#), "{json}");
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    Ok(())
}
