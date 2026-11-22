//! Multiple editable roots: one global history owner over independent root sessions.
#![cfg(feature = "experimental-rich-content")]

use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalSession, RichSelectionKind, RichTextPoint,
        root_set::{
            RichMultiRootSession, RichRootId, RichRootMeta, RichRootSet, RichRootSetCheckpoint,
            RichRootSetError,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::json;
use std::collections::BTreeMap;

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-roots")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}

fn session(
    context: &EditorContext,
    name: &str,
    capacity: u32,
) -> Result<RichLocalSession, Box<dyn std::error::Error>> {
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,
            "properties":{"breditor/document-id":name},
            "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
                "properties":{"breditor/block-id":"p"},
                "children":[{"kind":"text","text":"x","formats":[]}]}]}});
    let codec = DocumentJsonCodecV2::new(context.schema().clone());
    let document = RichDocument::try_admit(
        context.schema(),
        codec.decode(&value.to_string())?,
        context.limits(),
    )?;
    let point =
        RichTextPoint::new(BlockId::try_new("p")?, TextOffset::try_new(1)?, Affinity::After);
    Ok(RichLocalSession::try_new(
        context.clone(),
        document,
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
        HistoryCapacity::try_new(capacity)?,
    )?)
}

fn super_context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/other")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}

fn id(value: &str) -> Result<RichRootId, RichRootSetError> {
    RichRootId::try_new(value)
}

fn text(owner: &RichMultiRootSession, root: &str) -> Result<String, Box<dyn std::error::Error>> {
    let session = owner.root(&id(root)?).ok_or("root")?;
    let document = session.state().document();
    let node = document
        .document()
        .node_at(document.block_path(&BlockId::try_new("p")?).ok_or("path")?)?
        .as_element()
        .ok_or("element")?
        .clone();
    Ok(node
        .children()
        .iter()
        .filter_map(breditor_core::document::NodeRef::as_text)
        .map(breditor_core::document::TextNode::text)
        .collect())
}

fn type_in(owner: &mut RichMultiRootSession, root: &str, value: &str) -> TestResult {
    owner.dispatch(&id(root)?, |session| {
        Ok(session.insert_plain_text(&session.snapshot(), value)?)
    })?;
    Ok(())
}

fn owner(
    roots: &[&str],
    capacity: u32,
) -> Result<RichMultiRootSession, Box<dyn std::error::Error>> {
    owner_in(&context()?, roots, capacity)
}

fn owner_in(
    context: &EditorContext,
    roots: &[&str],
    capacity: u32,
) -> Result<RichMultiRootSession, Box<dyn std::error::Error>> {
    let mut owner = RichMultiRootSession::new(context.clone());
    for root in roots {
        owner.add_root(RichRootMeta::bare(id(root)?), session(context, root, capacity)?, None)?;
    }
    Ok(owner)
}

#[test]
fn global_undo_and_redo_follow_chronological_order_across_roots() -> TestResult {
    let mut owner = owner(&["header", "content", "sidebar"], 100)?;
    type_in(&mut owner, "header", "A")?;
    type_in(&mut owner, "content", "B")?;
    type_in(&mut owner, "header", "C")?;
    assert_eq!(owner.set().undo_depth(), 3);
    assert_eq!(owner.set().active(), Some(&id("header")?));
    assert_eq!(owner.undo()?, Some(id("header")?));
    assert_eq!(text(&owner, "header")?, "xA");
    assert_eq!(owner.undo()?, Some(id("content")?));
    assert_eq!(text(&owner, "content")?, "x");
    assert_eq!(owner.set().active(), Some(&id("content")?));
    assert_eq!(owner.undo()?, Some(id("header")?));
    assert_eq!(text(&owner, "header")?, "x");
    assert_eq!(owner.undo()?, None);
    assert_eq!(owner.redo()?, Some(id("header")?));
    assert_eq!(owner.redo()?, Some(id("content")?));
    assert_eq!(text(&owner, "content")?, "xB");
    assert_eq!(owner.set().redo_depth(), 1);
    assert_eq!(owner.set().redo_target(), Some(&id("header")?));
    Ok(())
}

