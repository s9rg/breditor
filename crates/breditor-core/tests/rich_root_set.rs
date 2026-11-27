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
            RICH_ROOT_STRUCTURE_STEPS_MAX, RichMultiRootSession, RichRootId, RichRootJournalEntry,
            RichRootMeta, RichRootSet, RichRootSetCheckpoint, RichRootSetError,
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

/// Journal as text: a root id for a content unit, `kind:root` for a structure step.
fn journal(owner: &RichMultiRootSession) -> Vec<String> {
    owner
        .set()
        .journal()
        .iter()
        .map(|entry| match entry {
            RichRootJournalEntry::Unit(id) => id.as_str().to_owned(),
            RichRootJournalEntry::Structure(step) => {
                format!("{}:{}", step.kind(), step.root().as_str())
            }
        })
        .collect()
}

fn order(owner: &RichMultiRootSession) -> Vec<String> {
    owner.set().roots().map(|meta| meta.id().as_str().to_owned()).collect()
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
    assert_eq!(journal(&owner), ["a"]);
    owner.dispatch(&id("b")?, |s| Ok(s.insert_typing_text(&s.snapshot(), "!", 30)?))?;
    assert_eq!(journal(&owner), ["a", "b"]);
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
    assert_eq!(journal(&owner), ["b", "a", "a"]);
    Ok(())
}

#[test]
fn out_of_order_local_undo_is_reordered_not_lost() -> TestResult {
    let mut owner = owner(&["a", "b"], 100)?;
    type_in(&mut owner, "a", "1")?;
    type_in(&mut owner, "b", "2")?;
    // A host bypassing global routing undoes root a directly.
    owner.dispatch(&id("a")?, |s| Ok(s.undo(&s.snapshot())?))?;
    assert_eq!(journal(&owner), ["b", "a"]);
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
    assert_eq!(journal(&owner), ["a"]);
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(owner.undo()?, None);
    assert!(matches!(owner.focus(&id("b")?), Err(RichRootSetError::UnknownRoot)));
    Ok(())
}

