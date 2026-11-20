//! Explicit candidate V4 bookmarks and internal links: grammar, uniqueness, actions
//! (set, clear, link-retargeting rename), reference integrity, history and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        decode_rich_rename_bookmark_command, decode_rich_set_bookmark_command,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, ChangeId, ReplicaId, RichBookmarkError, RichBookmarkIndex,
        RichBookmarkName, RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator,
        RichClipboardIdentityKind, RichDocument, RichFlowParent, RichFlowPosition,
        RichLocalOutcome, RichLocalSession, RichSelection, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint,
        actions::{
            InsertBlocks, RichAction, RichActionError, SetBookmark, SetHeading, SplitTextBlock,
        },
        internal_link_name, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Candidate V4 fingerprint for schema `example/layout@1` with the standard inline preset,
/// pinned after the bookmark slice (paragraph, heading and code block at revision 2).
const V4_FINGERPRINT: &str =
    "sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372";

fn schema(revision: u32) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn context(revision: u32) -> Result<EditorContext> {
    Ok(EditorContext::new(schema(revision)?, DocumentLimits::default()))
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
fn encode(c: &EditorContext, d: &RichDocument) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?,
    )?["root"]
        .clone())
}
fn document(children: Vec<Value>) -> Value {
    let mut root = fixture::element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn with_bookmark(mut node: Value, name: &str) -> Value {
    node["properties"]["breditor/bookmark"] = json!(name);
    node
}
fn heading(id: &str, text: &str) -> Value {
    let mut node = fixture::paragraph(id, text);
    node["type"] = json!("breditor/heading");
    node["properties"]["breditor/level"] = json!(2);
    node
}
fn link_text(text: &str, href: &str, new_window: bool) -> Value {
    json!({"kind":"text","text":text,"formats":[{"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":new_window}}]})
}
/// `See ` + link `intro` → `#intro` + `.`
fn linking(id: &str, href: &str) -> Value {
    fixture::element(
        "paragraph",
        id,
        vec![
            json!({"kind":"text","text":"See ","formats":[]}),
            link_text("intro", href, false),
            json!({"kind":"text","text":".","formats":[]}),
        ],
    )
}
/// Heading `h` bookmarked `intro`, paragraph `p` linking to it, a section whose summary
/// links to it too, and a trailing paragraph `q`.
fn root() -> Value {
    let summary = fixture::element(
        "details-summary",
        "sum",
        vec![link_text("Back to intro", "#intro", false)],
    );
    let section = fixture::element("details", "sec", vec![summary, fixture::paragraph("body", "")]);
    document(vec![
        with_bookmark(heading("h", "Introduction"), "intro"),
        linking("p", "#intro"),
        section,
        fixture::paragraph("q", "Tail"),
    ])
}
fn id(value: &str) -> Result<BlockId> {
    Ok(BlockId::try_new(value)?)
}
fn name(value: &str) -> Result<RichBookmarkName> {
    Ok(RichBookmarkName::try_new(value)?)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(id(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn caret(block: &str) -> Result<RichSelectionKind> {
    let point = point(block, 0)?;
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn owner(c: &EditorContext, raw: &Value) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(caret("q")?),
        HistoryCapacity::default(),
    )?)
}
fn run(a: &mut RichLocalSession, action: SetBookmark) -> Result<RichLocalOutcome> {
    Ok(a.dispatch(&a.snapshot(), &[RichAction::SetBookmark(action)], RichSelectionUpdate::Map)?)
}
fn set(a: &mut RichLocalSession, block: &str, value: Option<&str>) -> Result<RichLocalOutcome> {
    let value = value.map(name).transpose()?;
    let action = SetBookmark::capture(a.state().document(), &id(block)?, value.as_ref())?;
    run(a, action)
}
fn index(c: &EditorContext, a: &RichLocalSession) -> Result<RichBookmarkIndex> {
    Ok(RichBookmarkIndex::read(c, a.state().document())?)
}
fn names(index: &RichBookmarkIndex) -> Vec<(String, String)> {
    index
        .bookmarks()
        .iter()
        .map(|entry| (entry.name().as_str().to_owned(), entry.block().as_str().to_owned()))
        .collect()
}
fn broken(index: &RichBookmarkIndex) -> Vec<(String, String)> {
    index
        .broken_links()
        .iter()
        .map(|link| (link.block().as_str().to_owned(), link.target().as_str().to_owned()))
        .collect()
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_bookmarks() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_bookmarks());
    }
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT);
    assert!(d.supports_rich_bookmarks() && d.supports_rich_page_breaks());
    Ok(())
}

