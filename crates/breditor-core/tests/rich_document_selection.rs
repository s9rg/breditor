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
        BlockId, RichClipboardFragment, RichDocument, RichLocalOutcome, RichLocalSession,
        RichLocalSessionError, RichSelectionCoverage, RichSelectionFormatChange, RichSelectionKind,
        RichTextPoint, standard_inline_extension_v1,
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
