//! Ruby (furigana) as an opt-in typed inline extension: admission, fingerprint, the
//! generic set/replace/remove command, exact history and checkpoint replay. No grammar change.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
#[path = "support/rich_v4_frozen.rs"]
mod frozen;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{Format, PropertyMap, PropertyValue},
    extension::{ExtensionLimits, ExtensionManifest, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RICH_RUBY_ANNOTATION_V1, RICH_RUBY_FORMAT_V1, RichDocument, RichLocalOutcome,
        RichLocalSession, RichRubyAnnotation, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint,
        actions::{RichAction, RichFormatChange, SetInlineFormat},
        ruby_extension_v1, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use frozen::{FROZEN, V4_LAYOUT_FINGERPRINT, V4_STANDARD_FINGERPRINT};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// `example/layout@1`, V4, standard inline preset V1 plus ruby V1.
const RUBY_V4_LAYOUT_FINGERPRINT: &str =
    "sha256:dd793107a933e30a41608316003ce4d725952a35d1c63ffffbee8ba79d6a27d1";
/// `breditor-editor/standard@4` (the SDK stock schema), standard inline preset V1 plus ruby V1.
const RUBY_V4_STANDARD_FINGERPRINT: &str =
    "sha256:59b7d3c1fcbe2e85e23e526198312400e5732579d957a244d622c60a61194833";

fn compile(name: &str, version: u32, revision: u32, ruby: bool) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(version)?);
    let mut manifests: Vec<ExtensionManifest> = vec![standard_inline_extension_v1()];
    if ruby {
        manifests.push(ruby_extension_v1());
    }
    let extensions = ExtensionSet::try_new(manifests, ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn context(ruby: bool) -> Result<EditorContext> {
    Ok(EditorContext::new(compile("example/layout", 1, 4, ruby)?, DocumentLimits::default()))
}
fn ruby(annotation: &str) -> Value {
    json!({"type":RICH_RUBY_FORMAT_V1,"properties":{RICH_RUBY_ANNOTATION_V1:annotation}})
}
fn run(text: &str, formats: &[Value]) -> Value {
    json!({"kind":"text","text":text,"formats":formats})
}
fn root_with(runs: Vec<Value>) -> Value {
    let p = fixture::element("paragraph", "p", runs);
    let mut root =
        fixture::element("document", "unused", vec![p, fixture::paragraph("q", "Other")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
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
fn runs(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    let encoded: Value = serde_json::from_str(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?;
    Ok(encoded["root"]["children"][0]["children"].clone())
}
fn point(offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new("p")?, TextOffset::try_new(offset)?, Affinity::After))
}
fn owner(c: &EditorContext, raw: &Value) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(RichSelectionKind::TextRange { anchor: point(0)?, focus: point(2)? }),
        HistoryCapacity::default(),
    )?)
}
fn format(annotation: &str) -> Result<Format> {
    Ok(Format::new(
        QualifiedName::try_new(RICH_RUBY_FORMAT_V1)?,
        PropertyMap::try_from_sorted(vec![(
            QualifiedName::try_new(RICH_RUBY_ANNOTATION_V1)?,
            PropertyValue::from_string(annotation),
        )])?,
    ))
}
fn change(
    a: &RichLocalSession,
    start: u64,
    end: u64,
    change: &RichFormatChange,
) -> Result<RichAction> {
    Ok(RichAction::SetInlineFormat(SetInlineFormat::capture(
        a.state().document(),
        &BlockId::try_new("p")?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
        change,
    )?))
}