#[test]
fn bookmark_names_are_bounded_unique_and_only_on_text_blocks_in_v4() -> Result {
    let c = context(4)?;
    // Paragraph, heading and code block admit a bookmark; names are case-sensitive.
    let code = with_bookmark(fixture::element("code-block", "code", vec![]), "Code_1");
    let ok = document(vec![
        with_bookmark(fixture::paragraph("p", "a"), "intro"),
        with_bookmark(heading("h", "b"), "Intro"),
        code,
    ]);
    admit(&c, &ok)?;
    for good in ["a", "Z9", "section-2", "a_b", &"a".repeat(64)] {
        admit(&c, &document(vec![with_bookmark(fixture::paragraph("p", "a"), good)]))?;
    }
    for bad in ["", "1a", "-a", "a b", "a.b", "é", "a#b", &"a".repeat(65)] {
        let raw = document(vec![with_bookmark(fixture::paragraph("p", "a"), bad)]);
        assert!(admit(&c, &raw).is_err(), "{bad:?}");
    }
    let mut wrong = document(vec![with_bookmark(fixture::paragraph("p", "a"), "x")]);
    wrong["children"][0]["properties"]["breditor/bookmark"] = json!(7);
    assert!(admit(&c, &wrong).is_err());
    // Uniqueness: one name per document, including blocks nested in containers.
    let duplicate = document(vec![
        with_bookmark(fixture::paragraph("p", "a"), "dup"),
        fixture::element(
            "blockquote",
            "bq",
            vec![with_bookmark(fixture::paragraph("r", "b"), "dup")],
        ),
    ]);
    assert!(admit(&c, &duplicate).is_err());
    // Other kinds never carry one.
    let list = with_bookmark(
        fixture::element(
            "bullet-list",
            "l",
            vec![fixture::element("list-item", "li", vec![fixture::paragraph("lp", "x")])],
        ),
        "list",
    );
    assert!(admit(&c, &document(vec![list])).is_err());
    let summary = with_bookmark(fixture::element("details-summary", "s", vec![]), "sum");
    let section = fixture::element("details", "d", vec![summary, fixture::paragraph("b", "")]);
    assert!(admit(&c, &document(vec![section])).is_err());
    // V1–V3 reject the property everywhere.
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        let raw = document(vec![with_bookmark(fixture::paragraph("p", "a"), "intro")]);
        assert!(admit(&old, &raw).is_err());
    }
    Ok(())
}

#[test]
fn internal_link_targets_are_a_separate_bounded_grammar_in_v4_only() -> Result {
    let c = context(4)?;
    // A dangling internal link is admitted (reported, not refused).
    admit(&c, &document(vec![linking("p", "#nowhere")]))?;
    for bad in ["#", "#1a", "#a b", "#a.b", "##a", "#é"] {
        assert!(admit(&c, &document(vec![linking("p", bad)])).is_err(), "{bad:?}");
    }
    // An internal link never opens a new window.
    let new_window =
        document(vec![fixture::element("paragraph", "p", vec![link_text("x", "#intro", true)])]);
    assert!(admit(&c, &new_window).is_err());
    // External targets keep their unchanged policy (core checks only declared shape).
    admit(&c, &document(vec![linking("p", "https://example.com/#a b")]))?;
    // V1–V3 keep their exact admission: `#` hrefs are just bounded strings there.
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        admit(&old, &document(vec![linking("p", "#1a")]))?;
    }
    assert_eq!(internal_link_name("#intro"), Some("intro"));
    assert_eq!(internal_link_name("#1"), None);
    Ok(())
}

