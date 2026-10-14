//! Functional causal carets/grids, local typing state, exact action selections and live guards.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        actions::{
            DeleteBlock, DeleteColumn, DeleteText, InsertBlocks, InsertColumn, InsertRow,
            InsertText, MoveBlock,
        },
        selection::{CellTarget, Selection, SelectionLoss, SelectionOutcome, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn pending_literal_json_rejects_duplicate_fields_and_independent_budgets_without_publication()
-> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    let before = a.checkpoint()?;
    let observation = a.observe()?;
    for input in [
        "[{\"type\":\"breditor/strong\",\"type\":\"breditor/strong\",\"properties\":{}}]"
            .to_owned(),
        format!("{}null", " ".repeat(64 * 1024)),
    ] {
        assert!(a.set_pending_formats_json(&input).is_err());
        assert_eq!(a.checkpoint()?, before);
        a.check(&observation)?;
    }
    let mut old: Value = serde_json::from_str(&before)?;
    old["version"] = json!(2);
    assert!(RichReplica::restore(codec()?, "room", &old.to_string()).is_err());
    Ok(())
}

#[test]
fn repeated_created_caret_redo_tracks_offline_prefix_edits_and_exact_restart() -> TestResult {
    for affinity in [Affinity::Before, Affinity::After] {
        let (mut a, mut b) = peers()?;
        a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
        let node = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"created-text"},"children":[{"kind":"text","text":"New🙂","formats":[]}]});
        a.apply_with_state(
            vec![Command::InsertBlocks(InsertBlocks {
                parent: None,
                before: None,
                nodes: vec![node],
            })],
            SelectionUpdate::Set(Some(caret("created-text", 1, affinity))),
            PendingFormatsUpdate::Map,
        )?;
        b.receive(a.updates()?)?;
        a.undo()?;
        b.apply(vec![insert("created-text", 0, "R🙂")])?;
        a.receive(b.updates()?)?;
        let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
        for _ in 0..3 {
            a.redo()?;
            restored.redo()?;
            let value: Value = serde_json::from_str(a.document_json())?;
            let text = node_text(node_ref(&value["root"], "created-text")?);
            let position = text.find("New🙂").ok_or("creator text")?;
            let offset = u32::try_from(text[..position].encode_utf16().count())? + 1;
            assert_eq!(a.selection()?, Some(caret("created-text", offset, affinity)));
            assert_eq!(a.view_json()?, restored.view_json()?);
            assert_eq!(a.updates()?, restored.updates()?);
            a.undo()?;
            restored.undo()?;
            assert_eq!(a.view_json()?, restored.view_json()?);
        }
    }
    Ok(())
}

fn node_ref<'a>(value: &'a Value, block: &str) -> Result<&'a Value, Box<dyn std::error::Error>> {
    Ok(node(value, block).ok_or("text block")?)
}
fn node_text(node: &Value) -> String {
    node["children"].as_array().map_or_else(String::new, |runs| {
        runs.iter().filter_map(|run| run["text"].as_str()).collect()
    })
}

#[test]
fn multiple_history_groups_restore_their_own_before_and_after_carets() -> TestResult {
    let (mut a, _) = peers()?;
    let start = caret("p", 1, Affinity::Before);
    let first = caret("created-text", 2, Affinity::Before);
    a.set_selection(Some(&start))?;
    let created = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"created-text"},"children":[{"kind":"text","text":"New🙂","formats":[]}]});
    a.apply_with_state(
        vec![Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![created],
        })],
        SelectionUpdate::Set(Some(first.clone())),
        PendingFormatsUpdate::Map,
    )?;
    let second_before = caret("caption", 0, Affinity::After);
    let second_after = caret("caption", 1, Affinity::After);
    a.set_selection(Some(&second_before))?;
    a.apply_with_state(
        vec![insert("caption", 0, "Q")],
        SelectionUpdate::Set(Some(second_after.clone())),
        PendingFormatsUpdate::Map,
    )?;
    a.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    a.undo()?;
    assert_eq!(a.selection()?, Some(second_before));
    a.undo()?;
    assert_eq!(a.selection()?, Some(start));
    a.redo()?;
    assert_eq!(a.selection()?, Some(first));
    a.redo()?;
    assert_eq!(a.selection()?, Some(second_after));
    Ok(())
}

