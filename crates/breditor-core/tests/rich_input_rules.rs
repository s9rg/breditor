//! Native shortcut semantics, one-step reversal, complete admission and unchanged old recovery families.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichInputRuleKind, RichLocalOutcome, RichLocalSession,
        RichPendingFormatsUpdate, RichSelection, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint, StandardInlineFormatV1,
        actions::{RichAction, RichFormatChange, SetInlineFormat},
        plan_rich_markdown_input_rule, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(
    version: u8,
    children: Vec<Value>,
    natural: bool,
) -> Result<(EditorContext, RichLocalSession)> {
    let id =
        SchemaId::new(QualifiedName::try_new("example/input-rules")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    let schema = match version {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        _ => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
    };
    let context = EditorContext::new(schema, DocumentLimits::default());
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/input-rules","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?,
        context.limits(),
    )?;
    let mut owner =
        RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::try_new(128)?)?;
    if natural {
        owner.enable_typing_history(&owner.snapshot())?;
    }
    Ok((context, owner))
}
fn point(id: &str, offset: usize) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(
        BlockId::try_new(id)?,
        TextOffset::try_new(offset as u64)?,
        Affinity::After,
    ))
}
fn select(owner: &mut RichLocalSession, id: &str, offset: usize) -> Result {
    let p = point(id, offset)?;
    owner.set_selection(
        &owner.snapshot(),
        Some(RichSelectionKind::TextRange { anchor: p.clone(), focus: p }),
    )?;
    Ok(())
}
fn text(owner: &RichLocalSession, id: &str) -> Result<String> {
    Ok(node(owner, id)?.children().iter().map(|n| n.as_text().map_or("", |t| t.text())).collect())
}
fn node<'a>(
    owner: &'a RichLocalSession,
    id: &str,
) -> Result<&'a breditor_core::document::ElementNode> {
    Ok(owner
        .state()
        .document()
        .document()
        .node_at(
            owner.state().document().block_path(&BlockId::try_new(id)?).ok_or("missing node")?,
        )?
        .as_element()
        .ok_or("wrong kind")?)
}
fn saved(context: &EditorContext, owner: &RichLocalSession) -> Result<String> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).encode(owner)?
    } else {
        RichSessionJsonCodec::new(context.clone()).encode(owner)?
    })
}
fn restore(context: &EditorContext, owner: &RichLocalSession) -> Result<RichLocalSession> {
    Ok(if owner.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    } else {
        RichSessionJsonCodec::new(context.clone()).decode(&saved(context, owner)?)?
    })
}
fn trigger(owner: &mut RichLocalSession, text: &str) -> Result {
    if owner.typing_history_enabled() {
        owner.insert_typing_text(&owner.snapshot(), text, 100)?;
    } else {
        owner.insert_plain_text(&owner.snapshot(), text)?;
    }
    Ok(())
}
fn future(context: &EditorContext, owner: &mut RichLocalSession) -> Result {
    let mut twin = restore(context, owner)?;
    assert_eq!(saved(context, &twin)?, saved(context, owner)?);
    for undo in [true, false, true, false] {
        if undo {
            owner.undo(&owner.snapshot())?;
            twin.undo(&twin.snapshot())?;
        } else {
            owner.redo(&owner.snapshot())?;
            twin.redo(&twin.snapshot())?;
        }
        assert_eq!(saved(context, &twin)?, saved(context, owner)?);
    }
    Ok(())
}

