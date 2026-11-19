//! Explicit candidate V4 ordered-list numbering: admission, actions, history and old-profile refusal.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    block::OrderedListStart,
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        decode_rich_list_numbering_command,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichLayoutChange as Change, RichListKind,
        RichListNumberStyle as Style, RichListNumbering, RichListNumberingError,
        RichListNumberingPatch as Patch, RichLocalOutcome, RichLocalSession, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint,
        actions::{
            IndentListItems, OutdentListItems, RichAction, RichActionError, SetBlockLayout,
            SetListKind, SetListNumbering,
        },
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn id(s: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(s)?)
}
fn caret(s: &str) -> Result<RichSelectionKind> {
    let point = RichTextPoint::new(id(s)?, TextOffset::try_new(0)?, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
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
fn item(n: &str, children: Vec<Value>) -> Value {
    let mut body = vec![fixture::paragraph(&format!("{n}-text"), n)];
    body.extend(children);
    fixture::element("list-item", n, body)
}
fn ordered(list: &str, start: i64, items: Vec<Value>) -> Value {
    let mut value = fixture::element("ordered-list", list, items);
    value["properties"]["breditor/start"] = json!(start);
    value
}
/// A three-item list whose second item owns a nested two-item ordered list.
fn root() -> Value {
    let nested = ordered("inner", 1, vec![item("i1", vec![]), item("i2", vec![])]);
    let list =
        ordered("outer", 3, vec![item("a", vec![]), item("b", vec![nested]), item("c", vec![])]);
    let mut root =
        fixture::element("document", "unused", vec![list, fixture::paragraph("after", "After")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn node<'a>(n: &'a Value, id: &str) -> Option<&'a Value> {
    if n["properties"]["breditor/block-id"] == id {
        return Some(n);
    }
    n.get("children")?.as_array()?.iter().find_map(|n| node(n, id))
}
fn node_mut<'a>(n: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    if n["properties"]["breditor/block-id"] == id {
        return Some(n);
    }
    n.get_mut("children")?.as_array_mut()?.iter_mut().find_map(|n| node_mut(n, id))
}
fn with(list: &str, key: &str, value: Value) -> Result<Value> {
    let mut raw = root();
    node_mut(&mut raw, list).ok_or("list")?["properties"][format!("breditor/{key}")] = value;
    Ok(raw)
}
fn start(value: u32) -> Result<OrderedListStart> {
    Ok(OrderedListStart::try_new(value)?)
}
fn owner(c: &EditorContext, raw: &Value, at: &str) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(caret(at)?),
        HistoryCapacity::default(),
    )?)
}
fn numbering(c: &EditorContext, a: &RichLocalSession, list: &str) -> Result<RichListNumbering> {
    Ok(RichListNumbering::read(c, a.state().document(), &id(list)?)?)
}
fn apply(a: &mut RichLocalSession, list: &str, patch: Patch) -> Result<RichLocalOutcome> {
    let action = SetListNumbering::capture(a.state().document(), &id(list)?, &patch)?;
    Ok(a.dispatch(
        &a.snapshot(),
        &[RichAction::SetListNumbering(action)],
        RichSelectionUpdate::Map,
    )?)
}

#[test]
fn v4_is_explicit_and_v1_to_v3_fingerprints_and_capabilities_stay_exact() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    // V1/V2 constants are the existing locks; V3 was read from the previous actual Wasm runtime.
    assert_eq!(
        a.fingerprint().to_string(),
        "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"
    );
    assert_eq!(
        b.fingerprint().to_string(),
        "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"
    );
    assert_eq!(
        c.fingerprint().to_string(),
        "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"
    );
    assert_eq!(c.rich_content_revision(), Some(3));
    assert_eq!(d.rich_content_revision(), Some(4));
    for other in [&a, &b, &c] {
        assert_ne!(other.fingerprint(), d.fingerprint());
        assert!(!other.supports_rich_list_numbering());
    }
    assert!(!a.supports_rich_block_layout() && !b.supports_rich_block_layout());
    assert!(c.supports_rich_block_layout() && d.supports_rich_block_layout());
    assert!(d.supports_rich_list_numbering());
    assert_eq!(d, schema(4)?);
    Ok(())
}

