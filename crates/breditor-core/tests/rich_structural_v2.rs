//! Explicit structural V2 admission, guarded local editing and exact future history.
#![cfg(feature = "experimental-rich-content")]

use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, CodeLanguage, RichBlockDraft, RichClipboardError,
        RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind, RichDocument,
        RichFlowParent, RichFlowPosition, RichInlineFormatState, RichLocalOutcome,
        RichLocalSession, RichLocalSessionError, RichSelection, RichSelectionKind,
        RichSelectionUpdate, RichTaskItemDraft, RichTaskListDraft, RichTextPoint,
        actions::{
            CodeFormatPolicy, DeleteHorizontalRule, InsertBlocks, InsertHorizontalRule,
            JoinTaskItems, JoinTextBlocks, ReplaceTextRange, RichAction, RichActionError,
            RichFormatChange, SetCodeBlock, SetCodeLanguage, SetInlineFormat, SetTaskChecked,
            SplitTaskItem, SplitTextBlock, UnwrapBlockquote, UnwrapTaskList, WrapBlockquote,
            WrapTaskList,
        },
        inspect_inline_format,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion, ValidationCode},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn task_split_and_join_retain_completion_tails_selection_and_exact_future_history() -> TestResult {
    let c = context(true)?;
    let mut task = node(
        "task-item",
        "task",
        vec![
            prose("head", "a🙂b", true),
            node("blockquote", "quote", vec![prose("tail", "tail", false)]),
        ],
    );
    task["properties"]["breditor/checked"] = json!(true);
    let document = admit(&c, root(vec![node("task-list", "tasks", vec![task])]))?;
    let original = value(&c, &document)?;
    let mut session = RichLocalSession::try_new(
        c.clone(),
        document,
        Some(caret("head", 3)?),
        HistoryCapacity::default(),
    )?;
    let split = SplitTaskItem::capture(
        session.state().document(),
        &RichTextPoint::new(id("head")?, TextOffset::try_new(1)?, Affinity::After),
        &id("fresh-task")?,
        &id("right")?,
        None,
    )?;
    dispatch(&mut session, RichAction::SplitTaskItem(split))?;
    let body = value(&c, session.state().document())?;
    let list = &body["root"]["children"][0]["children"];
    assert_eq!(list[0]["properties"]["breditor/checked"], true);
    assert_eq!(list[1]["properties"]["breditor/checked"], false);
    assert_eq!(list[1]["children"][0]["children"][0]["text"], "🙂b");
    assert_eq!(list[1]["children"][1]["properties"]["breditor/block-id"], "quote");
    let RichSelectionKind::TextRange { focus, .. } =
        session.state().selection().ok_or("selection")?.kind()
    else {
        return Err("text selection".into());
    };
    assert_eq!(focus.block().as_str(), "right");
    assert_eq!(focus.offset().get(), 2);
    let join = JoinTaskItems::capture(
        session.state().document(),
        &id("tasks")?,
        &id("task")?,
        &id("fresh-task")?,
    )?;
    dispatch(&mut session, RichAction::JoinTaskItems(join))?;
    let joined = value(&c, session.state().document())?;
    assert_eq!(joined, original);
    assert_eq!(
        joined["root"]["children"][0]["children"][0]["properties"]["breditor/checked"],
        true
    );
    assert_eq!(joined["root"]["children"][0]["children"].as_array().ok_or("items")?.len(), 1);
    future(&mut session)
}

#[test]
fn partial_cross_block_code_replacement_rejects_instead_of_guessing_language_or_style_loss()
-> TestResult {
    let c = context(true)?;
    let document = admit(
        &c,
        root(vec![
            prose("p", "A", false),
            node("code-block", "code", vec![json!({"kind":"text","text":"a🙂b","formats":[]})]),
        ]),
    )?;
    for reverse in [false, true] {
        let a = RichTextPoint::new(id("p")?, TextOffset::ZERO, Affinity::After);
        let f = RichTextPoint::new(id("code")?, TextOffset::try_new(1)?, Affinity::After);
        let (anchor, focus) = if reverse { (f, a) } else { (a, f) };
        let selection =
            RichSelection::try_new(&document, RichSelectionKind::TextRange { anchor, focus })?;
        assert!(matches!(
            ReplaceTextRange::capture(&document, &selection, &TextFragment::empty()),
            Err(RichActionError::FlowRange)
        ));
    }
    Ok(())
}

