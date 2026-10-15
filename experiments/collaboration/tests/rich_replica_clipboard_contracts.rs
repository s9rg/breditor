//! Functional shared clipboard semantics, original identities, concurrent bodies and exact restart.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        ClipboardNamespace, Command, GridNavigationResult, PasteTarget, RichReplica,
        actions::{
            ClearTableCells, DeleteBlock, InsertColumn, InsertText, MergeCells, PasteTableCells,
            PastedCell, SetHeader,
        },
        selection::{CellTarget, Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        CausalStamp, ChangeId, ReplicaId, RichClipboardError, RichClipboardIdAllocator,
        RichClipboardIdentityKind,
    },
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn flow_paste_at_a_range_is_one_group_and_preserves_remote_suffix_characters() -> Result {
    let (mut a, mut b) = peers()?;
    let fragment = copy(&mut a, &Selection::Node { block: "image-block".into() })?;
    select(&mut a, &text_selection("p", 3, 1))?;
    let depth = a.undo_count();
    let o = a.observe()?;
    assert!(a.paste_flow_at_text_guarded(
        &o,
        &fragment,
        "pasted-suffix",
        &mut ClipboardNamespace::try_new("flow-at-range")?
    )?);
    assert_eq!(a.undo_count(), depth + 1);
    assert_eq!(a.selection()?, Some(text_selection("pasted-suffix", 0, 0)));
    b.apply(vec![
        Command::InsertText(InsertText { block: "p".into(), offset: 4, text: "!".into() }),
        insert("caption", "R"),
    ])?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(node(&raw(&a)?["root"], "p").ok_or("prefix")?), "a");
    assert_eq!(text(node(&raw(&a)?["root"], "pasted-suffix").ok_or("suffix")?), "b!");
    assert_eq!(text(node(&raw(&a)?["root"], "caption").ok_or("caption")?), "Rxy🙂");
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    assert_eq!(text(node(&raw(&a)?["root"], "p").ok_or("p")?), "a🙂b!");
    a.redo()?;
    r.redo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}

#[test]
fn rich_flow_paste_at_an_empty_normalization_caret_keeps_both_empty_text_sources() -> Result {
    let (mut a, _) = peers()?;
    let fragment = copy(&mut a, &Selection::Node { block: "image-block".into() })?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
    let value = raw(&a)?;
    let head =
        value["root"]["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("head")?;
    select(&mut a, &text_selection(head, 0, 0))?;
    let before = a.document_json().to_owned();
    let o = a.observe()?;
    a.paste_flow_at_text_guarded(
        &o,
        &fragment,
        "empty-suffix",
        &mut ClipboardNamespace::try_new("empty-flow-at-text")?,
    )?;
    let value = raw(&a)?;
    let types = value["root"]["children"]
        .as_array()
        .ok_or("body")?
        .iter()
        .map(|n| n["type"].as_str().ok_or("kind"))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    assert_eq!(types, vec!["breditor/paragraph", "breditor/image", "breditor/paragraph"]);
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.document_json(), before);
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}

#[test]
fn logical_grid_navigation_preserves_shared_bytes_redo_and_explicit_boundaries() -> Result {
    use breditor_core::rich_content::GridMove;
    let (mut a, _) = peers()?;
    a.apply(vec![insert("p", "Undoable")])?;
    a.undo()?;
    select(&mut a, &grid())?;
    let bytes = a.updates()?;
    let redo = a.redo_count();
    let o = a.observe()?;
    assert_eq!(
        a.navigate_grid_guarded(&o, GridMove::Previous, false)?,
        GridNavigationResult::Boundary { boundary: "beforeTable" }
    );
    a.check(&o)?;
    assert_eq!(a.navigate_grid_guarded(&o, GridMove::RowEnd, false)?, GridNavigationResult::Moved);
    assert_eq!(a.updates()?, bytes);
    assert_eq!(a.redo_count(), redo);
    assert!(a.check(&o).is_err());
    let o = a.observe()?;
    assert_eq!(
        a.navigate_grid_guarded(&o, GridMove::Next, false)?,
        GridNavigationResult::Boundary { boundary: "afterTable" }
    );
    a.check(&o)?;
    Ok(())
}

