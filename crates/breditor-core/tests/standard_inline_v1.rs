//! Native source-of-truth contracts for the optional standard inline preset.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichFormatsJsonCodec, RichSessionJsonCodec,
        encode_inline_format_catalog,
    },
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1,
    },
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalSession, RichSelectionKind, RichTextPoint,
        STANDARD_INLINE_EXTENSION_V1_NAME, StandardInlineFormatV1, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn name(value: &str) -> Result<QualifiedName> {
    Ok(QualifiedName::try_new(value)?)
}
fn schema(manifests: Vec<ExtensionManifest>) -> Result<CompiledSchema> {
    Ok(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(name("example/standard-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(manifests, ExtensionLimits::default())?,
    )?)
}
fn context() -> Result<EditorContext> {
    Ok(EditorContext::new(schema(vec![standard_inline_extension_v1()])?, DocumentLimits::default()))
}
fn literal(kind: StandardInlineFormatV1, properties: Value) -> Value {
    let mut literal = json!({"type":kind.kind().as_str(),"properties":null});
    literal["properties"] = properties;
    literal
}

#[test]
fn preset_has_exact_twelve_identities_and_does_not_change_the_ordinary_profile() -> Result {
    let plain = schema(vec![])?;
    let standard = schema(vec![standard_inline_extension_v1()])?;
    let catalog: Value = serde_json::from_str(&encode_inline_format_catalog(&standard))?;
    let kinds: Vec<_> = catalog["formats"]
        .as_array()
        .ok_or("formats")?
        .iter()
        .map(|format| format["kind"].as_str().unwrap_or_default())
        .collect();
    assert_eq!(
        kinds,
        vec![
            "breditor-inline/background-color",
            "breditor-inline/code",
            "breditor-inline/font-family",
            "breditor-inline/italic",
            "breditor-inline/link",
            "breditor-inline/strike",
            "breditor-inline/subscript",
            "breditor-inline/superscript",
            "breditor-inline/text-color",
            "breditor-inline/text-size",
            "breditor-inline/underline",
            "breditor/strong"
        ]
    );
    assert!(
        catalog["formats"]
            .as_array()
            .ok_or("formats")?
            .iter()
            .all(|format| format["revision"] == 1)
    );
    let plain_catalog: Value = serde_json::from_str(&encode_inline_format_catalog(&plain))?;
    assert_eq!(plain_catalog["formats"].as_array().ok_or("plain")?.len(), 1);
    assert_ne!(plain.fingerprint(), standard.fingerprint());
    assert_eq!(standard.fingerprint(), schema(vec![standard_inline_extension_v1()])?.fingerprint());
    Ok(())
}

#[test]
fn preset_catalog_pins_complete_required_domains_and_contains_no_actions() -> Result {
    let context = context()?;
    let catalog: Value = serde_json::from_str(&encode_inline_format_catalog(context.schema()))?;
    let formats = catalog["formats"].as_array().ok_or("formats")?;
    let properties = |kind: &str| {
        formats.iter().find(|f| f["kind"] == kind).map_or(Value::Null, |f| f["properties"].clone())
    };
    assert_eq!(
        properties("breditor-inline/link"),
        json!([
            {"name":"breditor-inline/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},
            {"name":"breditor-inline/new-window","presence":"required","valueType":{"kind":"boolean"}}
        ])
    );
    for (kind, property, minimum, maximum) in [
        ("text-color", "rgb24", 0, 0x00ff_ffff),
        ("background-color", "rgb24", 0, 0x00ff_ffff),
        ("text-size", "pixels", 8, 96),
        ("font-family", "family", 1, 4),
    ] {
        assert_eq!(
            properties(format!("breditor-inline/{kind}").as_str()),
            json!([{"name":format!("breditor-inline/{property}"),"presence":"required","valueType":{"kind":"integer","minimum":minimum,"maximum":maximum}}])
        );
    }
    let manifest = standard_inline_extension_v1();
    assert!(manifest.inline_format_toggles().is_empty());
    assert!(manifest.inline_format_sets().is_empty());
    assert_eq!(manifest.id().name().as_str(), STANDARD_INLINE_EXTENSION_V1_NAME);
    Ok(())
}

#[test]
fn compiled_preset_admits_only_exact_semantic_literals_at_every_numeric_boundary() -> Result {
    use StandardInlineFormatV1 as F;
    let codec = RichFormatsJsonCodec::new(context()?);
    for (kind, property, minimum, maximum) in [
        (F::TextColor, "breditor-inline/rgb24", 0, 0x00ff_ffff),
        (F::BackgroundColor, "breditor-inline/rgb24", 0, 0x00ff_ffff),
        (F::TextSize, "breditor-inline/pixels", 8, 96),
        (F::FontFamily, "breditor-inline/family", 1, 4),
    ] {
        for value in [minimum, maximum] {
            let input = json!([literal(kind, json!({property:value}))]).to_string();
            assert_eq!(
                serde_json::from_str::<Value>(&codec.encode(&codec.decode(&input)?)?)?,
                serde_json::from_str::<Value>(&input)?
            );
        }
        for value in [minimum - 1, maximum + 1] {
            assert!(
                codec.decode(&json!([literal(kind, json!({property:value}))]).to_string()).is_err()
            );
        }
        for properties in
            [json!({}), json!({property:"16"}), json!({property:minimum,"example/extra":true})]
        {
            assert!(codec.decode(&json!([literal(kind, properties)]).to_string()).is_err());
        }
    }
    let unsafe_but_semantic = json!([literal(
        F::Link,
        json!({"breditor-inline/href":"javascript:kept-as-data","breditor-inline/new-window":false})
    )])
    .to_string();
    // The schema does not pretend to be the closed browser URL policy.
    assert!(codec.decode(&unsafe_but_semantic).is_ok());
    for href in ["x".to_owned(), "x".repeat(2048), format!("{}ab", "日".repeat(682))] {
        assert!(
            codec
                .decode(
                    &json!([literal(
                        F::Link,
                        json!({"breditor-inline/href":href,"breditor-inline/new-window":true})
                    )])
                    .to_string()
                )
                .is_ok()
        );
    }
    for href in [String::new(), "x".repeat(2049), "日".repeat(683)] {
        assert!(
            codec
                .decode(
                    &json!([literal(
                        F::Link,
                        json!({"breditor-inline/href":href,"breditor-inline/new-window":false})
                    )])
                    .to_string()
                )
                .is_err()
        );
    }
    assert!(
        codec
            .decode(
                &json!([literal(
                    F::Link,
                    json!({"breditor-inline/href":"x","breditor-inline/new-window":1})
                )])
                .to_string()
            )
            .is_err()
    );
    assert!(
        codec
            .decode(
                &json!([literal(F::Link, json!({"breditor-inline/href":"https://example.test/"}))])
                    .to_string()
            )
            .is_err()
    );
    for kind in
        [F::Strong, F::Italic, F::Underline, F::Strike, F::Code, F::Subscript, F::Superscript]
    {
        assert!(codec.decode(&json!([literal(kind, json!({}))]).to_string()).is_ok());
    }
    // Both literals remain independently representable; a future exclusive control
    // must make its removal/addition explicit rather than changing admission rules.
    assert!(
        codec
            .decode(
                &json!([literal(F::Subscript, json!({})), literal(F::Superscript, json!({}))])
                    .to_string()
            )
            .is_ok()
    );
    Ok(())
}

#[test]
fn applications_compose_dependencies_before_resolution_and_duplicate_claims_reject() -> Result {
    let standard = standard_inline_extension_v1();
    let app = ExtensionManifest::try_new_with_inline_formats(
        ExtensionId::new(name("example/review")?, ExtensionVersion::one()),
        vec![standard.id().clone()],
        vec![],
        vec![InlineFormatSpecV1::new(name("example/review")?, PersistedTypeRevision::one())],
    )?;
    assert!(schema(vec![app.clone()]).is_err());
    assert!(schema(vec![app.clone(), standard.clone()]).is_ok());
    assert_eq!(
        schema(vec![standard.clone(), app.clone()])?.fingerprint(),
        schema(vec![app, standard.clone()])?.fingerprint()
    );
    assert!(schema(vec![standard.clone(), standard]).is_err());
    let claim = ExtensionManifest::try_new_with_inline_formats(
        ExtensionId::new(name("example/conflict")?, ExtensionVersion::one()),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(
            StandardInlineFormatV1::Italic.kind(),
            PersistedTypeRevision::one(),
        )],
    )?;
    assert!(schema(vec![standard_inline_extension_v1(), claim]).is_err());
    Ok(())
}

#[test]
fn preset_pending_typing_has_exact_history_and_cannot_be_restored_as_the_plain_schema() -> Result {
    let context = context()?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/standard-rich","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    let point =
        RichTextPoint::new(BlockId::try_new("caption")?, TextOffset::try_new(1)?, Affinity::After);
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
        HistoryCapacity::try_new(20)?,
    )?;
    let formats=RichFormatsJsonCodec::new(context.clone()).decode(&json!([literal(StandardInlineFormatV1::Link,json!({"breditor-inline/href":"https://example.test/","breditor-inline/new-window":true})),literal(StandardInlineFormatV1::TextSize,json!({"breditor-inline/pixels":24}))]).to_string())?;
    owner.set_pending_formats(&owner.snapshot(), Some(formats))?;
    owner.insert_plain_text(&owner.snapshot(), "日本🙂")?;
    let codec = RichSessionJsonCodec::new(context.clone());
    let saved = codec.encode(&owner)?;
    let mut restored = codec.decode(&saved)?;
    owner.undo(&owner.snapshot())?;
    restored.undo(&restored.snapshot())?;
    assert_eq!(codec.encode(&owner)?, codec.encode(&restored)?);
    owner.redo(&owner.snapshot())?;
    restored.redo(&restored.snapshot())?;
    assert_eq!(codec.encode(&owner)?, codec.encode(&restored)?);
    let plain =
        RichSessionJsonCodec::new(EditorContext::new(schema(vec![])?, DocumentLimits::default()));
    assert!(plain.decode(&saved).is_err());
    Ok(())
}