#[test]
fn deleted_emoji_caret_restores_scalar_alignment_through_repeated_history() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("p", 3, Affinity::Before)))?;
    a.apply_with_state(
        vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 2 })],
        SelectionUpdate::Set(Some(caret("p", 1, Affinity::Before))),
        PendingFormatsUpdate::Map,
    )?;
    b.apply(vec![insert("p", 0, "R")])?;
    a.receive(b.updates()?)?;
    for _ in 0..3 {
        a.undo()?;
        assert_eq!(a.selection()?, Some(caret("p", 4, Affinity::Before)));
        a.redo()?;
        assert_eq!(a.selection()?, Some(caret("p", 2, Affinity::Before)));
    }
    Ok(())
}

#[test]
fn shared_plain_typing_derives_formats_and_explicit_plain_override_does_not_inherit_strong()
-> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
    a.insert_plain_text("Derived🙂")?;
    let value: Value = serde_json::from_str(a.document_json())?;
    assert_eq!(node_ref(&value["root"], "p")?["children"][0]["formats"], json!([strong()]));
    a.undo()?;
    assert_eq!(a.selection()?, Some(caret("p", 1, Affinity::Before)));
    a.set_pending_formats(Some(&[]))?;
    a.insert_plain_text("Plain🙂")?;
    let value: Value = serde_json::from_str(a.document_json())?;
    let p = node_ref(&value["root"], "p")?;
    assert_eq!(p["children"][1]["text"], "Plain🙂");
    assert_eq!(p["children"][1]["formats"], json!([]));
    assert_eq!(a.selection()?, Some(caret("p", 8, Affinity::After)));
    a.undo()?;
    assert_eq!(a.selection()?, Some(caret("p", 1, Affinity::Before)));
    assert_eq!(a.pending_formats(), Some([].as_slice()));
    a.redo()?;
    assert_eq!(a.selection()?, Some(caret("p", 8, Affinity::After)));
    Ok(())
}

#[test]
fn explicit_shared_caption_typing_formats_survive_restart_with_one_content_history_unit()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("caption", 1, Affinity::After)))?;
    a.set_pending_formats(Some(&[strong()]))?;
    a.insert_plain_text("Styled🙂")?;
    assert_eq!(a.undo_count(), 1);
    b.apply(vec![insert("caption", 0, "Remote ")])?;
    a.receive(b.updates()?)?;
    let before = a.view_json()?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    a.undo()?;
    restored.undo()?;
    assert_eq!(a.view_json()?, restored.view_json()?);
    a.redo()?;
    restored.redo()?;
    let mut before: Value = serde_json::from_str(&before)?;
    let mut after: Value = serde_json::from_str(&a.view_json()?)?;
    for field in ["revision", "causalVersion"] {
        before.as_object_mut().ok_or("before view")?.remove(field);
        after.as_object_mut().ok_or("after view")?.remove(field);
    }
    assert_eq!(after, before); // Undo/Redo author new causal operations while restoring semantic/UI values.
    assert_eq!(a.view_json()?, restored.view_json()?);
    assert_eq!(a.updates()?, restored.updates()?);
    Ok(())
}

#[test]
fn empty_typing_and_guarded_history_preserve_or_invalidate_the_exact_observation() -> TestResult {
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("caption", 0, Affinity::After)))?;
    let current = a.observe()?;
    assert!(!a.insert_plain_text_guarded(&current, "")?);
    a.check(&current)?;
    assert!(a.insert_plain_text_guarded(&current, "Typed")?);
    assert!(a.undo_guarded(&current).is_err());
    let next = a.observe()?;
    assert!(a.undo_guarded(&next)?);
    let redo = a.observe()?;
    assert!(a.redo_guarded(&redo)?);
    Ok(())
}