#[test]
fn structural_rules_retain_text_identity_and_undo_to_the_literal_trigger_in_every_grammar() -> Result
{
    for version in 1..=3 {
        for natural in [false, true] {
            let mut cases = vec![
                ("#", "breditor/heading"),
                ("######", "breditor/heading"),
                ("-", "breditor/paragraph"),
                ("+", "breditor/paragraph"),
                ("*", "breditor/paragraph"),
                ("7.", "breditor/paragraph"),
                ("2147483647)", "breditor/paragraph"),
            ];
            if version >= 2 {
                cases.extend([
                    (">", "breditor/paragraph"),
                    ("[ ]", "breditor/paragraph"),
                    ("[x]", "breditor/paragraph"),
                    ("[X]", "breditor/paragraph"),
                    ("```", "breditor/code-block"),
                    ("```rust", "breditor/code-block"),
                    ("---", "breditor/paragraph"),
                    ("***", "breditor/paragraph"),
                    ("___", "breditor/paragraph"),
                ]);
            }
            for (marker, kind) in cases {
                let (context, mut owner) =
                    setup(version, vec![fixture::paragraph("body", marker)], natural)?;
                select(&mut owner, "body", marker.len())?;
                trigger(&mut owner, " ")?;
                let literal = owner.state().document().clone();
                let before_selection = owner.state().selection().map(|s| s.kind().clone());
                let depth = owner.undo_depth();
                assert_eq!(
                    owner.apply_markdown_input_rule(&owner.snapshot(), " ", "local-rule")?,
                    RichLocalOutcome::ContentCommitted,
                    "{marker}"
                );
                assert_eq!(text(&owner, "body")?, "");
                assert_eq!(node(&owner, "body")?.kind().as_str(), kind);
                assert_eq!(owner.undo_depth(), depth + 1);
                let formatted = owner.state().document().clone();
                owner.undo(&owner.snapshot())?;
                assert_eq!(owner.state().document().document(), literal.document());
                assert_eq!(owner.state().selection().map(|s| s.kind().clone()), before_selection);
                assert_eq!(text(&owner, "body")?, format!("{marker} "));
                owner.redo(&owner.snapshot())?;
                assert_eq!(owner.state().document().document(), formatted.document());
                future(&context, &mut owner)?;
            }
        }
    }
    Ok(())
}

#[test]
fn inline_rules_keep_unicode_runs_caret_and_effective_pending_formats_in_one_group() -> Result {
    for natural in [false, true] {
        for (source, key, kind) in [
            ("**猫🙂*", "*", "breditor/strong"),
            ("__猫🙂_", "_", "breditor/strong"),
            ("*猫🙂", "*", "breditor-inline/italic"),
            ("_猫🙂", "_", "breditor-inline/italic"),
            ("~~猫🙂~", "~", "breditor-inline/strike"),
            ("`猫🙂", "`", "breditor-inline/code"),
        ] {
            let source = format!("🙂 {source}");
            let (context, mut owner) =
                setup(3, vec![fixture::paragraph("body", &source)], natural)?;
            select(&mut owner, "body", source.encode_utf16().count())?;
            trigger(&mut owner, key)?;
            let literal = text(&owner, "body")?;
            let pending = owner.state().effective_caret_formats()?;
            owner.apply_markdown_input_rule(&owner.snapshot(), key, "unused")?;
            assert_eq!(text(&owner, "body")?, "🙂 猫🙂");
            let body = node(&owner, "body")?.children();
            assert_eq!(
                body.iter()
                    .next_back()
                    .and_then(|n| n.as_text())
                    .ok_or("missing text")?
                    .formats()
                    .iter()
                    .map(|f| f.kind().as_str())
                    .collect::<Vec<_>>(),
                [kind]
            );
            assert_eq!(owner.state().effective_caret_formats()?, pending);
            owner.undo(&owner.snapshot())?;
            assert_eq!(text(&owner, "body")?, literal);
            owner.redo(&owner.snapshot())?;
            future(&context, &mut owner)?;
        }
    }
    Ok(())
}

#[test]
fn ambiguous_escaped_intraword_whitespace_multiline_and_nonmatching_input_stay_literal() -> Result {
    for source in [
        "word_em_",
        "word**strong**",
        "\\*em*",
        "*em\\*",
        "***ambiguous***",
        "** whitespace**",
        "**whitespace **",
        "**line\nbreak**",
        "*a*b*",
        "__",
        "~~",
        "```",
        "####### ",
        "0. ",
        "01. ",
        "2147483648. ",
        "```<script> ",
        "  # ",
    ] {
        let (context, mut owner) = setup(3, vec![fixture::paragraph("body", source)], false)?;
        select(&mut owner, "body", source.encode_utf16().count())?;
        let before = saved(&context, &owner)?;
        let key = source.chars().next_back().ok_or("empty test")?.to_string();
        assert_eq!(
            owner.apply_markdown_input_rule(&owner.snapshot(), &key, "unused")?,
            RichLocalOutcome::Unchanged,
            "{source}"
        );
        assert_eq!(saved(&context, &owner)?, before);
    }
    Ok(())
}