#[test]
fn code_format_controls_are_unavailable_for_carets_ranges_and_cross_code_intervals() -> TestResult {
    let c = context(true)?;
    let code = node("code-block", "code", vec![json!({"kind":"text","text":"a🙂b","formats":[]})]);
    let document =
        admit(&c, root(vec![prose("before", "A", true), code, prose("after", "B", true)]))?;
    let kind = QualifiedName::try_new("breditor/strong")?;
    let point = |block: &str, offset: u64| -> Result<_, Box<dyn std::error::Error>> {
        Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
    };
    for selection in [
        caret("code", 0)?,
        caret("code", 4)?,
        RichSelectionKind::TextRange { anchor: point("code", 3)?, focus: point("code", 1)? },
        RichSelectionKind::TextRange { anchor: point("after", 1)?, focus: point("before", 0)? },
    ] {
        let selection = RichSelection::try_new(&document, selection)?;
        assert_eq!(
            inspect_inline_format(&c, &document, Some(&selection), None, &kind)?,
            RichInlineFormatState::Unavailable
        );
    }
    let selection = RichSelection::try_new(&document, caret("before", 0)?)?;
    assert!(matches!(
        inspect_inline_format(&c, &document, Some(&selection), None, &kind)?,
        RichInlineFormatState::Uniform(_)
    ));
    Ok(())
}
fn id(value: &str) -> Result<BlockId, Box<dyn std::error::Error>> {
    Ok(BlockId::try_new(value)?)
}
fn context(v2: bool) -> Result<EditorContext, Box<dyn std::error::Error>> {
    let selector =
        SchemaId::new(QualifiedName::try_new("example/structural")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = if v2 {
        CompiledSchema::try_compile_rich_content_profile_v2(selector, &extensions)?
    } else {
        CompiledSchema::try_compile_rich_content_profile(selector, &extensions)?
    };
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn text(value: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    Ok(if value.is_empty() {
        TextFragment::empty()
    } else {
        TextRun::try_new(value, FormatSet::default())?.into()
    })
}
fn node(kind: &str, block: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":block}});
    value["children"] = Value::Array(children);
    value
}
fn prose(block: &str, content: &str, strong: bool) -> Value {
    node(
        "paragraph",
        block,
        if content.is_empty() {
            vec![]
        } else {
            vec![
                json!({"kind":"text","text":content,"formats":if strong {json!([{"type":"breditor/strong","properties":{}}])} else {json!([])}}),
            ]
        },
    )
}
fn root(children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"}});
    value["children"] = Value::Array(children);
    value
}
fn envelope(context: &EditorContext, root: Value) -> Value {
    let mut value = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":context.schema().id().name().as_str(),"version":1},"schemaFingerprint":context.schema().fingerprint().to_string()});
    value["root"] = root;
    value
}
fn admit(context: &EditorContext, root: Value) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&envelope(context, root).to_string())?;
    Ok(RichDocument::try_admit(context.schema(), document, context.limits())?)
}
fn original(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let mut source: Value = serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?;
    source["children"]
        .as_array_mut()
        .ok_or("children")?
        .insert(0, prose("head", "A🙂\r\n\tB", true));
    source["children"].as_array_mut().ok_or("children")?.insert(1, prose("next", "Next", false));
    admit(context, source)
}
fn bytes(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(context.schema().clone()).encode(document.document())?)
}
fn find<'a>(value: &'a Value, block: &str) -> Option<&'a Value> {
    if value["properties"]["breditor/block-id"] == block {
        return Some(value);
    }
    value.get("children")?.as_array()?.iter().find_map(|child| find(child, block))
}
fn value(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(&bytes(context, document)?)?)
}
fn caret(block: &str, offset: u64) -> Result<RichSelectionKind, Box<dyn std::error::Error>> {
    let point = RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn owner(
    context: &EditorContext,
    document: RichDocument,
) -> Result<RichLocalSession, Box<dyn std::error::Error>> {
    Ok(RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::default())?)
}
fn dispatch(
    owner: &mut RichLocalSession,
    action: RichAction,
) -> Result<RichLocalOutcome, Box<dyn std::error::Error>> {
    Ok(owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?)
}
fn inverse(context: &EditorContext, before: &RichDocument, action: &RichAction) -> TestResult {
    let edit = action.apply(context, before)?.ok_or("edit")?;
    let undo = edit.inverse().apply(context, edit.document())?.ok_or("inverse")?;
    assert_eq!(bytes(context, undo.document())?, bytes(context, before)?);
    let redo = undo.inverse().apply(context, undo.document())?.ok_or("redo")?;
    assert_eq!(bytes(context, redo.document())?, bytes(context, edit.document())?);
    Ok(())
}
fn future(owner: &mut RichLocalSession) -> TestResult {
    let codec = RichSessionJsonCodec::new(owner.context().clone());
    let checkpoint = codec.encode(owner)?;
    let mut recovered = codec.decode(&checkpoint)?;
    assert_eq!(codec.encode(&recovered)?, checkpoint);
    let undos = owner.undo_depth();
    for _ in 0..undos {
        owner.undo(&owner.snapshot())?;
        recovered.undo(&recovered.snapshot())?;
        assert_eq!(codec.encode(owner)?, codec.encode(&recovered)?);
    }
    for _ in 0..undos {
        owner.redo(&owner.snapshot())?;
        recovered.redo(&recovered.snapshot())?;
        assert_eq!(codec.encode(owner)?, codec.encode(&recovered)?);
    }
    Ok(())
}

