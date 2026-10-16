//! Explicit native Select All includes non-text root edges, with separate exact recovery families.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichDocumentSessionJsonCodec,
        RichDocumentTypingSessionJsonCodec, RichSessionJsonCodec, RichTypingSessionJsonCodec,
    },
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichClipboardFragment, RichClipboardNamespace, RichDocument, RichLocalOutcome,
        RichLocalSession, RichLocalSessionError, RichSelectionCoverage, RichSelectionFormatChange,
        RichSelectionKind, RichTextPoint, standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(root: &Value) -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(
            QualifiedName::try_new("example/document-selection")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-selection","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":root}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    let session =
        RichLocalSession::try_new(context.clone(), document, None, HistoryCapacity::try_new(100)?)?;
    Ok((context, session))
}
fn saved(c: &EditorContext, s: &RichLocalSession) -> Result<String> {
    Ok(if s.typing_history_enabled() {
        RichDocumentTypingSessionJsonCodec::new(c.clone()).encode(s)?
    } else {
        RichDocumentSessionJsonCodec::new(c.clone()).encode(s)?
    })
}
fn restored(c: &EditorContext, s: &RichLocalSession, input: &str) -> Result<RichLocalSession> {
    Ok(if s.typing_history_enabled() {
        RichDocumentTypingSessionJsonCodec::new(c.clone()).decode(input)?
    } else {
        RichDocumentSessionJsonCodec::new(c.clone()).decode(input)?
    })
}
fn document_selected(s: &RichLocalSession) -> bool {
    matches!(
        s.state().selection().map(breditor_core::rich_content::RichSelection::kind),
        Some(RichSelectionKind::Document)
    )
}
#[test]
fn document_collapse_has_native_outer_edges_and_no_hidden_only_fake_endpoint() -> Result {
    use breditor_core::rich_content::FlowMove;
    for case in 0..4 {
        let mut root = fixture::root();
        if case > 0 {
            root["children"].as_array_mut().ok_or("children")?.retain(|n| match case {
                1 => ["quote", "list", "tasks", "code"]
                    .contains(&n["properties"]["breditor/block-id"].as_str().unwrap_or("")),
                2 => n["properties"]["breditor/block-id"] == "table",
                _ => n["properties"]["breditor/block-id"] == "hidden",
            });
        }
        let (context, mut s) = setup(&root)?;
        s.select_document(&s.snapshot())?;
        s.replace_document_plain_text(&s.snapshot(), &BlockId::try_new("temporary")?, "X")?;
        s.undo(&s.snapshot())?;
        s.set_read_only(&s.snapshot(), true)?;
        let source = s.state().document().clone();
        for side in [FlowMove::Before, FlowMove::After] {
            s.select_document(&s.snapshot())?;
            let old = s.snapshot();
            let outcome = s.collapse_document_selection(&old, side)?;
            assert_eq!(s.state().document().document(), source.document());
            assert_eq!((s.undo_depth(), s.redo_depth()), (0, 1));
            let kind = s.state().selection().ok_or("selection")?.kind().clone();
            if case == 3 {
                assert_eq!(outcome, RichLocalOutcome::Unchanged);
                assert!(matches!(kind, RichSelectionKind::Document));
            } else {
                assert_eq!(outcome, RichLocalOutcome::SelectionOnly);
                assert!(s.collapse_document_selection(&old, side).is_err());
                match (case, side, kind) {
                    (0, FlowMove::Before, RichSelectionKind::Node(id)) => {
                        assert_eq!(id.as_str(), "lead");
                    }
                    (0, FlowMove::After, RichSelectionKind::Node(id)) => {
                        assert_eq!(id.as_str(), "tail");
                    }
                    (2, _, RichSelectionKind::Node(id)) => assert_eq!(id.as_str(), "table"),
                    (1, FlowMove::Before, RichSelectionKind::TextRange { anchor, focus }) => {
                        assert_eq!(anchor, focus);
                        assert_eq!(focus.block().as_str(), "q1");
                        assert_eq!(focus.offset(), TextOffset::ZERO);
                    }
                    (1, FlowMove::After, RichSelectionKind::TextRange { anchor, focus }) => {
                        assert_eq!(anchor, focus);
                        assert_eq!(focus.block().as_str(), "code");
                        assert_eq!(focus.offset().get(), 10);
                    }
                    _ => return Err("wrong native document edge".into()),
                }
            }
            let bytes = saved(&context, &s)?;
            let recovered = restored(&context, &s, &bytes)?;
            assert_eq!(saved(&context, &recovered)?, bytes);
        }
    }
    Ok(())
}
fn caret(id: &str) -> Result<RichSelectionKind> {
    let p = RichTextPoint::new(BlockId::try_new(id)?, TextOffset::ZERO, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: p.clone(), focus: p })
}