fn codec() -> Result<DocumentJsonCodecV2, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn peers() -> Result<(RichReplica, RichReplica), Box<dyn std::error::Error>> {
    let codec = codec()?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let schema = codec.schema();
    let source=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string();
    let a = RichReplica::new(codec.clone(), &source, "1".into())?;
    let b = RichReplica::join(codec, "room".into(), "2".into(), a.updates()?)?;
    Ok((a, b))
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> TestResult {
    let x = a.updates()?;
    let y = b.updates()?;
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn point(block: &str, offset: u32, affinity: Affinity) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity }
}
fn caret(block: &str, offset: u32, affinity: Affinity) -> Selection {
    let point = point(block, offset, affinity);
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn row(block: &str, row: &str, before: Option<&str>) -> Command {
    Command::InsertRow(InsertRow {
        block: "table-block".into(),
        row_block: block.into(),
        row: row.into(),
        before: before.map(str::to_owned),
    })
}
fn column(column: &str, before: Option<&str>) -> Command {
    Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: column.into(),
        width: 240,
        before: before.map(str::to_owned),
    })
}
fn grid_selection(ar: &str, ac: &str, fr: &str, fc: &str) -> Selection {
    Selection::Grid {
        anchor: CellTarget { table: "t".into(), row: ar.into(), column: ac.into() },
        focus: CellTarget { table: "t".into(), row: fr.into(), column: fc.into() },
    }
}
fn strong() -> Value {
    json!({"type":"breditor/strong","properties":{}})
}
fn node<'a>(node: &'a Value, block: &str) -> Option<&'a Value> {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return Some(node);
    }
    node.get("children").and_then(Value::as_array)?.iter().find_map(|node| self::node(node, block))
}
fn derived_text(
    replica: &RichReplica,
    row: &str,
    column: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let value: Value = serde_json::from_str(replica.document_json())?;
    let cell = node(&value["root"], row).ok_or("row")?["children"]
        .as_array()
        .ok_or("cells")?
        .iter()
        .find(|cell| cell["properties"]["breditor/column-id"] == column)
        .ok_or("cell")?;
    Ok(cell["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("text block")?.into())
}

#[test]
fn local_selection_and_pending_formats_change_neither_shared_updates_nor_redo() -> TestResult {
    let (mut a, _) = peers()?;
    a.apply(vec![insert("p", 1, "Local")])?;
    a.undo()?;
    let updates = a.updates()?;
    let version = a.causal_version();
    let document = a.document_json().to_owned();
    assert_eq!(a.redo_count(), 1);
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    a.set_pending_formats(Some(&[strong()]))?;
    assert_eq!(a.updates()?, updates);
    assert_eq!(a.causal_version(), version);
    assert_eq!(a.document_json(), document);
    assert_eq!(a.redo_count(), 1);
    let observed = a.observe()?;
    assert!(!a.set_pending_formats(Some(&[strong()]))?);
    a.check(&observed)?;
    assert_eq!(
        serde_json::from_str::<Value>(observed.view_json())?["selection"]["focus"]["offset"],
        "1"
    );
    Ok(())
}

#[test]
fn causal_text_affinity_and_reverse_range_follow_concurrent_insertions() -> TestResult {
    let (mut a, mut b) = peers()?;
    let backwards = Selection::TextRange {
        anchor: point("p", 4, Affinity::After),
        focus: point("p", 1, Affinity::After),
    };
    a.set_selection(Some(&backwards))?;
    b.apply(vec![insert("p", 1, "X")])?;
    a.receive(b.updates()?)?;
    assert_eq!(
        a.selection()?,
        Some(Selection::TextRange {
            anchor: point("p", 5, Affinity::After),
            focus: point("p", 2, Affinity::After)
        })
    );
    assert_eq!(a.selection_outcome(), SelectionOutcome::Relocated);
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&Selection::TextRange {
        anchor: point("p", 1, Affinity::Before),
        focus: point("p", 1, Affinity::After),
    }))?;
    a.set_pending_formats(Some(&[strong()]))?;
    b.apply(vec![insert("p", 1, "🙂")])?;
    a.receive(b.updates()?)?;
    assert_eq!(
        a.selection()?,
        Some(Selection::TextRange {
            anchor: point("p", 1, Affinity::Before),
            focus: point("p", 3, Affinity::After)
        })
    );
    assert!(a.pending_formats().is_none());
    Ok(())
}

#[test]
fn stale_and_foreign_observations_reject_before_invalid_selection_or_commands() -> TestResult {
    let (mut a, b) = peers()?;
    let old = a.observe()?;
    let foreign = b.observe()?;
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    let before = a.checkpoint()?;
    for observation in [&old, &foreign] {
        assert!(matches!(
            a.set_selection_guarded(
                observation,
                Some(&caret("missing", u32::MAX, Affinity::After))
            ),
            Err(breditor_collab_feasibility::Error::Contract(
                "stale or foreign shared observation"
            ))
        ));
        assert!(
            a.apply_guarded(
                observation,
                vec![insert("missing", u32::MAX, "ignored")],
                SelectionUpdate::Map,
                PendingFormatsUpdate::Map
            )
            .is_err()
        );
        assert_eq!(a.checkpoint()?, before);
    }
    let current = a.observe()?;
    assert!(a.set_selection_guarded(&current, Some(&caret("p", 2, Affinity::After))).is_err());
    a.check(&current)?;
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}