#[test]
fn v2_is_explicit_and_v1_selector_fingerprints_and_capabilities_are_not_reinterpreted() -> TestResult
{
    let a = context(false)?;
    let b = context(true)?;
    assert_eq!(a.schema().id(), b.schema().id());
    assert_ne!(a.schema().fingerprint(), b.schema().fingerprint());
    assert_eq!(a.schema().rich_content_revision(), Some(1));
    assert_eq!(b.schema().rich_content_revision(), Some(2));
    let old = original(&a)?;
    assert!(RichDocument::try_admit(b.schema(), old.into_document(), b.limits()).is_err());
    for kind in ["blockquote", "code-block", "horizontal-rule", "task-list", "task-item"] {
        assert!(admit(&a, root(vec![node(kind, "new", vec![])])).is_err(), "V1 admitted {kind}");
    }
    Ok(())
}

#[test]
fn language_tokens_are_bounded_inert_and_case_preserving() -> TestResult {
    for token in ["Rust", "c++", "c#", "Objective-C", "plain_text", "a.b"] {
        assert_eq!(CodeLanguage::try_new(token)?.as_str(), token);
    }
    assert!(CodeLanguage::try_new("a".repeat(64)).is_ok());
    for token in ["", " rust", "rust ", "-rust", "a/b", "a\nb", "<script>", "日本", "a\0b"] {
        assert!(CodeLanguage::try_new(token).is_err());
    }
    assert!(CodeLanguage::try_new("a".repeat(65)).is_err());
    Ok(())
}

#[test]
fn typed_structural_drafts_admit_together_with_code_carets_and_new_node_selections() -> TestResult {
    let c = context(true)?;
    let before = original(&c)?;
    let tasks: RichBlockDraft = RichTaskListDraft::try_new(
        &id("tasks")?,
        vec![RichTaskItemDraft::try_new(
            &id("task")?,
            true,
            RichBlockDraft::paragraph(&id("task-head")?, &text("Done 🙂")?)?,
            vec![],
        )?],
    )?
    .into();
    let blocks = vec![
        RichBlockDraft::blockquote(
            &id("quote")?,
            vec![RichBlockDraft::paragraph(&id("quote-head")?, &text("Quote")?)?],
        )?,
        RichBlockDraft::code_block(
            &id("code")?,
            Some(&CodeLanguage::try_new("Rust")?),
            &text("a🙂\n\t\r\nb")?,
        )?,
        RichBlockDraft::horizontal_rule(&id("rule")?)?,
        tasks,
    ];
    let action = RichAction::InsertBlocks(InsertBlocks::capture(
        &before,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        blocks,
    )?);
    inverse(&c, &before, &action)?;
    let after = action.apply(&c, &before)?.ok_or("insert")?;
    for block in ["quote", "code", "rule", "tasks"] {
        RichSelection::try_new(after.document(), RichSelectionKind::Node(id(block)?))?;
    }
    RichSelection::try_new(after.document(), caret("code", 3)?)?;
    assert!(RichSelection::try_new(after.document(), caret("code", 2)?).is_err());
    assert_eq!(
        find(&value(&c, after.document())?["root"], "task").ok_or("task")?["properties"]["breditor/checked"],
        true
    );
    Ok(())
}