#[test]
fn explicit_paste_header_owns_intent_even_when_the_visible_value_was_already_equal() -> Result {
    let (mut a, mut b) = peers()?;
    a.apply(vec![Command::PasteTableCells(PasteTableCells {
        anchor: "cell".into(),
        focus: "cell".into(),
        cells: vec![vec![PastedCell {
            body: vec![paragraph("header-body", "Pasted")],
            header: Some(false),
        }]],
        merges: vec![],
    })])?;
    b.apply(vec![Command::SetHeader(SetHeader { cells: vec!["cell".into()], header: true })])?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&raw(&a)?["root"], "cell").ok_or("cell")?["properties"]["breditor/header"],
        false
    );
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&raw(&a)?["root"], "cell").ok_or("cell")?["properties"]["breditor/header"],
        true
    );
    a.redo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        node(&raw(&a)?["root"], "cell").ok_or("cell")?["properties"]["breditor/header"],
        false
    );
    Ok(())
}

#[test]
fn flow_paste_preserves_an_empty_normalized_root_or_cell_as_core_semantics_require() -> Result {
    for root in [false, true] {
        let (mut a, _) = peers()?;
        let fragment = copy(&mut a, &Selection::Node { block: "image-block".into() })?;
        let parent = if root {
            a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
            None
        } else {
            a.apply(vec![Command::InsertColumn(InsertColumn {
                block: "table-block".into(),
                column: "empty-target".into(),
                width: 180,
                before: None,
            })])?;
            Some(raw(&a)?["root"]["children"][0]["children"][0]["children"][2]["properties"]["breditor/block-id"].as_str().ok_or("cell")?.to_owned())
        };
        let initial = raw(&a)?;
        let target = if let Some(parent) = &parent {
            node(&initial["root"], parent).ok_or("cell")?
        } else {
            &initial["root"]
        };
        let head =
            target["children"][0]["properties"]["breditor/block-id"].as_str().ok_or("head")?;
        select(&mut a, &text_selection(head, 0, 0))?;
        let selection = a.selection()?;
        let before = a.document_json().to_owned();
        paste(
            &mut a,
            &fragment,
            PasteTarget::Flow { parent: parent.clone(), before: None },
            &mut Ids::new("empty-flow"),
        )?;
        let value = raw(&a)?;
        let flow = if let Some(parent) = parent {
            &node(&value["root"], &parent).ok_or("target")?["children"]
        } else {
            &value["root"]["children"]
        };
        assert_eq!(flow.as_array().ok_or("flow")?.len(), 2);
        assert_eq!(flow[0]["type"], "breditor/paragraph");
        assert_eq!(flow[1]["type"], "breditor/image");
        let mut r = restore(&a)?;
        a.undo()?;
        r.undo()?;
        assert_eq!(a.document_json(), before);
        assert_eq!(a.selection()?, selection);
        assert_eq!(a.checkpoint()?, r.checkpoint()?);
    }
    Ok(())
}
fn codec() -> Result<DocumentJsonCodecV2> {
    Ok(DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/shared-rich")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?))
}
fn source(codec: &DocumentJsonCodecV2) -> Result<String> {
    let mut root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let table = &mut root["children"][0];
    table["properties"]["breditor/columns"] =
        json!([{"id":"c","width":120},{"id":"c2","width":200}]);
    table["children"][0]["children"].as_array_mut().ok_or("cells")?.push(json!({"kind":"element","type":"breditor/table-cell","entityId":null,
        "properties":{"breditor/block-id":"cell2","breditor/column-id":"c2","breditor/header":true},"children":[paragraph("p2","Right")]}));
    let schema = codec.schema();
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string())
}
fn peers() -> Result<(RichReplica, RichReplica)> {
    let c = codec()?;
    let a = RichReplica::new(c.clone(), &source(&c)?, "101".into())?;
    let b = RichReplica::join(c, "room".into(), "202".into(), a.updates()?)?;
    Ok((a, b))
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.updates()?;
    let y = b.updates()?;
    a.receive(y)?;
    b.receive(x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
fn paragraph(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn node<'a>(n: &'a Value, id: &str) -> Option<&'a Value> {
    if n.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(n);
    }
    n["children"].as_array()?.iter().find_map(|n| node(n, id))
}
fn raw(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(a.document_json())?)
}
fn select(a: &mut RichReplica, s: &Selection) -> Result {
    a.set_selection(Some(s))?;
    Ok(())
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn text_selection(block: &str, start: u32, end: u32) -> Selection {
    Selection::TextRange { anchor: point(block, start), focus: point(block, end) }
}
fn grid() -> Selection {
    Selection::Grid {
        anchor: CellTarget { table: "t".into(), row: "r".into(), column: "c2".into() },
        focus: CellTarget { table: "t".into(), row: "r".into(), column: "c".into() },
    }
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn copy(a: &mut RichReplica, s: &Selection) -> Result<String> {
    select(a, s)?;
    Ok(a.copy_clipboard_guarded(&a.observe()?)?.ok_or("empty copy")?.rich_json)
}
#[derive(Default)]
struct Ids {
    prefix: String,
    n: usize,
}
impl Ids {
    fn new(prefix: &str) -> Self {
        Self { prefix: prefix.into(), n: 0 }
    }
}
impl RichClipboardIdAllocator for Ids {
    fn next(
        &mut self,
        k: RichClipboardIdentityKind,
    ) -> std::result::Result<String, RichClipboardError> {
        self.n += 1;
        Ok(format!("{}-{k:?}-{}", self.prefix, self.n))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            999_999,
            ChangeId::new(
                ReplicaId::try_new(999).map_err(|_| RichClipboardError::Allocation)?,
                999,
            ),
        ))
    }
}
fn paste(a: &mut RichReplica, input: &str, target: PasteTarget, ids: &mut Ids) -> Result {
    let o = a.observe()?;
    assert!(a.paste_clipboard_guarded(&o, input, target, ids)?);
    Ok(())
}
fn restore(a: &RichReplica) -> Result<RichReplica> {
    Ok(RichReplica::restore(codec()?, "room", &a.checkpoint()?)?)
}
fn text(n: &Value) -> String {
    if let Some(s) = n["text"].as_str() {
        return s.into();
    }
    n["children"].as_array().map_or_else(String::new, |v| v.iter().map(text).collect())
}
fn merge(a: &mut RichReplica) -> Result {
    a.apply(vec![Command::MergeCells(MergeCells {
        block: "table-block".into(),
        merge: "old-merge".into(),
        anchor: "cell".into(),
        focus: "cell2".into(),
    })])?;
    Ok(())
}