#[test]
fn index_reports_bookmarks_links_and_broken_links_in_document_order() -> Result {
    let c = context(4)?;
    let mut raw = root();
    raw["children"].as_array_mut().ok_or("children")?.push(linking("dangling", "#missing"));
    let a = owner(&c, &raw)?;
    let read = index(&c, &a)?;
    assert_eq!(names(&read), [("intro".to_owned(), "h".to_owned())]);
    let links: Vec<_> = read
        .links()
        .iter()
        .map(|link| (link.block().as_str().to_owned(), link.target().as_str().to_owned()))
        .collect();
    assert_eq!(
        links,
        [
            ("p".to_owned(), "intro".to_owned()),
            ("sum".to_owned(), "intro".to_owned()),
            ("dangling".to_owned(), "missing".to_owned()),
        ]
    );
    assert_eq!(broken(&read), [("dangling".to_owned(), "missing".to_owned())]);
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        let b = owner(&old, &document(vec![fixture::paragraph("q", "x")]))?;
        assert_eq!(
            RichBookmarkIndex::read(&old, b.state().document()),
            Err(RichBookmarkError::Profile)
        );
    }
    Ok(())
}

#[test]
fn set_replace_and_clear_are_one_history_group_each_with_exact_undo_and_restore() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    let original = encode(&c, a.state().document())?;
    assert_eq!(set(&mut a, "q", Some("tail"))?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let set_once = encode(&c, a.state().document())?;
    assert_eq!(set_once["children"][3]["properties"]["breditor/bookmark"], "tail");
    assert_eq!(set_once["children"][3]["children"], original["children"][3]["children"]);
    assert_eq!(a.state().document().bookmark(&id("q")?), Some(name("tail")?));
    // Identical value: admitted exact no-op.
    assert_eq!(set(&mut a, "q", Some("tail"))?, RichLocalOutcome::Unchanged);
    assert_eq!(a.undo_depth(), 1);
    // A name held by another block is refused before any edit.
    let err = SetBookmark::capture(a.state().document(), &id("q")?, Some(&name("intro")?))
        .err()
        .ok_or("accepted")?;
    assert!(matches!(err, RichActionError::Bookmark(RichBookmarkError::Duplicate)));
    // Replacing with set does not touch links.
    assert_eq!(set(&mut a, "q", Some("end"))?, RichLocalOutcome::ContentCommitted);
    let replaced = encode(&c, a.state().document())?;
    assert_eq!(replaced["children"][1], original["children"][1]);
    // Checkpoint restore keeps the document and history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, replaced);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, set_once);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, original);
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, set_once);
    // Clear is one group; clearing again is a no-op.
    assert_eq!(set(&mut a, "q", None)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(encode(&c, a.state().document())?, original);
    assert_eq!(set(&mut a, "q", None)?, RichLocalOutcome::Unchanged);
    // Targets: only paragraphs, headings and code blocks.
    for target in ["sec", "sum", "nope"] {
        let err = SetBookmark::capture(a.state().document(), &id(target)?, Some(&name("x")?))
            .err()
            .ok_or("accepted")?;
        assert!(matches!(err, RichActionError::Bookmark(RichBookmarkError::Target)), "{target}");
    }
    Ok(())
}

#[test]
fn rename_retargets_every_internal_link_in_one_group() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    let original = encode(&c, a.state().document())?;
    let action = SetBookmark::rename(a.state().document(), &name("intro")?, &name("start")?)?;
    assert_eq!(run(&mut a, action)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let renamed = encode(&c, a.state().document())?;
    assert_eq!(renamed["children"][0]["properties"]["breditor/bookmark"], "start");
    let href = |value: &Value| value["formats"][0]["properties"]["breditor-inline/href"].clone();
    assert_eq!(href(&renamed["children"][1]["children"][1]), "#start");
    assert_eq!(href(&renamed["children"][2]["children"][0]["children"][0]), "#start");
    // Text, other formats and the trailing paragraph are untouched.
    assert_eq!(renamed["children"][1]["children"][0], original["children"][1]["children"][0]);
    assert_eq!(renamed["children"][3], original["children"][3]);
    assert!(index(&c, &a)?.broken_links().is_empty());
    // One Undo restores anchor and links together; Redo re-applies both.
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, original);
    a.redo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, renamed);
    // Same name: exact no-op. Missing source and taken destination are refused.
    let same = SetBookmark::rename(a.state().document(), &name("start")?, &name("start")?)?;
    assert_eq!(run(&mut a, same)?, RichLocalOutcome::Unchanged);
    let missing = SetBookmark::rename(a.state().document(), &name("intro")?, &name("x")?);
    assert!(matches!(missing, Err(RichActionError::Bookmark(RichBookmarkError::Missing))));
    set(&mut a, "q", Some("tail"))?;
    let taken = SetBookmark::rename(a.state().document(), &name("start")?, &name("tail")?);
    assert!(matches!(taken, Err(RichActionError::Bookmark(RichBookmarkError::Duplicate))));
    // Renaming a bookmark nobody links to touches only its block.
    let lone = SetBookmark::rename(a.state().document(), &name("tail")?, &name("end")?)?;
    run(&mut a, lone)?;
    assert_eq!(encode(&c, a.state().document())?["children"][1], renamed["children"][1]);
    Ok(())
}