#[test]
fn pure_plans_are_exact_source_proofs_and_never_publish_or_change_the_selection() -> Result {
    let (context, mut owner) = setup(3, vec![fixture::paragraph("body", "# ")], false)?;
    select(&mut owner, "body", 2)?;
    let before = saved(&context, &owner)?;
    let plan = plan_rich_markdown_input_rule(
        &context,
        owner.state().document(),
        owner.state().selection(),
        " ",
        "rule",
    )?
    .ok_or("missing rule")?;
    assert_eq!(plan.kind(), &RichInputRuleKind::Heading(1));
    assert_eq!(saved(&context, &owner)?, before);
    plan.validate_for(owner.state().document())?;
    trigger(&mut owner, "X")?;
    assert!(plan.validate_for(owner.state().document()).is_err());
    Ok(())
}

#[test]
fn nonmatches_keep_redo_observations_and_native_typing_continuation_exact() -> Result {
    let (context, mut owner) = setup(3, vec![fixture::paragraph("body", "hello*")], true)?;
    select(&mut owner, "body", 6)?;
    trigger(&mut owner, "X")?;
    owner.undo(&owner.snapshot())?;
    let before = saved(&context, &owner)?;
    let observed = owner.snapshot();
    assert_eq!(
        owner.apply_markdown_input_rule(&observed, "*", "ignored")?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(saved(&context, &owner)?, before);
    owner.redo(&observed)?;
    assert_eq!(text(&owner, "body")?, "hello*X");
    Ok(())
}

#[test]
fn stale_readonly_invalid_ids_and_late_group_limits_never_remove_retained_markers() -> Result {
    let (context, mut owner) = setup(
        3,
        vec![fixture::paragraph("body", "- "), fixture::paragraph("rule:rule:list", "other")],
        false,
    )?;
    select(&mut owner, "body", 2)?;
    let before = saved(&context, &owner)?;
    for namespace in ["bad prefix", "rule"] {
        assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", namespace).is_err());
        assert_eq!(saved(&context, &owner)?, before);
    }
    let old = owner.snapshot();
    owner.set_read_only(&owner.snapshot(), true)?;
    let before = saved(&context, &owner)?;
    assert!(owner.apply_markdown_input_rule(&old, " ", "fresh").is_err());
    assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", "fresh").is_err());
    assert_eq!(saved(&context, &owner)?, before);
    let tighter = context.clone().with_max_operations_per_transaction(1);
    let selection = RichSelection::try_new(
        owner.state().document(),
        RichSelectionKind::TextRange { anchor: point("body", 2)?, focus: point("body", 2)? },
    )?;
    assert!(
        plan_rich_markdown_input_rule(
            &tighter,
            owner.state().document(),
            Some(&selection),
            " ",
            "fresh"
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn captions_only_allow_inline_rules_and_list_heads_keep_their_required_prose_shape() -> Result {
    let mut image = fixture::element("image", "image", vec![fixture::paragraph("caption", "# ")]);
    image["properties"] = json!({"breditor/block-id":"image","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Diagram"});
    let list = fixture::element(
        "bullet-list",
        "list",
        vec![fixture::element(
            "list-item",
            "item",
            vec![fixture::paragraph("head", "- "), fixture::paragraph("tail", "- ")],
        )],
    );
    let (context, mut owner) = setup(3, vec![image, list], false)?;
    for id in ["caption", "head"] {
        select(&mut owner, id, 2)?;
        let before = saved(&context, &owner)?;
        assert_eq!(
            owner.apply_markdown_input_rule(&owner.snapshot(), " ", "rule")?,
            RichLocalOutcome::Unchanged
        );
        assert_eq!(saved(&context, &owner)?, before);
    }
    select(&mut owner, "tail", 2)?;
    assert_eq!(
        owner.apply_markdown_input_rule(&owner.snapshot(), " ", "tail")?,
        RichLocalOutcome::ContentCommitted
    );
    future(&context, &mut owner)?;
    Ok(())
}

#[test]
fn code_and_link_content_never_autoformats_and_code_conversion_cannot_silently_drop_suffix_formats()
-> Result {
    for kind in [StandardInlineFormatV1::Code, StandardInlineFormatV1::Link] {
        let properties = if kind == StandardInlineFormatV1::Link {
            json!({"breditor-inline/href":"https://example.test/","breditor-inline/new-window":false})
        } else {
            json!({})
        };
        let mut paragraph = fixture::paragraph("body", "**literal**");
        paragraph["children"][0]["formats"] =
            json!([{"type":kind.kind().as_str(),"properties":properties}]);
        let (context, mut owner) = setup(3, vec![paragraph], false)?;
        select(&mut owner, "body", 11)?;
        let before = saved(&context, &owner)?;
        assert_eq!(
            owner.apply_markdown_input_rule(&owner.snapshot(), "*", "rule")?,
            RichLocalOutcome::Unchanged
        );
        assert_eq!(saved(&context, &owner)?, before);
    }
    let (context, mut owner) = setup(3, vec![fixture::paragraph("body", "``` text")], false)?;
    select(&mut owner, "body", 4)?;
    let format = Format::new(StandardInlineFormatV1::Strong.kind(), PropertyMap::default());
    let change = RichAction::SetInlineFormat(SetInlineFormat::capture(
        owner.state().document(),
        &BlockId::try_new("body")?,
        TextOffset::try_new(4)?,
        TextOffset::try_new(8)?,
        &RichFormatChange::Set(format),
    )?);
    owner.dispatch_with_pending_formats(
        &owner.snapshot(),
        &[change],
        RichSelectionUpdate::Map,
        RichPendingFormatsUpdate::Set(Some(FormatSet::default())),
    )?;
    let before = saved(&context, &owner)?;
    assert!(owner.apply_markdown_input_rule(&owner.snapshot(), " ", "rule").is_err());
    assert_eq!(saved(&context, &owner)?, before);
    Ok(())
}

#[test]
fn a_window_floor_inside_a_surrogate_does_not_split_text_or_invent_an_opening_delimiter() -> Result
{
    let source = format!("🙂{} **猫🙂**", "z".repeat(4087));
    let (context, mut owner) = setup(3, vec![fixture::paragraph("body", &source)], false)?;
    select(&mut owner, "body", source.encode_utf16().count())?;
    owner.apply_markdown_input_rule(&owner.snapshot(), "*", "unused")?;
    assert_eq!(text(&owner, "body")?, format!("🙂{} 猫🙂", "z".repeat(4087)));
    future(&context, &mut owner)?;
    let source = format!("**{}**", "z".repeat(4096));
    let (_, mut owner) = setup(3, vec![fixture::paragraph("body", &source)], false)?;
    select(&mut owner, "body", source.len())?;
    assert_eq!(
        owner.apply_markdown_input_rule(&owner.snapshot(), "*", "unused")?,
        RichLocalOutcome::Unchanged
    );
    Ok(())
}

#[test]
fn merged_source_bodies_and_caption_rules_keep_other_partitions_and_exact_history() -> Result {
    let mut tree = fixture::root();
    tree["children"][2]["children"][0]["children"][0]["children"][0] =
        fixture::paragraph("p-0-0", "### ");
    tree["children"][2]["children"][2]["children"][1]["children"][1]["children"][0] =
        fixture::paragraph("caption", "**猫🙂**");
    let children = tree["children"].as_array().ok_or("missing flow")?.clone();
    let (context, mut owner) = setup(3, children, true)?;
    let original = owner.state().document().clone();
    select(&mut owner, "p-0-0", 4)?;
    owner.apply_markdown_input_rule(&owner.snapshot(), " ", "cell")?;
    assert_eq!(node(&owner, "p-0-0")?.kind().as_str(), "breditor/heading");
    assert_eq!(text(&owner, "p-1-1")?, "a🙂b");
    select(&mut owner, "caption", 7)?;
    owner.apply_markdown_input_rule(&owner.snapshot(), "*", "unused")?;
    assert_eq!(text(&owner, "caption")?, "猫🙂");
    owner.undo(&owner.snapshot())?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(owner.state().document().document(), original.document());
    owner.redo(&owner.snapshot())?;
    owner.redo(&owner.snapshot())?;
    future(&context, &mut owner)?;
    Ok(())
}