#[test]
fn a_new_edit_in_any_root_clears_the_global_redo_branch() -> TestResult {
    let mut owner = owner(&["a", "b"], 100)?;
    type_in(&mut owner, "a", "1")?;
    type_in(&mut owner, "b", "2")?;
    owner.undo()?;
    assert_eq!(owner.set().redo_target(), Some(&id("b")?));
    type_in(&mut owner, "a", "3")?;
    assert_eq!(owner.set().redo_depth(), 0);
    assert_eq!(owner.redo()?, None);
    // Root b still holds its orphaned unit locally, but global history never reaches it.
    assert_eq!(owner.root(&id("b")?).ok_or("b")?.redo_depth(), 1);
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(owner.undo()?, None);
    assert_eq!(text(&owner, "b")?, "x");
    Ok(())
}

#[test]
fn typing_bursts_group_per_root_and_stay_globally_ordered() -> TestResult {
    let mut owner = owner(&["a", "b"], 100)?;
    for root in ["a", "b"] {
        owner.dispatch(&id(root)?, |s| Ok(s.enable_typing_history(&s.snapshot())?))?;
    }
    for (clock, value) in [(10, "h"), (20, "i")] {
        owner.dispatch(&id("a")?, |s| Ok(s.insert_typing_text(&s.snapshot(), value, clock)?))?;
    }
    assert_eq!(owner.set().journal(), &[id("a")?]);
    owner.dispatch(&id("b")?, |s| Ok(s.insert_typing_text(&s.snapshot(), "!", 30)?))?;
    assert_eq!(owner.set().journal(), &[id("a")?, id("b")?]);
    assert_eq!(owner.undo()?, Some(id("b")?));
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(text(&owner, "a")?, "x");
    Ok(())
}

#[test]
fn capacity_eviction_drops_the_oldest_units_of_that_root_only() -> TestResult {
    let mut owner = owner(&["a", "b"], 2)?;
    type_in(&mut owner, "b", "0")?;
    for value in ["1", "2", "3"] {
        type_in(&mut owner, "a", value)?;
    }
    assert_eq!(owner.set().journal(), &[id("b")?, id("a")?, id("a")?]);
    Ok(())
}

#[test]
fn out_of_order_local_undo_is_reordered_not_lost() -> TestResult {
    let mut owner = owner(&["a", "b"], 100)?;
    type_in(&mut owner, "a", "1")?;
    type_in(&mut owner, "b", "2")?;
    // A host bypassing global routing undoes root a directly.
    owner.dispatch(&id("a")?, |s| Ok(s.undo(&s.snapshot())?))?;
    assert_eq!(owner.set().journal(), &[id("b")?, id("a")?]);
    assert_eq!(owner.set().cursor(), 1);
    assert_eq!(owner.redo()?, Some(id("a")?));
    assert_eq!(text(&owner, "a")?, "x1");
    Ok(())
}

#[test]
fn roots_are_added_and_removed_outside_history() -> TestResult {
    let context = context()?;
    let mut owner = owner_in(&context, &["a", "b"], 100)?;
    type_in(&mut owner, "a", "1")?;
    type_in(&mut owner, "b", "2")?;
    assert!(matches!(
        owner.add_root(
            RichRootMeta::bare(id("foreign")?),
            session(&super_context()?, "f", 100)?,
            None
        ),
        Err(RichRootSetError::ContextMismatch)
    ));
    let mut used = session(&context, "c", 100)?;
    used.insert_plain_text(&used.snapshot(), "z")?;
    assert!(matches!(
        owner.add_root(RichRootMeta::bare(id("c")?), used, None),
        Err(RichRootSetError::HistoryNotEmpty)
    ));
    assert!(matches!(
        owner.add_root(RichRootMeta::bare(id("a")?), session(&context, "a2", 100)?, None),
        Err(RichRootSetError::DuplicateRoot)
    ));
    owner.add_root(RichRootMeta::bare(id("c")?), session(&context, "c", 100)?, Some(0))?;
    let order: Vec<_> = owner.set().roots().map(|meta| meta.id().as_str().to_owned()).collect();
    assert_eq!(order, ["c", "a", "b"]);
    assert_eq!(owner.set().undo_depth(), 2);
    let (meta, removed) = owner.remove_root(&id("b")?)?;
    assert_eq!(meta.id(), &id("b")?);
    assert_eq!(removed.undo_depth(), 1);
    assert_eq!(owner.set().journal(), &[id("a")?]);
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(owner.undo()?, None);
    assert!(matches!(owner.focus(&id("b")?), Err(RichRootSetError::UnknownRoot)));
    Ok(())
}