#[test]
fn moved_caption_and_image_selection_keep_stable_targets_and_typing_context() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("caption", 2, Affinity::After)))?;
    a.set_pending_formats(Some(&[strong()]))?;
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "image-block".into(),
        parent: None,
        before: Some("table-block".into()),
    })])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection()?, Some(caret("caption", 2, Affinity::After)));
    assert_eq!(a.pending_formats(), Some([strong()].as_slice()));
    a.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    b.apply(vec![Command::MoveBlock(MoveBlock {
        block: "image-block".into(),
        parent: Some("cell".into()),
        before: None,
    })])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection()?, Some(Selection::Node { block: "image-block".into() }));
    Ok(())
}

#[test]
fn directional_grid_keeps_stable_endpoints_and_uses_rust_merged_closure() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("new-row", "r2", Some("row")), column("c2", Some("c"))])?;
    sync(&mut a, &mut b)?;
    let grid = grid_selection("r", "c", "r2", "c2");
    a.set_selection(Some(&grid))?;
    b.apply(vec![row("middle-row", "rm", Some("row")), column("cm", Some("c"))])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection()?, Some(grid));
    let view: Value = serde_json::from_str(&a.view_json()?)?;
    assert_eq!(view["grid"]["cells"].as_array().ok_or("grid cells")?.len(), 9);
    Ok(())
}

#[test]
fn deleted_grid_endpoints_choose_original_axes_not_concurrent_new_axes() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("new-row", "r2", Some("row")), column("c2", Some("c"))])?;
    sync(&mut a, &mut b)?;
    a.set_selection(Some(&grid_selection("r2", "c2", "r", "c")))?;
    b.apply(vec![
        row("middle-row", "rm", Some("row")),
        column("cm", Some("c")),
        Command::DeleteBlock(DeleteBlock { block: "new-row".into() }),
        Command::DeleteColumn(DeleteColumn { block: "table-block".into(), column: "c2".into() }),
    ])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection()?, Some(grid_selection("r", "c", "r", "c")));
    assert_eq!(a.selection_outcome(), SelectionOutcome::Relocated);
    Ok(())
}

#[test]
fn all_original_rows_removed_clear_grid_even_when_a_new_row_exists() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&grid_selection("r", "c", "r", "c")))?;
    b.apply(vec![
        row("new-row", "r-new", None),
        Command::DeleteBlock(DeleteBlock { block: "row".into() }),
    ])?;
    a.receive(b.updates()?)?;
    assert!(a.selection()?.is_none());
    assert_eq!(
        a.selection_outcome(),
        SelectionOutcome::Cleared { reason: SelectionLoss::TargetDeleted }
    );
    Ok(())
}

#[test]
fn deleted_text_row_relocates_to_a_surviving_original_cell_and_clears_pending_formats() -> TestResult
{
    let (mut a, mut b) = peers()?;
    a.apply(vec![row("previous-row", "rp", Some("row"))])?;
    sync(&mut a, &mut b)?;
    let target = derived_text(&a, "previous-row", "c")?;
    a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
    a.set_pending_formats(Some(&[strong()]))?;
    b.apply(vec![
        row("unrelated-row", "rn", None),
        Command::DeleteBlock(DeleteBlock { block: "row".into() }),
    ])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection()?, Some(caret(&target, 0, Affinity::Before)));
    assert!(a.pending_formats().is_none());
    Ok(())
}

#[test]
fn hidden_table_node_selection_clears_explicitly_and_does_not_revive_on_remote_undo() -> TestResult
{
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&Selection::Node { block: "table-block".into() }))?;
    b.apply(vec![Command::DeleteColumn(DeleteColumn {
        block: "table-block".into(),
        column: "c".into(),
    })])?;
    a.receive(b.updates()?)?;
    assert_eq!(
        a.selection_outcome(),
        SelectionOutcome::Cleared { reason: SelectionLoss::HiddenTable }
    );
    assert!(a.selection()?.is_none());
    b.undo()?;
    a.receive(b.updates()?)?;
    assert!(a.selection()?.is_none());
    Ok(())
}

#[test]
fn undo_redo_restore_action_selections_and_pending_formats_not_the_current_mouse_caret()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
    a.set_pending_formats(Some(&[strong()]))?;
    a.apply_with_state(
        vec![insert("p", 1, "local")],
        SelectionUpdate::Set(Some(caret("p", 6, Affinity::After))),
        PendingFormatsUpdate::Set(Some(vec![])),
    )?;
    b.apply(vec![insert("p", 0, "R")])?;
    a.receive(b.updates()?)?;
    a.set_selection(Some(&caret("caption", 0, Affinity::After)))?;
    a.undo()?;
    assert_eq!(a.selection()?, Some(caret("p", 2, Affinity::Before)));
    assert_eq!(a.pending_formats(), Some([strong()].as_slice()));
    a.redo()?;
    assert_eq!(a.selection()?, Some(caret("p", 7, Affinity::After)));
    assert_eq!(a.pending_formats(), Some([].as_slice()));
    Ok(())
}

