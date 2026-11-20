//! Explicit shared rich language V4: frozen grammar, model 14/journal 15, exact convergence of
//! every V4 slice, deterministic merge repairs and old-runtime refusal.
#[path = "../../breditor-core/tests/support/rich_v4_frozen.rs"]
mod frozen;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        ClipboardNamespace, Command, PasteTarget, RichReplica, SharedRichProfile,
        actions::{
            DeleteBlock, DeleteText, InsertBlocks, InsertColumn, InsertRow, InsertText,
            JoinTextBlocks, MoveBlock, SetBlockLayout, SetFormat, SetHeading, SetImageAlt,
            SplitTextBlock,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::standard_inline_extension_v1,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use loro::{ExportMode, LoroDoc};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const SCHEMA: &str = "example/shared-v4";
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
fn mention(label: &str) -> Value {
    json!({"type":"breditor/mention","properties":{"breditor/mention-id":"u-1","breditor/mention-kind":"user","breditor/mention-label":label}})
}
fn language(tag: &str) -> Value {
    json!({"type":"breditor/text-language","properties":{"breditor/language-tag":tag}})
}
fn link(href: &str) -> Value {
    json!({"type":"breditor-inline/link","properties":{"breditor-inline/href":href,"breditor-inline/new-window":false}})
}
/// One document using all eight frozen V4 slices.
fn root() -> Value {
    let mut heading = el("heading", "intro", vec![run("Introduction", vec![])]);
    heading["properties"]["breditor/level"] = json!(1);
    heading["properties"]["breditor/bookmark"] = json!("intro");
    let mentions = el(
        "paragraph",
        "people",
        vec![
            run("Hi ", vec![]),
            run("@Ann", vec![mention("Ann")]),
            run(", see ", vec![]),
            run("intro", vec![link("#intro")]),
            run(" ", vec![]),
            run("bonjour", vec![language("fr-CA")]),
        ],
    );
    let item = |id: &str, text: &str| el("list-item", id, vec![para(&format!("{id}-text"), text)]);
    let mut list = el("ordered-list", "list", vec![item("a", "alpha"), item("b", "beta")]);
    list["properties"]["breditor/start"] = json!(3);
    list["properties"]["breditor/list-style"] = json!(4);
    list["properties"]["breditor/list-reversed"] = json!(true);
    let mut image = el("image", "fig", vec![para("fig-cap", "Chart")]);
    image["properties"] = json!({"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Chart","breditor/image-href":"https://example.com/chart","breditor/image-link-new-window":true});
    let mut details = el(
        "details",
        "sec",
        vec![
            el("details-summary", "sum", vec![run("More", vec![])]),
            para("body-1", "Body one"),
            para("body-2", "Body two"),
        ],
    );
    details["properties"]["breditor/details-open"] = json!(true);
    let cell = |row: &str, column: &str| {
        let mut cell = el(
            "table-cell",
            &format!("cell-{row}-{column}"),
            vec![para(&format!("p-{row}-{column}"), "x")],
        );
        cell["properties"]["breditor/column-id"] = json!(column);
        cell["properties"]["breditor/header"] = json!(false);
        cell
    };
    let row = |id: &str| {
        let mut row = el("table-row", &format!("row-{id}"), vec![cell(id, "c1"), cell(id, "c2")]);
        row["properties"]["breditor/row-id"] = json!(id);
        row
    };
    let mut table = el("table", "table", vec![row("r1"), row("r2"), para("tcap", "Totals")]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"c1","width":160},{"id":"c2","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut root = el(
        "document",
        "unused",
        vec![
            heading,
            mentions,
            list,
            image,
            details,
            el("page-break", "pb", vec![]),
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
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = profile()?;
    let a = p.create(&source(&p, &root()), "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
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
fn delete(block: &str, offset: u32, length: u32) -> Command {
    Command::DeleteText(DeleteText { block: block.into(), offset, length })
}
fn caret(block: &str, offset: u32) -> Selection {
    let point = TextPoint { block: block.into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn bookmarked(id: &str, name: &str, text: &str) -> Value {
    let mut node = para(id, text);
    node["properties"]["breditor/bookmark"] = json!(name);
    node
}
/// Exchange every peer's complete update set and require one identical document.
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
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &saved(a)?)?
    } else {
        p.restore("room", &saved(a)?)?
    })
}
/// Exact restart, then identical Undo/Redo on the original and the restored owner.
fn future(p: &SharedRichProfile, a: &mut RichReplica) -> Result {
    let mut b = restore(p, a)?;
    assert_eq!(saved(a)?, saved(&b)?);
    assert_eq!(a.document_json(), b.document_json());
    let count = a.undo_count() + 1;
    for redo in [false, true, false, true] {
        for _ in 0..count {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(saved(a)?, saved(&b)?);
        }
    }
    Ok(())
}
fn schema_v4(name: &str, version: u32) -> Result<CompiledSchema> {
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(CompiledSchema::try_compile_rich_content_profile_v4(
        SchemaId::new(QualifiedName::try_new(name)?, SchemaVersion::try_new(version)?),
        &extensions,
    )?)
}
fn named(name: &str, version: u32) -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":4,"schema":{"name":name,"version":version},"extensions":[]}).to_string()
}

#[test]
fn explicit_v4_factories_bind_model14_journal15_and_the_frozen_local_grammar() -> Result {
    let (p, a, _) = setup()?;
    for descriptor in [p.descriptor_json(), a.descriptor_json()] {
        let v: Value = serde_json::from_str(&descriptor)?;
        assert_eq!(v["modelVersion"], 14);
        assert_eq!(v["journalVersion"], 15);
        assert_eq!(v["richLanguageVersion"], 4);
        assert_eq!(v["blockLayoutVersion"], 1);
        for slice in [
            "listNumberingVersion",
            "textLanguageVersion",
            "imageLinkVersion",
            "detailsVersion",
            "mentionVersion",
            "tableCaptionVersion",
            "pageBreakVersion",
            "bookmarkVersion",
        ] {
            assert_eq!(v[slice], 1, "{slice}");
        }
    }
    assert_eq!((a.model_version(), a.journal_version()), (14, 15));
    // The shared grammar IS the frozen local V4 grammar: same compiler entry, rule
    // revision and fingerprint, never a shared-only variant.
    assert_eq!(p.schema().fingerprint(), schema_v4(SCHEMA, 1)?.fingerprint());
    assert_eq!(p.schema().rich_content_revision(), Some(frozen::V4_RULE_REVISION));
    let layout =
        SharedRichProfile::from_standard_configuration_json_v4(&named("example/layout", 1))?;
    assert_eq!(layout.schema().fingerprint().to_string(), frozen::V4_LAYOUT_FINGERPRINT);
    let stock = SharedRichProfile::from_standard_configuration_json_v4(&named(
        "breditor-editor/standard",
        4,
    ))?;
    assert_eq!(stock.schema().fingerprint().to_string(), frozen::V4_STANDARD_FINGERPRINT);
    let bare = SharedRichProfile::from_configuration_json_v4(&named("example/layout", 1))?;
    assert_eq!(bare.schema().fingerprint().to_string(), frozen::V4_BARE_FINGERPRINT);
    let compiled = SharedRichProfile::from_schema_v4(
        schema_v4("breditor-editor/standard", 4)?,
        stock.limits().clone(),
    )?;
    assert_eq!(compiled.descriptor_json(), stock.descriptor_json());
    // Old constructors never admit V4, and V4 never admits older revisions.
    assert!(SharedRichProfile::from_schema(p.schema().clone(), p.limits().clone()).is_err());
    assert!(SharedRichProfile::from_schema_v2(p.schema().clone(), p.limits().clone()).is_err());
    assert!(SharedRichProfile::from_schema_v3(p.schema().clone(), p.limits().clone()).is_err());
    for version in [1, 2, 3, 5] {
        assert!(SharedRichProfile::from_configuration_json_v4(&config(version)).is_err());
        assert!(SharedRichProfile::from_standard_configuration_json_v4(&config(version)).is_err());
    }
    assert!(SharedRichProfile::from_configuration_json(&config(4)).is_err());
    assert!(SharedRichProfile::from_standard_configuration_json_v1(&config(4)).is_err());
    assert!(SharedRichProfile::from_standard_configuration_json_v2(&config(4)).is_err());
    assert!(SharedRichProfile::from_standard_configuration_json_v3(&config(4)).is_err());
    let v3 = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    assert!(SharedRichProfile::from_schema_v4(v3.schema().clone(), v3.limits().clone()).is_err());
    Ok(())
}

#[test]
fn older_models_refuse_v4_rooms_frames_journals_and_documents() -> Result {
    let (p, a, _) = setup()?;
    let v3 = SharedRichProfile::from_standard_configuration_json_v3(&config(3))?;
    let frame = a.update_frame()?;
    assert!(v3.join_frame("room".into(), "303".into(), &frame).is_err());
    assert!(v3.restore("room", &a.checkpoint()?).is_err());
    assert!(v3.create(&source(&p, &root()), "303".into()).is_err());
    // V3 frames and journals never enter a V4 room either.
    let mut v3_root = root();
    v3_root["children"] = json!([para("only", "x")]);
    let old = v3.create(&source(&v3, &v3_root), "404".into())?;
    assert!(p.join_frame("room".into(), "505".into(), &old.update_frame()?).is_err());
    assert!(p.restore("room", &old.checkpoint()?).is_err());
    let mut b = p.join_frame("room".into(), "606".into(), &frame)?;
    assert!(b.receive_frame(&old.update_frame()?).is_err());
    // A raw engine import of another room's V3 marker is refused before adoption.
    let before = b.document_json().to_owned();
    assert!(b.receive(old.updates()?).is_err());
    assert_eq!(b.document_json(), before);
    let codec = DocumentJsonCodecV2::new(v3.schema().clone());
    assert!(RichReplica::restore(codec, "room", &a.checkpoint()?).is_err());
    Ok(())
}

#[test]
fn every_v4_slice_seeds_replicates_and_restores_exactly_across_three_peers() -> Result {
    let (p, mut a, mut b) = setup()?;
    let mut c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    let codec = DocumentJsonCodecV2::new(p.schema().clone());
    let input = source(&p, &root());
    assert_eq!(a.document_json(), codec.encode(&codec.decode(&input)?)?);
    assert_eq!(ast(&a)?, root());
    sync(&mut [&mut a, &mut b, &mut c])?;
    for peer in [&a, &b, &c] {
        assert_eq!(restore(&p, peer)?.document_json(), a.document_json());
    }
    assert_eq!(node(&b, "intro")?["properties"]["breditor/bookmark"], "intro");
    assert_eq!(node(&b, "list")?["properties"]["breditor/list-style"], 4);
    assert_eq!(node(&b, "list")?["properties"]["breditor/list-reversed"], true);
    assert_eq!(node(&b, "fig")?["properties"]["breditor/image-href"], "https://example.com/chart");
    assert_eq!(node(&b, "fig")?["properties"]["breditor/image-link-new-window"], true);
    assert_eq!(node(&b, "sec")?["properties"]["breditor/details-open"], true);
    assert_eq!(kinds(&node(&b, "sec")?)[0], "breditor/details-summary");
    assert_eq!(kinds(&node(&b, "table")?).last().map(String::as_str), Some("breditor/paragraph"));
    assert_eq!(node(&b, "pb")?["type"], "breditor/page-break");
    let people = node(&c, "people")?;
    assert_eq!(people["children"][1]["formats"][0], mention("Ann"));
    assert_eq!(people["children"][3]["formats"][0], link("#intro"));
    assert_eq!(people["children"][5]["formats"][0], language("fr-CA"));
    Ok(())
}

#[test]
fn generic_concurrent_editing_of_every_slice_converges_and_replays_exactly() -> Result {
    let (p, mut a, mut b) = setup()?;
    let mut c = p.join_frame("room".into(), "303".into(), &a.update_frame()?)?;
    // A: summary and caption text, a kind change of the section body.
    a.apply(vec![insert("sum", 4, " details"), insert("tcap", 6, " (2026)")])?;
    a.apply(vec![Command::SetHeading(SetHeading { block: "body-1".into(), level: Some(2) })])?;
    // B: plain text after the mention, bold over the whole mention, language over a word.
    b.apply(vec![insert("people", 7, "!")])?;
    b.apply(vec![Command::SetFormat(SetFormat {
        block: "people".into(),
        offset: 3,
        length: 4,
        format: json!({"type":"breditor/strong","properties":{}}),
        enabled: true,
    })])?;
    b.apply(vec![Command::SetFormat(SetFormat {
        block: "tail".into(),
        offset: 0,
        length: 4,
        format: language("de-CH-1996"),
        enabled: true,
    })])?;
    // C: split the bookmarked heading, append a row after the caption, join the body.
    c.apply(vec![Command::SplitTextBlock(SplitTextBlock {
        block: "intro".into(),
        offset: 5,
        right: "intro-right".into(),
        right_heading: Some(1),
    })])?;
    c.apply(vec![Command::InsertRow(InsertRow {
        block: "table".into(),
        row_block: "row-r3".into(),
        row: "r3".into(),
        before: None,
    })])?;
    c.apply(vec![Command::JoinTextBlocks(JoinTextBlocks {
        left: "body-1".into(),
        right: "body-2".into(),
    })])?;
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(kinds(&node(&a, "sec")?), ["breditor/details-summary", "breditor/heading"]);
    assert_eq!(plain(&node(&a, "sum")?), "More details");
    assert_eq!(plain(&node(&a, "body-1")?), "Body oneBody two");
    assert_eq!(
        kinds(&node(&a, "table")?),
        ["breditor/table-row", "breditor/table-row", "breditor/table-row", "breditor/paragraph"]
    );
    assert_eq!(plain(&node(&a, "tcap")?), "Totals (2026)");
    assert_eq!(node(&a, "intro")?["properties"]["breditor/bookmark"], "intro");
    assert!(node(&a, "intro-right")?["properties"].get("breditor/bookmark").is_none());
    let people = node(&a, "people")?;
    assert_eq!(plain(&people), "Hi @Ann!, see intro bonjour");
    let unit = &people["children"][1];
    assert_eq!(unit["text"], "@Ann");
    let formats = unit["formats"].as_array().ok_or("formats")?;
    assert!(formats.contains(&mention("Ann")));
    assert!(formats.contains(&json!({"type":"breditor/strong","properties":{}})));
    assert_eq!(node(&a, "tail")?["children"][0]["formats"][0], language("de-CH-1996"));
    for peer in [&mut a, &mut b, &mut c] {
        future(&p, peer)?;
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    // Selective Undo of every writer's work converges back to the exact seed.
    for peer in [&mut a, &mut b, &mut c] {
        while peer.undo()? {}
    }
    sync(&mut [&mut a, &mut b, &mut c])?;
    assert_eq!(ast(&a)?, root());
    Ok(())
}

#[test]
fn typing_after_a_mention_is_plain_and_partial_mention_edits_are_refused_locally() -> Result {
    let (p, mut a, mut b) = setup()?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.set_selection(Some(&caret("people", 7)))?;
    a.insert_plain_text("x")?;
    let people = node(&a, "people")?;
    assert_eq!(people["children"][1]["text"], "@Ann");
    assert_eq!(people["children"][2], run("x, see ", vec![]));
    let before = saved(&a)?;
    for commands in [
        vec![insert("people", 5, "z")],
        vec![delete("people", 4, 2)],
        vec![delete("people", 2, 3)],
        vec![Command::SetFormat(SetFormat {
            block: "people".into(),
            offset: 4,
            length: 2,
            format: mention("Ann"),
            enabled: false,
        })],
        vec![Command::SetFormat(SetFormat {
            block: "tail".into(),
            offset: 0,
            length: 4,
            format: mention("Tail"),
            enabled: true,
        })],
    ] {
        assert!(a.apply(commands).is_err());
        assert_eq!(saved(&a)?, before);
    }
    // Whole-unit edits are ordinary: delete the mention as one unit.
    a.apply(vec![delete("people", 3, 4)])?;
    assert_eq!(plain(&node(&a, "people")?), "Hi x, see intro bonjour");
    b.receive_frame(&a.update_frame()?)?;
    assert_eq!(a.document_json(), b.document_json());
    future(&p, &mut a)
}

#[test]
fn an_engine_level_insertion_inside_a_mention_projects_it_as_plain_text_on_every_peer() -> Result {
    let (_, mut a, mut b) = setup()?;
    // Forge an engine edit that bypasses native admission: characters inserted inside
    // a mention, where the mention mark expands over them.
    let d = LoroDoc::new();
    d.import(&a.updates()?)?;
    d.set_peer_id(909)?;
    let text = d.get_map("texts").ensure_mergeable_text("people")?;
    let at = text.to_string().find("@Ann").ok_or("mention text")? + 2;
    text.insert(at, "zz")?;
    d.commit();
    let forged = d.export(ExportMode::all_updates())?;
    a.receive(forged.clone())?;
    b.receive(forged)?;
    assert_eq!(a.document_json(), b.document_json());
    let people = node(&a, "people")?;
    assert_eq!(plain(&people), "Hi @Azznn, see intro bonjour");
    for run in people["children"].as_array().ok_or("runs")? {
        assert!(!run["formats"].as_array().ok_or("formats")?.contains(&mention("Ann")));
    }
    Ok(())
}

#[test]
fn concurrent_equal_bookmarks_keep_the_first_in_document_order_and_undo_restores_it() -> Result {
    let (p, mut a, mut b) = setup()?;
    // A local duplicate is refused outright: repairs exist only for merges.
    let before = saved(&a)?;
    assert!(
        a.apply(vec![Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![bookmarked("dup", "intro", "Again")],
        })])
        .is_err()
    );
    assert_eq!(saved(&a)?, before);
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("tail".into()),
        nodes: vec![bookmarked("from-a", "notes", "A notes")],
    })])?;
    b.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("people".into()),
        nodes: vec![bookmarked("from-b", "notes", "B notes")],
    })])?;
    sync(&mut [&mut a, &mut b])?;
    // B's block is earlier in document order, so it keeps the name; A's block stays.
    assert_eq!(node(&a, "from-b")?["properties"]["breditor/bookmark"], "notes");
    assert!(node(&a, "from-a")?["properties"].get("breditor/bookmark").is_none());
    assert_eq!(plain(&node(&a, "from-a")?), "A notes");
    // Removing the winner makes the retained name visible on the survivor again.
    b.undo()?;
    sync(&mut [&mut a, &mut b])?;
    assert!(find(&ast(&a)?, "from-b").is_none());
    assert_eq!(node(&a, "from-a")?["properties"]["breditor/bookmark"], "notes");
    future(&p, &mut a)?;
    future(&p, &mut b)
}