#[test]
fn checkpoint_restores_every_root_and_the_global_order() -> TestResult {
    let mut owner = owner(&["header", "content"], 100)?;
    type_in(&mut owner, "header", "A")?;
    type_in(&mut owner, "content", "B")?;
    type_in(&mut owner, "header", "C")?;
    owner.undo()?;
    let mut attributes = BTreeMap::new();
    attributes.insert("order".to_owned(), "10".to_owned());
    owner.set_attributes(&id("content")?, attributes)?;
    let encoded = owner.checkpoint()?;
    let mut restored = RichMultiRootSession::restore(context()?, &encoded)?;
    assert_eq!(restored.set().meta(&id("content")?).ok_or("meta")?.attributes()["order"], "10");
    assert_eq!(restored.set().active(), Some(&id("header")?));
    assert_eq!(restored.set().journal(), owner.set().journal());
    assert_eq!(restored.set().cursor(), 2);
    assert_eq!(restored.checkpoint()?, encoded);
    assert_eq!(restored.redo()?, Some(id("header")?));
    assert_eq!(text(&restored, "header")?, "xAC");
    assert_eq!(restored.undo()?, Some(id("header")?));
    assert_eq!(restored.undo()?, Some(id("content")?));
    assert_eq!(restored.undo()?, Some(id("header")?));
    assert_eq!(text(&restored, "header")?, "x");

    // A journal that disagrees with any root's exact history is rejected.
    let mut value: serde_json::Value = serde_json::from_str(&encoded)?;
    value["journal"] = json!(["content", "content", "header"]);
    assert!(matches!(
        RichMultiRootSession::restore(context()?, &value.to_string()),
        Err(RichRootSetError::HistoryMismatch)
    ));
    for (field, bad) in [
        ("journal", json!(["nope"])),
        ("cursor", json!(9)),
        ("active", json!("missing")),
        ("formatVersion", json!(2)),
    ] {
        let mut value: serde_json::Value = serde_json::from_str(&encoded)?;
        value[field] = bad;
        assert!(RichRootSetCheckpoint::decode(&value.to_string()).is_err(), "{field}");
    }
    let mut value: serde_json::Value = serde_json::from_str(&encoded)?;
    value["roots"][1]["id"] = json!("header");
    assert!(RichRootSetCheckpoint::decode(&value.to_string()).is_err());
    Ok(())
}

#[test]
fn root_identity_and_metadata_are_bounded() -> TestResult {
    for bad in ["", "1abc", "has space", "a.b", &"a".repeat(65)] {
        assert!(RichRootId::try_new(bad).is_err(), "{bad}");
    }
    assert!(RichRootId::try_new("left-side_2").is_ok());
    assert!(RichRootMeta::try_new(id("a")?, Some("bad\u{0}".to_owned()), BTreeMap::new()).is_err());
    let mut attributes = BTreeMap::new();
    attributes.insert("bad key".to_owned(), "v".to_owned());
    assert!(RichRootMeta::try_new(id("a")?, None, attributes).is_err());
    let context = context()?;
    let mut set = RichRootSet::new();
    let root = session(&context, "a", 100)?;
    set.add_root(RichRootMeta::bare(id("a")?), &root, None)?;
    let mut attributes = BTreeMap::new();
    attributes.insert("order".to_owned(), "1".to_owned());
    set.set_attributes(&id("a")?, attributes)?;
    assert_eq!(set.meta(&id("a")?).ok_or("meta")?.attributes()["order"], "1");
    for index in 1..64 {
        set.add_root(RichRootMeta::bare(id(&format!("r{index}"))?), &root, None)?;
    }
    assert!(matches!(
        set.add_root(RichRootMeta::bare(id("overflow")?), &root, None),
        Err(RichRootSetError::TooManyRoots)
    ));
    Ok(())
}