#[test]
fn document_scope_covers_and_copies_atoms_hidden_tables_and_every_cell_caption() -> Result {
    let (context, mut session) = setup(&fixture::root())?;
    assert_eq!(session.select_document(&session.snapshot())?, RichLocalOutcome::SelectionOnly);
    let selection = session.state().selection().ok_or("selection")?;
    let coverage = RichSelectionCoverage::capture(session.state().document(), selection)?;
    let whole = RichSelectionCoverage::document(session.state().document())?;
    assert_eq!(coverage.nodes(), whole.nodes());
    assert_eq!(coverage.text(), whole.text());
    assert_eq!(coverage.selected_utf16(), whole.selected_utf16());
    assert!(coverage.nodes().iter().any(|n| n.block().as_str() == "lead"));
    assert!(coverage.nodes().iter().any(|n| n.block().as_str() == "tail"));
    assert!(
        coverage.nodes().iter().any(breditor_core::rich_content::RichCoveredNode::is_hidden_table)
    );
    let copied = RichClipboardFragment::copy_general_selection(
        &context,
        session.state().document(),
        selection,
    )?
    .ok_or("copy")?;
    let clip: Value =
        serde_json::from_str(&RichClipboardJsonCodec::new(context.clone()).encode(&copied)?)?;
    let children = clip["document"]["root"]["children"].as_array().ok_or("children")?;
    assert_eq!(children.len(), fixture::root()["children"].as_array().ok_or("source")?.len());
    assert_eq!(children[0]["properties"]["breditor/block-id"], "lead");
    assert_eq!(children.last().ok_or("last")?["properties"]["breditor/block-id"], "hidden");
    assert!(copied.plain_text()?.contains("Diagram"));
    assert!(copied.plain_text()?.contains("xy🙂"));
    assert_eq!(session.undo_depth(), 0);
    let before = saved(&context, &session)?;
    assert_eq!(session.select_document(&session.snapshot())?, RichLocalOutcome::Unchanged);
    assert_eq!(saved(&context, &session)?, before);
    Ok(())
}

#[test]
fn whole_replacement_restores_exact_document_scope_and_future_history_in_both_families() -> Result {
    for natural in [false, true] {
        for text in ["", "Q🙂\nZ"] {
            let (context, mut session) = setup(&fixture::root())?;
            if natural {
                session.enable_typing_history(&session.snapshot())?;
            }
            session.select_document(&session.snapshot())?;
            let source = session.state().document().clone();
            assert_eq!(
                session.replace_document_plain_text(
                    &session.snapshot(),
                    &BlockId::try_new("whole-replacement")?,
                    text
                )?,
                RichLocalOutcome::ContentCommitted
            );
            assert_eq!(session.undo_depth(), 1);
            let root = session.state().document().document().root().as_element().ok_or("root")?;
            assert_eq!(root.children().len(), 1);
            assert!(
                root.children()
                    .get(0)
                    .ok_or("replacement")?
                    .as_element()
                    .is_some_and(|n| n.kind().as_str() == "breditor/paragraph")
            );
            let bytes = saved(&context, &session)?;
            let mut recovered = restored(&context, &session, &bytes)?;
            assert_eq!(saved(&context, &recovered)?, bytes);
            // The visible caret is now text, but old families must also reject retained Document before-UI.
            assert!(RichSessionJsonCodec::new(context.clone()).encode(&session).is_err());
            assert!(RichTypingSessionJsonCodec::new(context.clone()).encode(&session).is_err());
            for undo in [true, false, true, false] {
                if undo {
                    session.undo(&session.snapshot())?;
                    recovered.undo(&recovered.snapshot())?;
                    assert!(document_selected(&session));
                    assert_eq!(session.state().document().document(), source.document());
                } else {
                    session.redo(&session.snapshot())?;
                    recovered.redo(&recovered.snapshot())?;
                    assert!(!document_selected(&session));
                }
                assert_eq!(saved(&context, &session)?, saved(&context, &recovered)?);
            }
        }
    }
    Ok(())
}