#[test]
fn raw_v2_structural_values_do_not_bypass_closed_semantic_rules() -> TestResult {
    let c = context(true)?;
    let mut task = node("task-item", "task", vec![prose("p", "task", false)]);
    task["properties"]["breditor/checked"] = json!(true);
    admit(&c, root(vec![node("task-list", "tasks", vec![task.clone()])]))?;
    let mut invalid = vec![
        node("blockquote", "q", vec![]),
        node("horizontal-rule", "hr", vec![json!({"kind":"text","text":"bad","formats":[]})]),
        node("task-list", "tasks", vec![prose("p", "not item", false)]),
    ];
    for checked in [Value::Null, json!(0), json!("true")] {
        let mut changed = task.clone();
        changed["properties"]["breditor/checked"] = checked;
        invalid.push(node("task-list", "tasks", vec![changed]));
    }
    let mut bad_head = task.clone();
    bad_head["children"] = json!([node("code-block", "code", vec![])]);
    invalid.push(node("task-list", "tasks", vec![bad_head]));
    for bad in invalid {
        assert!(admit(&c, root(vec![bad])).is_err());
    }
    let mut ordinary = node("list-item", "ordinary", vec![prose("p", "text", false)]);
    ordinary["properties"]["breditor/checked"] = json!(false);
    assert!(admit(&c, root(vec![node("bullet-list", "list", vec![ordinary])])).is_err());
    Ok(())
}

#[test]
fn code_conversion_requires_explicit_style_loss_and_exact_undo_restores_formatted_unicode()
-> TestResult {
    let c = context(true)?;
    let before = original(&c)?;
    let lang = CodeLanguage::try_new("Rust")?;
    assert!(
        SetCodeBlock::capture(
            &before,
            &id("head")?,
            Some(&lang),
            CodeFormatPolicy::RejectFormatted
        )
        .is_err()
    );
    let action = RichAction::SetCodeBlock(SetCodeBlock::capture(
        &before,
        &id("head")?,
        Some(&lang),
        CodeFormatPolicy::RemoveFormats,
    )?);
    inverse(&c, &before, &action)?;
    let mut session = owner(&c, before)?;
    session.set_selection(&session.snapshot(), Some(caret("head", 3)?))?;
    dispatch(&mut session, action)?;
    let body = value(&c, session.state().document())?;
    let code = find(&body["root"], "head").ok_or("code")?;
    assert_eq!(code["type"], "breditor/code-block");
    assert_eq!(code["children"][0]["text"], "A🙂\r\n\tB");
    assert_eq!(code["children"][0]["formats"], json!([]));
    assert_eq!(session.undo_depth(), 1);
    session.insert_plain_text(&session.snapshot(), "\n\tX")?;
    assert_eq!(session.undo_depth(), 2);
    future(&mut session)
}

