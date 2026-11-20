//! Shared V4 block-field commands: ordered-list numbering, bookmarks with link-preserving
//! rename and internal links, and section open state. Every command is one owned field
//! (or one rename group) with the local V4 semantics, concurrent convergence, selective
//! Undo/Redo per writer and exact checkpoint replay.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{
            DeleteBlock, InsertText, ListStyle, ListStyleChange, OutdentListItems, RenameBookmark,
            SetBookmark, SetDetailsOpen, SetFormat, SetListKind, SetListNumbering, SplitTextBlock,
        },
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-v4-fields";
fn config(revision: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":revision,"schema":{"name":SCHEMA,"version":1},"extensions":[]}).to_string()
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_standard_configuration_json_v4(&config(4))?)
}
fn el(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut node = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    node["children"] = Value::Array(children);
    node
}
fn run(text: &str, formats: Vec<Value>) -> Value {
    let mut run = json!({"kind":"text","text":text,"formats":[]});
    run["formats"] = Value::Array(formats);
    run
}
fn para(id: &str, text: &str) -> Value {
    el("paragraph", id, if text.is_empty() { vec![] } else { vec![run(text, vec![])] })
}
fn link(href: &str) -> Value {
    json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":false}})
}
fn linked(id: &str, kind: &str, before: &str, target: &str) -> Value {
    el(kind, id, vec![run(before, vec![]), run("go", vec![link(&format!("#{target}"))])])
}
/// Bookmarks, internal links in a paragraph, a summary, a table caption and a cell, an
/// ordered list, a bullet list and an open section.
fn root() -> Value {
    let mut heading = el("heading", "intro", vec![run("Introduction", vec![])]);
    heading["properties"]["breditor/level"] = json!(1);
    heading["properties"]["breditor/bookmark"] = json!("intro");
    let mut other = para("other", "Other");
    other["properties"]["breditor/bookmark"] = json!("other");
    let item = |id: &str, text: &str| el("list-item", id, vec![para(&format!("{id}-text"), text)]);
    let mut list = el("ordered-list", "list", vec![item("a", "alpha"), item("b", "beta")]);
    list["properties"]["breditor/start"] = json!(3);
    let bullets = el("bullet-list", "bullets", vec![item("c", "gamma")]);
    let mut details = el(
        "details",
        "sec",
        vec![
            linked("sum", "details-summary", "More ", "intro"),
            para("body-1", "Body one"),
            para("body-2", "Body two"),
        ],
    );
    details["properties"]["breditor/details-open"] = json!(true);
    let cell = |row: &str, column: &str, body: Value| {
        let mut cell = el("table-cell", &format!("cell-{row}-{column}"), vec![body]);
        cell["properties"]["breditor/column-id"] = json!(column);
        cell["properties"]["breditor/header"] = json!(false);
        cell
    };
    let mut row = el(
        "table-row",
        "row-r1",
        vec![
            cell("r1", "c1", linked("p-r1-c1", "paragraph", "Cell ", "intro")),
            cell("r1", "c2", para("p-r1-c2", "x")),
        ],
    );
    row["properties"]["breditor/row-id"] = json!("r1");
    let mut table =
        el("table", "table", vec![row, linked("tcap", "paragraph", "Caption ", "intro")]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"c1","width":160},{"id":"c2","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut root = el(
        "document",
        "unused",
        vec![
            heading,
            linked("people", "paragraph", "See ", "intro"),
            other,
            list,
            bullets,
            details,
            table,
            para("tail", "Tail"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn source(p: &SharedRichProfile, root: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":SCHEMA,"version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string()
}
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica, RichReplica)> {
    let p = profile()?;
    let a = p.create(&source(&p, &root()), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    Ok((p, a, b, c))
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
fn prop(a: &RichReplica, id: &str, name: &str) -> Result<Value> {
    Ok(node(a, id)?["properties"][format!("breditor/{name}")].clone())
}
/// Every internal link href of one text block, in run order.
fn hrefs(a: &RichReplica, id: &str) -> Result<Vec<String>> {
    Ok(node(a, id)?["children"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|run| run["formats"].as_array().cloned().unwrap_or_default())
        .filter_map(|f| f["properties"]["breditor-inline/href"].as_str().map(str::to_owned))
        .collect())
}
const LINKED: [&str; 4] = ["people", "sum", "p-r1-c1", "tcap"];
fn all_hrefs(a: &RichReplica) -> Result<Vec<Vec<String>>> {
    LINKED.iter().map(|id| hrefs(a, id)).collect()
}
fn sync(peers: &mut [&mut RichReplica]) -> Result {
    let frames =
        peers.iter().map(|p| p.update_frame()).collect::<std::result::Result<Vec<_>, _>>()?;
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
            assert_eq!(a.document_json(), b.document_json());
        }
    }
    Ok(())
}
fn undo_all(a: &mut RichReplica) -> Result {
    while a.undo()? {}
    Ok(())
}
fn numbering(list: &str, style: ListStyleChange, reversed: Option<bool>) -> Command {
    Command::SetListNumbering(SetListNumbering { list: list.into(), style, reversed })
}
fn style(token: &str) -> ListStyleChange {
    ListStyleChange::Set(token.into())
}
fn bookmark(block: &str, name: Option<&str>) -> Command {
    Command::SetBookmark(SetBookmark { block: block.into(), name: name.map(str::to_owned) })
}
fn rename(from: &str, to: &str) -> Command {
    Command::RenameBookmark(RenameBookmark { from: from.into(), to: to.into() })
}
fn open(block: &str, open: bool) -> Command {
    Command::SetDetailsOpen(SetDetailsOpen { block: block.into(), open })
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn message(result: std::result::Result<bool, breditor_collaboration::Error>) -> String {
    result.err().map(|error| error.to_string()).unwrap_or_default()
}
fn index(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(&a.bookmark_index_json(&a.observe()?)?)?)
}

#[test]
fn wire_shapes_are_closed_snake_case_commands() -> Result {
    let parsed: Vec<Command> = serde_json::from_value(json!([
        {"kind":"set_list_numbering","data":{"list":"list","style":{"set":"lower-alpha"},"reversed":null}},
        {"kind":"set_list_numbering","data":{"list":"list","style":"clear","reversed":true}},
        {"kind":"set_bookmark","data":{"block":"tail","name":null}},
        {"kind":"rename_bookmark","data":{"from":"a","to":"b"}},
        {"kind":"set_details_open","data":{"block":"sec","open":false}},
    ]))?;
    assert_eq!(parsed[0], numbering("list", style("lower-alpha"), None));
    assert_eq!(parsed[1], numbering("list", ListStyleChange::Clear, Some(true)));
    for bad in [
        json!({"kind":"set_list_numbering","data":{"list":"list","style":"keep"}}),
        json!({"kind":"set_list_numbering","data":{"list":"l","style":"keep","reversed":null,"start":2}}),
        json!({"kind":"set_bookmark","data":{"block":"tail"}}),
        json!({"kind":"set_details_open","data":{"block":"sec","open":null}}),
    ] {
        assert!(serde_json::from_value::<Command>(bad).is_err());
    }
    Ok(())
}

#[test]
fn list_numbering_merges_disjoint_fields_orders_same_field_and_undoes_per_writer() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    let seed = a.document_json().to_owned();
    // Disjoint fields from two writers merge.
    assert!(a.apply(vec![numbering("list", style("lower-alpha"), None)])?);
    assert!(b.apply(vec![numbering("list", ListStyleChange::Keep, Some(true))])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(
        (prop(&a, "list", "list-style")?, prop(&a, "list", "list-reversed")?),
        (json!(2), json!(true))
    );
    // The same field from three writers: one deterministic winner on every peer.
    assert!(a.apply(vec![numbering("list", style("upper-roman"), None)])?);
    assert!(b.apply(vec![numbering("list", style("lower-roman"), None)])?);
    assert!(c.apply(vec![numbering("list", ListStyleChange::Clear, None)])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    let winner = prop(&a, "list", "list-style")?;
    assert!([json!(5), json!(4), Value::Null].contains(&winner));
    // Selective Undo of each writer converges, removing only that writer's choice.
    assert!(c.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert!(b.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(
        prop(&a, "list", "list-style")?,
        json!(5),
        "only the first writer's last style is left"
    );
    assert!(b.redo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    // A start change rides in the same group as numbering: one Undo step for both.
    let undo = a.undo_count();
    assert!(a.apply(vec![
        Command::SetListKind(SetListKind {
            container: "list".into(),
            style: ListStyle::Ordered { start: 9 }
        }),
        numbering("list", ListStyleChange::Keep, Some(false)),
    ])?);
    assert_eq!(a.undo_count(), undo + 1);
    assert_eq!(prop(&a, "list", "start")?, json!(9));
    assert_eq!(prop(&a, "list", "list-reversed")?, Value::Null);
    // An exact no-op publishes nothing; the native rules refuse the rest.
    assert!(!a.apply(vec![numbering("list", ListStyleChange::Keep, Some(false))])?);
    for refused in [
        numbering("bullets", style("decimal"), None),
        numbering("list", ListStyleChange::Keep, None),
        numbering("list", style("disc"), None),
        numbering("a", style("decimal"), None),
    ] {
        assert!(a.apply(vec![refused]).is_err());
    }
    future(&p, &mut a)?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Converting to bullets keeps the causal fields (never projected); converting back shows them.
    let before = node(&a, "list")?;
    a.apply(vec![Command::SetListKind(SetListKind {
        container: "list".into(),
        style: ListStyle::Bullet,
    })])?;
    assert_eq!(prop(&a, "list", "list-style")?, Value::Null);
    a.undo()?;
    assert_eq!(node(&a, "list")?, before);
    for peer in [&mut a, &mut b, &mut c] {
        undo_all(peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(a.document_json(), seed);
    Ok(())
}

#[test]
fn bookmarks_set_replace_clear_and_refuse_duplicates_with_a_clear_error() -> Result {
    let (p, mut a, mut b, _) = setup()?;
    let error = message(a.apply(vec![bookmark("tail", Some("intro"))]));
    assert!(error.contains("bookmark name is already used"), "{error}");
    assert!(message(a.apply(vec![bookmark("list", Some("x"))])).contains("target kind"));
    assert!(message(a.apply(vec![bookmark("sum", Some("x"))])).contains("target kind"));
    assert!(a.apply(vec![bookmark("tail", Some("9bad"))]).is_err());
    assert!(a.apply(vec![bookmark("tail", Some("end"))])?);
    assert!(!a.apply(vec![bookmark("tail", Some("end"))])?, "the current name is a no-op");
    assert!(a.apply(vec![bookmark("tail", Some("finish"))])?, "replace");
    // Clearing the referenced anchor leaves its links dangling, reported by the index.
    assert!(a.apply(vec![bookmark("intro", None)])?);
    let read = index(&a)?;
    assert_eq!(
        read["bookmarks"],
        json!([{"name":"other","block":"other"},{"name":"finish","block":"tail"}])
    );
    assert_eq!(read["brokenLinks"].as_array().map(Vec::len), Some(4));
    assert_eq!(all_hrefs(&a)?, vec![vec!["#intro".to_owned()]; 4], "links are never rewritten");
    // Splitting keeps the bookmark on the left identity; the right block has none.
    a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "tail".into(),
        offset: 2,
        right: "tail-right".into(),
        right_heading: None,
    })])?;
    assert_eq!(prop(&a, "tail", "bookmark")?, json!("finish"));
    assert_eq!(prop(&a, "tail-right", "bookmark")?, Value::Null);
    // Bookmarks on a code block and inside a list item and a table cell are admitted.
    assert!(a.apply(vec![bookmark("a-text", Some("item")), bookmark("p-r1-c2", Some("cell"))])?);
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut a)?;
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(prop(&b, "a-text", "bookmark")?, json!("item"));
    Ok(())
}

#[test]
fn concurrent_bookmark_edits_converge_and_equal_names_keep_the_first_in_document_order() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    let seed = a.document_json().to_owned();
    // Same name on two blocks concurrently: both are admitted locally; the merge
    // keeps the first block in document order.
    assert!(a.apply(vec![bookmark("tail", Some("shared"))])?);
    assert!(b.apply(vec![bookmark("body-1", Some("shared"))])?);
    // Same field concurrently on one block: one deterministic winner.
    assert!(c.apply(vec![bookmark("other", Some("c-name"))])?);
    assert!(b.apply(vec![bookmark("other", None)])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "body-1", "bookmark")?, json!("shared"));
    assert_eq!(prop(&a, "tail", "bookmark")?, Value::Null);
    let other = prop(&a, "other", "bookmark")?;
    assert!(other == json!("c-name") || other.is_null());
    // A local set of the merged name is now refused with the clear error.
    assert!(message(c.apply(vec![bookmark("p-r1-c2", Some("shared"))])).contains("already used"));
    // Undo of the winning writer makes the retained later name visible again.
    assert!(b.undo()?);
    assert!(b.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "tail", "bookmark")?, json!("shared"));
    assert_eq!(prop(&a, "other", "bookmark")?, json!("c-name"));
    future(&p, &mut b)?;
    for peer in [&mut a, &mut b, &mut c] {
        undo_all(peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(a.document_json(), seed);
    Ok(())
}

#[test]
fn rename_retargets_every_internal_link_in_one_undo_step() -> Result {
    let (p, mut a, mut b, _) = setup()?;
    let seed = a.document_json().to_owned();
    let undo = a.undo_count();
    assert!(a.apply(vec![rename("intro", "start")])?);
    assert_eq!(a.undo_count(), undo + 1);
    assert_eq!(prop(&a, "intro", "bookmark")?, json!("start"));
    assert_eq!(all_hrefs(&a)?, vec![vec!["#start".to_owned()]; 4]);
    assert_eq!(index(&a)?["brokenLinks"], json!([]));
    // Missing source, taken target and invalid names are refused; from == to is a no-op.
    assert!(message(a.apply(vec![rename("nope", "x")])).contains("does not exist"));
    assert!(message(a.apply(vec![rename("start", "other")])).contains("already used"));
    assert!(a.apply(vec![rename("start", "-x")]).is_err());
    assert!(!a.apply(vec![rename("start", "start")])?);
    sync(&mut [&mut a, &mut b])?;
    assert!(a.undo()?);
    assert_eq!(a.document_json(), seed, "one Undo restores the anchor and every link");
    assert!(a.redo()?);
    assert_eq!(all_hrefs(&a)?, vec![vec!["#start".to_owned()]; 4]);
    future(&p, &mut a)?;
    // A link created to the bookmark later is renamed by the next rename, also in a summary.
    let summary_length = u32::try_from("More go".len())?;
    a.apply(vec![
        Command::InsertText(InsertText { block: "body-2".into(), offset: 0, text: "Jump ".into() }),
        Command::SetFormat(SetFormat {
            block: "body-2".into(),
            offset: 0,
            length: 4,
            format: json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":"#start","breditor-inline/new-window":false}}),
            enabled: true,
        }),
    ])?;
    assert!(a.apply(vec![rename("start", "begin")])?);
    assert_eq!(hrefs(&a, "body-2")?, ["#begin"]);
    assert_eq!(hrefs(&a, "sum")?, ["#begin"]);
    assert_eq!(node(&a, "sum")?["children"].as_array().map(Vec::len), Some(2));
    assert!(summary_length > 0);
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut b)?;
    Ok(())
}

#[test]
fn internal_links_converge_under_concurrent_rename_removal_and_new_links() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    // Two concurrent renames: the field and every link follow one causal winner.
    assert!(a.apply(vec![rename("intro", "alpha")])?);
    assert!(b.apply(vec![rename("intro", "beta")])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    let name = prop(&a, "intro", "bookmark")?;
    let target = format!("#{}", name.as_str().ok_or("renamed")?);
    assert!(target == "#alpha" || target == "#beta");
    assert_eq!(all_hrefs(&a)?, vec![vec![target.clone()]; 4]);
    assert_eq!(index(&a)?["brokenLinks"], json!([]));
    // Undo of each writer converges back to the seed name and links.
    assert!(a.undo()?);
    assert!(b.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "intro", "bookmark")?, json!("intro"));
    assert_eq!(all_hrefs(&a)?, vec![vec!["#intro".to_owned()]; 4]);
    // Rename concurrent with removal and with a new link to the old name.
    assert!(a.apply(vec![rename("intro", "gamma")])?);
    assert!(b.apply(vec![bookmark("intro", None)])?);
    assert!(c.apply(vec![Command::SetFormat(SetFormat {
        block: "tail".into(),
        offset: 0,
        length: 4,
        format: json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":"#intro","breditor-inline/new-window":false}}),
        enabled: true,
    })])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Every peer agrees; the concurrent new link was not seen by the rename, so it
    // dangles exactly as in the local model after a rename.
    assert_eq!(hrefs(&a, "tail")?, ["#intro"]);
    let read = index(&a)?;
    assert!(
        read["brokenLinks"]
            .as_array()
            .is_some_and(|links| links.iter().any(|l| l["block"] == "tail"))
    );
    // Removing the bookmarked block entirely leaves links dangling, never refused.
    assert!(c.apply(vec![Command::DeleteBlock(DeleteBlock { block: "intro".into() })])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(index(&a)?["bookmarks"], json!([{"name":"other","block":"other"}]));
    assert_eq!(
        index(&a)?["links"].as_array().map(Vec::len),
        index(&a)?["brokenLinks"].as_array().map(Vec::len)
    );
    for peer in [&mut a, &mut b, &mut c] {
        future(&p, peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    Ok(())
}

#[test]
fn section_open_state_is_one_owned_field_and_collapsing_moves_a_hidden_selection() -> Result {
    let (p, mut a, mut b, mut c) = setup()?;
    let seed = a.document_json().to_owned();
    // Collapse with the caret in the body: the caret moves to the summary end.
    a.set_selection(Some(&caret("body-2", 3)))?;
    assert!(a.set_details_open_guarded(&a.observe()?, "sec", false)?);
    assert_eq!(prop(&a, "sec", "details-open")?, Value::Null);
    assert_eq!(
        a.selection()?,
        Some(caret("sum", u32::try_from("More go".encode_utf16().count())?))
    );
    // The current state is an admitted no-op; a caret in the summary stays.
    assert!(!a.set_details_open_guarded(&a.observe()?, "sec", false)?);
    a.set_selection(Some(&caret("sum", 1)))?;
    assert!(a.set_details_open_guarded(&a.observe()?, "sec", true)?);
    assert!(a.set_details_open_guarded(&a.observe()?, "sec", false)?);
    assert_eq!(a.selection()?, Some(caret("sum", 1)));
    assert!(a.set_details_open_guarded(&a.observe()?, "tail", true).is_err());
    assert!(a.apply(vec![open("body-1", true)]).is_err());
    // Concurrent same-field edits converge and Undo removes only its writer's choice.
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&b, "sec", "details-open")?, Value::Null);
    assert!(b.apply(vec![open("sec", true)])?);
    assert!(c.apply(vec![open("sec", true)])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert!(b.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "sec", "details-open")?, json!(true), "the other writer still expands it");
    assert!(c.undo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "sec", "details-open")?, Value::Null);
    assert!(b.redo()?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "sec", "details-open")?, json!(true));
    // Disjoint fields merge: hidden-body typing and a concurrent collapse.
    assert!(b.apply(vec![Command::InsertText(InsertText {
        block: "body-1".into(),
        offset: 0,
        text: "Hidden ".into()
    })])?);
    assert!(c.apply(vec![open("sec", false)])?);
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(prop(&a, "sec", "details-open")?, Value::Null);
    assert!(
        node(&a, "body-1")?["children"][0]["text"]
            .as_str()
            .is_some_and(|t| t.starts_with("Hidden "))
    );
    for peer in [&mut a, &mut b, &mut c] {
        future(&p, peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    for peer in [&mut a, &mut b, &mut c] {
        undo_all(peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(a.document_json(), seed);
    Ok(())
}

#[test]
fn block_fields_refuse_older_languages() -> Result {
    let p = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    let item = el("list-item", "i", vec![para("i-text", "x")]);
    let mut list = el("ordered-list", "list", vec![item]);
    list["properties"]["breditor/start"] = json!(1);
    let mut root = el("document", "unused", vec![para("p", "Text"), list]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "101".into())?;
    for command in
        [numbering("list", style("decimal"), None), bookmark("p", Some("x")), rename("x", "y")]
    {
        assert!(message(a.apply(vec![command])).contains("model 14"));
    }
    assert!(a.set_details_open_guarded(&a.observe()?, "p", true).is_err());
    assert!(a.bookmark_index_json(&a.observe()?).is_err());
    Ok(())
}

/// Splitting a styled, reversed ordered list (top-level outdent of a middle item) gives
/// the fresh tail list the same style and counting order, as the local V4 owner does.
#[test]
fn splitting_an_ordered_list_copies_style_and_reversal_to_the_tail() -> Result {
    let p = profile()?;
    let item = |id: &str, text: &str| el("list-item", id, vec![para(&format!("{id}-text"), text)]);
    let mut list =
        el("ordered-list", "ol", vec![item("x", "one"), item("y", "two"), item("z", "three")]);
    list["properties"]["breditor/start"] = json!(9);
    let mut root = el("document", "unused", vec![list, para("end", "End")]);
    root["properties"] = json!({"breditor/document-id":"room"});
    let mut a = p.create(&source(&p, &root), "101".into())?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let seed = a.document_json().to_owned();
    assert!(a.apply(vec![numbering("ol", style("upper-alpha"), Some(true))])?);
    assert!(a.apply(vec![Command::OutdentListItems(OutdentListItems {
        container: "ol".into(),
        first: "y".into(),
        last: "y".into(),
        fresh_tail: Some("ol-tail".into()),
    })])?);
    assert_eq!(
        (prop(&a, "ol-tail", "list-style")?, prop(&a, "ol-tail", "list-reversed")?),
        (json!(3), json!(true))
    );
    assert_eq!(prop(&a, "ol-tail", "start")?, json!(7));
    sync(&mut [&mut a, &mut b])?;
    // A later style change on the prefix does not touch the tail.
    assert!(b.apply(vec![numbering("ol", style("lower-roman"), None)])?);
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(prop(&a, "ol-tail", "list-style")?, json!(3));
    future(&p, &mut a)?;
    for peer in [&mut a, &mut b] {
        undo_all(peer)?;
    }
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(a.document_json(), seed);
    Ok(())
}