#[test]
fn removing_or_clearing_a_target_leaves_reported_dangling_links() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    // Clearing the referenced bookmark is allowed: links dangle and are reported.
    set(&mut a, "h", None)?;
    assert_eq!(
        broken(&index(&c, &a)?),
        [("p".to_owned(), "intro".to_owned()), ("sum".to_owned(), "intro".to_owned())]
    );
    a.undo(&a.snapshot())?;
    assert!(index(&c, &a)?.broken_links().is_empty());
    // A range join keeps the left block and its anchor.
    let join = RichSelectionKind::TextRange { anchor: point("h", 12)?, focus: point("p", 0)? };
    a.replace_general_range_plain_text(&a.snapshot(), &join, "", &[])?;
    assert_eq!(names(&index(&c, &a)?), [("intro".to_owned(), "h".to_owned())]);
    a.undo(&a.snapshot())?;
    // Deleting the bookmarked block through an ordinary range edit is never refused.
    let mut raw = root();
    raw["children"].as_array_mut().ok_or("children")?.insert(0, fixture::paragraph("lead", "Lead"));
    let mut a = owner(&c, &raw)?;
    let across = RichSelectionKind::TextRange { anchor: point("lead", 4)?, focus: point("p", 0)? };
    a.replace_general_range_plain_text(&a.snapshot(), &across, "", &[])?;
    let read = index(&c, &a)?;
    assert!(read.bookmarks().is_empty());
    assert_eq!(broken(&read).len(), 2);
    // Undo restores the anchor and the links are whole again.
    a.undo(&a.snapshot())?;
    assert!(index(&c, &a)?.broken_links().is_empty());
    Ok(())
}

#[test]
fn bookmarks_travel_with_kind_changes_and_stay_left_on_split() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    // Heading → paragraph → heading keeps the anchor.
    let to_paragraph = SetHeading::capture(a.state().document(), &id("h")?, None)?;
    a.dispatch(&a.snapshot(), &[RichAction::SetHeading(to_paragraph)], RichSelectionUpdate::Map)?;
    assert_eq!(a.state().document().bookmark(&id("h")?), Some(name("intro")?));
    // Splitting keeps the anchor on the identity that stays; the new right block has none.
    let split =
        SplitTextBlock::capture(a.state().document(), &point("h", 5)?, &id("right")?, None)?;
    a.dispatch(&a.snapshot(), &[RichAction::SplitTextBlock(split)], RichSelectionUpdate::Map)?;
    assert_eq!(a.state().document().bookmark(&id("h")?), Some(name("intro")?));
    assert_eq!(a.state().document().bookmark(&id("right")?), None);
    assert!(index(&c, &a)?.broken_links().is_empty());
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
        Ok(format!("paste-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            1,
            ChangeId::new(ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?, 1),
        ))
    }
}