#[test]
fn code_rejects_raw_inline_marks_and_pending_styles_without_any_publication() -> TestResult {
    let c = context(true)?;
    let before = admit(
        &c,
        root(vec![node(
            "code-block",
            "code",
            vec![json!({"kind":"text","text":"a🙂","formats":[]})],
        )]),
    )?;
    let mut invalid = node(
        "code-block",
        "code",
        vec![
            json!({"kind":"text","text":"x","formats":[{"type":"breditor/strong","properties":{}}]}),
        ],
    );
    assert!(admit(&c, root(vec![invalid.clone()])).is_err());
    invalid["children"] = json!([]);
    invalid["properties"]["breditor/language"] = json!("x onclick=bad");
    assert!(admit(&c, root(vec![invalid])).is_err());
    let strong = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?;
    assert!(
        RichBlockDraft::code_block(
            &id("new-code")?,
            None,
            &TextRun::try_new("styled", strong.clone())?.into()
        )
        .is_err()
    );
    let mut session = owner(&c, before)?;
    session.set_selection(&session.snapshot(), Some(caret("code", 1)?))?;
    let codec = RichSessionJsonCodec::new(c.clone());
    let checkpoint = codec.encode(&session)?;
    assert!(matches!(
        session.set_pending_formats(&session.snapshot(), Some(strong)),
        Err(RichLocalSessionError::CodeFormats)
    ));
    assert_eq!(codec.encode(&session)?, checkpoint);
    let action = RichAction::SetInlineFormat(SetInlineFormat::capture(
        session.state().document(),
        &id("code")?,
        TextOffset::ZERO,
        TextOffset::try_new(1)?,
        &RichFormatChange::Set(Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        )),
    )?);
    assert!(session.dispatch(&session.snapshot(), &[action], RichSelectionUpdate::Map).is_err());
    assert_eq!(codec.encode(&session)?, checkpoint);
    Ok(())
}

#[test]
fn code_language_noops_preserve_exact_owner_and_removal_has_exact_future_history() -> TestResult {
    let c = context(true)?;
    let mut source = node("code-block", "code", vec![]);
    source["properties"]["breditor/language"] = json!("Rust");
    let mut session = owner(&c, admit(&c, root(vec![source]))?)?;
    let codec = RichSessionJsonCodec::new(c.clone());
    let checkpoint = codec.encode(&session)?;
    let noop = RichAction::SetCodeLanguage(SetCodeLanguage::capture(
        session.state().document(),
        &id("code")?,
        Some(&CodeLanguage::try_new("Rust")?),
    )?);
    assert_eq!(dispatch(&mut session, noop)?, RichLocalOutcome::Unchanged);
    assert_eq!(codec.encode(&session)?, checkpoint);
    let change = RichAction::SetCodeLanguage(SetCodeLanguage::capture(
        session.state().document(),
        &id("code")?,
        None,
    )?);
    dispatch(&mut session, change)?;
    future(&mut session)
}

#[test]
fn quote_wrap_unwrap_and_nested_parent_insertion_preserve_complete_rich_subtrees() -> TestResult {
    let c = context(true)?;
    let before = original(&c)?;
    let action = RichAction::WrapBlockquote(WrapBlockquote::capture(
        &before,
        &id("head")?,
        &id("table-block")?,
        &id("quote")?,
    )?);
    inverse(&c, &before, &action)?;
    let mut session = owner(&c, before)?;
    session.set_selection(&session.snapshot(), Some(caret("p", 3)?))?;
    dispatch(&mut session, action)?;
    assert!(session.state().selection().is_some());
    let insert = RichAction::InsertBlocks(InsertBlocks::capture(
        session.state().document(),
        &RichFlowPosition::new(RichFlowParent::Blockquote(id("quote")?), Some(id("table-block")?)),
        vec![RichBlockDraft::horizontal_rule(&id("rule")?)?],
    )?);
    dispatch(&mut session, insert)?;
    let unwrap = RichAction::UnwrapBlockquote(UnwrapBlockquote::capture(
        session.state().document(),
        &id("quote")?,
    )?);
    dispatch(&mut session, unwrap)?;
    assert!(session.state().document().block_path(&id("p")?).is_some());
    future(&mut session)
}