#[test]
fn ruby_is_an_opt_in_extension_with_its_own_fingerprint_and_frozen_v4_is_unchanged() -> Result {
    let plain = compile("example/layout", 1, 4, false)?;
    let with = compile("example/layout", 1, 4, true)?;
    assert_eq!(plain.fingerprint().to_string(), V4_LAYOUT_FINGERPRINT, "{FROZEN}");
    let stock = compile("breditor-editor/standard", 4, 4, false)?;
    assert_eq!(stock.fingerprint().to_string(), V4_STANDARD_FINGERPRINT, "{FROZEN}");
    assert_eq!(with.fingerprint().to_string(), RUBY_V4_LAYOUT_FINGERPRINT);
    assert_eq!(
        compile("breditor-editor/standard", 4, 4, true)?.fingerprint().to_string(),
        RUBY_V4_STANDARD_FINGERPRINT
    );
    // The same grammar (rule revision, every V4 slice) with one more admitted format.
    assert_eq!(with.rich_content_revision(), Some(4));
    assert!(with.supports_rich_text_language() && with.supports_rich_mentions());
    let kind = QualifiedName::try_new(RICH_RUBY_FORMAT_V1)?;
    let contract = with.inline_format_property_contract(&kind).ok_or("contract")?;
    assert_eq!(contract.properties().len(), 1);
    assert_eq!(contract.properties()[0].name().as_str(), RICH_RUBY_ANNOTATION_V1);
    assert!(plain.inline_format_property_contract(&kind).is_none());
    // The seam is language-independent: V1–V3 hosts may opt in too.
    for revision in 1..=3 {
        assert!(
            compile("example/layout", 1, revision, true)?
                .inline_format_property_contract(&kind)
                .is_some()
        );
    }
    // One owner per identity: a duplicate manifest is refused, never merged.
    assert!(
        ExtensionSet::try_new(
            vec![ruby_extension_v1(), ruby_extension_v1()],
            ExtensionLimits::default()
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn documents_with_ruby_are_admitted_only_by_ruby_profiles_and_within_the_bound() -> Result {
    let with = context(true)?;
    let without = context(false)?;
    let root = root_with(vec![run("漢字", &[ruby("かんじ")]), run("です", &[])]);
    admit(&with, &root)?;
    // A profile without the extension refuses the format (its fingerprint differs too).
    assert!(admit(&without, &root).is_err());
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":with.schema().fingerprint().to_string(),"root":root});
    assert!(DocumentJsonCodecV2::new(without.schema().clone()).decode(&input.to_string()).is_err());
    input["schemaFingerprint"] = json!(without.schema().fingerprint().to_string());
    assert!(DocumentJsonCodecV2::new(with.schema().clone()).decode(&input.to_string()).is_err());
    for bad in [
        root_with(vec![run("漢字", &[ruby("")])]),
        root_with(vec![run("漢字", &[ruby(&"あ".repeat(86))])]),
        root_with(vec![run("漢字", &[json!({"type":RICH_RUBY_FORMAT_V1,"properties":{}})])]),
    ] {
        assert!(admit(&with, &bad).is_err());
    }
    // 85 three-byte scalars (255 bytes) fit; 256 bytes is the inclusive bound.
    admit(&with, &root_with(vec![run("漢字", &[ruby(&"あ".repeat(85))])]))?;
    Ok(())
}

#[test]
fn annotation_policy_is_exact_and_round_trips_the_format_literal() -> Result {
    for good in ["かんじ", "kan ji", "ㄏㄢˋ", "a", &"x".repeat(256)] {
        let value = RichRubyAnnotation::try_new(good)?;
        assert_eq!(RichRubyAnnotation::of(&value.format()), Some(value));
    }
    for bad in
        ["", " かん", "かん ", "か\nん", "か\u{7}ん", "\u{202E}x", "x\u{2066}", &"x".repeat(257)]
    {
        assert!(RichRubyAnnotation::try_new(bad).is_err(), "{bad:?}");
    }
    assert!(
        RichRubyAnnotation::of(&Format::new(
            QualifiedName::try_new("breditor-inline/italic")?,
            PropertyMap::default()
        ))
        .is_none()
    );
    Ok(())
}

#[test]
fn set_replace_and_remove_are_one_exact_undo_step_each_and_replay_from_a_checkpoint() -> Result {
    let c = context(true)?;
    let strong = json!({"type":"breditor/strong","properties":{}});
    let mut a =
        owner(&c, &root_with(vec![run("漢", std::slice::from_ref(&strong)), run("字です", &[])]))?;
    let original = runs(&c, &a)?;
    // Set: the base spans two runs with different formats; both carry one equal annotation.
    let set = change(&a, 0, 2, &RichFormatChange::Set(format("かんじ")?))?;
    assert_eq!(
        a.dispatch(&a.snapshot(), &[set], RichSelectionUpdate::Map)?,
        RichLocalOutcome::ContentCommitted
    );
    assert_eq!(a.undo_depth(), 1);
    let annotated = runs(&c, &a)?;
    let mut strong_ruby = vec![strong.clone(), ruby("かんじ")];
    strong_ruby.sort_by(|x, y| x["type"].as_str().cmp(&y["type"].as_str()));
    assert_eq!(
        annotated,
        json!([run("漢", &strong_ruby), run("字", &[ruby("かんじ")]), run("です", &[])])
    );
    // Replace: one complete map replacement on the same base.
    let replace = change(&a, 0, 2, &RichFormatChange::Set(format("カンジ")?))?;
    a.dispatch(&a.snapshot(), &[replace], RichSelectionUpdate::Map)?;
    assert_eq!(a.undo_depth(), 2);
    assert_eq!(runs(&c, &a)?[1], run("字", &[ruby("カンジ")]));
    // Remove: other formats are untouched.
    let remove =
        change(&a, 0, 2, &RichFormatChange::Remove(QualifiedName::try_new(RICH_RUBY_FORMAT_V1)?))?;
    a.dispatch(&a.snapshot(), &[remove], RichSelectionUpdate::Map)?;
    assert_eq!(a.undo_depth(), 3);
    assert_eq!(runs(&c, &a)?, original);
    // Exact undo/redo, then the retained history replays from a checkpoint.
    a.undo(&a.snapshot())?;
    assert_eq!(runs(&c, &a)?[1], run("字", &[ruby("カンジ")]));
    a.undo(&a.snapshot())?;
    assert_eq!(runs(&c, &a)?, annotated);
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut restored = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(runs(&c, &restored)?, annotated);
    restored.undo(&restored.snapshot())?;
    assert_eq!(runs(&c, &restored)?, original);
    restored.redo(&restored.snapshot())?;
    restored.redo(&restored.snapshot())?;
    assert_eq!(runs(&c, &restored)?[1], run("字", &[ruby("カンジ")]));
    // A profile without ruby refuses the checkpoint.
    assert!(RichSessionJsonCodec::new(context(false)?).decode(&codec.encode(&a)?).is_err());
    Ok(())
}

#[test]
fn an_over_bound_annotation_is_refused_without_publication() -> Result {
    let c = context(true)?;
    let mut a = owner(&c, &root_with(vec![run("漢字", &[])]))?;
    let before = runs(&c, &a)?;
    let action = change(&a, 0, 2, &RichFormatChange::Set(format(&"x".repeat(257))?))?;
    assert!(a.dispatch(&a.snapshot(), &[action], RichSelectionUpdate::Map).is_err());
    assert_eq!(a.undo_depth(), 0);
    assert_eq!(runs(&c, &a)?, before);
    Ok(())
}

#[test]
fn typing_beside_or_inside_a_base_never_inherits_the_reading() -> Result {
    let c = context(true)?;
    let strong = json!({"type":"breditor/strong","properties":{}});
    let mut a = owner(
        &c,
        &root_with(vec![run("漢字", &[ruby("かんじ"), strong.clone()]), run("です", &[])]),
    )?;
    let caret = |offset| -> Result<Option<RichSelectionKind>> {
        Ok(Some(RichSelectionKind::TextRange { anchor: point(offset)?, focus: point(offset)? }))
    };
    a.set_selection(&a.snapshot(), caret(2)?)?;
    a.insert_plain_text(&a.snapshot(), "X")?;
    a.set_selection(&a.snapshot(), caret(1)?)?;
    a.insert_plain_text(&a.snapshot(), "Y")?;
    let mut both = vec![strong.clone(), ruby("かんじ")];
    both.sort_by(|x, y| x["type"].as_str().cmp(&y["type"].as_str()));
    // Other formats are still inherited (from the run the caret affinity selects); the reading
    // stays on its exact base.
    assert_eq!(
        runs(&c, &a)?,
        json!([
            run("漢", &both),
            run("Y", std::slice::from_ref(&strong)),
            run("字", &both),
            run("Xです", &[])
        ])
    );
    Ok(())
}
