#![cfg(feature = "experimental-rich-content")]
//! Exact property-aware UI reads over the same Rust snapshot used by rich editing.

use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec, RichSessionJsonCodec},
    document::{FormatSet, PropertyMap},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, RichDocument, RichInlineFormatState, RichInlineFormatStateError,
        RichLocalSession, RichSelection, RichSelectionKind, RichTextPoint, RowId, TableId,
        inspect_inline_format,
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
fn context() -> Result<EditorContext> {
    context_with_href_limit(2048)
}
fn context_with_href_limit(maximum: u32) -> Result<EditorContext> {
    let kind = name("example/link")?;
    let contract = InlineFormatPropertyContractV1::try_new(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            name("example/href")?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, maximum)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    Ok(EditorContext::new(
        CompiledSchema::try_compile_rich_content_profile(
            SchemaId::new(name("example/inline-state")?, SchemaVersion::try_new(1)?),
            &ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?,
        )?,
        DocumentLimits::default(),
    ))
}
fn link(href: &str) -> Value {
    json!({"type":"example/link","properties":{"example/href":href}})
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn runs(node: &mut Value, block: &str, replacement: &Value) -> bool {
    if node["properties"]["breditor/block-id"] == block {
        node["children"] = replacement.clone();
        return true;
    }
    node.get_mut("children")
        .and_then(Value::as_array_mut)
        .is_some_and(|children| children.iter_mut().any(|child| runs(child, block, replacement)))
}
fn document(context: &EditorContext, empty_caption: bool) -> Result<RichDocument> {
    let mut root: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    assert!(runs(
        &mut root,
        "p",
        &json!([
            {"kind":"text","text":"a","formats":[strong(),link("https://a.test/")]},
            {"kind":"text","text":"🙂","formats":[strong(),link("https://b.test/")]},
            {"kind":"text","text":"b","formats":[]}
        ])
    ));
    if empty_caption {
        assert!(runs(&mut root, "caption", &json!([])));
    }
    let input = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let codec = DocumentJsonCodecV2::new(context.schema().clone());
    Ok(RichDocument::try_admit(
        context.schema(),
        codec.decode(&input.to_string())?,
        context.limits(),
    )?)
}
fn point(block: &str, offset: u64, affinity: Affinity) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, affinity))
}
fn range(document: &RichDocument, a: (&str, u64), f: (&str, u64)) -> Result<RichSelection> {
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::TextRange {
            anchor: point(a.0, a.1, Affinity::After)?,
            focus: point(f.0, f.1, Affinity::After)?,
        },
    )?)
}
fn query(
    context: &EditorContext,
    document: &RichDocument,
    selection: &RichSelection,
    kind: &str,
) -> Result<RichInlineFormatState> {
    Ok(inspect_inline_format(context, document, Some(selection), None, &name(kind)?)?)
}
fn uniform(state: RichInlineFormatState, href: &str) -> Result {
    let RichInlineFormatState::Uniform(format) = state else {
        return Err("expected uniform format".into());
    };
    assert_eq!(format.kind(), &name("example/link")?);
    let codec = RichFormatsJsonCodec::new(context()?);
    assert_eq!(
        serde_json::from_str::<Value>(&codec.encode(&FormatSet::try_from_formats(vec![format])?)?)?,
        json!([link(href)])
    );
    Ok(())
}

#[test]
fn exact_values_all_present_mixed_values_and_partial_presence_remain_distinct() -> Result {
    let context = context()?;
    let doc = document(&context, false)?;
    uniform(
        query(&context, &doc, &range(&doc, ("p", 0), ("p", 1))?, "example/link")?,
        "https://a.test/",
    )?;
    uniform(
        query(&context, &doc, &range(&doc, ("p", 1), ("p", 3))?, "example/link")?,
        "https://b.test/",
    )?;
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 0), ("p", 3))?, "example/link")?,
        RichInlineFormatState::Mixed { present_everywhere: true }
    );
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 0), ("p", 4))?, "example/link")?,
        RichInlineFormatState::Mixed { present_everywhere: false }
    );
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 3), ("p", 4))?, "example/link")?,
        RichInlineFormatState::Unset
    );
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 0), ("p", 3))?, "breditor/strong")?,
        RichInlineFormatState::Uniform(breditor_core::document::Format::new(
            name("breditor/strong")?,
            PropertyMap::default()
        ))
    );
    Ok(())
}