#[test]
fn concurrent_deletion_of_every_section_body_block_shows_one_derived_paragraph() -> Result {
    let (p, mut a, mut b) = setup()?;
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "body-1".into() })])?;
    b.apply(vec![Command::DeleteBlock(DeleteBlock { block: "body-2".into() })])?;
    sync(&mut [&mut a, &mut b])?;
    let sec = node(&a, "sec")?;
    assert_eq!(kinds(&sec), ["breditor/details-summary", "breditor/paragraph"]);
    assert_eq!(plain(&sec["children"][1]), "");
    // The derived body paragraph is editable like any other container fallback.
    let fallback =
        sec["children"][1]["properties"]["breditor/block-id"].as_str().ok_or("id")?.to_owned();
    a.set_selection(Some(&caret(&fallback, 0)))?;
    a.insert_plain_text("Restored")?;
    sync(&mut [&mut a, &mut b])?;
    assert_eq!(plain(&node(&b, &fallback)?), "Restored");
    future(&p, &mut a)?;
    future(&p, &mut b)
}

#[test]
fn placement_never_puts_a_summary_elsewhere_or_a_page_break_below_the_root() -> Result {
    let (_, mut a, _) = setup()?;
    let before = a.document_json().to_owned();
    for (block, parent, anchor) in [
        ("pb", Some("sec"), None),
        ("pb", Some("a"), None),
        ("sum", None, None),
        ("sum", Some("sec"), None),
        ("body-1", Some("sec"), Some("sum")),
    ] {
        let result = a.apply(vec![Command::MoveBlock(MoveBlock {
            block: block.into(),
            parent: parent.map(Into::into),
            before: anchor.map(Into::into),
        })]);
        assert!(result.is_err() || !result?, "{block} moved into {parent:?}");
        assert_eq!(a.document_json(), before);
    }
    // A page break may be inserted at the root and moved along the root.
    a.apply(vec![Command::InsertBlocks(InsertBlocks {
        parent: None,
        before: Some("tail".into()),
        nodes: vec![el("page-break", "pb-2", vec![])],
    })])?;
    a.apply(vec![Command::MoveBlock(MoveBlock {
        block: "pb-2".into(),
        parent: None,
        before: Some("intro".into()),
    })])?;
    assert_eq!(ast(&a)?["children"][0]["type"], "breditor/page-break");
    Ok(())
}