#[test]
fn every_style_and_reversal_is_admitted_only_in_v4() -> Result {
    let c = context(4)?;
    admit(&c, &root())?;
    for style in Style::ALL {
        admit(&c, &with("outer", "list-style", json!(style.code()))?)?;
        assert_eq!(Style::from_token(style.as_str()), Some(style));
        assert_eq!(Style::try_from(style.code())?, style);
    }
    let raw = with("inner", "list-reversed", json!(true))?;
    let d = admit(&c, &raw)?;
    let read = RichListNumbering::read(&c, &d, &id("inner")?)?;
    assert!(read.reversed());
    assert_eq!(read.style(), None);
    assert_eq!((read.ordinal_at(0), read.ordinal_at(1), read.ordinal_at(2)), (1, 0, -1));
    // The outer list's own values are unaffected; nothing is inherited.
    let outer = RichListNumbering::read(&c, &d, &id("outer")?)?;
    assert!(!outer.reversed());
    assert_eq!(outer.start().get(), 3);
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        admit(&old, &root())?;
        for style in Style::ALL {
            assert!(admit(&old, &with("outer", "list-style", json!(style.code()))?).is_err());
        }
        assert!(admit(&old, &with("outer", "list-reversed", json!(true))?).is_err());
        assert_eq!(
            RichListNumbering::read(&old, &admit(&old, &root())?, &id("outer")?),
            Err(RichListNumberingError::Profile)
        );
    }
    Ok(())
}

#[test]
fn out_of_domain_noncanonical_and_misplaced_values_are_rejected() -> Result {
    let c = context(4)?;
    for value in [
        json!(0),
        json!(6),
        json!(-1),
        json!("lower-roman"),
        json!(true),
        json!(1.5),
        Value::Null,
        json!({}),
    ] {
        assert!(admit(&c, &with("outer", "list-style", value)?).is_err());
    }
    for value in [json!(false), json!(1), json!("true"), Value::Null] {
        assert!(admit(&c, &with("outer", "list-reversed", value)?).is_err());
    }
    // Numbering properties belong only to ordered lists.
    for target in ["a", "a-text", "after"] {
        let mut raw = root();
        node_mut(&mut raw, target).ok_or("target")?["properties"]["breditor/list-style"] = json!(1);
        assert!(admit(&c, &raw).is_err());
        let mut raw = root();
        node_mut(&mut raw, target).ok_or("target")?["properties"]["breditor/list-reversed"] =
            json!(true);
        assert!(admit(&c, &raw).is_err());
    }
    let mut bullet = fixture::element("bullet-list", "bullets", vec![item("x", vec![])]);
    bullet["properties"]["breditor/list-style"] = json!(1);
    let mut raw = root();
    raw["children"].as_array_mut().ok_or("children")?.push(bullet);
    assert!(admit(&c, &raw).is_err());
    // The existing ordinal ceiling applies to every list, reversed or not.
    let mut raw = with("outer", "list-reversed", json!(true))?;
    node_mut(&mut raw, "outer").ok_or("outer")?["properties"]["breditor/start"] =
        json!(2_147_483_647);
    assert!(admit(&c, &raw).is_err());
    node_mut(&mut raw, "outer").ok_or("outer")?["properties"]["breditor/start"] =
        json!(2_147_483_645);
    admit(&c, &raw)?;
    Ok(())
}

#[test]
fn patch_keep_set_clear_semantics_have_no_implicit_defaults() -> Result {
    assert_eq!(Patch::try_new(Change::Keep, None, None), Err(RichListNumberingError::EmptyPatch));
    let c = context(4)?;
    let d = admit(&c, &with("outer", "list-style", json!(4))?)?;
    let base = RichListNumbering::read(&c, &d, &id("outer")?)?;
    let reversed = Patch::try_new(Change::Keep, Some(true), Some(start(9)?))?.apply_to(base);
    assert_eq!(
        (reversed.style(), reversed.reversed(), reversed.start().get()),
        (Some(Style::LowerRoman), true, 9)
    );
    let cleared = Patch::clear().apply_to(reversed);
    assert_eq!((cleared.style(), cleared.reversed(), cleared.start().get()), (None, false, 9));
    Ok(())
}