#[test]
fn atom_only_and_hidden_only_documents_need_no_synthetic_text_endpoints() -> Result {
    for hidden_only in [false, true] {
        let mut root = fixture::root();
        let children = root["children"].as_array_mut().ok_or("children")?;
        children.retain(|n| {
            n["properties"]["breditor/block-id"] == "hidden"
                || !hidden_only && n["properties"]["breditor/block-id"] == "lead"
        });
        let (context, mut session) = setup(&root)?;
        session.select_document(&session.snapshot())?;
        assert!(
            RichSelectionCoverage::capture(
                session.state().document(),
                session.state().selection().ok_or("selection")?
            )?
            .text()
            .is_empty()
        );
        let source = session.state().document().clone();
        let before = saved(&context, &session)?;
        session.replace_document_plain_text(
            &session.snapshot(),
            &BlockId::try_new("recovery-paragraph")?,
            "",
        )?;
        session.undo(&session.snapshot())?;
        assert!(document_selected(&session));
        assert_eq!(session.state().document().document(), source.document());
        let recovered = RichDocumentSessionJsonCodec::new(context.clone()).decode(&before)?;
        assert!(document_selected(&recovered));
    }
    Ok(())
}

#[test]
fn original_families_stay_strict_and_new_selection_records_are_closed() -> Result {
    let (context, mut session) = setup(&fixture::root())?;
    let original = RichSessionJsonCodec::new(context.clone()).encode(&session)?;
    let upgraded = RichDocumentSessionJsonCodec::new(context.clone()).encode(&session)?;
    assert!(RichSessionJsonCodec::new(context.clone()).decode(&upgraded).is_err());
    assert!(RichDocumentSessionJsonCodec::new(context.clone()).decode(&original).is_err());
    assert_eq!(
        RichSessionJsonCodec::new(context.clone())
            .encode(&RichSessionJsonCodec::new(context.clone()).decode(&original)?)?,
        original
    );
    session.select_document(&session.snapshot())?;
    let bytes = saved(&context, &session)?;
    let old = bytes.replace("breditor/rich-document-session", "breditor/rich-local-session");
    assert!(RichSessionJsonCodec::new(context.clone()).decode(&old).is_err());
    for bad in [
        bytes.replace("\"kind\":\"document\"", "\"kind\":\"document\",\"extra\":true"),
        bytes.replace("\"kind\":\"document\"", "\"kind\":\"document\",\"kind\":\"document\""),
    ] {
        assert!(RichDocumentSessionJsonCodec::new(context.clone()).decode(&bad).is_err());
    }
    assert!(
        RichDocumentSessionJsonCodec::new(context.clone())
            .with_max_json_bytes(bytes.len() - 1)
            .decode(&bytes)
            .is_err()
    );
    assert!(
        RichDocumentSessionJsonCodec::new(context.clone())
            .with_max_json_bytes(bytes.len() - 1)
            .encode(&session)
            .is_err()
    );
    Ok(())
}

#[test]
fn guards_read_only_redo_and_formatting_preserve_native_whole_scope() -> Result {
    let (context, mut session) = setup(&fixture::root())?;
    let (_, foreign) = setup(&fixture::root())?;
    let old = session.snapshot();
    session.select_document(&old)?;
    let before = saved(&context, &session)?;
    assert!(session.replace_document_plain_text(&old, &BlockId::try_new("fresh")?, "X").is_err());
    assert!(session.select_document(&foreign.snapshot()).is_err());
    assert!(
        session
            .replace_document_plain_text(&session.snapshot(), &BlockId::try_new("q1")?, "X")
            .is_err()
    );
    assert!(
        session
            .replace_document_plain_text(
                &session.snapshot(),
                &BlockId::try_new("fresh")?,
                &"x".repeat(65537)
            )
            .is_err()
    );
    assert_eq!(saved(&context, &session)?, before);
    // Code forbids inline formats; whole scope must refuse, not silently skip selected code.
    let bold = Format::new(QualifiedName::try_new("breditor/strong")?, PropertyMap::default());
    assert!(
        session
            .change_selection_formats(&session.snapshot(), &[RichSelectionFormatChange::Set(bold)])
            .is_err()
    );
    assert_eq!(saved(&context, &session)?, before);
    session.replace_document_plain_text(&session.snapshot(), &BlockId::try_new("fresh")?, "X")?;
    session.undo(&session.snapshot())?;
    assert_eq!(session.redo_depth(), 1);
    session.set_selection(&session.snapshot(), Some(caret("q1")?))?;
    session.set_read_only(&session.snapshot(), true)?;
    session.select_document(&session.snapshot())?;
    assert!(document_selected(&session));
    assert_eq!(session.redo_depth(), 1);
    assert!(matches!(
        session.replace_document_plain_text(&session.snapshot(), &BlockId::try_new("fresh2")?, "Y"),
        Err(RichLocalSessionError::ReadOnly)
    ));
    session.set_read_only(&session.snapshot(), false)?;
    session.redo(&session.snapshot())?;
    assert_eq!(session.undo_depth(), 1);
    Ok(())
}