#[test]
fn image_link_and_decorative_state_stay_one_admitted_choice() -> Result {
    let (_, mut a, _) = setup()?;
    let before = saved(&a)?;
    // A linked image cannot become decorative (its link needs an accessible name).
    assert!(
        a.apply(vec![Command::SetImageAlt(SetImageAlt {
            block: "fig".into(),
            text: String::new(),
            decorative: true,
        })])
        .is_err()
    );
    assert_eq!(saved(&a)?, before);
    a.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "fig".into(),
        text: "Bar chart".into(),
        decorative: false,
    })])?;
    let fig = node(&a, "fig")?;
    assert_eq!(fig["properties"]["breditor/alt-text"], "Bar chart");
    assert_eq!(fig["properties"]["breditor/image-href"], "https://example.com/chart");
    Ok(())
}

#[test]
fn rich_clipboard_round_trips_v4_blocks_with_fresh_identities() -> Result {
    let (p, mut a, mut b) = setup()?;
    a.set_selection(Some(&Selection::Node { block: "sec".into() }))?;
    let clipboard = a.copy_clipboard_guarded(&a.observe()?)?.ok_or("clipboard")?;
    a.paste_clipboard_guarded(
        &a.observe()?,
        &clipboard.rich_json,
        PasteTarget::Flow { parent: None, before: None },
        &mut ClipboardNamespace::try_new("v4-paste")?,
    )?;
    let root = ast(&a)?;
    let pasted = root["children"].as_array().ok_or("children")?.last().ok_or("pasted")?.clone();
    assert_eq!(pasted["type"], "breditor/details");
    assert_ne!(pasted["properties"]["breditor/block-id"], "sec");
    assert_eq!(pasted["properties"]["breditor/details-open"], true);
    assert_eq!(kinds(&pasted)[0], "breditor/details-summary");
    // A bookmarked heading pastes without its document-unique anchor.
    a.set_selection(Some(&Selection::TextRange {
        anchor: TextPoint { block: "intro".into(), offset: 0, affinity: Affinity::After },
        focus: TextPoint { block: "people".into(), offset: 2, affinity: Affinity::After },
    }))?;
    let copied = a.copy_clipboard_guarded(&a.observe()?)?.ok_or("copied heading")?;
    a.paste_clipboard_guarded(
        &a.observe()?,
        &copied.rich_json,
        PasteTarget::Flow { parent: None, before: None },
        &mut ClipboardNamespace::try_new("v4-paste-2")?,
    )?;
    let root = ast(&a)?;
    let names: Vec<_> = root["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .filter_map(|n| n["properties"]["breditor/bookmark"].as_str())
        .collect();
    assert_eq!(names, ["intro"]);
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut a)
}