#[test]
fn checkpoint_restores_every_root_and_the_global_order() -> TestResult {
    let context = context()?;
    let mut owner = owner_in(&context, &["header"], 100)?;
    let mut attributes = BTreeMap::new();
    attributes.insert("order".to_owned(), "10".to_owned());
    // Initial composition metadata is not a history step.
    owner.add_root(
        RichRootMeta::try_new(id("content")?, None, attributes)?,
        session(&context, "content", 100)?,
        None,
    )?;
    type_in(&mut owner, "header", "A")?;
    type_in(&mut owner, "content", "B")?;
    type_in(&mut owner, "header", "C")?;
    owner.undo()?;
    let encoded = owner.checkpoint()?;
    // Without structure steps the envelope is still written as version 1.
    assert_eq!(serde_json::from_str::<serde_json::Value>(&encoded)?["formatVersion"], 1);
    let mut restored = RichMultiRootSession::restore(context.clone(), &encoded)?;
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
        RichMultiRootSession::restore(context.clone(), &value.to_string()),
        Err(RichRootSetError::HistoryMismatch)
    ));
    for (field, bad) in [
        ("journal", json!(["nope"])),
        ("cursor", json!(9)),
        ("active", json!("missing")),
        ("formatVersion", json!(3)),
        // Version 1 cannot carry structure steps or detached roots.
        ("journal", json!([{"step":"move","root":"header","from":0,"to":1}])),
        ("detached", json!([])),
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

#[test]
fn undoable_removal_retains_the_root_and_undo_restores_it_exactly() -> TestResult {
    let mut owner = owner(&["header", "content", "sidebar"], 100)?;
    type_in(&mut owner, "content", "1")?;
    type_in(&mut owner, "header", "2")?;
    owner.focus(&id("content")?)?;
    let meta = owner.remove_root_undoable(&id("content")?)?;
    assert_eq!(meta.id(), &id("content")?);
    assert_eq!(order(&owner), ["header", "sidebar"]);
    // The removed root was active; its right neighbour takes over.
    assert_eq!(owner.set().active(), Some(&id("sidebar")?));
    assert_eq!(journal(&owner), ["content", "header", "remove:content"]);
    assert!(owner.root(&id("content")?).is_none());
    assert_eq!(owner.detached_root(&id("content")?).ok_or("retained")?.undo_depth(), 1);
    // A detached root accepts no commands and cannot take focus.
    assert!(matches!(owner.focus(&id("content")?), Err(RichRootSetError::UnknownRoot)));
    assert!(matches!(
        owner.dispatch(&id("content")?, |s| Ok(s.insert_plain_text(&s.snapshot(), "!")?)),
        Err(RichRootSetError::UnknownRoot)
    ));
    type_in(&mut owner, "sidebar", "3")?;

    assert_eq!(owner.undo()?, Some(id("sidebar")?));
    assert_eq!(owner.undo()?, Some(id("content")?));
    // Same id, same position, same document and history; it becomes active.
    assert_eq!(order(&owner), ["header", "content", "sidebar"]);
    assert_eq!(owner.set().active(), Some(&id("content")?));
    assert_eq!(text(&owner, "content")?, "x1");
    assert_eq!(owner.set().detached().count(), 0);
    assert_eq!(owner.undo()?, Some(id("header")?));
    assert_eq!(owner.undo()?, Some(id("content")?));
    assert_eq!(text(&owner, "content")?, "x");
    assert_eq!(owner.undo()?, None);

    for _ in 0..3 {
        owner.redo()?;
    }
    assert_eq!(order(&owner), ["header", "sidebar"]);
    assert_eq!(owner.redo()?, Some(id("sidebar")?));
    assert_eq!(text(&owner, "sidebar")?, "x3");
    assert_eq!(owner.redo()?, None);
    Ok(())
}

#[test]
fn undoable_addition_detaches_on_undo_and_is_released_when_redo_is_cleared() -> TestResult {
    let context = context()?;
    let mut owner = owner_in(&context, &["a", "b"], 100)?;
    owner.add_root_undoable(RichRootMeta::bare(id("c")?), session(&context, "c", 100)?, Some(1))?;
    assert_eq!(order(&owner), ["a", "c", "b"]);
    assert_eq!(owner.set().active(), Some(&id("c")?));
    type_in(&mut owner, "c", "!")?;
    assert_eq!(journal(&owner), ["add:c", "c"]);
    assert_eq!(owner.undo()?, Some(id("c")?));
    assert_eq!(owner.undo()?, Some(id("c")?));
    assert_eq!(order(&owner), ["a", "b"]);
    assert!(owner.detached_root(&id("c")?).is_some());
    assert_eq!(owner.redo()?, Some(id("c")?));
    assert_eq!(order(&owner), ["a", "c", "b"]);
    assert_eq!(owner.redo()?, Some(id("c")?));
    assert_eq!(text(&owner, "c")?, "x!");
    owner.undo()?;
    owner.undo()?;
    // A new edit clears the global redo branch: the undone addition can never return.
    type_in(&mut owner, "a", "1")?;
    assert!(owner.detached_root(&id("c")?).is_none());
    assert_eq!(owner.set().detached().count(), 0);
    assert_eq!(journal(&owner), ["a"]);
    // Its id is free again.
    owner.add_root_undoable(RichRootMeta::bare(id("c")?), session(&context, "c2", 100)?, None)?;
    assert_eq!(order(&owner), ["a", "b", "c"]);
    Ok(())
}

#[test]
fn root_moves_and_attribute_changes_are_global_undo_steps() -> TestResult {
    let mut owner = owner(&["a", "b", "c"], 100)?;
    type_in(&mut owner, "a", "1")?;
    assert!(owner.move_root(&id("a")?, 2)?);
    assert!(!owner.move_root(&id("a")?, 2)?);
    assert_eq!(order(&owner), ["b", "c", "a"]);
    assert!(owner.set_attribute(&id("b")?, "order", "1")?);
    assert!(!owner.set_attribute(&id("b")?, "order", "1")?);
    assert!(owner.set_attribute(&id("b")?, "section", "intro")?);
    assert!(owner.remove_attribute(&id("b")?, "order")?);
    assert!(!owner.remove_attribute(&id("b")?, "order")?);
    assert_eq!(journal(&owner), ["a", "move:a", "attributes:b", "attributes:b", "attributes:b"]);
    let attributes = |owner: &RichMultiRootSession| -> Result<Vec<String>, RichRootSetError> {
        Ok(owner
            .set()
            .meta(&id("b")?)
            .ok_or(RichRootSetError::UnknownRoot)?
            .attributes()
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect())
    };
    assert_eq!(attributes(&owner)?, ["section=intro"]);
    owner.undo()?;
    assert_eq!(attributes(&owner)?, ["order=1", "section=intro"]);
    owner.undo()?;
    owner.undo()?;
    assert!(attributes(&owner)?.is_empty());
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(order(&owner), ["a", "b", "c"]);
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(text(&owner, "a")?, "x");
    for _ in 0..5 {
        owner.redo()?;
    }
    assert_eq!(order(&owner), ["b", "c", "a"]);
    assert_eq!(attributes(&owner)?, ["section=intro"]);
    Ok(())
}

#[test]
fn structure_steps_refuse_with_typed_errors_and_change_nothing() -> TestResult {
    let context = context()?;
    let mut empty = RichMultiRootSession::new(context.clone());
    assert!(matches!(
        empty.add_root_undoable(RichRootMeta::bare(id("a")?), session(&context, "a", 100)?, None),
        Err(RichRootSetError::LastRoot)
    ));
    let mut owner = owner_in(&context, &["a", "b"], 100)?;
    owner.remove_root_undoable(&id("b")?)?;
    assert!(matches!(owner.remove_root_undoable(&id("a")?), Err(RichRootSetError::LastRoot)));
    assert!(matches!(owner.remove_root(&id("a")?), Err(RichRootSetError::LastRoot)));
    assert!(matches!(owner.remove_root_undoable(&id("b")?), Err(RichRootSetError::UnknownRoot)));
    assert!(matches!(owner.remove_root_undoable(&id("zz")?), Err(RichRootSetError::UnknownRoot)));
    // A removed root's id stays reserved while Undo can bring it back.
    assert!(matches!(
        owner.add_root_undoable(RichRootMeta::bare(id("b")?), session(&context, "b2", 100)?, None),
        Err(RichRootSetError::DuplicateRoot)
    ));
    assert!(matches!(
        owner.add_root(RichRootMeta::bare(id("a")?), session(&context, "a2", 100)?, None),
        Err(RichRootSetError::DuplicateRoot)
    ));
    assert!(matches!(
        owner.add_root_undoable(
            RichRootMeta::bare(id("c")?),
            session(&context, "c", 100)?,
            Some(9)
        ),
        Err(RichRootSetError::IndexOutOfRange)
    ));
    assert!(matches!(owner.move_root(&id("a")?, 1), Err(RichRootSetError::IndexOutOfRange)));
    let revision = owner.set().revision();
    owner.set().check_revision(revision)?;
    type_in(&mut owner, "a", "1")?;
    assert!(matches!(owner.set().check_revision(revision), Err(RichRootSetError::StaleRevision)));
    // The newest step is a's content unit: a structure undo is refused, not misapplied.
    let mut set = owner.set().clone();
    assert!(matches!(set.undo_structure(), Err(RichRootSetError::NoStructureStep)));
    assert!(matches!(set.redo_structure(), Err(RichRootSetError::NoStructureStep)));
    assert_eq!((set.cursor(), set.revision()), (owner.set().cursor(), owner.set().revision()));
    Ok(())
}

#[test]
fn a_change_outside_history_is_a_barrier_for_positional_steps() -> TestResult {
    let context = context()?;
    let mut owner = owner_in(&context, &["a", "b", "c"], 100)?;
    type_in(&mut owner, "b", "1")?;
    owner.remove_root_undoable(&id("b")?)?;
    owner.set_attribute(&id("a")?, "k", "v")?;
    owner.move_root(&id("c")?, 0)?;
    owner.add_root(RichRootMeta::bare(id("d")?), session(&context, "d", 100)?, Some(0))?;
    // Positions recorded before the outside change could no longer be exact.
    assert_eq!(journal(&owner), ["attributes:a"]);
    assert!(owner.detached_root(&id("b")?).is_none());
    assert_eq!(owner.undo()?, Some(id("a")?));
    assert_eq!(owner.undo()?, None);
    assert_eq!(order(&owner), ["d", "c", "a"]);
    Ok(())
}

#[test]
fn structure_history_is_bounded_oldest_first() -> TestResult {
    let mut owner = owner(&["a", "b"], 100)?;
    owner.remove_root_undoable(&id("b")?)?;
    for value in 0..RICH_ROOT_STRUCTURE_STEPS_MAX {
        owner.set_attribute(&id("a")?, "n", &value.to_string())?;
    }
    assert_eq!(owner.set().journal().len(), RICH_ROOT_STRUCTURE_STEPS_MAX);
    // The oldest step (b's removal) left history, so b was released.
    assert_eq!(owner.set().detached().count(), 0);
    assert!(owner.detached_root(&id("b")?).is_none());
    Ok(())
}

#[test]
fn version_2_checkpoint_persists_structure_steps_and_detached_roots() -> TestResult {
    let mut owner = owner(&["header", "content", "sidebar"], 100)?;
    type_in(&mut owner, "content", "1")?;
    owner.set_attribute(&id("header")?, "order", "1")?;
    owner.remove_root_undoable(&id("content")?)?;
    owner.move_root(&id("sidebar")?, 0)?;
    owner.undo()?;
    let encoded = owner.checkpoint()?;
    let value: serde_json::Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["formatVersion"], 2);
    assert_eq!(value["detached"][0]["id"], "content");
    assert_eq!(value["journal"][2], json!({"step":"remove","root":"content","index":1}));
    let mut restored = RichMultiRootSession::restore(context()?, &encoded)?;
    assert_eq!(restored.checkpoint()?, encoded);
    assert_eq!(journal(&restored), journal(&owner));
    assert_eq!(restored.redo()?, Some(id("sidebar")?));
    assert_eq!(order(&restored), ["sidebar", "header"]);
    restored.undo()?;
    assert_eq!(restored.undo()?, Some(id("content")?));
    assert_eq!(order(&restored), ["header", "content", "sidebar"]);
    assert_eq!(text(&restored, "content")?, "x1");
    restored.undo()?;
    assert_eq!(restored.undo()?, Some(id("content")?));
    assert_eq!(text(&restored, "content")?, "x");

    let tamper = |edit: &dyn Fn(&mut serde_json::Value)| -> Result<bool, serde_json::Error> {
        let mut value: serde_json::Value = serde_json::from_str(&encoded)?;
        edit(&mut value);
        Ok(RichRootSetCheckpoint::decode(&value.to_string()).is_err())
    };
    // A recorded position that does not replay exactly.
    assert!(tamper(&|v| v["journal"][2]["index"] = json!(5))?);
    assert!(tamper(&|v| v["journal"][3]["from"] = json!(0))?);
    // Attributes that do not match the set at that point.
    assert!(tamper(&|v| v["journal"][1]["after"] = json!({"order":"2"}))?);
    // A detached root nothing can restore, or one that is also attached.
    assert!(tamper(&|v| v["journal"][2] = json!("header"))?);
    assert!(tamper(&|v| v["detached"][0]["id"] = json!("header"))?);
    // Unknown step kinds and fields.
    assert!(tamper(&|v| v["journal"][3]["step"] = json!("rename"))?);
    assert!(tamper(&|v| v["journal"][3]["extra"] = json!(1))?);
    // Version 2 requires the detached list.
    assert!(tamper(&|v| {
        if let Some(object) = v.as_object_mut() {
            object.remove("detached");
        }
    })?);
    // Untouched, it decodes.
    assert!(!tamper(&|_| {})?);
    Ok(())
}