#[test]
fn nested_tables_cannot_hide_inside_quotes_or_task_tails_and_limits_still_bound_new_containers()
-> TestResult {
    let c = context(true)?;
    let before = original(&c)?;
    // Fresh independent identities ensure NestedTable, not duplicate IDs, proves the failure.
    let mut inner = node(
        "table",
        "inner-table",
        vec![node(
            "table-row",
            "inner-row",
            vec![node("table-cell", "inner-cell", vec![prose("inner-p", "inside", false)])],
        )],
    );
    inner["properties"] = json!({"breditor/block-id":"inner-table","breditor/table-id":"inner-t","breditor/columns":[{"id":"inner-c","width":120}],"breditor/merges":[],"breditor/retracted-merges":[]});
    inner["children"][0]["properties"]["breditor/row-id"] = json!("inner-r");
    inner["children"][0]["children"][0]["properties"]["breditor/column-id"] = json!("inner-c");
    inner["children"][0]["children"][0]["properties"]["breditor/header"] = json!(false);
    let independent = admit(&c, root(vec![inner]))?;
    let table = RichBlockDraft::capture(&independent, &id("inner-table")?)?;
    let nested = RichBlockDraft::blockquote(&id("tunnel")?, vec![table.clone()])?;
    let cell = before.cell_entries().next().ok_or("cell")?.0.clone();
    let insert = RichAction::InsertBlocks(InsertBlocks::capture(
        &before,
        &RichFlowPosition::new(RichFlowParent::Cell(cell.clone()), None),
        vec![nested],
    )?);
    assert!(
        matches!(insert.apply(&c, &before), Err(RichActionError::Validation(report)) if report.contains(ValidationCode::NestedTable))
    );
    let tasks: RichBlockDraft = RichTaskListDraft::try_new(
        &id("nested-tasks")?,
        vec![RichTaskItemDraft::try_new(
            &id("nested-task")?,
            false,
            RichBlockDraft::paragraph(&id("nested-head")?, &text("Task")?)?,
            vec![table],
        )?],
    )?
    .into();
    let insert = RichAction::InsertBlocks(InsertBlocks::capture(
        &before,
        &RichFlowPosition::new(RichFlowParent::Cell(cell), None),
        vec![tasks],
    )?);
    assert!(
        matches!(insert.apply(&c, &before), Err(RichActionError::Validation(report)) if report.contains(ValidationCode::NestedTable))
    );
    let shallow = admit(&c, root(vec![prose("p", "x", false)]))?;
    let wrap = RichAction::WrapBlockquote(WrapBlockquote::capture(
        &shallow,
        &id("p")?,
        &id("p")?,
        &id("q")?,
    )?);
    let tight = EditorContext::new(c.schema().clone(), DocumentLimits::default().with_max_nodes(3));
    RichDocument::try_admit(tight.schema(), shallow.clone().into_document(), tight.limits())?;
    assert!(wrap.apply(&tight, &shallow).is_err());
    let tiny =
        EditorContext::new(c.schema().clone(), DocumentLimits::default().with_max_node_depth(2));
    RichDocument::try_admit(tiny.schema(), shallow.clone().into_document(), tiny.limits())?;
    assert!(wrap.apply(&tiny, &shallow).is_err());
    Ok(())
}

#[test]
fn task_state_noop_retains_exact_checkpoint_and_all_six_heading_heads_are_admitted() -> TestResult {
    let c = context(true)?;
    for rank in 1..=6 {
        let mut head = prose("p", "Heading", false);
        head["type"] = json!("breditor/heading");
        head["properties"]["breditor/level"] = json!(rank);
        let mut task = node("task-item", "item", vec![head]);
        task["properties"]["breditor/checked"] = json!(false);
        let mut session =
            owner(&c, admit(&c, root(vec![node("task-list", "tasks", vec![task])]))?)?;
        let codec = RichSessionJsonCodec::new(c.clone());
        let before = codec.encode(&session)?;
        let noop = RichAction::SetTaskChecked(SetTaskChecked::capture(
            session.state().document(),
            &id("item")?,
            false,
        )?);
        assert_eq!(dispatch(&mut session, noop)?, RichLocalOutcome::Unchanged);
        assert_eq!(codec.encode(&session)?, before);
    }
    Ok(())
}

