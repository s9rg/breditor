//! Rust-owned whole-atom deletion/replacement, floors and original exact history.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/atom_fixture.rs"]
mod fixture;
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        BlockId, FlowMove, RichDocument, RichLocalOutcome, RichLocalSession, RichSelectionKind,
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
fn setup(
    language: u32,
    root: &Value,
    target: &str,
    limits: DocumentLimits,
) -> Result<(EditorContext, RichLocalSession)> {
    let name =
        SchemaId::new(QualifiedName::try_new("example/atom-edit")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let schema = if language == 2 {
        CompiledSchema::try_compile_rich_content_profile_v2(name, &extensions)?
    } else {
        CompiledSchema::try_compile_rich_content_profile(name, &extensions)?
    };
    let c = EditorContext::new(schema, limits);
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/atom-edit","version":1},
        "schemaFingerprint":c.schema().fingerprint().to_string(),"root":root}).to_string();
    let document = RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone())
            .with_limits(c.limits().clone())
            .decode(&input)?,
        c.limits(),
    )?;
    let a = RichLocalSession::try_new(
        c.clone(),
        document,
        Some(RichSelectionKind::Node(id(target)?)),
        HistoryCapacity::default(),
    )?;
    Ok((c, a))
}
fn saved(c: &EditorContext, a: &RichLocalSession) -> Result<String> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).encode(a)?
    } else {
        RichSessionJsonCodec::new(c.clone()).encode(a)?
    })
}
fn restore(c: &EditorContext, a: &RichLocalSession) -> Result<RichLocalSession> {
    Ok(if a.typing_history_enabled() {
        RichTypingSessionJsonCodec::new(c.clone()).decode(&saved(c, a)?)?
    } else {
        RichSessionJsonCodec::new(c.clone()).decode(&saved(c, a)?)?
    })
}
fn selected(a: &RichLocalSession) -> Result<&RichSelectionKind> {
    Ok(a.state().selection().ok_or("selection")?.kind())
}
fn caret(a: &RichLocalSession, block: &str, offset: u64) -> Result {
    let RichSelectionKind::TextRange { anchor, focus } = selected(a)? else {
        return Err("caret".into());
    };
    assert_eq!(anchor, focus);
    assert_eq!(focus.block().as_str(), block);
    assert_eq!(focus.offset().get(), offset);
    Ok(())
}
fn history(
    c: &EditorContext,
    a: &mut RichLocalSession,
    before: &breditor_core::document::Document,
) -> Result {
    let mut b = restore(c, a)?;
    for redo in [false, true, false, true] {
        if redo {
            a.redo(&a.snapshot())?;
            b.redo(&b.snapshot())?;
        } else {
            a.undo(&a.snapshot())?;
            b.undo(&b.snapshot())?;
            assert_eq!(a.state().document().document(), before);
        }
        assert_eq!(saved(c, a)?, saved(c, &b)?);
    }
    Ok(())
}
#[test]
fn deletion_uses_directional_native_neighbors_and_exact_inverse_in_every_flow() -> Result {
    for language in [1, 2] {
        for kind in ["image", "table", "rule"] {
            for parent in ["root", "cell", "list", "task", "quote"] {
                if (language == 1 && (kind == "rule" || matches!(parent, "task" | "quote")))
                    || kind == "table" && parent == "cell"
                {
                    continue;
                }
                for direction in [FlowMove::Before, FlowMove::After] {
                    let (root, target) = fixture::fixture(kind, parent, false, false)?;
                    let (c, mut a) = setup(language, &root, target, DocumentLimits::default())?;
                    let before = a.state().document().document().clone();
                    a.delete_atom(&a.snapshot(), &id("unused")?, direction)?;
                    assert!(a.state().document().block_path(&id(target)?).is_none());
                    assert!(a.state().document().block_path(&id("unused")?).is_none());
                    caret(
                        &a,
                        if direction == FlowMove::Before { "left" } else { "right" },
                        if direction == FlowMove::Before { 4 } else { 0 },
                    )?;
                    assert_eq!(a.undo_depth(), 1);
                    history(&c, &mut a, &before)?;
                }
            }
        }
    }
    Ok(())
}
#[test]
fn sole_children_and_hidden_only_remainders_get_an_explicit_floor_at_original_slot() -> Result {
    for (kind, parent) in
        [("table", "root"), ("image", "root"), ("image", "cell"), ("rule", "quote")]
    {
        for hidden in [false, true] {
            if hidden && parent == "cell" {
                continue; // A hidden table is still a table: nested tables remain forbidden.
            }
            let (root, target) = fixture::fixture(kind, parent, true, hidden)?;
            let (c, mut a) = setup(2, &root, target, DocumentLimits::default())?;
            let old_path = a.state().document().block_path(&id(target)?).ok_or("path")?.clone();
            let before = a.state().document().document().clone();
            a.delete_atom(&a.snapshot(), &id("floor")?, FlowMove::After)?;
            caret(&a, "floor", 0)?;
            assert_eq!(a.state().document().block_path(&id("floor")?).ok_or("floor")?, &old_path);
            history(&c, &mut a, &before)?;
        }
    }
    Ok(())
}
#[test]
fn replacement_is_plain_utf16_and_exact_with_empty_input_and_all_supported_atoms() -> Result {
    for language in [1, 2] {
        for kind in ["image", "table", "rule"] {
            if language == 1 && kind == "rule" {
                continue;
            }
            for input in ["", "Q🙂e\u{301}", "a\r\n\tb"] {
                let (root, target) = fixture::fixture(kind, "root", true, false)?;
                let (c, mut a) = setup(language, &root, target, DocumentLimits::default())?;
                let before = a.state().document().document().clone();
                a.replace_atom_plain_text(&a.snapshot(), &id("replacement")?, input)?;
                caret(&a, "replacement", u64::try_from(input.encode_utf16().count())?)?;
                assert_eq!(a.state().effective_caret_formats()?.len(), 0);
                history(&c, &mut a, &before)?;
            }
        }
    }
    Ok(())
}
#[test]
fn first_key_and_subsequent_typing_share_one_native_group_but_restart_has_no_clock() -> Result {
    for kind in ["image", "table", "rule"] {
        let (root, target) = fixture::fixture(kind, "root", true, false)?;
        let (c, mut a) = setup(2, &root, target, DocumentLimits::default())?;
        a.enable_typing_history(&a.snapshot())?;
        let before = a.state().document().document().clone();
        let unchanged = saved(&c, &a)?;
        assert_eq!(
            a.replace_atom_typing_text(&a.snapshot(), &id(target)?, "", 100)?,
            RichLocalOutcome::Unchanged
        );
        assert_eq!(saved(&c, &a)?, unchanged);
        a.replace_atom_typing_text(&a.snapshot(), &id("replacement")?, "Q", 100)?;
        a.insert_typing_text(&a.snapshot(), "🙂", 200)?;
        a.insert_typing_text(&a.snapshot(), "e\u{301}", 300)?;
        assert_eq!((a.undo_depth(), a.history_step_count()), (1, 3));
        caret(&a, "replacement", 5)?;
        let mut b = restore(&c, &a)?;
        b.insert_typing_text(&b.snapshot(), "!", 301)?;
        assert_eq!(b.undo_depth(), 2);
        history(&c, &mut a, &before)?;
    }
    Ok(())
}
#[test]
fn stale_read_only_non_atom_disabled_and_identity_failures_are_atomic() -> Result {
    let (root, target) = fixture::fixture("image", "root", true, false)?;
    let (c, mut a) = setup(2, &root, target, DocumentLimits::default())?;
    let before = saved(&c, &a)?;
    assert!(a.replace_atom_typing_text(&a.snapshot(), &id("fresh")?, "Q", 1).is_err());
    assert!(a.replace_atom_plain_text(&a.snapshot(), &id(target)?, "Q").is_err());
    assert!(a.delete_atom(&a.snapshot(), &id(target)?, FlowMove::After).is_err());
    assert_eq!(saved(&c, &a)?, before);
    let stale = a.snapshot();
    a.set_read_only(&a.snapshot(), true)?;
    let before = saved(&c, &a)?;
    assert!(a.replace_atom_plain_text(&stale, &id("fresh")?, "Q").is_err());
    assert!(a.delete_atom(&a.snapshot(), &id("fresh")?, FlowMove::After).is_err());
    assert!(a.replace_atom_plain_text(&a.snapshot(), &id("fresh")?, "Q").is_err());
    assert_eq!(saved(&c, &a)?, before);
    a.set_read_only(&a.snapshot(), false)?;
    a.set_selection(&a.snapshot(), Some(RichSelectionKind::Node(id("caption")?)))?;
    let before = saved(&c, &a)?;
    assert!(a.delete_atom(&a.snapshot(), &id("fresh")?, FlowMove::After).is_err());
    assert!(a.replace_atom_plain_text(&a.snapshot(), &id("fresh")?, "Q").is_err());
    assert_eq!(saved(&c, &a)?, before);
    Ok(())
}
#[test]
fn local_replacement_needs_only_final_tree_headroom_not_transient_insertion() -> Result {
    let (root, target) = fixture::fixture("table", "root", true, false)?;
    let nodes = fixture::count(&root);
    let (c, mut a) = setup(2, &root, target, DocumentLimits::default().with_max_nodes(nodes))?;
    a.replace_atom_plain_text(&a.snapshot(), &id("replacement")?, "Q")?;
    let v: Value = serde_json::from_str(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(a.state().document().document())?,
    )?;
    assert!(fixture::find(&v["root"], target).is_none());
    Ok(())
}