#[test]
fn copying_is_a_nonmutating_frozen_read_and_preserves_redo_and_guards() -> Result {
    let (mut a, _) = peers()?;
    a.apply(vec![insert("p", "X")])?;
    a.undo()?;
    select(&mut a, &text_selection("p", 3, 1))?;
    let o = a.observe()?;
    let before = a.checkpoint()?;
    let copied = a.copy_clipboard_guarded(&o)?.ok_or("copy")?;
    assert_eq!(copied.plain_text, "🙂");
    assert_eq!(a.checkpoint()?, before);
    a.check(&o)?;
    assert_eq!(a.redo_count(), 1);
    select(&mut a, &text_selection("p", 0, 0))?;
    assert!(a.copy_clipboard_guarded(&o).is_err());
    assert!(a.copy_clipboard_guarded(&a.observe()?)?.is_none());
    Ok(())
}
#[test]
fn inline_paste_uses_complete_source_styles_and_one_exact_history_recipe() -> Result {
    let (mut a, mut b) = peers()?;
    let fragment = copy(&mut a, &text_selection("p", 3, 1))?;
    select(&mut a, &text_selection("p2", 4, 1))?;
    let before = a.document_json().to_owned();
    let selection = a.selection()?;
    let mut ids = Ids::default();
    paste(&mut a, &fragment, PasteTarget::Text, &mut ids)?;
    assert_eq!(ids.n, 0);
    assert_eq!(text(node(&raw(&a)?["root"], "p2").ok_or("p2")?), "R🙂t");
    assert_eq!(a.selection()?, Some(text_selection("p2", 3, 3)));
    b.receive(a.updates()?)?;
    b.apply(vec![insert("p", "remote")])?;
    sync(&mut a, &mut b)?;
    let mut r = restore(&a)?;
    assert_eq!(r.checkpoint()?, a.checkpoint()?);
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    assert_eq!(a.selection()?, selection);
    assert_eq!(
        text(node(&raw(&a)?["root"], "p2").ok_or("p2")?),
        text(node(&serde_json::from_str::<Value>(&before)?["root"], "p2").ok_or("p2")?)
    );
    a.redo()?;
    r.redo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}