#[test]
fn set_and_clear_are_single_history_groups_with_exact_undo_redo_and_restore() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), "a-text")?;
    let original = encode(&c, a.state().document())?;
    let patch = Patch::try_new(Change::Set(Style::UpperAlpha), Some(true), Some(start(5)?))?;
    assert_eq!(apply(&mut a, "outer", patch)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let changed = numbering(&c, &a, "outer")?;
    assert_eq!(
        (changed.style(), changed.reversed(), changed.start().get()),
        (Some(Style::UpperAlpha), true, 5)
    );
    let root_after = encode(&c, a.state().document())?;
    let props = &node(&root_after, "outer").ok_or("outer")?["properties"];
    assert_eq!(props["breditor/list-style"], json!(3));
    assert_eq!(props["breditor/list-reversed"], json!(true));
    // The nested list keeps its own (absent) numbering; items and identities are unchanged.
    assert_eq!(node(&root_after, "inner"), node(&original, "inner"));
    // Exact no-op is admitted and publishes nothing.
    assert_eq!(apply(&mut a, "outer", patch)?, RichLocalOutcome::Unchanged);
    assert_eq!(a.undo_depth(), 1);
    // A checkpoint restores the exact document and retained history.
    let saved = RichSessionJsonCodec::new(c.clone()).encode(&a)?;
    let mut b = RichSessionJsonCodec::new(c.clone()).decode(&saved)?;
    assert_eq!(encode(&c, b.state().document())?, root_after);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, original);
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, root_after);
    // Clear removes both optional properties in one more group and keeps the explicit start.
    assert_eq!(apply(&mut a, "outer", Patch::clear())?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 2);
    let cleared = encode(&c, a.state().document())?;
    let props = &node(&cleared, "outer").ok_or("outer")?["properties"];
    assert!(
        props.get("breditor/list-style").is_none() && props.get("breditor/list-reversed").is_none()
    );
    assert_eq!(props["breditor/start"], json!(5));
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, root_after);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, original);
    a.redo(&a.snapshot())?;
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, cleared);
    Ok(())
}

#[test]
fn read_only_stale_wrong_target_overflow_and_old_profiles_refuse_atomically() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), "a-text")?;
    let before = RichSessionJsonCodec::new(c.clone()).encode(&a)?;
    let patch = Patch::try_new(Change::Set(Style::LowerAlpha), None, None)?;
    // Wrong targets: a list item, a paragraph and an absent identity.
    for target in ["a", "after", "missing"] {
        assert!(SetListNumbering::capture(a.state().document(), &id(target)?, &patch).is_err());
    }
    // Read-only policy refuses before publication.
    a.set_read_only(&a.snapshot(), true)?;
    assert!(apply(&mut a, "outer", patch).is_err());
    a.set_read_only(&a.snapshot(), false)?;
    // A stale observation is refused.
    let stale = a.snapshot();
    apply(&mut a, "inner", patch)?;
    let action = SetListNumbering::capture(a.state().document(), &id("outer")?, &patch)?;
    assert!(
        a.dispatch(&stale, &[RichAction::SetListNumbering(action)], RichSelectionUpdate::Map)
            .is_err()
    );
    // A captured action is guarded against a changed source list.
    let captured = SetListNumbering::capture(a.state().document(), &id("inner")?, &Patch::clear())?;
    apply(&mut a, "inner", Patch::try_new(Change::Set(Style::UpperRoman), None, None)?)?;
    assert!(captured.apply(&c, a.state().document()).is_err());
    // A start that would push the final ordinal past the ceiling is refused by admission.
    assert!(
        apply(&mut a, "outer", Patch::try_new(Change::Keep, None, Some(start(2_147_483_647)?))?)
            .is_err()
    );
    // Only the two accepted edits were recorded; undoing them restores the original.
    assert_eq!(a.undo_depth(), 2);
    a.undo(&a.snapshot())?;
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, {
        let b = RichSessionJsonCodec::new(c.clone()).decode(&before)?;
        encode(&c, b.state().document())?
    });
    // Original profiles never acquire the action.
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        let mut b = owner(&old, &root(), "a-text")?;
        let action = SetListNumbering::capture(b.state().document(), &id("outer")?, &patch)?;
        let err = action.apply(&old, b.state().document()).err().ok_or("accepted")?;
        assert!(matches!(err, RichActionError::ListNumbering(RichListNumberingError::Profile)));
        assert!(
            b.dispatch(
                &b.snapshot(),
                &[RichAction::SetListNumbering(action)],
                RichSelectionUpdate::Map
            )
            .is_err()
        );
        assert!(
            decode_rich_list_numbering_command(&old, r#"{"list":"outer","style":"decimal"}"#)
                .is_err()
        );
    }
    Ok(())
}