#[test]
fn pasted_blocks_never_carry_bookmarks_and_v3_refuses_the_record() -> Result {
    let c = context(4)?;
    let raw = root();
    let d = admit(&c, &raw)?;
    let all = RichSelection::try_new(&d, RichSelectionKind::Document)?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &all)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains("breditor/bookmark"), "{json}");
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(&json)?;
    let drafts = decoded.flow_drafts(&c, &mut Ids::default())?;
    let mut a = owner(&c, &raw)?;
    let end = RichFlowPosition::new(RichFlowParent::Document, None);
    let action = InsertBlocks::capture(a.state().document(), &end, drafts)?;
    a.dispatch(&a.snapshot(), &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)?;
    // The copy keeps its internal links (they resolve to the original anchor) but no anchor.
    let read = index(&c, &a)?;
    assert_eq!(names(&read), [("intro".to_owned(), "h".to_owned())]);
    assert_eq!(read.links().len(), 4);
    assert!(read.broken_links().is_empty());
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    Ok(())
}

#[test]
fn read_only_stale_and_old_profiles_refuse_atomically() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    a.set_read_only(&a.snapshot(), true)?;
    assert!(set(&mut a, "q", Some("x")).is_err());
    let rename = SetBookmark::rename(a.state().document(), &name("intro")?, &name("y")?)?;
    assert!(run(&mut a, rename).is_err());
    a.set_read_only(&a.snapshot(), false)?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(caret("p")?))?;
    let action = SetBookmark::capture(a.state().document(), &id("q")?, Some(&name("x")?))?;
    assert!(
        a.dispatch(&stale, &[RichAction::SetBookmark(action)], RichSelectionUpdate::Map).is_err()
    );
    // A captured rename is guarded against a changed referencing block.
    let captured = SetBookmark::rename(a.state().document(), &name("intro")?, &name("y")?)?;
    let edit = SetBookmark::capture(a.state().document(), &id("h")?, Some(&name("other")?))?;
    run(&mut a, edit)?;
    assert!(captured.apply(&c, a.state().document()).is_err());
    assert_eq!(a.undo_depth(), 1);
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        let b = owner(&old, &document(vec![fixture::paragraph("q", "x")]))?;
        let action = SetBookmark::capture(b.state().document(), &id("q")?, Some(&name("x")?))?;
        let err = action.apply(&old, b.state().document()).err().ok_or("accepted")?;
        assert!(matches!(err, RichActionError::Bookmark(RichBookmarkError::Profile)));
        assert!(decode_rich_set_bookmark_command(&old, r#"{"block":"q","name":"x"}"#).is_err());
        assert!(decode_rich_rename_bookmark_command(&old, r#"{"from":"a","to":"b"}"#).is_err());
    }
    Ok(())
}

#[test]
fn command_decoding_is_strict() -> Result {
    let c = context(4)?;
    let (block, value) = decode_rich_set_bookmark_command(&c, r#"{"block":"q","name":"intro"}"#)?;
    assert_eq!(
        (block.as_str(), value.as_ref().map(RichBookmarkName::as_str)),
        ("q", Some("intro"))
    );
    let (_, cleared) = decode_rich_set_bookmark_command(&c, r#"{"block":"q","name":null}"#)?;
    assert!(cleared.is_none());
    let (from, to) = decode_rich_rename_bookmark_command(&c, r#"{"from":"a","to":"b-2"}"#)?;
    assert_eq!((from.as_str(), to.as_str()), ("a", "b-2"));
    for bad in [
        r#"{"block":"q"}"#,
        r#"{"name":"x"}"#,
        r#"{"block":"q","name":"1x"}"#,
        r#"{"block":"q","name":" x"}"#,
        r#"{"block":"q","name":7}"#,
        r#"{"block":"q","name":"x","extra":1}"#,
        r#"{"block":"q","name":"x","name":"y"}"#,
        r#"{"block":"","name":"x"}"#,
        "[]",
    ] {
        assert!(decode_rich_set_bookmark_command(&c, bad).is_err(), "{bad}");
    }
    for bad in [
        r#"{"from":"a"}"#,
        r#"{"from":"a","to":null}"#,
        r##"{"from":"a","to":"#b"}"##,
        r#"{"from":"a","to":"b","x":1}"#,
    ] {
        assert!(decode_rich_rename_bookmark_command(&c, bad).is_err(), "{bad}");
    }
    let long = format!(r#"{{"block":"q","name":"{}"}}"#, "a".repeat(3000));
    assert!(decode_rich_set_bookmark_command(&c, &long).is_err());
    Ok(())
}
