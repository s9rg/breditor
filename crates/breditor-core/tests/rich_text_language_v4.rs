//! Explicit candidate V4 text-run language: grammar, admission, actions, history and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        decode_rich_text_language_command,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichDocument, RichLanguageTag, RichLocalOutcome,
        RichLocalSession, RichSelectionKind, RichTextLanguageError, RichTextPoint,
        actions::RichActionError, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Current candidate V4 (image links bumped the image type revision; sections changed the grammar).
const V4_FINGERPRINT: &str =
    "sha256:f19134f8bf95a5170a36eb2f5a9f5e3819dbfd2b0dcd9507ab846c60cffb5428";

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
fn language(tag: &str) -> Value {
    json!({"type":"breditor/text-language","properties":{"breditor/language-tag":tag}})
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn run(text: &str, formats: &[Value]) -> Value {
    json!({"kind":"text","text":text,"formats":formats})
}
/// `p`: "Hello world" (with an rtl block direction), `q`: "Other", `code`: a code block.
fn root_with(runs: Vec<Value>) -> Value {
    let mut p = fixture::element("paragraph", "p", runs);
    p["properties"]["breditor/block-direction"] = json!(2);
    let code = fixture::element("code-block", "code", vec![run("let x", &[])]);
    let mut root =
        fixture::element("document", "unused", vec![p, fixture::paragraph("q", "Other"), code]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn root() -> Value {
    root_with(vec![run("Hello world", &[])])
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
fn tag(value: &str) -> Result<RichLanguageTag> {
    Ok(RichLanguageTag::canonicalize(value)?)
}
fn runs(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(encode(c, a.state().document())?["children"][0]["children"].clone())
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
        assert!(!old.supports_rich_text_language());
        assert!(old.inline_format_property_contract(&RichLanguageTag::format_kind()).is_none());
    }
    // Candidate V4 changes as later slices land; this pins the current candidate exactly.
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT);
    assert!(d.supports_rich_text_language() && d.supports_rich_list_numbering());
    let contract =
        d.inline_format_property_contract(&RichLanguageTag::format_kind()).ok_or("contract")?;
    assert_eq!(contract.properties().len(), 1);
    assert_eq!(contract.properties()[0].name().as_str(), "breditor/language-tag");
    // The plain (no standard inline) V4 also carries the native format.
    let id = SchemaId::new(QualifiedName::try_new("example/plain")?, SchemaVersion::try_new(1)?);
    let plain = CompiledSchema::try_compile_rich_content_profile_v4(
        id,
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert!(plain.inline_format_property_contract(&RichLanguageTag::format_kind()).is_some());
    Ok(())
}

#[test]
fn only_canonical_bounded_tags_are_admitted_and_only_in_v4() -> Result {
    let c = context(4)?;
    for good in [
        "en",
        "fr-CA",
        "zh-Hant-TW",
        "es-419",
        "de-CH-1996",
        "sl-rozaj-biske",
        "art-lojban",
        "und",
        "abcdefgh-Abcd-123-abcde-abcdf-abcdg",
    ] {
        admit(&c, &root_with(vec![run("Hi", &[language(good)])]))?;
        assert_eq!(tag(good)?.as_str(), good);
        for revision in [1, 2, 3] {
            assert!(
                admit(&context(revision)?, &root_with(vec![run("Hi", &[language(good)])])).is_err()
            );
        }
    }
    for bad in [
        "",
        "e",
        "EN",
        "en-us",
        "fr-ca",
        "zh-hant-TW",
        "ZH-Hant-TW",
        "de-CH-1996X",
        "en_US",
        "x-private",
        "en-x-foo",
        "i-klingon",
        "zh-yue",
        "de-u-co-phonebk",
        "abcd",
        "en-",
        "en--US",
        "en-US-US",
        "abcdefgh-Abcd-123-abcde-abcdf-abcdgh",
    ] {
        assert!(admit(&c, &root_with(vec![run("Hi", &[language(bad)])])).is_err(), "{bad}");
        assert_eq!(RichLanguageTag::try_new(bad), Err(RichTextLanguageError::Value), "{bad}");
    }
    // Missing, ill-typed and extra properties are refused by the declared contract.
    for format in [
        json!({"type":"breditor/text-language","properties":{}}),
        json!({"type":"breditor/text-language","properties":{"breditor/language-tag":7}}),
        json!({"type":"breditor/text-language","properties":{"breditor/language-tag":"en","breditor/x":"y"}}),
    ] {
        assert!(admit(&c, &root_with(vec![run("Hi", &[format])])).is_err());
    }
    // One value per character: a run cannot carry two languages.
    assert!(admit(&c, &root_with(vec![run("Hi", &[language("en"), language("fr")])])).is_err());
    Ok(())
}

#[test]
fn setting_a_range_is_one_history_group_that_replaces_values_and_keeps_direction() -> Result {
    let c = context(4)?;
    let raw = root_with(vec![run("Hello ", &[strong()]), run("world", &[])]);
    let mut a = owner(&c, &raw, range("p", 3, 9)?)?;
    let original = encode(&c, a.state().document())?;
    assert_eq!(
        a.set_text_language(&a.snapshot(), Some(&tag("FR-ca")?))?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(a.undo_depth(), 1);
    assert_eq!(
        runs(&c, &a)?,
        json!([
            run("Hel", &[strong()]),
            run("lo ", &[strong(), language("fr-CA")]),
            run("wor", &[language("fr-CA")]),
            run("ld", &[]),
        ])
    );
    let after = encode(&c, a.state().document())?;
    // Language never changes block direction or other blocks.
    assert_eq!(after["children"][0]["properties"], original["children"][0]["properties"]);
    assert_eq!(after["children"][1], original["children"][1]);
    // An identical value is an admitted exact no-op.
    assert_eq!(
        a.set_text_language(&a.snapshot(), Some(&tag("fr-CA")?))?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(a.undo_depth(), 1);
    // A new value replaces the old one on the selected characters only.
    a.set_selection(&a.snapshot(), Some(range("p", 6, 11)?))?;
    a.set_text_language(&a.snapshot(), Some(&tag("de")?))?;
    assert_eq!(
        runs(&c, &a)?,
        json!([
            run("Hel", &[strong()]),
            run("lo ", &[strong(), language("fr-CA")]),
            run("world", &[language("de")]),
        ])
    );
    assert_eq!(a.undo_depth(), 2);
    let replaced = encode(&c, a.state().document())?;
    // Checkpoint round trip restores the document and the exact retained history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, replaced);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, after);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, original);
    b.redo(&b.snapshot())?;
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, replaced);
    // Clear removes only the language in one more group; strong stays.
    a.set_selection(&a.snapshot(), Some(range("p", 0, 11)?))?;
    assert_eq!(a.set_text_language(&a.snapshot(), None)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(runs(&c, &a)?, json!([run("Hello ", &[strong()]), run("world", &[])]));
    assert_eq!(a.undo_depth(), 3);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, replaced);
    // Clearing text without any language is an exact no-op.
    a.set_selection(&a.snapshot(), Some(range("q", 0, 5)?))?;
    assert_eq!(a.set_text_language(&a.snapshot(), None)?, RichLocalOutcome::Unchanged);
    Ok(())
}

#[test]
fn a_caret_changes_pending_typing_formats_like_other_valued_formats() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), range("p", 5, 5)?)?;
    assert_eq!(
        a.set_text_language(&a.snapshot(), Some(&tag("ja")?))?,
        RichLocalOutcome::TypingStateOnly
    );
    assert_eq!(a.undo_depth(), 0);
    let pending = a.state().pending_formats().ok_or("pending")?;
    assert_eq!(pending.len(), 1);
    assert_eq!(RichLanguageTag::from_format(pending.iter().next().ok_or("format")?)?, tag("ja")?);
    a.insert_plain_text(&a.snapshot(), "語")?;
    assert_eq!(
        runs(&c, &a)?,
        json!([run("Hello", &[]), run("語", &[language("ja")]), run(" world", &[])])
    );
    // Typing after a tagged run inherits its language, as with other valued formats; clearing at
    // the caret stops that for following text.
    assert_eq!(a.set_text_language(&a.snapshot(), None)?, RichLocalOutcome::TypingStateOnly);
    assert!(a.state().pending_formats().ok_or("pending")?.is_empty());
    Ok(())
}

#[test]
fn read_only_stale_code_and_old_profiles_refuse_atomically() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root(), range("p", 0, 5)?)?;
    let codec = RichSessionJsonCodec::new(c.clone());
    let before = codec.encode(&a)?;
    a.set_read_only(&a.snapshot(), true)?;
    assert!(a.set_text_language(&a.snapshot(), Some(&tag("en")?)).is_err());
    a.set_read_only(&a.snapshot(), false)?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(range("p", 0, 4)?))?;
    assert!(a.set_text_language(&stale, Some(&tag("en")?)).is_err());
    a.set_selection(&a.snapshot(), Some(range("code", 0, 3)?))?;
    assert!(a.set_text_language(&a.snapshot(), Some(&tag("en")?)).is_err());
    assert_eq!(
        encode(&c, a.state().document())?,
        encode(&c, codec.decode(&before)?.state().document())?
    );
    assert_eq!(a.undo_depth(), 0);
    let old = context(3)?;
    let mut v3 = owner(&old, &root(), range("p", 0, 5)?)?;
    let error = v3.set_text_language(&v3.snapshot(), Some(&tag("en")?)).err().ok_or("refused")?;
    assert!(
        matches!(
            error,
            breditor_core::rich_content::RichLocalSessionError::Action(
                RichActionError::TextLanguage(RichTextLanguageError::Profile)
            )
        ),
        "{error:?}"
    );
    Ok(())
}