#[test]
fn strict_command_decoding_distinguishes_keep_set_clear_and_rejects_noise() -> Result {
    let c = context(4)?;
    let (list, patch) = decode_rich_list_numbering_command(
        &c,
        r#"{"list":"outer","style":"upper-roman","reversed":true,"start":7}"#,
    )?;
    assert_eq!(list, id("outer")?);
    assert_eq!(patch, Patch::try_new(Change::Set(Style::UpperRoman), Some(true), Some(start(7)?))?);
    let (_, clear) = decode_rich_list_numbering_command(
        &c,
        r#"{"list":"outer","style":null,"reversed":false}"#,
    )?;
    assert_eq!(clear, Patch::clear());
    let (_, keep) = decode_rich_list_numbering_command(&c, r#"{"list":"outer","reversed":true}"#)?;
    assert_eq!(keep.style(), Change::Keep);
    for bad in [
        r#"{"list":"outer"}"#,
        r#"{"list":"outer","style":"roman"}"#,
        r#"{"list":"outer","style":"Decimal"}"#,
        r#"{"list":"outer","style":1}"#,
        r#"{"list":"outer","reversed":null}"#,
        r#"{"list":"outer","reversed":"true"}"#,
        r#"{"list":"outer","start":0}"#,
        r#"{"list":"outer","start":null}"#,
        r#"{"list":"outer","start":-1}"#,
        r#"{"list":"outer","start":1.5}"#,
        r#"{"list":"outer","style":"decimal","css":"x"}"#,
        r#"{"list":"outer","style":"decimal","style":"decimal"}"#,
        r#"{"style":"decimal"}"#,
        r#"{"list":"","style":"decimal"}"#,
    ] {
        assert!(decode_rich_list_numbering_command(&c, bad).is_err(), "{bad}");
    }
    Ok(())
}

#[test]
fn list_rewrites_keep_each_lists_own_numbering_and_reversed_tails_count_down() -> Result {
    let c = context(4)?;
    let mut raw = with("outer", "list-style", json!(4))?;
    let outer = node_mut(&mut raw, "outer").ok_or("outer")?;
    outer["properties"]["breditor/list-reversed"] = json!(true);
    outer["properties"]["breditor/start"] = json!(10);
    node_mut(&mut raw, "inner").ok_or("inner")?["properties"]["breditor/list-style"] = json!(2);
    let d = admit(&c, &raw)?;
    // SetListKind start change keeps style/reversal; conversion to bullets drops them.
    let edit = SetListKind::capture(&d, &id("outer")?, RichListKind::Ordered(start(20)?))?
        .apply(&c, &d)?
        .ok_or("no-op")?;
    let after = RichListNumbering::read(&c, edit.document(), &id("outer")?)?;
    assert_eq!(
        (after.style(), after.reversed(), after.start().get()),
        (Some(Style::LowerRoman), true, 20)
    );
    let bullets = SetListKind::capture(&d, &id("outer")?, RichListKind::Bullet)?
        .apply(&c, &d)?
        .ok_or("no-op")?;
    let encoded = encode(&c, bullets.document())?;
    let props = &node(&encoded, "outer").ok_or("outer")?["properties"];
    assert!(
        props.get("breditor/list-style").is_none() && props.get("breditor/list-reversed").is_none()
    );
    // Outdenting the middle item splits a reversed list; the tail keeps counting down.
    let edit =
        OutdentListItems::capture(&d, &id("outer")?, &id("b")?, &id("b")?, Some(&id("tail")?))?
            .apply(&c, &d)?
            .ok_or("no-op")?;
    let prefix = RichListNumbering::read(&c, edit.document(), &id("outer")?)?;
    let tail = RichListNumbering::read(&c, edit.document(), &id("tail")?)?;
    assert_eq!(
        (prefix.start().get(), prefix.reversed(), prefix.style()),
        (10, true, Some(Style::LowerRoman))
    );
    assert_eq!(
        (tail.start().get(), tail.reversed(), tail.style()),
        (8, true, Some(Style::LowerRoman))
    );
    // The nested list keeps its own style after promotion of its parent.
    let inner = RichListNumbering::read(&c, edit.document(), &id("inner")?)?;
    assert_eq!((inner.style(), inner.reversed()), (Some(Style::LowerAlpha), false));
    // A reversed tail whose first ordinal would fall below 1 is refused, not clamped.
    let mut low = raw.clone();
    node_mut(&mut low, "outer").ok_or("outer")?["properties"]["breditor/start"] = json!(2);
    let low = admit(&c, &low)?;
    assert!(
        OutdentListItems::capture(&low, &id("outer")?, &id("b")?, &id("b")?, Some(&id("tail")?))
            .is_err()
    );
    // Indenting "c" moves it into "b"'s trailing nested list, which keeps its own numbering.
    let d = admit(&c, &raw)?;
    let edit = IndentListItems::capture(&d, &id("outer")?, &id("c")?, &id("c")?, None)?
        .apply(&c, &d)?
        .ok_or("no-op")?;
    let inner = RichListNumbering::read(&c, edit.document(), &id("inner")?)?;
    assert_eq!((inner.style(), inner.reversed()), (Some(Style::LowerAlpha), false));
    let outer = RichListNumbering::read(&c, edit.document(), &id("outer")?)?;
    assert_eq!((outer.style(), outer.reversed()), (Some(Style::LowerRoman), true));
    Ok(())
}

#[test]
fn partial_clipboard_copy_of_a_reversed_list_counts_down() -> Result {
    let c = context(4)?;
    let mut raw = with("outer", "list-reversed", json!(true))?;
    node_mut(&mut raw, "outer").ok_or("outer")?["properties"]["breditor/start"] = json!(10);
    let b = RichTextPoint::new(id("b-text")?, TextOffset::try_new(0)?, Affinity::After);
    let end = RichTextPoint::new(id("c-text")?, TextOffset::try_new(1)?, Affinity::After);
    let a = RichLocalSession::try_new(
        c.clone(),
        admit(&c, &raw)?,
        Some(RichSelectionKind::TextRange { anchor: b, focus: end }),
        HistoryCapacity::default(),
    )?;
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        a.state().document(),
        a.state().selection().ok_or("selection")?,
    )?
    .ok_or("fragment")?;
    let codec = RichClipboardJsonCodec::new(c.clone());
    let encoded: Value = serde_json::from_str(&codec.encode(&fragment)?)?;
    let text = encoded.to_string();
    assert!(text.contains(r#""breditor/list-reversed":true"#), "{text}");
    assert!(text.contains(r#""breditor/start":9"#), "{text}");
    Ok(())
}

#[test]
fn v4_keeps_v3_block_layout() -> Result {
    let c = context(4)?;
    let d = admit(&c, &root())?;
    let patch = breditor_core::rich_content::RichBlockLayoutPatch::try_new(
        Change::Set(breditor_core::rich_content::RichBlockAlignment::Center),
        Change::Keep,
        Change::Keep,
        Change::Keep,
    )?;
    let edit = SetBlockLayout::capture(&d, &id("after")?, &patch)?.apply(&c, &d)?.ok_or("no-op")?;
    let encoded = encode(&c, edit.document())?;
    assert_eq!(
        node(&encoded, "after").ok_or("after")?["properties"]["breditor/block-align"],
        json!(2)
    );
    Ok(())
}
