//! Shared rich language V4 structure commands: sections (wrap/unwrap), page breaks
//! (insert/delete, slash batch) and table captions (add/remove). Each is one writer-local
//! Undo step, converges across concurrent peers, replays exactly from checkpoints and never
//! relies on a V4 merge repair.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedRichProfile,
        actions::{
            AddTableCaption, DeleteBlock, DeletePageBreak, DeleteText, InsertBlocks,
            InsertPageBreak, InsertRow, InsertText, MoveBlock, RemoveTableCaption, SetBlockLayout,
            SetDetailsOpen, SetHeading, UnwrapDetails, WrapDetails,
        },
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-v4-structure";
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":SCHEMA,"version":1},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":Value::Array(children)})
}
fn para(id: &str, text: &str) -> Value {
    el(
        "paragraph",
        id,
        if text.is_empty() {
            vec![]
        } else {
            vec![json!({"kind":"text","text":text,"formats":[]})]
        },
    )
}
fn table(id: &str, caption: Option<Value>) -> Value {
    let cell = |row: &str, column: &str| {
        let mut cell = el(
            "table-cell",
            &format!("{id}-cell-{row}-{column}"),
            vec![para(&format!("{id}-p-{row}-{column}"), "x")],
        );
        cell["properties"]["breditor/column-id"] = json!(column);
        cell["properties"]["breditor/header"] = json!(false);
        cell
    };
    let row = |row: &str| {
        let mut node =
            el("table-row", &format!("{id}-row-{row}"), vec![cell(row, "c1"), cell(row, "c2")]);
        node["properties"]["breditor/row-id"] = json!(row);
        node
    };
    let mut children = vec![row("r1"), row("r2")];
    children.extend(caption);
    let mut node = el("table", id, children);
    node["properties"] = json!({"breditor/block-id":id,"breditor/table-id":format!("{id}-t"),"breditor/columns":[{"id":"c1","width":160},{"id":"c2","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    node
}
/// Root flow with paragraphs, an open section, a page break and an uncaptioned table.
fn root() -> Value {
    let mut section = el(
        "details",
        "sec",
        vec![
            el("details-summary", "sum", vec![json!({"kind":"text","text":"More","formats":[]})]),
            para("body-1", "Body one"),
            para("body-2", "Body two"),
        ],
    );
    section["properties"]["breditor/details-open"] = json!(true);
    let mut root = el(
        "document",
        "unused",
        vec![
            para("p1", "One"),
            para("p2", "Two"),
            para("p3", "Three"),
            section,
            el("page-break", "pb", vec![]),
            table("tbl", None),
            para("tail", "Tail"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v4(&config(4))?)
}
fn peers(n: usize) -> Result<(SharedRichProfile, Vec<RichReplica>)> {
    let p = profile()?;
    let a = p.create(&source(&p, &root()), "101".into())?;
    let mut all = vec![];
    for i in 1..n {
        all.push(p.join_frame(
            "room".into(),
            format!("{}0{}", i + 1, i + 1),
            &a.update_frame()?,
        )?);
    }
    all.insert(0, a);
    Ok((p, all))
}
fn ast(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"].clone())
}
fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
    if node["properties"]["breditor/block-id"] == id {
        return Some(node);
    }
    node.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
fn node(a: &RichReplica, id: &str) -> Result<Value> {
    Ok(find(&ast(a)?, id).ok_or_else(|| format!("missing block {id}"))?.clone())
}
fn ids(node: &Value) -> Vec<String> {
    node["children"]
        .as_array()
        .map(|c| {
            c.iter()
                .filter_map(|n| n["properties"]["breditor/block-id"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
fn kinds(node: &Value) -> Vec<String> {
    node["children"]
        .as_array()
        .map(|c| c.iter().filter_map(|n| n["type"].as_str().map(str::to_owned)).collect())
        .unwrap_or_default()
}
fn plain(node: &Value) -> String {
    node["children"].as_array().map_or_else(String::new, |runs| {
        runs.iter().filter_map(|r| r["text"].as_str()).collect::<String>()
    })
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn wrap(first: &str, last: &str, wrapper: &str) -> Command {
    Command::WrapDetails(WrapDetails {
        first: first.into(),
        last: last.into(),
        wrapper: wrapper.into(),
        summary: format!("{wrapper}-sum"),
        open: true,
    })
}
fn unwrap(wrapper: &str) -> Command {
    Command::UnwrapDetails(UnwrapDetails { wrapper: wrapper.into() })
}
fn page_break(block: &str, before: Option<&str>) -> Command {
    Command::InsertPageBreak(InsertPageBreak {
        block: block.into(),
        before: before.map(Into::into),
    })
}
fn add_caption(table: &str, caption: &str) -> Command {
    Command::AddTableCaption(AddTableCaption { block: table.into(), caption: caption.into() })
}
fn remove_caption(table: &str) -> Command {
    Command::RemoveTableCaption(RemoveTableCaption { block: table.into() })
}
/// Exchange every peer's complete update set and require one identical document.
fn sync(peers: &mut [RichReplica]) -> Result {
    let frames =
        peers.iter().map(RichReplica::update_frame).collect::<std::result::Result<Vec<_>, _>>()?;
    for (i, peer) in peers.iter_mut().enumerate() {
        for (j, frame) in frames.iter().enumerate() {
            if i != j {
                peer.receive_frame(frame)?;
            }
        }
    }
    for peer in peers.iter() {
        assert_eq!(peer.document_json(), peers[0].document_json());
    }
    Ok(())
}
/// Exact restart, then identical Undo/Redo on the original and the restored owner.
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let mut b = p.restore("room", &a.checkpoint()?)?;
    assert_eq!(a.checkpoint()?, b.checkpoint()?);
    assert_eq!(a.document_json(), b.document_json());
    let count = a.undo_count() + 1;
    for redo in [false, true, false, true] {
        for _ in 0..count {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(a.checkpoint()?, b.checkpoint()?);
        }
    }
    Ok(())
}
/// One command group is exactly one Undo step: Undo restores the basis, Redo the result.
fn one_step(a: &mut RichReplica, commands: Vec<Command>) -> Result<Value> {
    let before = (ast(a)?, a.undo_count());
    assert!(a.apply(commands)?);
    let after = ast(a)?;
    assert_eq!(a.undo_count(), before.1 + 1);
    assert!(a.undo()?);
    assert_eq!(ast(a)?, before.0);
    assert!(a.redo()?);
    assert_eq!(ast(a)?, after);
    Ok(after)
}
/// Selective Undo of every peer's work converges back to the exact seed.
fn undo_all(peers: &mut [RichReplica]) -> Result {
    for peer in peers.iter_mut() {
        while peer.undo()? {}
    }
    sync(peers)?;
    assert_eq!(ast(&peers[0])?, root());
    Ok(())
}

#[test]
fn wrap_and_unwrap_sections_are_one_undo_step_each_and_keep_every_identity() -> Result {
    let (p, mut all) = peers(2)?;
    let a = &mut all[0];
    let wrapped = one_step(a, vec![wrap("p1", "p2", "s1")])?;
    assert_eq!(ids(&wrapped), ["s1", "p3", "sec", "pb", "tbl", "tail"]);
    let section = find(&wrapped, "s1").ok_or("section")?;
    assert_eq!(ids(section), ["s1-sum", "p1", "p2"]);
    assert_eq!(kinds(section)[0], "breditor/details-summary");
    assert_eq!(section["properties"]["breditor/details-open"], true);
    assert_eq!(plain(&node(a, "p2")?), "Two");
    // The summary is an ordinary text line for typing.
    a.apply(vec![insert("s1-sum", 0, "Intro")])?;
    // Unwrapping keeps the summary identity and text as a paragraph, then the body.
    let lifted = one_step(a, vec![unwrap("s1")])?;
    assert_eq!(ids(&lifted), ["s1-sum", "p1", "p2", "p3", "sec", "pb", "tbl", "tail"]);
    assert_eq!(node(a, "s1-sum")?["type"], "breditor/paragraph");
    assert_eq!(plain(&node(a, "s1-sum")?), "Intro");
    // The lifted summary is an ordinary paragraph: it may now own block layout.
    a.apply(vec![Command::SetBlockLayout(SetBlockLayout {
        block: "s1-sum".into(),
        patch_json: r#"{"alignment":"center"}"#.into(),
    })])?;
    assert!(node(a, "s1-sum")?["properties"].get("breditor/block-align").is_some());
    a.undo()?;
    // The seeded section unwraps too; a caret in its summary keeps its offset.
    a.set_selection(Some(&caret("sum", 2)))?;
    let seeded = one_step(a, vec![unwrap("sec")])?;
    assert_eq!(
        ids(&seeded),
        ["s1-sum", "p1", "p2", "p3", "sum", "body-1", "body-2", "pb", "tbl", "tail"]
    );
    assert_eq!(a.selection()?, Some(caret("sum", 2)));
    // A collapsed new section is a creation default; wrapping a section nests it.
    a.undo()?;
    let mut collapsed = wrap("sec", "sec", "s2");
    if let Command::WrapDetails(value) = &mut collapsed {
        value.open = false;
    }
    let nested = one_step(a, vec![collapsed])?;
    let outer = find(&nested, "s2").ok_or("s2")?;
    assert_eq!(ids(outer), ["s2-sum", "sec"]);
    assert!(outer["properties"].get("breditor/details-open").is_none());
    future(&p, a)?;
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn concurrent_wrap_versus_edits_inside_and_unwrap_versus_moves_converge() -> Result {
    let (p, mut all) = peers(3)?;
    // A wraps p1..p2 while B types inside p2 and C converts p1 to a heading.
    all[0].apply(vec![wrap("p1", "p2", "s1")])?;
    all[1].apply(vec![insert("p2", 3, " edited")])?;
    all[2].apply(vec![Command::SetHeading(SetHeading { block: "p1".into(), level: Some(2) })])?;
    sync(&mut all)?;
    let section = node(&all[0], "s1")?;
    assert_eq!(ids(&section), ["s1-sum", "p1", "p2"]);
    assert_eq!(kinds(&section)[1], "breditor/heading");
    assert_eq!(plain(&node(&all[0], "p2")?), "Two edited");
    // A unwraps the seeded section while B moves a body block out (to the end) and
    // C moves the third paragraph into the body.
    all[0].apply(vec![unwrap("sec")])?;
    all[1].apply(vec![Command::MoveBlock(MoveBlock {
        block: "body-2".into(),
        parent: None,
        before: None,
    })])?;
    all[2].apply(vec![Command::MoveBlock(MoveBlock {
        block: "p3".into(),
        parent: Some("sec".into()),
        before: None,
    })])?;
    sync(&mut all)?;
    let top = ids(&ast(&all[0])?);
    assert!(!top.contains(&"sec".to_owned()), "the section is removed: {top:?}");
    assert!(top.contains(&"sum".to_owned()) && top.contains(&"body-1".to_owned()));
    assert_eq!(node(&all[0], "sum")?["type"], "breditor/paragraph");
    // body-2: both moves are root placements; the highest causal stamp chooses the slot.
    assert!(top.contains(&"body-2".to_owned()));
    for peer in &mut all {
        future(&p, peer)?;
    }
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn page_breaks_insert_at_the_root_only_and_delete_as_one_step() -> Result {
    let (p, mut all) = peers(2)?;
    let a = &mut all[0];
    let inserted = one_step(a, vec![page_break("pb2", Some("p2"))])?;
    assert_eq!(ids(&inserted), ["p1", "pb2", "p2", "p3", "sec", "pb", "tbl", "tail"]);
    assert_eq!(node(a, "pb2")?["type"], "breditor/page-break");
    let appended = one_step(a, vec![page_break("pb3", None)])?;
    assert_eq!(ids(&appended).last().map(String::as_str), Some("pb3"));
    // A before-anchor inside a section is not a root position: refused atomically.
    let before = a.checkpoint()?;
    assert!(a.apply(vec![page_break("pb4", Some("body-1"))]).is_err());
    assert_eq!(a.checkpoint()?, before);
    // Wrapping a page break into a section is refused by the frozen grammar.
    assert!(a.apply(vec![wrap("pb", "pb", "s-pb")]).is_err());
    assert_eq!(a.checkpoint()?, before);
    // Deleting a page break is one step; a non-page-break target is refused.
    let deleted = one_step(
        a,
        vec![Command::DeletePageBreak(DeletePageBreak { block: "pb".into(), paragraph: None })],
    )?;
    assert!(find(&deleted, "pb").is_none());
    assert!(
        a.apply(vec![Command::DeletePageBreak(DeletePageBreak {
            block: "p1".into(),
            paragraph: None
        })])
        .is_err()
    );
    future(&p, a)?;
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn a_sole_page_break_is_deleted_with_an_explicit_fresh_floor_paragraph() -> Result {
    let p = profile()?;
    let mut root = el("document", "unused", vec![el("page-break", "only", vec![])]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "101".into())?;
    assert!(
        a.apply(vec![Command::DeletePageBreak(DeletePageBreak {
            block: "only".into(),
            paragraph: None
        })])
        .is_err()
    );
    let after = one_step(
        &mut a,
        vec![Command::DeletePageBreak(DeletePageBreak {
            block: "only".into(),
            paragraph: Some("floor".into()),
        })],
    )?;
    assert_eq!(ids(&after), ["floor"]);
    assert_eq!(node(&a, "floor")?["type"], "breditor/paragraph");
    Ok(())
}

#[test]
fn a_page_break_insert_racing_a_wrap_of_its_anchor_stays_at_the_root() -> Result {
    let (p, mut all) = peers(3)?;
    all[0].apply(vec![page_break("pb2", Some("p2"))])?;
    all[1].apply(vec![wrap("p2", "p3", "s1")])?;
    all[2].apply(vec![page_break("pb3", Some("p3"))])?;
    sync(&mut all)?;
    let top = ids(&ast(&all[0])?);
    assert!(top.contains(&"pb2".to_owned()) && top.contains(&"pb3".to_owned()));
    assert_eq!(ids(&node(&all[0], "s1")?), ["s1-sum", "p2", "p3"]);
    assert_eq!(top[0], "p1");
    for peer in &mut all {
        future(&p, peer)?;
    }
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn the_slash_batch_removes_the_trigger_and_inserts_a_page_break_in_one_undo_step() -> Result {
    let (_, mut all) = peers(2)?;
    let a = &mut all[0];
    a.apply(vec![insert("p1", 3, "/page")])?;
    let typed = ast(a)?;
    let count = a.undo_count();
    let trigger = Command::DeleteText(DeleteText { block: "p1".into(), offset: 3, length: 5 });
    assert!(a.apply_with_state(
        vec![trigger, page_break("pb2", Some("p2"))],
        SelectionUpdate::Map,
        PendingFormatsUpdate::Map,
    )?);
    assert_eq!(a.undo_count(), count + 1);
    assert_eq!(plain(&node(a, "p1")?), "One");
    assert_eq!(ids(&ast(a)?)[..3], ["p1".to_owned(), "pb2".to_owned(), "p2".to_owned()]);
    assert!(a.undo()?);
    assert_eq!(ast(a)?, typed);
    sync(&mut all)?;
    assert_eq!(all[1].undo_count(), 0, "peers never gain a local Undo step");
    Ok(())
}

#[test]
fn table_captions_add_and_remove_as_one_step_and_rows_stay_before_the_caption() -> Result {
    let (p, mut all) = peers(2)?;
    let a = &mut all[0];
    let added = one_step(a, vec![add_caption("tbl", "cap")])?;
    let table = find(&added, "tbl").ok_or("table")?;
    assert_eq!(ids(table), ["tbl-row-r1", "tbl-row-r2", "cap"]);
    // As locally, an existing caption is refused, never replaced.
    assert!(a.apply(vec![add_caption("tbl", "cap-2")]).is_err());
    a.apply(vec![insert("cap", 0, "Totals")])?;
    a.apply(vec![Command::InsertRow(InsertRow {
        block: "tbl".into(),
        row_block: "tbl-row-r3".into(),
        row: "r3".into(),
        before: None,
    })])?;
    assert_eq!(ids(&node(a, "tbl")?), ["tbl-row-r1", "tbl-row-r2", "tbl-row-r3", "cap"]);
    let removed = one_step(a, vec![remove_caption("tbl")])?;
    assert_eq!(kinds(find(&removed, "tbl").ok_or("table")?), ["breditor/table-row"; 3]);
    // Removing an absent caption is an admitted no-op; non-table targets are refused.
    assert!(!a.apply(vec![remove_caption("tbl")])?);
    assert!(a.apply(vec![add_caption("p1", "cap-3")]).is_err());
    future(&p, a)?;
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn concurrent_caption_adds_show_one_caption_and_a_row_insert_stays_before_it() -> Result {
    let (p, mut all) = peers(3)?;
    all[0].apply(vec![add_caption("tbl", "cap-a")])?;
    all[0].apply(vec![insert("cap-a", 0, "A")])?;
    all[1].apply(vec![add_caption("tbl", "cap-b")])?;
    all[1].apply(vec![insert("cap-b", 0, "B")])?;
    all[2].apply(vec![Command::InsertRow(InsertRow {
        block: "tbl".into(),
        row_block: "tbl-row-r3".into(),
        row: "r3".into(),
        before: None,
    })])?;
    sync(&mut all)?;
    let table = node(&all[0], "tbl")?;
    assert_eq!(
        kinds(&table),
        ["breditor/table-row", "breditor/table-row", "breditor/table-row", "breditor/paragraph"]
    );
    let shown = ids(&table)[3].clone();
    assert!(shown == "cap-a" || shown == "cap-b");
    // Every peer may keep editing (the merge repair is not a new local repair).
    let writer = usize::from(shown == "cap-b");
    all[writer].apply(vec![insert(&shown, 1, "!")])?;
    sync(&mut all)?;
    // Removing the caption removes the hidden concurrent candidate too (as locally, the
    // table then has no caption); Undo brings back exactly the shown one.
    all[2].apply(vec![remove_caption("tbl")])?;
    sync(&mut all)?;
    assert_eq!(kinds(&node(&all[0], "tbl")?), ["breditor/table-row"; 3]);
    all[2].undo()?;
    sync(&mut all)?;
    assert_eq!(ids(&node(&all[0], "tbl")?)[3], shown);
    all[2].redo()?;
    sync(&mut all)?;
    // A later local add is admitted again (no visible caption, no new repair).
    all[2].apply(vec![add_caption("tbl", "cap-c")])?;
    sync(&mut all)?;
    assert_eq!(ids(&node(&all[0], "tbl")?)[3], "cap-c");
    for peer in &mut all {
        future(&p, peer)?;
    }
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn caption_removal_racing_typing_in_it_converges_and_undo_restores_the_typing() -> Result {
    let p = profile()?;
    let mut seed = root();
    seed["children"][5] = table("tbl", Some(para("cap", "Totals")));
    let a = p.create(&source(&p, &seed), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    let mut all = vec![a, b, c];
    all[0].apply(vec![remove_caption("tbl")])?;
    all[1].apply(vec![insert("cap", 6, " 2026")])?;
    all[2].apply(vec![Command::DeleteBlock(DeleteBlock { block: "pb".into() })])?;
    sync(&mut all)?;
    assert_eq!(kinds(&node(&all[0], "tbl")?), ["breditor/table-row"; 2]);
    // Undo of the removal shows the caption with the concurrent typing.
    all[0].undo()?;
    sync(&mut all)?;
    assert_eq!(plain(&node(&all[0], "cap")?), "Totals 2026");
    for peer in &mut all {
        future(&p, peer)?;
    }
    Ok(())
}

/// Enter at a collapsed summary caret (the local `enterDetailsBody`): one guarded batch
/// inserts a fresh first body paragraph and expands the section, places the caret there,
/// and is exactly one writer-local Undo step that restores the collapsed section.
#[test]
fn enter_at_a_collapsed_summary_expands_and_enters_the_body_in_one_undo_step() -> Result {
    let (p, mut all) = peers(2)?;
    let open =
        |value: bool| Command::SetDetailsOpen(SetDetailsOpen { block: "sec".into(), open: value });
    let enter = |open_too: bool| {
        let mut commands = vec![Command::InsertBlocks(InsertBlocks {
            parent: Some("sec".into()),
            before: Some("body-1".into()),
            nodes: vec![para("n", "")],
        })];
        if open_too {
            commands.push(open(true));
        }
        commands
    };
    {
        let a = &mut all[0];
        assert!(a.apply(vec![open(false)])?);
        a.set_selection(Some(&caret("sum", 2)))?;
        let collapsed = ast(a)?;
        let count = a.undo_count();
        assert!(a.apply_guarded(
            &a.observe()?,
            enter(true),
            SelectionUpdate::Set(Some(caret("n", 0))),
            PendingFormatsUpdate::Set(None),
        )?);
        assert_eq!(a.undo_count(), count + 1, "one Undo step, as locally");
        let section = node(a, "sec")?;
        assert_eq!(section["properties"]["breditor/details-open"], json!(true));
        assert_eq!(ids(&section), ["sum", "n", "body-1", "body-2"]);
        assert_eq!(plain(&node(a, "sum")?), "More", "the summary is never split");
        assert_eq!(a.selection()?, Some(caret("n", 0)));
        assert!(a.undo()?);
        assert_eq!(ast(a)?, collapsed);
        assert!(a.redo()?);
        assert_eq!(node(a, "sec")?["properties"]["breditor/details-open"], json!(true));
    }
    // A concurrent collapse by another writer and typing into the new paragraph converge.
    sync(&mut all)?;
    assert!(all[1].apply(vec![open(false)])?);
    assert!(all[0].apply(vec![insert("n", 0, "typed")])?);
    sync(&mut all)?;
    assert_eq!(plain(&node(&all[1], "n")?), "typed");
    assert_eq!(node(&all[1], "sec")?["properties"]["breditor/details-open"], Value::Null);
    // An open section takes the same batch without the open-state command.
    {
        let b = &mut all[1];
        assert!(b.undo()?);
        b.set_selection(Some(&caret("sum", 4)))?;
        let count = b.undo_count();
        let mut commands = enter(false);
        if let Command::InsertBlocks(insert) = &mut commands[0] {
            insert.nodes = vec![para("m", "")];
            insert.before = Some("n".into());
        }
        assert!(b.apply_guarded(
            &b.observe()?,
            commands,
            SelectionUpdate::Set(Some(caret("m", 0))),
            PendingFormatsUpdate::Set(None),
        )?);
        assert_eq!(b.undo_count(), count + 1);
        assert_eq!(ids(&node(b, "sec")?)[..3], ["sum".to_owned(), "m".to_owned(), "n".to_owned()]);
    }
    sync(&mut all)?;
    for peer in &mut all {
        future(&p, peer)?;
    }
    sync(&mut all)?;
    undo_all(&mut all)
}

#[test]
fn structure_commands_are_refused_by_v3_owners() -> Result {
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    let mut root = el("document", "unused", vec![para("p1", "One"), para("p2", "Two")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "101".into())?;
    let before = a.checkpoint()?;
    for command in [wrap("p1", "p2", "s1"), page_break("pb", None), add_caption("p1", "c")] {
        assert!(a.apply(vec![command]).is_err());
    }
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}