#[test]
fn document_replacement_isolates_natural_typing_on_both_sides() -> Result {
    let (context, mut session) = setup(&fixture::root())?;
    session.enable_typing_history(&session.snapshot())?;
    session.set_selection(&session.snapshot(), Some(caret("q1")?))?;
    for (text, clock) in [("A", 1), ("B", 2)] {
        session.insert_typing_text(&session.snapshot(), text, clock)?;
    }
    assert_eq!(session.undo_depth(), 1);
    let before = session.state().document().clone();
    session.select_document(&session.snapshot())?;
    session.replace_document_plain_text(&session.snapshot(), &BlockId::try_new("whole")?, "Q")?;
    for (text, clock) in [("C", 3), ("D", 4)] {
        session.insert_typing_text(&session.snapshot(), text, clock)?;
    }
    assert_eq!(session.undo_depth(), 3);
    let bytes = saved(&context, &session)?;
    let value: Value = serde_json::from_str(&bytes)?;
    assert_eq!(value["groups"], json!([2, 1, 2]));
    let mut recovered = restored(&context, &session, &bytes)?;
    for _ in 0..2 {
        session.undo(&session.snapshot())?;
        recovered.undo(&recovered.snapshot())?;
        assert_eq!(saved(&context, &session)?, saved(&context, &recovered)?);
    }
    assert!(document_selected(&session));
    assert_eq!(session.state().document().document(), before.document());
    Ok(())
}

