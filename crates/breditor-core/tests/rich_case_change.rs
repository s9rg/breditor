//! Native case change: Unicode mapping, format runs, mentions, selection, history and checkpoints.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichCaseChange, RichCaseChangeError, RichCaseRequest, RichDocument,
        RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichSelectionKind,
        RichTextPoint, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn context(revision: u32) -> Result<EditorContext> {
    let id = SchemaId::new(QualifiedName::try_new("example/case")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        _ => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
    };
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn admit(c: &EditorContext, root: &Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/case","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
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
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn italic() -> Value {
    json!({"type":"breditor-inline/italic","properties":{}})
}
fn mention(label: &str) -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-kind":"user","breditor/mention-id":"u1","breditor/mention-label":label}})
}
fn run(text: &str, formats: &[Value]) -> Value {
    json!({"kind":"text","text":text,"formats":formats})
}
fn document(blocks: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", blocks);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(anchor: (&str, u64), focus: (&str, u64)) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange {
        anchor: point(anchor.0, anchor.1)?,
        focus: point(focus.0, focus.1)?,
    })
}
fn owner(c: &EditorContext, raw: &Value, selection: RichSelectionKind) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(selection),
        HistoryCapacity::default(),
    )?)
}
fn request(json: &str) -> Result<RichCaseRequest> {
    Ok(RichCaseRequest::from_json(json)?)
}
fn blocks(c: &EditorContext, a: &RichLocalSession) -> Result<Vec<Value>> {
    let root = encode(c, a.state().document())?;
    Ok(root["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .map(|b| b["children"].clone())
        .collect())
}
fn selection(a: &RichLocalSession) -> Result<(u64, u64)> {
    match a.state().selection().ok_or("selection")?.kind() {
        RichSelectionKind::TextRange { anchor, focus } => {
            Ok((anchor.offset().get(), focus.offset().get()))
        }
        _ => Err("kind".into()),
    }
}

#[test]
fn upper_across_blocks_keeps_formats_identities_and_one_undo_step() -> Result {
    let c = context(4)?;
    let raw = document(vec![
        fixture::element(
            "paragraph",
            "p",
            vec![run("Straße ", &[strong()]), run("und ", &[]), run("weg", &[italic()])],
        ),
        fixture::element("heading", "h", vec![run("second line", &[])]),
    ]);
    let raw = {
        let mut raw = raw;
        raw["children"][1]["properties"]["breditor/level"] = json!(2);
        raw
    };
    let mut a = owner(&c, &raw, range(("p", 3), ("h", 6))?)?;
    let before = encode(&c, a.state().document())?;
    assert_eq!(
        a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?)?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(
        blocks(&c, &a)?,
        vec![
            json!([run("StrASSE ", &[strong()]), run("UND ", &[]), run("WEG", &[italic()])]),
            json!([run("SECOND line", &[])]),
        ]
    );
    // Block identities and kinds are unchanged; the selection still covers the changed text.
    let after = encode(&c, a.state().document())?;
    assert_eq!(after["children"][1]["properties"], before["children"][1]["properties"]);
    assert_eq!(selection(&a)?, (3, 6));
    assert_eq!(a.undo_depth(), 1);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, before);
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, after);
    // Checkpoint replay restores the exact recipe, not a re-run of the mapping.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, before);
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, after);
    Ok(())
}

#[test]
fn length_changes_map_the_selection_and_keep_runs() -> Result {
    let c = context(4)?;
    let raw = document(vec![fixture::element(
        "paragraph",
        "p",
        vec![run("ßa", &[strong()]), run("ß", &[]), run(" x", &[italic()])],
    )]);
    let mut a = owner(&c, &raw, range(("p", 4), ("p", 0))?)?;
    a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?)?;
    assert_eq!(
        blocks(&c, &a)?[0],
        json!([run("SSA", &[strong()]), run("SS", &[]), run(" x", &[italic()])])
    );
    // Backward direction is preserved and endpoints follow the longer text.
    assert_eq!(selection(&a)?, (6, 0));
    Ok(())
}