#[test]
fn explicit_hard_break_is_one_lf_one_history_group_and_exact_directional_replay() -> TestResult {
    for v2 in [false, true] {
        let c = context(v2)?;
        let mut session = owner(&c, admit(&c, root(vec![prose("p", "a🙂b", true)]))?)?;
        let point = |offset| {
            Ok::<_, Box<dyn std::error::Error>>(RichTextPoint::new(
                id("p")?,
                TextOffset::try_new(offset)?,
                Affinity::After,
            ))
        };
        session.set_selection(
            &session.snapshot(),
            Some(RichSelectionKind::TextRange { anchor: point(3)?, focus: point(1)? }),
        )?;
        session.insert_hard_break(&session.snapshot())?;
        assert_eq!(session.undo_depth(), 1);
        let body = value(&c, session.state().document())?;
        assert_eq!(find(&body["root"], "p").ok_or("p")?["children"][0]["text"], "a\nb");
        assert!(!session.state().effective_caret_formats()?.is_empty());
        future(&mut session)?;
    }
    let c = context(true)?;
    let mut session = owner(
        &c,
        admit(
            &c,
            root(vec![node(
                "code-block",
                "code",
                vec![json!({"kind":"text","text":"a\r\n\tb","formats":[]})],
            )]),
        )?,
    )?;
    session.set_selection(&session.snapshot(), Some(caret("code", 1)?))?;
    session.insert_hard_break(&session.snapshot())?;
    assert!(session.state().effective_caret_formats()?.is_empty());
    let body = value(&c, session.state().document())?;
    assert_eq!(find(&body["root"], "code").ok_or("code")?["children"][0]["text"], "a\n\r\n\tb");
    future(&mut session)
}

#[test]
fn task_wrap_check_unwrap_and_nested_body_edits_are_exact_one_group_actions() -> TestResult {
    let c = context(true)?;
    let before = original(&c)?;
    let wrap = RichAction::WrapTaskList(WrapTaskList::capture(
        &before,
        &id("head")?,
        &id("table-block")?,
        &id("tasks")?,
        &[(id("first-task")?, false), (id("second-task")?, true)],
    )?);
    inverse(&c, &before, &wrap)?;
    let mut session = owner(&c, before)?;
    dispatch(&mut session, wrap)?;
    let checked = RichAction::SetTaskChecked(SetTaskChecked::capture(
        session.state().document(),
        &id("first-task")?,
        true,
    )?);
    dispatch(&mut session, checked)?;
    let insert = RichAction::InsertBlocks(InsertBlocks::capture(
        session.state().document(),
        &RichFlowPosition::new(RichFlowParent::TaskItem(id("first-task")?), None),
        vec![RichBlockDraft::horizontal_rule(&id("task-rule")?)?],
    )?);
    dispatch(&mut session, insert)?;
    let body = value(&c, session.state().document())?;
    assert_eq!(
        find(&body["root"], "first-task").ok_or("task")?["properties"]["breditor/checked"],
        true
    );
    assert!(find(&body["root"], "table-block").is_some());
    let unwrap = RichAction::UnwrapTaskList(UnwrapTaskList::capture(
        session.state().document(),
        &id("tasks")?,
    )?);
    dispatch(&mut session, unwrap)?;
    assert_eq!(session.undo_depth(), 4);
    future(&mut session)
}

#[test]
fn stale_task_edits_and_late_duplicate_rule_failure_leave_no_partial_group() -> TestResult {
    let c = context(true)?;
    let before = admit(&c, root(vec![prose("p", "body", false)]))?;
    let mut session = owner(&c, before)?;
    let wrap = RichAction::WrapTaskList(WrapTaskList::capture(
        session.state().document(),
        &id("p")?,
        &id("p")?,
        &id("tasks")?,
        &[(id("item")?, false)],
    )?);
    dispatch(&mut session, wrap)?;
    let stale = RichAction::SetTaskChecked(SetTaskChecked::capture(
        session.state().document(),
        &id("item")?,
        true,
    )?);
    let change = RichAction::InsertHorizontalRule(InsertHorizontalRule::capture(
        session.state().document(),
        &RichFlowPosition::new(RichFlowParent::TaskItem(id("item")?), None),
        &id("rule")?,
    )?);
    dispatch(&mut session, change)?;
    assert!(matches!(
        stale.apply(&c, session.state().document()),
        Err(RichActionError::StaleTarget)
    ));
    let codec = RichSessionJsonCodec::new(c.clone());
    let checkpoint = codec.encode(&session)?;
    let good = RichAction::SetTaskChecked(SetTaskChecked::capture(
        session.state().document(),
        &id("item")?,
        true,
    )?);
    let duplicate = RichAction::InsertHorizontalRule(InsertHorizontalRule::capture(
        session.state().document(),
        &RichFlowPosition::new(RichFlowParent::Document, None),
        &id("p")?,
    )?);
    assert!(
        session
            .dispatch(&session.snapshot(), &[good, duplicate], RichSelectionUpdate::Map)
            .is_err()
    );
    assert_eq!(codec.encode(&session)?, checkpoint);
    Ok(())
}