#[test]
fn directional_ranges_cross_cell_and_caption_boundaries_without_losing_properties() -> Result {
    let context = context()?;
    let doc = document(&context, false)?;
    for kind in ["breditor/strong", "example/link"] {
        let forward = query(&context, &doc, &range(&doc, ("p", 0), ("caption", 1))?, kind)?;
        assert_eq!(forward, query(&context, &doc, &range(&doc, ("caption", 1), ("p", 0))?, kind)?);
        assert_eq!(forward, RichInlineFormatState::Mixed { present_everywhere: false });
    }
    // The final paragraph contributes no characters at its zero endpoint.
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 0), ("caption", 0))?, "example/link")?,
        RichInlineFormatState::Mixed { present_everywhere: false }
    );
    assert!(
        RichSelection::try_new(
            &doc,
            RichSelectionKind::TextRange {
                anchor: point("p", 2, Affinity::After)?,
                focus: point("caption", 0, Affinity::After)?
            }
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn caret_uses_focus_affinity_and_explicit_plain_pending_override() -> Result {
    let context = context()?;
    let doc = document(&context, false)?;
    let kind = name("example/link")?;
    for (offset, affinity, href) in [
        (1, Affinity::Before, "https://a.test/"),
        (1, Affinity::After, "https://b.test/"),
        (3, Affinity::Before, "https://b.test/"),
    ] {
        let selection = RichSelection::try_new(
            &doc,
            RichSelectionKind::TextRange {
                anchor: point("p", offset, Affinity::After)?,
                focus: point("p", offset, affinity)?,
            },
        )?;
        uniform(inspect_inline_format(&context, &doc, Some(&selection), None, &kind)?, href)?;
        assert_eq!(
            inspect_inline_format(
                &context,
                &doc,
                Some(&selection),
                Some(&FormatSet::default()),
                &kind
            )?,
            RichInlineFormatState::Unset
        );
    }
    let selection = range(&doc, ("p", 3), ("p", 3))?;
    assert_eq!(query(&context, &doc, &selection, "example/link")?, RichInlineFormatState::Unset);
    let pending = RichFormatsJsonCodec::new(context.clone())
        .decode(&json!([link("https://pending.test/")]).to_string())?;
    uniform(
        inspect_inline_format(&context, &doc, Some(&selection), Some(&pending), &kind)?,
        "https://pending.test/",
    )?;
    Ok(())
}

#[test]
fn empty_caret_is_applicable_but_empty_selected_fragments_and_nontext_modes_are_not() -> Result {
    let context = context()?;
    let doc = document(&context, true)?;
    let kind = name("breditor/strong")?;
    assert_eq!(
        query(&context, &doc, &range(&doc, ("caption", 0), ("caption", 0))?, "breditor/strong")?,
        RichInlineFormatState::Unset
    );
    assert_eq!(
        query(&context, &doc, &range(&doc, ("p", 4), ("caption", 0))?, "breditor/strong")?,
        RichInlineFormatState::Unavailable
    );
    assert_eq!(
        inspect_inline_format(&context, &doc, None, None, &kind)?,
        RichInlineFormatState::Unavailable
    );
    let cell = CellId::new(TableId::try_new("t")?, RowId::try_new("r")?, ColumnId::try_new("c")?);
    for value in [
        RichSelectionKind::Node(BlockId::try_new("image-block")?),
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    ] {
        let selection = RichSelection::try_new(&doc, value)?;
        assert_eq!(
            inspect_inline_format(&context, &doc, Some(&selection), None, &kind)?,
            RichInlineFormatState::Unavailable
        );
    }
    Ok(())
}

#[test]
fn unknown_context_stale_selection_and_invalid_pending_fail_without_false_values() -> Result {
    let context = context()?;
    let doc = document(&context, false)?;
    let selection = range(&doc, ("p", 0), ("p", 1))?;
    assert!(matches!(
        inspect_inline_format(&context, &doc, Some(&selection), None, &name("example/unknown")?),
        Err(RichInlineFormatStateError::UnknownFormat)
    ));
    let foreign = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    assert!(matches!(
        inspect_inline_format(&foreign, &doc, None, None, &name("breditor/strong")?),
        Err(RichInlineFormatStateError::Context)
    ));
    assert!(matches!(
        inspect_inline_format(
            &context,
            &doc,
            Some(&selection),
            Some(&FormatSet::default()),
            &name("example/link")?
        ),
        Err(RichInlineFormatStateError::Pending(_))
    ));
    let invalid = FormatSet::try_from_formats(vec![breditor_core::document::Format::new(
        name("example/link")?,
        PropertyMap::default(),
    )])?;
    let caret = range(&doc, ("p", 0), ("p", 0))?;
    assert!(matches!(
        inspect_inline_format(&context, &doc, Some(&caret), Some(&invalid), &name("example/link")?),
        Err(RichInlineFormatStateError::Pending(_))
    ));
    let changed = document(&context, true)?;
    assert!(matches!(
        inspect_inline_format(&context, &changed, Some(&selection), None, &name("example/link")?),
        Err(RichInlineFormatStateError::Selection(_))
    ));
    Ok(())
}

#[test]
fn reads_preserve_exact_checkpoint_redo_and_the_live_mutation_observation() -> Result {
    let context = context()?;
    let doc = document(&context, false)?;
    let selection = range(&doc, ("p", 1), ("p", 1))?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        doc,
        Some(selection.kind().clone()),
        HistoryCapacity::try_new(10)?,
    )?;
    owner.insert_plain_text(&owner.snapshot(), "X")?;
    owner.undo(&owner.snapshot())?;
    let before = owner.snapshot();
    let codec = RichSessionJsonCodec::new(context.clone());
    let bytes = codec.encode(&owner)?;
    for kind in ["breditor/strong", "example/link"] {
        inspect_inline_format(
            &context,
            owner.state().document(),
            owner.state().selection(),
            owner.state().pending_formats(),
            &name(kind)?,
        )?;
    }
    assert_eq!(codec.encode(&owner)?, bytes);
    owner.redo(&before)?; // Read queries did not rotate the live publication guard.
    owner.undo(&owner.snapshot())?;
    let restored = codec.decode(&bytes)?;
    assert_eq!(owner.state().document().document(), restored.state().document().document());
    Ok(())
}

#[test]
fn state_encoding_is_schema_bound_closed_and_rejects_forged_uniform_values() -> Result {
    use breditor_core::codec::encode_rich_inline_format_state;
    let context = context()?;
    let kind = name("example/link")?;
    let doc = document(&context, false)?;
    let uniform = query(&context, &doc, &range(&doc, ("p", 0), ("p", 1))?, "example/link")?;
    let encoded = encode_rich_inline_format_state(&context, &kind, &uniform)?;
    let value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(
        value,
        json!({"format":"breditor/rich-inline-format-state","formatVersion":1,
        "schema":{"name":"example/inline-state","version":1,"fingerprint":context.schema().fingerprint().to_string()},
        "formatKind":"example/link","state":{"kind":"uniform","format":link("https://a.test/")}})
    );
    assert_eq!(encoded, encode_rich_inline_format_state(&context, &kind, &uniform)?);
    for (state, expected) in [
        (RichInlineFormatState::Unavailable, json!({"kind":"unavailable"})),
        (RichInlineFormatState::Unset, json!({"kind":"unset"})),
        (
            RichInlineFormatState::Mixed { present_everywhere: true },
            json!({"kind":"mixed","presentEverywhere":true}),
        ),
        (
            RichInlineFormatState::Mixed { present_everywhere: false },
            json!({"kind":"mixed","presentEverywhere":false}),
        ),
    ] {
        assert_eq!(
            serde_json::from_str::<Value>(&encode_rich_inline_format_state(
                &context, &kind, &state
            )?)?["state"],
            expected
        );
    }
    let forged = RichInlineFormatState::Uniform(breditor_core::document::Format::new(
        kind.clone(),
        PropertyMap::default(),
    ));
    assert!(encode_rich_inline_format_state(&context, &kind, &forged).is_err());
    assert!(
        encode_rich_inline_format_state(&context, &name("breditor/strong")?, &uniform).is_err()
    );
    assert!(
        encode_rich_inline_format_state(
            &context,
            &name("example/unknown")?,
            &RichInlineFormatState::Unset
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn cross_cell_read_interval_uses_tree_paths_not_lexical_ids_or_dom_projection() -> Result {
    let context = context()?;
    let original = document(&context, false)?;
    let codec = DocumentJsonCodecV2::new(context.schema().clone());
    let mut input: Value = serde_json::from_str(&codec.encode(original.document())?)?;
    input["root"]["children"][0]["properties"]["breditor/columns"]
        .as_array_mut()
        .ok_or("columns")?
        .push(json!({"id":"c2","width":120}));
    input["root"]["children"][0]["children"][0]["children"].as_array_mut().ok_or("cells")?.push(json!({"kind":"element","type":"breditor/table-cell","entityId":null,"properties":{"breditor/block-id":"cell2","breditor/column-id":"c2","breditor/header":false},"children":[{"kind":"element","type":"breditor/heading","entityId":null,"properties":{"breditor/block-id":"aaa-later-heading","breditor/level":2},"children":[{"kind":"text","text":"Z🙂","formats":[strong()]}]}]}));
    let doc = RichDocument::try_admit(
        context.schema(),
        codec.decode(&input.to_string())?,
        context.limits(),
    )?;
    // The later heading ID sorts before the earlier caption ID. Empty boundary
    // text in the caption contributes no observation to either direction.
    let expected = RichInlineFormatState::Uniform(breditor_core::document::Format::new(
        name("breditor/strong")?,
        PropertyMap::default(),
    ));
    assert_eq!(
        query(
            &context,
            &doc,
            &range(&doc, ("caption", 4), ("aaa-later-heading", 1))?,
            "breditor/strong"
        )?,
        expected
    );
    assert_eq!(
        query(
            &context,
            &doc,
            &range(&doc, ("aaa-later-heading", 1), ("caption", 4))?,
            "breditor/strong"
        )?,
        expected
    );
    assert_eq!(
        query(
            &context,
            &doc,
            &range(&doc, ("p", 3), ("aaa-later-heading", 1))?,
            "breditor/strong"
        )?,
        RichInlineFormatState::Mixed { present_everywhere: false }
    );
    Ok(())
}

#[test]
fn large_schema_valid_uniform_value_fails_the_read_budget_instead_of_truncating() -> Result {
    use breditor_core::{
        codec::{RichFormatsCodecError, encode_rich_inline_format_state},
        document::{Format, PropertyValue},
    };
    let context = context_with_href_limit(65536)?;
    let kind = name("example/link")?;
    let state = |bytes| -> Result<RichInlineFormatState> {
        Ok(RichInlineFormatState::Uniform(Format::new(
            kind.clone(),
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string("x".repeat(bytes)),
            )])?,
        )))
    };
    assert!(encode_rich_inline_format_state(&context, &kind, &state(16384)?).is_ok());
    assert!(matches!(
        encode_rich_inline_format_state(&context, &kind, &state(65536)?),
        Err(RichFormatsCodecError::Limit)
    ));
    Ok(())
}