#[test]
fn document_first_key_starts_one_new_burst_and_recovers_its_document_before_ui() -> Result {
    let (context, mut session) = setup(&fixture::root())?;
    session.enable_typing_history(&session.snapshot())?;
    session.set_selection(&session.snapshot(), Some(caret("q1")?))?;
    for (text, clock) in [("A", 1), ("B", 2)] {
        session.insert_typing_text(&session.snapshot(), text, clock)?;
    }
    let before = session.state().document().clone();
    session.select_document(&session.snapshot())?;
    let selected = saved(&context, &session)?;
    assert_eq!(
        session.replace_document_typing_text(
            &session.snapshot(),
            &BlockId::try_new("whole")?,
            "",
            3
        )?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(saved(&context, &session)?, selected);
    session.replace_document_typing_text(
        &session.snapshot(),
        &BlockId::try_new("whole")?,
        "Q",
        3,
    )?;
    for (text, clock) in [("🙂", 4), ("R", 5)] {
        session.insert_typing_text(&session.snapshot(), text, clock)?;
    }
    assert_eq!(session.undo_depth(), 2);
    let bytes = saved(&context, &session)?;
    assert_eq!(serde_json::from_str::<Value>(&bytes)?["groups"], json!([2, 3]));
    let mut recovered = restored(&context, &session, &bytes)?;
    for undo in [true, false, true, false] {
        if undo {
            session.undo(&session.snapshot())?;
            recovered.undo(&recovered.snapshot())?;
            assert!(document_selected(&session));
            assert_eq!(session.state().document().document(), before.document());
        } else {
            session.redo(&session.snapshot())?;
            recovered.redo(&recovered.snapshot())?;
        }
        assert_eq!(saved(&context, &session)?, saved(&context, &recovered)?);
    }
    Ok(())
}

fn clipboard(
    c: &EditorContext,
    s: &RichLocalSession,
    kind: RichSelectionKind,
) -> Result<RichClipboardFragment> {
    let selection =
        breditor_core::rich_content::RichSelection::try_new(s.state().document(), kind)?;
    RichClipboardFragment::copy_selection(c, s.state().document(), &selection)?
        .ok_or("clipboard".into())
}

#[test]
fn whole_rich_paste_keeps_structure_formats_and_exact_future_history() -> Result {
    let (context, mut donor) = setup(&fixture::root())?;
    let point = |offset| -> Result<RichTextPoint> {
        Ok(RichTextPoint::new(
            BlockId::try_new("q1")?,
            TextOffset::try_new(offset)?,
            Affinity::After,
        ))
    };
    let text = RichSelectionKind::TextRange { anchor: point(0)?, focus: point(2)? };
    donor.set_selection(&donor.snapshot(), Some(text.clone()))?;
    donor.change_selection_formats(
        &donor.snapshot(),
        &[RichSelectionFormatChange::Set(Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        ))],
    )?;
    let mut clips = vec![clipboard(&context, &donor, text)?];
    for id in ["table", "image"] {
        clips.push(clipboard(&context, &donor, RichSelectionKind::Node(BlockId::try_new(id)?))?);
    }
    let (_, hidden_donor) = setup(&{
        let mut root = fixture::root();
        root["children"]
            .as_array_mut()
            .ok_or("root")?
            .retain(|n| n["properties"]["breditor/block-id"] == "hidden");
        root
    })?;
    clips.push(clipboard(&context, &hidden_donor, RichSelectionKind::Document)?);
    let cell = breditor_core::rich_content::CellId::new(
        breditor_core::rich_content::TableId::try_new("t")?,
        breditor_core::rich_content::RowId::try_new("r1")?,
        breditor_core::rich_content::ColumnId::try_new("c1")?,
    );
    clips.push(clipboard(
        &context,
        &donor,
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    )?);
    clips.push(clipboard(&context, &donor, RichSelectionKind::Document)?);
    for natural in [false, true] {
        for hidden in [false, true] {
            for (index, clip) in clips.iter().enumerate() {
                let mut root = fixture::root();
                if hidden {
                    root["children"]
                        .as_array_mut()
                        .ok_or("children")?
                        .retain(|n| n["properties"]["breditor/block-id"] == "hidden");
                }
                let (_, mut s) = setup(&root)?;
                if natural {
                    s.enable_typing_history(&s.snapshot())?;
                }
                s.select_document(&s.snapshot())?;
                let before = s.state().document().document().clone();
                s.paste_document_clipboard(
                    &s.snapshot(),
                    clip,
                    &mut RichClipboardNamespace::try_new(&format!("paste-{index}"))?,
                )?;
                assert_eq!(s.undo_depth(), 1);
                assert!(!document_selected(&s));
                let root = s.state().document().document().root().as_element().ok_or("root")?;
                if index == 0 {
                    assert_eq!(root.children().len(), 1);
                    assert!(saved(&context, &s)?.contains("breditor/strong"));
                } else {
                    let last = root
                        .children()
                        .get(root.children().len().saturating_sub(1))
                        .and_then(breditor_core::document::NodeRef::as_element)
                        .ok_or("tail")?;
                    assert_eq!(last.kind().as_str(), "breditor/paragraph");
                    assert!(last.children().is_empty());
                }
                let exact = saved(&context, &s)?;
                let mut b = restored(&context, &s, &exact)?;
                assert_eq!(saved(&context, &b)?, exact);
                for undo in [true, false, true, false] {
                    if undo {
                        s.undo(&s.snapshot())?;
                        b.undo(&b.snapshot())?;
                        assert!(document_selected(&s));
                        assert_eq!(s.state().document().document(), &before);
                    } else {
                        s.redo(&s.snapshot())?;
                        b.redo(&b.snapshot())?;
                    }
                    assert_eq!(saved(&context, &s)?, saved(&context, &b)?);
                }
            }
        }
    }
    Ok(())
}

