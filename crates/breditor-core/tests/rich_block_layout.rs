//! Explicit V3 layout admission, native selection ownership and exact retained metadata.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        RichTypingSessionJsonCodec,
    },
    document::{Format, FormatSet, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, CellId, ChangeId, ColumnId, ReplicaId, RichBlockAlignment as Align,
        RichBlockDirection as Direction, RichBlockIndent as Indent, RichBlockLayout as Layout,
        RichBlockLayoutError, RichBlockLayoutPatch as Patch, RichClipboardError,
        RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind, RichDocument,
        RichFlowParent, RichFlowPosition, RichLayoutChange as Change,
        RichLayoutFieldState as Field, RichLineHeight as Height, RichLocalOutcome,
        RichLocalSession, RichSelection, RichSelectionCoverage, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RowId, TableId,
        actions::{
            CodeFormatPolicy, InsertBlocks, JoinTextBlocks, RichAction, SetBlockLayout,
            SetCodeBlock, SetHeading, SplitListItem, SplitTaskItem, SplitTextBlock,
        },
        inspect_block_layout, standard_inline_extension_v1,
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
fn point(s: &str, n: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(s)?, TextOffset::try_new(n)?, Affinity::After))
}
fn range(a: &str, x: u64, b: &str, y: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(a, x)?, focus: point(b, y)? })
}
fn schema(revision: u32) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn admit(c: &EditorContext, root: Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    input["root"] = root;
    let input = input.to_string();
    Ok(RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input)?,
        c.limits(),
    )?)
}
fn setup() -> Result<(EditorContext, RichDocument)> {
    let c = EditorContext::new(schema(3)?, DocumentLimits::default());
    let d = admit(&c, fixture::root())?;
    Ok((c, d))
}
fn owner(c: &EditorContext, d: RichDocument, s: RichSelectionKind) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(c.clone(), d, Some(s), HistoryCapacity::default())?)
}
fn saved(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn align(value: Align) -> Result<Patch> {
    Ok(Patch::try_new(Change::Set(value), Change::Keep, Change::Keep, Change::Keep)?)
}
fn complete() -> Result<Patch> {
    Ok(Patch::try_new(
        Change::Set(Align::End),
        Change::Set(Direction::RightToLeft),
        Change::Set(Indent::try_new(3)?),
        Change::Set(Height::try_new(150)?),
    )?)
}
fn node_mut<'a>(n: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    if n["properties"]["breditor/block-id"] == id {
        return Some(n);
    }
    n.get_mut("children")?.as_array_mut()?.iter_mut().find_map(|n| node_mut(n, id))
}
fn mini(children: Vec<Value>) -> Value {
    let mut n = fixture::element("document", "unused", children);
    n["properties"] = json!({"breditor/document-id":"room"});
    n
}
#[test]
fn v3_is_explicit_old_binary_fingerprints_stay_exact_and_old_profiles_refuse_layout() -> Result {
    let a = schema(1)?;
    let b = schema(2)?;
    let c = schema(3)?;
    assert_eq!(
        a.fingerprint().to_string(),
        "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"
    );
    assert_eq!(
        b.fingerprint().to_string(),
        "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"
    );
    assert_eq!(c.rich_content_revision(), Some(3));
    assert_ne!(c.fingerprint(), b.fingerprint());
    for revision in [1, 2] {
        let context = EditorContext::new(schema(revision)?, DocumentLimits::default());
        let root = mini(vec![fixture::paragraph("p", "Text")]);
        let d = admit(&context, root.clone())?;
        let mut a = owner(&context, d, range("p", 0, "p", 0)?)?;
        let before = saved(&context, &a)?;
        assert!(a.change_selection_layout(&a.snapshot(), &align(Align::Center)?).is_err());
        assert_eq!(saved(&context, &a)?, before);
        let action = SetBlockLayout::capture(
            a.state().document(),
            &id("p")?,
            &Patch::try_new(Change::Clear, Change::Keep, Change::Keep, Change::Keep)?,
        )?;
        assert!(action.apply(&context, a.state().document()).is_err());
        let mut raw = root;
        node_mut(&mut raw, "p").ok_or("p")?["properties"]["breditor/block-align"] = json!(2);
        assert!(admit(&context, raw).is_err());
    }
    Ok(())
}
#[test]
fn native_closed_value_bounds_and_keep_set_clear_have_no_implicit_defaults() -> Result {
    assert_eq!(Indent::try_new(0)?.get(), 0);
    assert_eq!(Indent::try_new(12)?.get(), 12);
    assert!(Indent::try_new(13).is_err());
    assert_eq!(Height::try_new(100)?.get(), 100);
    assert_eq!(Height::try_new(300)?.get(), 300);
    assert!(Height::try_new(99).is_err());
    assert!(Height::try_new(301).is_err());
    assert_eq!(
        Patch::try_new(Change::Keep, Change::Keep, Change::Keep, Change::Keep),
        Err(RichBlockLayoutError::EmptyPatch)
    );
    let old = complete()?.apply_to(Layout::default());
    let p = Patch::try_new(
        Change::Clear,
        Change::Keep,
        Change::Set(Indent::try_new(0)?),
        Change::Keep,
    )?;
    let new = p.apply_to(old);
    assert_eq!(new.alignment(), None);
    assert_eq!(new.direction(), old.direction());
    assert_eq!(new.indent(), Some(Indent::try_new(0)?));
    assert_eq!(new.line_height(), old.line_height());
    Ok(())
}
#[test]
fn complete_admission_rejects_wrong_types_ranges_unknown_keys_and_nontext_owners() -> Result {
    let (c, _) = setup()?;
    for (key, valid, invalid) in [
        ("block-align", vec![1, 2, 3, 4, 5, 6], vec![json!(0), json!(7)]),
        ("block-direction", vec![1, 2, 3], vec![json!(0), json!(4)]),
        ("block-indent", vec![0, 12], vec![json!(-1), json!(13)]),
        ("line-height-percent", vec![100, 300], vec![json!(99), json!(301)]),
    ] {
        for value in valid {
            let mut raw = fixture::root();
            node_mut(&mut raw, "code").ok_or("code")?["properties"][format!("breditor/{key}")] =
                json!(value);
            admit(&c, raw)?;
        }
        for value in invalid.into_iter().chain([
            Value::Null,
            json!(true),
            json!("2"),
            json!(1.5),
            json!({}),
            json!([]),
        ]) {
            let mut raw = fixture::root();
            node_mut(&mut raw, "z-intro").ok_or("intro")?["properties"]
                [format!("breditor/{key}")] = value;
            assert!(admit(&c, raw).is_err());
        }
        for wrong in
            ["table", "cell-0-0", "image", "quote", "list", "item", "tasks", "task", "lead"]
        {
            let mut raw = fixture::root();
            node_mut(&mut raw, wrong).ok_or("node")?["properties"][format!("breditor/{key}")] =
                json!(2);
            assert!(admit(&c, raw).is_err());
        }
    }
    let mut raw = fixture::root();
    node_mut(&mut raw, "z-intro").ok_or("intro")?["properties"]["breditor/arbitrary-css"] =
        json!("red");
    assert!(admit(&c, raw).is_err());
    Ok(())
}
#[test]
fn selection_native_layout_covers_code_empty_boundaries_nodes_and_merged_source_bodies() -> Result {
    let cell = CellId::new(TableId::try_new("t")?, RowId::try_new("r1")?, ColumnId::try_new("c1")?);
    for s in [
        range("task-head", 1, "code", 0)?,
        range("code", 0, "task-head", 1)?,
        RichSelectionKind::Node(id("image")?),
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    ] {
        let (c, d) = setup()?;
        let source = d.document().clone();
        let proof = RichSelection::try_new(&d, s.clone())?;
        let cover = RichSelectionCoverage::capture(&d, &proof)?;
        let targets = cover.text().iter().map(|s| s.block().clone()).collect::<Vec<_>>();
        let mut a = owner(&c, d, s.clone())?;
        assert_eq!(
            a.change_selection_layout(&a.snapshot(), &complete()?)?,
            RichLocalOutcome::ContentCommitted
        );
        assert_eq!(a.undo_depth(), 1);
        assert_eq!(a.state().selection().ok_or("selection")?.kind(), &s);
        let read = inspect_block_layout(&c, a.state().document(), a.state().selection())?;
        assert_eq!(read.blocks, u64::try_from(targets.len())?);
        assert_eq!(read.alignment, Field::Uniform(Some(Align::End)));
        for span in RichSelectionCoverage::document(a.state().document())?.text() {
            let value = Layout::read(&c, a.state().document(), span.block())?;
            assert_eq!(
                value,
                if targets.contains(span.block()) {
                    complete()?.apply_to(Layout::default())
                } else {
                    Layout::default()
                }
            );
        }
        a.undo(&a.snapshot())?;
        assert_eq!(a.state().document().document(), &source);
    }
    Ok(())
}
#[test]
fn mixed_read_tracks_independent_values_and_reset_restores_inheritance_exactly() -> Result {
    let (c, d) = setup()?;
    let mut a = owner(&c, d, RichSelectionKind::Node(id("quote")?))?;
    a.change_selection_layout(&a.snapshot(), &complete()?)?;
    a.set_selection(&a.snapshot(), Some(range("q2", 0, "q2", 0)?))?;
    a.change_selection_layout(&a.snapshot(), &align(Align::Center)?)?;
    a.set_selection(&a.snapshot(), Some(RichSelectionKind::Node(id("quote")?)))?;
    let before = saved(&c, &a)?;
    let r = inspect_block_layout(&c, a.state().document(), a.state().selection())?;
    assert_eq!(r.alignment, Field::Mixed);
    assert_eq!(r.direction, Field::Uniform(Some(Direction::RightToLeft)));
    assert_eq!(saved(&c, &a)?, before);
    let clear = Patch::try_new(Change::Clear, Change::Keep, Change::Keep, Change::Keep)?;
    a.change_selection_layout(&a.snapshot(), &clear)?;
    let after = saved(&c, &a)?;
    assert_eq!(
        inspect_block_layout(&c, a.state().document(), a.state().selection())?.alignment,
        Field::Uniform(None)
    );
    assert_eq!(
        Layout::read(&c, a.state().document(), &id("q2")?)?.indent(),
        Some(Indent::try_new(3)?)
    );
    assert_eq!(a.change_selection_layout(&a.snapshot(), &clear)?, RichLocalOutcome::Unchanged);
    assert_eq!(saved(&c, &a)?, after);
    a.undo(&a.snapshot())?;
    assert!(saved(&c, &a)?.contains("block-align"));
    a.set_selection(&a.snapshot(), Some(RichSelectionKind::Node(id("lead")?)))?;
    assert_eq!(
        inspect_block_layout(&c, a.state().document(), a.state().selection())?.alignment,
        Field::Unavailable
    );
    let before = saved(&c, &a)?;
    assert!(a.change_selection_layout(&a.snapshot(), &clear).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}
#[test]
fn explicit_and_natural_recovery_reproduce_exact_future_layout_history() -> Result {
    for natural in [false, true] {
        let (c, d) = setup()?;
        let mut a = owner(&c, d, range("z-intro", 1, "caption", 4)?)?;
        if natural {
            a.enable_typing_history(&a.snapshot())?;
        }
        a.change_selection_layout(&a.snapshot(), &complete()?)?;
        let checkpoint = saved(&c, &a)?;
        let mut b = if natural {
            RichTypingSessionJsonCodec::new(c.clone()).decode(&checkpoint)?
        } else {
            RichSessionJsonCodec::new(c.clone()).decode(&checkpoint)?
        };
        for redo in [false, true, false, true] {
            if redo {
                a.redo(&a.snapshot())?;
                b.redo(&b.snapshot())?;
            } else {
                a.undo(&a.snapshot())?;
                b.undo(&b.snapshot())?;
            }
            assert_eq!(saved(&c, &a)?, saved(&c, &b)?);
        }
        a.set_selection(&a.snapshot(), Some(range("z-intro", 1, "z-intro", 1)?))?;
        let format = Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::try_from_sorted(vec![])?,
        );
        a.set_pending_formats(&a.snapshot(), Some(FormatSet::try_from_formats(vec![format])?))?;
        let pending = a.state().pending_formats().cloned();
        a.change_selection_layout(&a.snapshot(), &align(Align::Center)?)?;
        assert_eq!(a.state().pending_formats(), pending.as_ref());
    }
    Ok(())
}
#[test]
fn stale_readonly_transaction_limits_and_late_property_budget_failures_are_atomic() -> Result {
    let (c, d) = setup()?;
    let mut a = owner(&c, d, RichSelectionKind::Node(id("table")?))?;
    let stale = a.snapshot();
    a.set_read_only(&a.snapshot(), true)?;
    let before = saved(&c, &a)?;
    assert!(a.change_selection_layout(&stale, &complete()?).is_err());
    assert!(a.change_selection_layout(&a.snapshot(), &complete()?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    let (c, d) = setup()?;
    let c = c.with_max_operations_per_transaction(1);
    let mut a = owner(&c, d, RichSelectionKind::Node(id("quote")?))?;
    let before = saved(&c, &a)?;
    assert!(a.change_selection_layout(&a.snapshot(), &complete()?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    let c =
        EditorContext::new(schema(3)?, DocumentLimits::default().with_max_properties_per_owner(2));
    let mut q = fixture::element(
        "blockquote",
        "quote",
        vec![fixture::paragraph("a", "a"), fixture::paragraph("b", "b")],
    );
    node_mut(&mut q, "b").ok_or("b")?["properties"]["breditor/block-direction"] = json!(2);
    let d = admit(&c, mini(vec![q]))?;
    let mut a = owner(&c, d, RichSelectionKind::Node(id("quote")?))?;
    let before = saved(&c, &a)?;
    assert!(a.change_selection_layout(&a.snapshot(), &align(Align::Center)?).is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}
#[test]
fn kind_changes_and_plain_list_task_splits_retain_layout_and_exact_inverse() -> Result {
    for target in ["z-intro", "head", "task-head"] {
        let (c, d) = setup()?;
        let mut a = owner(&c, d, range(target, 1, target, 1)?)?;
        a.change_selection_layout(&a.snapshot(), &complete()?)?;
        let before = a.state().document().document().clone();
        let d = a.state().document();
        let action = match target {
            "head" => RichAction::SplitListItem(SplitListItem::capture(
                d,
                &point(target, 1)?,
                &id("fresh-item")?,
                &id("fresh-text")?,
                Some(3),
            )?),
            "task-head" => RichAction::SplitTaskItem(SplitTaskItem::capture(
                d,
                &point(target, 1)?,
                &id("fresh-item")?,
                &id("fresh-text")?,
                None,
            )?),
            _ => RichAction::SplitTextBlock(SplitTextBlock::capture(
                d,
                &point(target, 1)?,
                &id("fresh-text")?,
                None,
            )?),
        };
        a.dispatch(&a.snapshot(), &[action], RichSelectionUpdate::Map)?;
        assert_eq!(
            Layout::read(&c, a.state().document(), &id("fresh-text")?)?,
            complete()?.apply_to(Layout::default())
        );
        a.undo(&a.snapshot())?;
        assert_eq!(a.state().document().document(), &before);
        let action = SetHeading::capture(a.state().document(), &id(target)?, Some(2))?;
        a.dispatch(&a.snapshot(), &[RichAction::SetHeading(action)], RichSelectionUpdate::Map)?;
        assert_eq!(
            Layout::read(&c, a.state().document(), &id(target)?)?,
            complete()?.apply_to(Layout::default())
        );
        a.undo(&a.snapshot())?;
        let action = SetCodeBlock::capture(
            a.state().document(),
            &id(target)?,
            None,
            CodeFormatPolicy::RejectFormatted,
        )?;
        if target == "z-intro" {
            a.dispatch(
                &a.snapshot(),
                &[RichAction::SetCodeBlock(action)],
                RichSelectionUpdate::Map,
            )?;
            assert_eq!(
                Layout::read(&c, a.state().document(), &id(target)?)?,
                complete()?.apply_to(Layout::default())
            );
            a.undo(&a.snapshot())?;
            assert_eq!(a.state().document().document(), &before);
        }
    }
    Ok(())
}
#[test]
fn join_retains_left_layout_and_recovers_exact_right_metadata() -> Result {
    let (c, d) = setup()?;
    let mut a = owner(&c, d, range("q1", 0, "q1", 0)?)?;
    a.change_selection_layout(&a.snapshot(), &complete()?)?;
    a.set_selection(&a.snapshot(), Some(range("q2", 0, "q2", 0)?))?;
    a.change_selection_layout(&a.snapshot(), &align(Align::Center)?)?;
    let before = a.state().document().document().clone();
    let join = JoinTextBlocks::capture(a.state().document(), &id("q1")?, &id("q2")?)?;
    a.dispatch(&a.snapshot(), &[RichAction::JoinTextBlocks(join)], RichSelectionUpdate::Map)?;
    assert_eq!(Layout::read(&c, a.state().document(), &id("q1")?)?.alignment(), Some(Align::End));
    a.undo(&a.snapshot())?;
    assert_eq!(a.state().document().document(), &before);
    Ok(())
}
#[derive(Default)]
struct Ids(u64);
impl RichClipboardIdAllocator for Ids {
    fn next(
        &mut self,
        kind: RichClipboardIdentityKind,
    ) -> std::result::Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("layout-paste-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            100,
            ChangeId::new(ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?, 10),
        ))
    }
}
#[test]
fn rich_clipboard_preserves_caption_layout_with_fresh_ids_and_exact_paste_history() -> Result {
    let (c, d) = setup()?;
    let mut a = owner(&c, d, RichSelectionKind::Node(id("image")?))?;
    a.change_selection_layout(&a.snapshot(), &complete()?)?;
    let original = a.state().document().document().clone();
    let fragment = RichClipboardFragment::copy_selection(
        &c,
        a.state().document(),
        a.state().selection().ok_or("selection")?,
    )?
    .ok_or("fragment")?;
    let codec = RichClipboardJsonCodec::new(c.clone());
    let fragment = codec.decode(&codec.encode(&fragment)?)?;
    let drafts = fragment.flow_drafts(&c, &mut Ids::default())?;
    let action = InsertBlocks::capture(
        a.state().document(),
        &RichFlowPosition::new(RichFlowParent::Document, None),
        drafts,
    )?;
    a.dispatch(&a.snapshot(), &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)?;
    let raw: Value = serde_json::from_str(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?;
    let new = raw["root"]["children"].as_array().ok_or("children")?.last().ok_or("last")?;
    let caption =
        new["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("caption")?;
    assert_ne!(caption, "caption");
    assert_eq!(
        Layout::read(&c, a.state().document(), &id(caption)?)?,
        complete()?.apply_to(Layout::default())
    );
    a.undo(&a.snapshot())?;
    assert_eq!(a.state().document().document(), &original);
    Ok(())
}

#[test]
fn strict_intent_distinguishes_keep_clear_and_set_and_never_accepts_targets_or_css() -> Result {
    use breditor_core::codec::{
        RichBlockLayoutCodecError as E, decode_rich_block_layout_patch as decode,
    };
    let (c, _) = setup()?;
    let p = decode(&c, "{\"alignment\":null}")?;
    assert_eq!(p.alignment(), Change::Clear);
    assert_eq!(p.direction(), Change::Keep);
    let p = decode(
        &c,
        "{\"alignment\":\"start\",\"direction\":\"auto\",\"indent\":0,\"lineHeightPercent\":300}",
    )?;
    assert_eq!(p.alignment(), Change::Set(Align::Start));
    assert_eq!(p.direction(), Change::Set(Direction::Auto));
    assert_eq!(p.indent(), Change::Set(Indent::try_new(0)?));
    assert_eq!(p.line_height(), Change::Set(Height::try_new(300)?));
    for input in [
        "{}",
        "null",
        "[]",
        "{\"alignment\":\"inherit\"}",
        "{\"alignment\":\"Start\"}",
        "{\"direction\":\"RTL\"}",
        "{\"indent\":13}",
        "{\"indent\":-1}",
        "{\"lineHeightPercent\":99}",
        "{\"lineHeightPercent\":300.5}",
        "{\"alignment\":1}",
        "{\"indent\":\"1\"}",
        "{\"alignment\":\"start\",\"alignment\":null}",
        "{\"alignment\":null,\"targets\":[]}",
        "{\"style\":\"color:red\"}",
    ] {
        assert!(decode(&c, input).is_err(), "unexpected accepted intent");
    }
    assert!(matches!(decode(&c, &" ".repeat(65_537)), Err(E::Limit)));
    let old = EditorContext::new(schema(2)?, DocumentLimits::default());
    assert!(matches!(decode(&old, "notJSON"), Err(E::UnsupportedContext)));
    Ok(())
}
#[test]
fn distinct_field_state_encoding_keeps_inheritance_and_refuses_contradictory_read_counts() -> Result
{
    use breditor_core::codec::encode_rich_block_layout_state as encode;
    let (c, d) = setup()?;
    let mut a = owner(&c, d, range("empty", 0, "empty", 0)?)?;
    let state = inspect_block_layout(&c, a.state().document(), a.state().selection())?;
    let r: Value = serde_json::from_str(&encode(&c, &state)?)?;
    assert_eq!(r["format"], "breditor/rich-block-layout-state");
    assert_eq!(r["blocks"], "1");
    assert_eq!(r["alignment"], json!({"kind":"uniform","value":null}));
    a.change_selection_layout(&a.snapshot(), &complete()?)?;
    let state = inspect_block_layout(&c, a.state().document(), a.state().selection())?;
    let r: Value = serde_json::from_str(&encode(&c, &state)?)?;
    assert_eq!(r["alignment"]["value"], "end");
    assert_eq!(r["direction"]["value"], "rtl");
    assert_eq!(r["indent"]["value"], 3);
    assert_eq!(r["lineHeightPercent"]["value"], 150);
    let mut bad = state;
    bad.blocks = 0;
    assert!(encode(&c, &bad).is_err());
    bad.blocks = 1;
    bad.alignment = Field::Mixed;
    assert!(encode(&c, &bad).is_err());
    let empty = inspect_block_layout(&c, a.state().document(), None)?;
    assert_eq!(
        serde_json::from_str::<Value>(&encode(&c, &empty)?)?["alignment"]["kind"],
        "unavailable"
    );
    Ok(())
}
#[test]
fn layout_read_rejects_stale_or_foreign_proof_and_does_not_apply_the_mutation_count_budget()
-> Result {
    let (c, d) = setup()?;
    let proof = RichSelection::try_new(&d, RichSelectionKind::Node(id("quote")?))?;
    let mut a = owner(&c, d, proof.kind().clone())?;
    let before = inspect_block_layout(
        &c.clone().with_max_operations_per_transaction(1),
        a.state().document(),
        a.state().selection(),
    )?;
    assert_eq!(before.blocks, 2);
    a.change_selection_layout(&a.snapshot(), &complete()?)?;
    assert!(inspect_block_layout(&c, a.state().document(), Some(&proof)).is_err());
    let codec = DocumentJsonCodecV2::new(c.schema().clone());
    let mut root: Value = serde_json::from_str(&codec.encode(a.state().document().document())?)?;
    root["root"]["properties"]["breditor/document-id"] = json!("foreign");
    let foreign =
        RichDocument::try_admit(c.schema(), codec.decode(&root.to_string())?, c.limits())?;
    assert!(inspect_block_layout(&c, &foreign, a.state().selection()).is_err());
    Ok(())
}
#[test]
fn explicit_layout_drafts_admit_only_text_blocks_and_never_widen_original_profiles() -> Result {
    use breditor_core::{
        document::{TextFragment, TextRun},
        rich_content::RichBlockDraft,
    };
    let (c, d) = setup()?;
    let content = TextFragment::from(TextRun::try_new("New 🙂", FormatSet::default())?);
    let draft = RichBlockDraft::paragraph(&id("new")?, &content)?.with_block_layout(&complete()?)?;
    assert!(RichBlockDraft::capture(&d, &id("image")?)?.with_block_layout(&complete()?).is_err());
    let action = InsertBlocks::capture(
        &d,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        vec![draft.clone()],
    )?;
    let result = action.apply(&c, &d)?.ok_or("edit")?;
    assert_eq!(
        Layout::read(&c, result.document(), &id("new")?)?,
        complete()?.apply_to(Layout::default())
    );
    let old = EditorContext::new(schema(2)?, DocumentLimits::default());
    let doc = admit(&old, fixture::root())?;
    let action = InsertBlocks::capture(
        &doc,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        vec![draft],
    )?;
    assert!(action.apply(&old, &doc).is_err());
    Ok(())
}

#[test]
fn logical_and_physical_alignment_roundtrip_without_direction_based_substitution() -> Result {
    use breditor_core::codec::{
        decode_rich_block_layout_patch as decode, encode_rich_block_layout_state as encode,
    };
    let (context, document) = setup()?;
    let mut editor = owner(&context, document, range("z-intro", 0, "z-intro", 0)?)?;
    for (token, expected) in [
        ("start", Align::Start),
        ("center", Align::Center),
        ("end", Align::End),
        ("justify", Align::Justify),
        ("left", Align::Left),
        ("right", Align::Right),
    ] {
        for direction in ["ltr", "rtl", "auto"] {
            let patch =
                decode(&context, &json!({"alignment":token,"direction":direction}).to_string())?;
            editor.change_selection_layout(&editor.snapshot(), &patch)?;
            let value = inspect_block_layout(
                &context,
                editor.state().document(),
                editor.state().selection(),
            )?;
            assert_eq!(value.alignment, Field::Uniform(Some(expected)));
            let encoded: Value = serde_json::from_str(&encode(&context, &value)?)?;
            assert_eq!(encoded["alignment"]["value"], token);
            assert_eq!(encoded["direction"]["value"], direction);
        }
    }
    Ok(())
}
#[test]
fn code_exit_keeps_source_layout_but_new_adjacent_paragraph_inherits_parent_instead() -> Result {
    let (context, document) = setup()?;
    let mut editor = owner(&context, document, range("code", 0, "code", 0)?)?;
    editor.change_selection_layout(&editor.snapshot(), &complete()?)?;
    let before = editor.state().document().document().clone();
    editor.exit_code_block(&editor.snapshot(), &id("after-code")?)?;
    assert_eq!(
        Layout::read(&context, editor.state().document(), &id("code")?)?,
        complete()?.apply_to(Layout::default())
    );
    assert_eq!(
        Layout::read(&context, editor.state().document(), &id("after-code")?)?,
        Layout::default()
    );
    editor.undo(&editor.snapshot())?;
    assert_eq!(editor.state().document().document(), &before);
    Ok(())
}