#[test]
fn sole_rule_deletion_requires_explicit_reachable_text_and_retains_exact_restore() -> TestResult {
    let c = context(true)?;
    let before = admit(&c, root(vec![node("horizontal-rule", "rule", vec![])]))?;
    assert!(matches!(
        DeleteHorizontalRule::capture(&before, &id("rule")?, None),
        Err(RichActionError::FlowWouldBeEmpty)
    ));
    let action = RichAction::DeleteHorizontalRule(DeleteHorizontalRule::capture(
        &before,
        &id("rule")?,
        Some(RichBlockDraft::paragraph(&id("replacement")?, &TextFragment::empty())?),
    )?);
    inverse(&c, &before, &action)?;
    let mut session = owner(&c, before)?;
    session.dispatch(
        &session.snapshot(),
        &[action],
        RichSelectionUpdate::Set(Some(caret("replacement", 0)?)),
    )?;
    session.insert_plain_text(&session.snapshot(), "Reachable")?;
    future(&mut session)
}

#[test]
fn generic_prose_split_and_join_do_not_guess_code_language_or_block_exit_policy() -> TestResult {
    let c = context(true)?;
    let source =
        admit(&c, root(vec![node("code-block", "code", vec![]), prose("p", "text", false)]))?;
    assert!(
        SplitTextBlock::capture(
            &source,
            &RichTextPoint::new(id("code")?, TextOffset::ZERO, Affinity::After),
            &id("right")?,
            None
        )
        .is_err()
    );
    assert!(JoinTextBlocks::capture(&source, &id("code")?, &id("p")?).is_err());
    assert!(JoinTextBlocks::capture(&source, &id("p")?, &id("code")?).is_err());
    Ok(())
}

struct Allocator(u64);
impl RichClipboardIdAllocator for Allocator {
    fn next(&mut self, _kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("copied-{}", self.0))
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        Err(RichClipboardError::Allocation)
    }
}
#[test]
fn structural_clipboard_rekeys_every_identity_and_preserves_code_checked_state_and_history()
-> TestResult {
    let c = context(true)?;
    let mut task = node("task-item", "task", vec![prose("task-head", "Task", false)]);
    task["properties"]["breditor/checked"] = json!(true);
    let mut code =
        node("code-block", "code", vec![json!({"kind":"text","text":"a\n\tb","formats":[]})]);
    code["properties"]["breditor/language"] = json!("Rust");
    let source = admit(
        &c,
        root(vec![node(
            "blockquote",
            "quote",
            vec![
                code,
                node("horizontal-rule", "rule", vec![]),
                node("task-list", "tasks", vec![task]),
            ],
        )]),
    )?;
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        &source,
        &RichSelection::try_new(&source, RichSelectionKind::Node(id("quote")?))?,
    )?
    .ok_or("clipboard")?;
    assert_eq!(fragment.plain_text()?, "a\n\tb\n\nTask");
    let drafts = fragment.flow_drafts(&c, &mut Allocator(0))?;
    let action = RichAction::InsertBlocks(InsertBlocks::capture(
        &source,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        drafts,
    )?);
    let mut session = owner(&c, source)?;
    dispatch(&mut session, action)?;
    let body = value(&c, session.state().document())?;
    assert_eq!(body["root"]["children"].as_array().ok_or("roots")?.len(), 2);
    assert_eq!(
        body["root"]["children"][1]["children"][0]["properties"]["breditor/language"],
        "Rust"
    );
    assert_eq!(
        body["root"]["children"][1]["children"][2]["children"][0]["properties"]["breditor/checked"],
        true
    );
    future(&mut session)
}