#[test]
fn document_rich_paste_isolates_preceding_and_following_natural_typing() -> Result {
    let (context, donor) = setup(&fixture::root())?;
    let clip = clipboard(&context, &donor, RichSelectionKind::Document)?;
    let (_, mut s) = setup(&fixture::root())?;
    s.enable_typing_history(&s.snapshot())?;
    s.set_selection(&s.snapshot(), Some(caret("q1")?))?;
    for (text, clock) in [("A", 1), ("B", 2)] {
        s.insert_typing_text(&s.snapshot(), text, clock)?;
    }
    let before = s.state().document().clone();
    s.select_document(&s.snapshot())?;
    s.paste_document_clipboard(
        &s.snapshot(),
        &clip,
        &mut RichClipboardNamespace::try_new("burst-rich")?,
    )?;
    let pasted = s.state().document().clone();
    for (text, clock) in [("C", 3), ("D", 4)] {
        s.insert_typing_text(&s.snapshot(), text, clock)?;
    }
    assert_eq!(s.undo_depth(), 3);
    let bytes = saved(&context, &s)?;
    assert_eq!(serde_json::from_str::<Value>(&bytes)?["groups"], json!([2, 1, 2]));
    let mut recovered = restored(&context, &s, &bytes)?;
    for undo in [true, true, false, false, true, true, false, false] {
        if undo {
            s.undo(&s.snapshot())?;
            recovered.undo(&recovered.snapshot())?;
            if s.undo_depth() == 2 {
                assert_eq!(s.state().document().document(), pasted.document());
            }
            if s.undo_depth() == 1 {
                assert_eq!(s.state().document().document(), before.document());
                assert!(document_selected(&s));
            }
        } else {
            s.redo(&s.snapshot())?;
            recovered.redo(&recovered.snapshot())?;
        }
        assert_eq!(saved(&context, &s)?, saved(&context, &recovered)?);
    }
    Ok(())
}

#[test]
fn document_paste_excludes_all_target_identity_domains_even_when_original_roots_are_removed()
-> Result {
    use breditor_core::rich_content::{
        CausalStamp, RichClipboardError, RichClipboardIdAllocator,
        RichClipboardIdentityKind as Kind,
    };
    struct Collision {
        safe: RichClipboardNamespace,
        kind: Kind,
        value: String,
    }
    impl RichClipboardIdAllocator for Collision {
        fn next(&mut self, kind: Kind) -> std::result::Result<String, RichClipboardError> {
            if kind == self.kind { Ok(self.value.clone()) } else { self.safe.next(kind) }
        }
        fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
            self.safe.merge_stamp()
        }
    }
    let (c, mut s) = setup(&fixture::root())?;
    let copied = clipboard(&c, &s, RichSelectionKind::Document)?
        .rekeyed(&c, &mut RichClipboardNamespace::try_new("donor")?)?;
    s.select_document(&s.snapshot())?;
    let exact = saved(&c, &s)?;
    for (kind, value) in [
        (Kind::Block, "q1"),
        (Kind::Table, "t"),
        (Kind::Row, "r0"),
        (Kind::Column, "c0"),
        (Kind::Image, "img"),
        (Kind::AssetGeneration, "gen"),
        (Kind::Merge, "m"),
    ] {
        let mut ids =
            Collision { safe: RichClipboardNamespace::try_new("safe")?, kind, value: value.into() };
        assert!(s.paste_document_clipboard(&s.snapshot(), &copied, &mut ids).is_err());
        assert_eq!(saved(&c, &s)?, exact);
    }
    let old = s.snapshot();
    s.set_read_only(&s.snapshot(), true)?;
    assert!(
        s.paste_document_clipboard(&old, &copied, &mut RichClipboardNamespace::try_new("guard")?)
            .is_err()
    );
    assert!(matches!(
        s.paste_document_clipboard(
            &s.snapshot(),
            &copied,
            &mut RichClipboardNamespace::try_new("guard")?
        ),
        Err(RichLocalSessionError::ReadOnly)
    ));
    Ok(())
}

#[test]
fn whole_root_rich_paste_is_not_limited_to_sixty_four_blocks() -> Result {
    let mut root = fixture::root();
    root["children"] =
        json!((0..70).map(|i| fixture::paragraph(&format!("source-{i}"), "S")).collect::<Vec<_>>());
    let (c, donor) = setup(&root)?;
    let copied = clipboard(&c, &donor, RichSelectionKind::Document)?;
    let (_, mut s) = setup(&fixture::root())?;
    s.select_document(&s.snapshot())?;
    s.paste_document_clipboard(
        &s.snapshot(),
        &copied,
        &mut RichClipboardNamespace::try_new("many")?,
    )?;
    assert_eq!(
        s.state().document().document().root().as_element().ok_or("root")?.children().len(),
        71
    );
    Ok(())
}