#[test]
fn flow_image_paste_allocates_identity_but_preserves_asset_caption_and_remote_original() -> Result {
    let (mut a, mut b) = peers()?;
    let fragment = copy(&mut a, &Selection::Node { block: "image-block".into() })?;
    let before = a.document_json().to_owned();
    paste(
        &mut a,
        &fragment,
        PasteTarget::Flow { parent: None, before: None },
        &mut Ids::new("image-copy"),
    )?;
    let v = raw(&a)?;
    let image = &v["root"]["children"][1];
    assert_ne!(image["properties"]["breditor/image-id"], "image");
    assert_ne!(image["properties"]["breditor/asset-generation"], "generation");
    assert_eq!(image["properties"]["breditor/asset-id"], "asset");
    assert_eq!(text(image), "xy🙂");
    b.apply(vec![insert("caption", "R")])?;
    sync(&mut a, &mut b)?;
    a.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(raw(&a)?["root"]["children"].as_array().ok_or("children")?.len(), 1);
    assert_eq!(text(node(&raw(&a)?["root"], "caption").ok_or("caption")?), "Rxy🙂");
    let mut r = restore(&a)?;
    a.redo()?;
    r.redo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    assert_ne!(a.document_json(), before);
    Ok(())
}
#[test]
fn copied_table_reauthors_merges_without_copying_clocks_or_flattening_cells() -> Result {
    let (mut a, _) = peers()?;
    merge(&mut a)?;
    let fragment = copy(&mut a, &Selection::Node { block: "table-block".into() })?;
    paste(
        &mut a,
        &fragment,
        PasteTarget::Flow { parent: None, before: None },
        &mut Ids::new("table-copy"),
    )?;
    let v = raw(&a)?;
    let table = &v["root"]["children"][1];
    let record = &table["properties"]["breditor/merges"][0];
    assert_eq!(record["writer"], "101");
    assert_ne!(record["lamport"], "999999");
    assert_ne!(record["id"], "old-merge");
    assert_eq!(text(&table["children"][0]["children"][0]), "a🙂bxy🙂");
    assert_eq!(text(&table["children"][0]["children"][1]), "Right");
    let after = a.document_json().to_owned();
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    a.redo()?;
    r.redo()?;
    assert_eq!(a.document_json(), after);
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}
#[test]
fn grid_paste_retains_axes_body_partitions_and_remote_old_body_edits_through_undo() -> Result {
    let (mut a, mut b) = peers()?;
    merge(&mut a)?;
    b.receive(a.updates()?)?;
    let fragment = copy(&mut a, &grid())?;
    let old = a.document_json().to_owned();
    paste(&mut a, &fragment, PasteTarget::Grid, &mut Ids::new("grid-copy"))?;
    b.apply(vec![insert("caption", "R"), insert("p2", "B")])?;
    sync(&mut a, &mut b)?;
    let v = raw(&a)?;
    let table = &v["root"]["children"][0];
    assert_eq!(
        table["properties"]["breditor/columns"],
        serde_json::from_str::<Value>(&old)?["root"]["children"][0]["properties"]["breditor/columns"]
    );
    assert_eq!(text(&table["children"][0]["children"][0]), "a🙂bxy🙂");
    assert_eq!(text(&table["children"][0]["children"][1]), "Right");
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    sync(&mut a, &mut b)?;
    assert_eq!(text(node(&raw(&a)?["root"], "caption").ok_or("caption")?), "Rxy🙂");
    assert_eq!(text(node(&raw(&a)?["root"], "p2").ok_or("p2")?), "BRight");
    a.redo()?;
    r.receive(b.updates()?)?;
    r.redo()?;
    assert_eq!(a.document_json(), r.document_json());
    Ok(())
}
#[test]
fn clear_keeps_merge_header_geometry_and_restores_remote_content_on_undo() -> Result {
    let (mut a, mut b) = peers()?;
    merge(&mut a)?;
    b.receive(a.updates()?)?;
    let before = raw(&a)?;
    a.apply(vec![Command::ClearTableCells(ClearTableCells {
        anchor: "cell2".into(),
        focus: "cell".into(),
        empty: vec!["clear-left".into(), "clear-right".into()],
    })])?;
    let v = raw(&a)?;
    assert_eq!(text(&v["root"]), "");
    assert_eq!(v["root"]["children"][0]["properties"], before["root"]["children"][0]["properties"]);
    assert_eq!(node(&v["root"], "cell2").ok_or("cell2")?["properties"]["breditor/header"], true);
    b.apply(vec![insert("p", "R")])?;
    sync(&mut a, &mut b)?;
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    assert_eq!(text(node(&raw(&a)?["root"], "p").ok_or("p")?), "Ra🙂b");
    Ok(())
}
#[test]
fn paste_and_clear_support_canonical_empty_derived_intersections() -> Result {
    let (mut a, _) = peers()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "new-column".into(),
        width: 180,
        before: None,
    })])?;
    let v = raw(&a)?;
    let cell = &v["root"]["children"][0]["children"][0]["children"][2];
    let id = cell["properties"]["breditor/block-id"].as_str().ok_or("id")?.to_owned();
    let before = a.document_json().to_owned();
    a.apply(vec![Command::ClearTableCells(ClearTableCells {
        anchor: id.clone(),
        focus: id.clone(),
        empty: vec!["empty-fresh".into()],
    })])?;
    a.undo()?;
    assert_eq!(a.document_json(), before);
    a.redo()?;
    a.apply(vec![Command::PasteTableCells(PasteTableCells {
        anchor: id.clone(),
        focus: id,
        cells: vec![vec![PastedCell {
            body: vec![paragraph("new-body", "Body")],
            header: Some(true),
        }]],
        merges: vec![],
    })])?;
    let mut r = restore(&a)?;
    a.undo()?;
    r.undo()?;
    assert_eq!(a.checkpoint()?, r.checkpoint()?);
    Ok(())
}
#[test]
fn stale_guard_and_invalid_paste_leave_all_owner_state_unchanged() -> Result {
    let (mut a, _) = peers()?;
    let fragment = copy(&mut a, &grid())?;
    let o = a.observe()?;
    select(&mut a, &text_selection("p", 0, 0))?;
    let before = a.checkpoint()?;
    let mut ids = Ids::new("reject");
    assert!(a.paste_clipboard_guarded(&o, "invalid", PasteTarget::Grid, &mut ids).is_err());
    assert_eq!(ids.n, 0);
    assert_eq!(a.checkpoint()?, before);
    assert!(
        a.paste_clipboard_guarded(&a.observe()?, &fragment, PasteTarget::Grid, &mut ids).is_err()
    );
    assert_eq!(ids.n, 0);
    assert_eq!(a.checkpoint()?, before);
    let invalid = Command::PasteTableCells(PasteTableCells {
        anchor: "cell".into(),
        focus: "cell2".into(),
        cells: vec![vec![PastedCell { body: vec![paragraph("p", "bad")], header: None }]],
        merges: vec![],
    });
    assert!(a.apply(vec![invalid]).is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}
#[test]
fn concurrent_grid_replacements_retain_both_writers_and_selective_undo_only_removes_own_body()
-> Result {
    let (mut a, mut b) = peers()?;
    let cmd = |id: &str, value: &str| {
        Command::PasteTableCells(PasteTableCells {
            anchor: "cell2".into(),
            focus: "cell2".into(),
            cells: vec![vec![PastedCell { body: vec![paragraph(id, value)], header: None }]],
            merges: vec![],
        })
    };
    a.apply(vec![cmd("a-body", "A")])?;
    b.apply(vec![cmd("b-body", "B")])?;
    sync(&mut a, &mut b)?;
    let v = raw(&a)?;
    assert!(node(&v["root"], "a-body").is_some());
    assert!(node(&v["root"], "b-body").is_some());
    a.undo()?;
    sync(&mut a, &mut b)?;
    let v = raw(&a)?;
    assert!(node(&v["root"], "a-body").is_none());
    assert!(node(&v["root"], "b-body").is_some());
    assert!(node(&v["root"], "p2").is_none());
    b.undo()?;
    sync(&mut a, &mut b)?;
    assert_eq!(text(node(&raw(&a)?["root"], "p2").ok_or("p2")?), "Right");
    Ok(())
}