#[test]
fn created_text_middle_caret_restores_after_undo_and_redo() -> TestResult {
    let (mut a, _) = peers()?;
    let before = caret("p", 1, Affinity::Before);
    let after = caret("created-text", 2, Affinity::Before);
    a.set_selection(Some(&before))?;
    let node = json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"created-text"},"children":[{"kind":"text","text":"New🙂","formats":[]}]});
    a.apply_with_state(
        vec![Command::InsertBlocks(InsertBlocks { parent: None, before: None, nodes: vec![node] })],
        SelectionUpdate::Set(Some(after.clone())),
        PendingFormatsUpdate::Map,
    )?;
    a.undo()?;
    assert_eq!(a.selection()?, Some(before));
    a.redo()?;
    assert_eq!(a.selection()?, Some(after));
    Ok(())
}

#[test]
fn failed_post_action_selection_preserves_content_history_ui_and_current_observation() -> TestResult
{
    let (mut a, _) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::After)))?;
    let current = a.observe()?;
    let checkpoint = a.checkpoint()?;
    assert!(
        a.apply_guarded(
            &current,
            vec![insert("p", 1, "partial")],
            SelectionUpdate::Set(Some(caret("missing", 0, Affinity::After))),
            PendingFormatsUpdate::Map
        )
        .is_err()
    );
    assert_eq!(a.checkpoint()?, checkpoint);
    assert_eq!(a.view_json()?, current.view_json());
    a.check(&current)?;
    Ok(())
}

#[test]
fn same_writer_restart_restores_current_ui_and_exact_future_selective_history() -> TestResult {
    let (mut a, mut b) = peers()?;
    a.set_selection(Some(&caret("p", 1, Affinity::Before)))?;
    a.set_pending_formats(Some(&[]))?;
    a.apply_with_state(
        vec![insert("p", 1, "local")],
        SelectionUpdate::Set(Some(caret("p", 6, Affinity::After))),
        PendingFormatsUpdate::Set(Some(vec![strong()])),
    )?;
    b.apply(vec![insert("p", 0, "R")])?;
    a.receive(b.updates()?)?;
    let observed = a.observe()?;
    let mut restored = RichReplica::restore(codec()?, "room", &a.checkpoint()?)?;
    assert_eq!(a.view_json()?, restored.view_json()?);
    assert!(restored.check(&observed).is_err());
    a.undo()?;
    restored.undo()?;
    assert_eq!(a.view_json()?, restored.view_json()?);
    assert_eq!(a.updates()?, restored.updates()?);
    a.redo()?;
    restored.redo()?;
    assert_eq!(a.view_json()?, restored.view_json()?);
    assert_eq!(a.updates()?, restored.updates()?);
    Ok(())
}

#[test]
fn empty_derived_cell_selection_has_boundary_affinity_without_creating_shared_containers()
-> TestResult {
    let (mut a, mut b) = peers()?;
    a.apply(vec![column("new-empty", None)])?;
    sync(&mut a, &mut b)?;
    let block = derived_text(&a, "row", "new-empty")?;
    let updates = a.updates()?;
    a.set_selection(Some(&Selection::TextRange {
        anchor: point(&block, 0, Affinity::Before),
        focus: point(&block, 0, Affinity::After),
    }))?;
    assert_eq!(a.updates()?, updates);
    b.apply(vec![insert(&block, 0, "🙂")])?;
    a.receive(b.updates()?)?;
    assert_eq!(
        a.selection()?,
        Some(Selection::TextRange {
            anchor: point(&block, 0, Affinity::Before),
            focus: point(&block, 2, Affinity::After)
        })
    );
    Ok(())
}

#[test]
fn serialized_selection_candidates_require_exact_decimal_offsets_and_closed_shapes() -> TestResult {
    for point in [
        json!({"block":"p","offset":1,"affinity":"after"}),
        json!({"block":"p","offset":"01","affinity":"after"}),
        json!({"block":"p","offset":"4294967296","affinity":"after"}),
        json!({"block":"p","offset":"1","affinity":"after","unexpected":true}),
    ] {
        assert!(
            serde_json::from_value::<Selection>(
                json!({"kind":"text","anchor":point,"focus":point})
            )
            .is_err()
        );
    }
    let value = caret("p", 1, Affinity::After);
    assert_eq!(serde_json::from_value::<Selection>(serde_json::to_value(&value)?)?, value);
    Ok(())
}