#[test]
fn command_decoding_is_strict_and_canonicalizes_case() -> Result {
    let c = context(4)?;
    assert_eq!(
        decode_rich_text_language_command(&c, r#"{"language":"sr-latn-rs"}"#)?,
        Some(tag("sr-Latn-RS")?)
    );
    assert_eq!(decode_rich_text_language_command(&c, r#"{"language":null}"#)?, None);
    for bad in [
        r"{}",
        r#"{"language":"en","extra":1}"#,
        r#"{"language":"en","language":"fr"}"#,
        r#"{"language":7}"#,
        r#"{"language":"en_US"}"#,
        r#"{"language":"x-private"}"#,
        r#"{"language":""}"#,
        r#"["en"]"#,
    ] {
        assert!(decode_rich_text_language_command(&c, bad).is_err(), "{bad}");
    }
    assert!(decode_rich_text_language_command(&context(3)?, r#"{"language":"en"}"#).is_err());
    let long = format!(r#"{{"language":"en","pad":"{}"}}"#, "x".repeat(2048));
    assert!(decode_rich_text_language_command(&c, &long).is_err());
    Ok(())
}

#[test]
fn native_clipboard_copy_and_paste_keep_the_exact_language() -> Result {
    let c = context(4)?;
    let raw = root_with(vec![run("Hello ", &[]), run("monde", &[language("fr-CA")])]);
    let a = owner(&c, &raw, range("p", 4, 11)?)?;
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        a.state().document(),
        a.state().selection().ok_or("selection")?,
    )?
    .ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains(r#""breditor/language-tag":"fr-CA""#), "{json}");
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(&json)?;
    let mut b = owner(&c, &root(), range("q", 5, 5)?)?;
    b.paste_general_inline_clipboard(&b.snapshot(), &range("q", 5, 5)?, &decoded, &[])?;
    let pasted = encode(&c, b.state().document())?;
    assert_eq!(
        pasted["children"][1]["children"],
        json!([run("Othero ", &[]), run("monde", &[language("fr-CA")])])
    );
    // A V3 owner refuses the V4 fragment outright.
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    Ok(())
}