#[test]
fn captioned_tables_take_new_columns_and_rows_and_summaries_take_no_layout() -> Result {
    let (p, mut a, mut b) = setup()?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table".into(),
        column: "c3".into(),
        width: 120,
        before: None,
    })])?;
    b.apply(vec![Command::InsertRow(InsertRow {
        block: "table".into(),
        row_block: "row-r0".into(),
        row: "r0".into(),
        before: Some("row-r1".into()),
    })])?;
    sync(&mut [&mut a, &mut b])?;
    let table = node(&a, "table")?;
    assert_eq!(
        kinds(&table),
        ["breditor/table-row", "breditor/table-row", "breditor/table-row", "breditor/paragraph"]
    );
    for row in &table["children"].as_array().ok_or("rows")?[..3] {
        assert_eq!(row["children"].as_array().ok_or("cells")?.len(), 3);
    }
    let before = saved(&a)?;
    assert!(
        a.apply(vec![Command::SetBlockLayout(SetBlockLayout {
            block: "sum".into(),
            patch_json: r#"{"alignment":"center"}"#.into(),
        })])
        .is_err()
    );
    assert_eq!(saved(&a)?, before);
    a.apply(vec![Command::SetBlockLayout(SetBlockLayout {
        block: "tcap".into(),
        patch_json: r#"{"alignment":"center"}"#.into(),
    })])?;
    assert_eq!(node(&a, "tcap")?["properties"]["breditor/block-align"], 2);
    sync(&mut [&mut a, &mut b])?;
    future(&p, &mut a)
}