#[test]
fn title_case_minor_words_locale_and_caret_whole_block() -> Result {
    let c = context(4)?;
    let raw = document(vec![fixture::paragraph("p", "the LORD of THE rings")]);
    let mut a = owner(&c, &raw, range(("p", 5), ("p", 5))?)?;
    a.change_selection_case(&a.snapshot(), &request(r#"{"change":"title"}"#)?)?;
    assert_eq!(blocks(&c, &a)?[0], json!([run("The Lord of the Rings", &[])]));
    // A caret keeps its offset.
    assert_eq!(selection(&a)?, (5, 5));
    a.change_selection_case(
        &a.snapshot(),
        &request(r#"{"change":"title","titleMinorWords":[]}"#)?,
    )?;
    assert_eq!(blocks(&c, &a)?[0], json!([run("The Lord Of The Rings", &[])]));
    let raw = document(vec![fixture::paragraph("p", "istanbul DİYARBAKIR")]);
    let mut t = owner(&c, &raw, range(("p", 0), ("p", 8))?)?;
    t.change_selection_case(&t.snapshot(), &request(r#"{"change":"upper","locale":"tr-TR"}"#)?)?;
    t.set_selection(&t.snapshot(), Some(range(("p", 9), ("p", 19))?))?;
    t.change_selection_case(&t.snapshot(), &request(r#"{"change":"lower","locale":"tr"}"#)?)?;
    assert_eq!(blocks(&c, &t)?[0], json!([run("İSTANBUL diyarbakır", &[])]));
    // Without a locale the default Unicode mapping applies.
    let mut d = owner(&c, &raw, range(("p", 0), ("p", 8))?)?;
    d.change_selection_case(&d.snapshot(), &request(r#"{"change":"upper"}"#)?)?;
    assert_eq!(blocks(&c, &d)?[0], json!([run("ISTANBUL DİYARBAKIR", &[])]));
    Ok(())
}

#[test]
fn cycle_goes_upper_lower_title_and_mixed_becomes_upper() -> Result {
    let c = context(4)?;
    let raw = document(vec![fixture::paragraph("p", "hello World")]);
    let mut a = owner(&c, &raw, range(("p", 0), ("p", 11))?)?;
    let cycle = request(r#"{"change":"cycle"}"#)?;
    let mut seen = Vec::new();
    for _ in 0..4 {
        a.change_selection_case(&a.snapshot(), &cycle)?;
        seen.push(blocks(&c, &a)?[0][0]["text"].clone());
    }
    assert_eq!(
        seen,
        vec![
            json!("HELLO WORLD"),
            json!("hello world"),
            json!("Hello World"),
            json!("HELLO WORLD")
        ]
    );
    assert_eq!(a.undo_depth(), 4);
    Ok(())
}

#[test]
fn mentions_are_never_changed_and_unchanged_requests_publish_nothing() -> Result {
    let c = context(4)?;
    let raw = document(vec![fixture::element(
        "paragraph",
        "p",
        vec![run("hi ", &[]), run("@Ada", &[mention("Ada")]), run(" there", &[strong()])],
    )]);
    let mut a = owner(&c, &raw, range(("p", 0), ("p", 13))?)?;
    a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?)?;
    assert_eq!(
        blocks(&c, &a)?[0],
        json!([run("HI ", &[]), run("@Ada", &[mention("Ada")]), run(" THERE", &[strong()])])
    );
    assert_eq!(
        a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?)?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(a.undo_depth(), 1);
    // Only the mention selected: nothing to change.
    a.set_selection(&a.snapshot(), Some(range(("p", 3), ("p", 7))?))?;
    assert_eq!(
        a.change_selection_case(&a.snapshot(), &request(r#"{"change":"lower"}"#)?)?,
        RichLocalOutcome::Unchanged
    );
    Ok(())
}

#[test]
fn works_in_older_rich_languages_and_rejects_bad_requests() -> Result {
    for revision in [1, 3] {
        let c = context(revision)?;
        let raw = document(vec![fixture::paragraph("p", "abc"), fixture::paragraph("q", "def")]);
        let mut a = owner(&c, &raw, range(("p", 1), ("q", 2))?)?;
        a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?)?;
        assert_eq!(blocks(&c, &a)?, vec![json!([run("aBC", &[])]), json!([run("DEf", &[])])]);
    }
    for bad in [
        r#"{"change":"shout"}"#,
        r#"{"change":"upper","extra":1}"#,
        r#"{"change":"upper","locale":"t"}"#,
        r#"{"change":"upper","locale":"tr_TR"}"#,
        r#"{"change":"title","titleMinorWords":[""]}"#,
        r#"{"change":"title","titleMinorWords":["a b"]}"#,
    ] {
        assert_eq!(RichCaseRequest::from_json(bad), Err(RichCaseChangeError::Request), "{bad}");
    }
    let too_many =
        serde_json::to_string(&json!({"change":"title","titleMinorWords":vec!["a";257]}))?;
    assert!(RichCaseRequest::from_json(&too_many).is_err());
    assert_eq!(request(r#"{"change":"cycle"}"#)?.change(), RichCaseChange::Cycle);
    // Read-only owners refuse atomically.
    let c = context(4)?;
    let mut a =
        owner(&c, &document(vec![fixture::paragraph("p", "abc")]), range(("p", 0), ("p", 3))?)?;
    a.set_read_only(&a.snapshot(), true)?;
    assert!(matches!(
        a.change_selection_case(&a.snapshot(), &request(r#"{"change":"upper"}"#)?),
        Err(RichLocalSessionError::ReadOnly)
    ));
    Ok(())
}
