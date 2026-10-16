//! Native natural history retains every explicit revision and survives exact recovery.
#![cfg(feature = "experimental-rich-content")]
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec, RichTypingSessionJsonCodec},
    document::FormatSet,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichLocalOutcome, RichLocalSession, RichLocalSessionError,
        RichSelectionKind, RichTextPoint, RichTypingDeleteDirection,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use proptest::prelude::*;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn point(offset: u64) -> Result<RichTextPoint> {
    Ok(RichTextPoint::new(BlockId::try_new("p")?, TextOffset::try_new(offset)?, Affinity::After))
}
fn range(start: u64, end: u64) -> Result<RichSelectionKind> {
    Ok(RichSelectionKind::TextRange { anchor: point(start)?, focus: point(end)? })
}
fn setup(capacity: u32) -> Result<(EditorContext, RichLocalSession)> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("example/typing-history")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/typing-history","version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?}).to_string();
    let document = RichDocument::try_admit(
        context.schema(),
        DocumentJsonCodecV2::new(context.schema().clone()).decode(&input)?,
        context.limits(),
    )?;
    let owner = RichLocalSession::try_new(
        context.clone(),
        document,
        Some(range(1, 1)?),
        HistoryCapacity::try_new(capacity)?,
    )?;
    Ok((context, owner))
}
fn text(owner: &RichLocalSession) -> Result<String> {
    let path = owner.state().document().block_path(&BlockId::try_new("p")?).ok_or("block")?;
    let node = owner.state().document().document().node_at(path)?.as_element().ok_or("element")?;
    Ok(node
        .children()
        .iter()
        .filter_map(breditor_core::document::NodeRef::as_text)
        .map(breditor_core::document::TextNode::text)
        .collect())
}
fn offset(owner: &RichLocalSession) -> Result<u64> {
    let Some(selection) = owner.state().selection() else {
        return Err("selection".into());
    };
    let RichSelectionKind::TextRange { focus, .. } = selection.kind() else {
        return Err("text selection".into());
    };
    Ok(focus.offset().get())
}
fn type_text(owner: &mut RichLocalSession, input: &str, time: u64) -> Result {
    assert_eq!(
        owner.insert_typing_text(&owner.snapshot(), input, time)?,
        RichLocalOutcome::ContentCommitted
    );
    Ok(())
}

#[test]
fn contiguous_unicode_keys_are_one_atomic_undo_and_keep_original_step_revisions() -> Result {
    let (context, mut a) = setup(100)?;
    let before = a.state().document().document().clone();
    a.enable_typing_history(&a.snapshot())?;
    let codec = RichTypingSessionJsonCodec::new(context.clone());
    for (clock, input) in [(100, "Q"), (200, "🙂"), (300, "e\u{301}")] {
        type_text(&mut a, input, clock)?;
    }
    assert_eq!(text(&a)?, "aQ🙂e\u{301}🙂b");
    assert_eq!(offset(&a)?, 6);
    assert_eq!((a.undo_depth(), a.redo_depth(), a.history_step_count()), (1, 0, 3));
    let checkpoint = codec.encode(&a)?;
    let value: Value = serde_json::from_str(&checkpoint)?;
    assert_eq!(value["groups"], json!([3]));
    assert_eq!(value["checkpoint"]["entries"].as_array().ok_or("entries")?.len(), 3);
    for entry in value["checkpoint"]["entries"].as_array().ok_or("entries")? {
        let before = entry["before"]["revision"].as_str().ok_or("revision")?.parse::<u64>()?;
        assert_eq!(
            entry["after"]["revision"].as_str().ok_or("revision")?.parse::<u64>()?,
            before + 1
        );
    }
    let old = RichSessionJsonCodec::new(context);
    assert!(old.encode(&a).is_err());
    assert!(old.decode(&checkpoint).is_err());
    let mut b = codec.decode(&checkpoint)?;
    assert_eq!(codec.encode(&b)?, checkpoint);
    let revision = a.state().revision().get();
    a.undo(&a.snapshot())?;
    b.undo(&b.snapshot())?;
    assert_eq!(a.state().revision().get(), revision + 1);
    assert_eq!(a.state().document().document(), &before);
    assert_eq!(offset(&a)?, 1);
    assert_eq!((a.undo_depth(), a.redo_depth()), (0, 1));
    assert_eq!(codec.encode(&a)?, codec.encode(&b)?);
    a.redo(&a.snapshot())?;
    b.redo(&b.snapshot())?;
    assert_eq!(codec.encode(&a)?, codec.encode(&b)?);
    assert_eq!(offset(&a)?, 6);
    Ok(())
}

#[test]
fn time_direction_publication_and_explicit_close_are_native_boundaries() -> Result {
    let (context, mut a) = setup(100)?;
    a.enable_typing_history(&a.snapshot())?;
    type_text(&mut a, "a", 1000)?;
    type_text(&mut a, "b", 1750)?;
    assert_eq!(a.undo_depth(), 1);
    type_text(&mut a, "c", 2501)?;
    type_text(&mut a, "d", 100)?;
    assert_eq!(a.undo_depth(), 3);
    let saved = RichTypingSessionJsonCodec::new(context.clone()).encode(&a)?;
    assert_eq!(a.insert_typing_text(&a.snapshot(), "", u64::MAX)?, RichLocalOutcome::Unchanged);
    assert_eq!(RichTypingSessionJsonCodec::new(context).encode(&a)?, saved);
    type_text(&mut a, "e", 101)?;
    assert_eq!(a.undo_depth(), 3);
    let stale = a.snapshot();
    assert!(a.close_typing_group(&stale)?);
    assert!(!a.close_typing_group(&a.snapshot())?);
    assert!(matches!(
        a.insert_typing_text(&stale, "stale", 102),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    type_text(&mut a, "f", 102)?;
    assert_eq!(a.undo_depth(), 4);
    a.set_pending_formats(&a.snapshot(), Some(FormatSet::default()))?;
    type_text(&mut a, "g", 103)?;
    assert_eq!(a.undo_depth(), 5);
    a.set_read_only(&a.snapshot(), true)?;
    a.set_read_only(&a.snapshot(), false)?;
    type_text(&mut a, "h", 104)?;
    assert_eq!(a.undo_depth(), 6);
    a.insert_plain_text(&a.snapshot(), "Paste")?;
    type_text(&mut a, "i", 105)?;
    assert_eq!(a.undo_depth(), 8);
    Ok(())
}

#[test]
fn directional_deletion_groups_restore_the_actual_pre_edit_caret_and_unicode() -> Result {
    for direction in [RichTypingDeleteDirection::Backward, RichTypingDeleteDirection::Forward] {
        let (context, mut a) = setup(100)?;
        a.enable_typing_history(&a.snapshot())?;
        let (caret, first, second) = match direction {
            RichTypingDeleteDirection::Backward => (4, range(3, 4)?, range(3, 1)?),
            RichTypingDeleteDirection::Forward => (0, range(0, 1)?, range(0, 2)?),
        };
        a.set_selection(&a.snapshot(), Some(range(caret, caret)?))?;
        a.delete_typing_range(&a.snapshot(), &first, direction, 100)?;
        a.delete_typing_range(&a.snapshot(), &second, direction, 200)?;
        assert_eq!((a.undo_depth(), a.history_step_count()), (1, 2));
        let after = text(&a)?;
        let codec = RichTypingSessionJsonCodec::new(context);
        let mut b = codec.decode(&codec.encode(&a)?)?;
        for owner in [&mut a, &mut b] {
            owner.undo(&owner.snapshot())?;
            assert_eq!(text(owner)?, "a🙂b");
            assert_eq!(offset(owner)?, caret);
            owner.redo(&owner.snapshot())?;
            assert_eq!(text(owner)?, after);
        }
        assert_eq!(codec.encode(&a)?, codec.encode(&b)?);
    }
    Ok(())
}

#[test]
fn invalid_or_stale_input_is_atomic_and_does_not_break_a_live_group() -> Result {
    let (context, mut a) = setup(100)?;
    let old = RichSessionJsonCodec::new(context.clone());
    let before = old.encode(&a)?;
    assert!(matches!(
        a.insert_typing_text(&a.snapshot(), "Q", 1),
        Err(RichLocalSessionError::TypingHistoryDisabled)
    ));
    assert_eq!(old.encode(&a)?, before);
    let stale = a.snapshot();
    a.enable_typing_history(&a.snapshot())?;
    type_text(&mut a, "Q", 100)?;
    let codec = RichTypingSessionJsonCodec::new(context);
    let before = codec.encode(&a)?;
    assert!(a.insert_typing_text(&stale, "stale", 101).is_err());
    assert!(
        a.delete_typing_range(
            &a.snapshot(),
            &range(0, 1)?,
            RichTypingDeleteDirection::Forward,
            101
        )
        .is_err()
    );
    // Caret is at 2, and the smiley occupies 2..4. A scalar-splitting target is invalid.
    assert!(
        a.delete_typing_range(
            &a.snapshot(),
            &range(2, 3)?,
            RichTypingDeleteDirection::Forward,
            101
        )
        .is_err()
    );
    assert_eq!(codec.encode(&a)?, before);
    type_text(&mut a, "R", 200)?;
    assert_eq!(a.undo_depth(), 1);
    a.set_read_only(&a.snapshot(), true)?;
    let before = codec.encode(&a)?;
    assert!(matches!(
        a.insert_typing_text(&a.snapshot(), "X", 300),
        Err(RichLocalSessionError::ReadOnly)
    ));
    assert_eq!(codec.encode(&a)?, before);
    Ok(())
}

#[test]
fn line_separators_and_input_kind_changes_isolate_both_sides() -> Result {
    let (_, mut a) = setup(100)?;
    a.enable_typing_history(&a.snapshot())?;
    type_text(&mut a, "A", 100)?;
    type_text(&mut a, "\n", 101)?;
    type_text(&mut a, "B", 102)?;
    assert_eq!(a.undo_depth(), 3);
    a.delete_typing_range(&a.snapshot(), &range(3, 4)?, RichTypingDeleteDirection::Backward, 103)?;
    a.delete_typing_range(&a.snapshot(), &range(2, 3)?, RichTypingDeleteDirection::Backward, 104)?;
    a.delete_typing_range(&a.snapshot(), &range(1, 2)?, RichTypingDeleteDirection::Backward, 105)?;
    assert_eq!(a.undo_depth(), 6);
    assert_eq!(text(&a)?, "a🙂b");
    Ok(())
}

#[test]
fn step_ceiling_capacity_trimming_and_branch_replacement_preserve_partition() -> Result {
    let (context, mut a) = setup(100)?;
    a.enable_typing_history(&a.snapshot())?;
    for index in 0..65 {
        type_text(&mut a, "x", index)?;
    }
    assert_eq!((a.undo_depth(), a.history_step_count()), (2, 65));
    let codec = RichTypingSessionJsonCodec::new(context);
    let value: Value = serde_json::from_str(&codec.encode(&a)?)?;
    assert_eq!(value["groups"], json!([64, 1]));
    a.undo(&a.snapshot())?;
    type_text(&mut a, "z", 100)?;
    assert_eq!((a.undo_depth(), a.redo_depth()), (2, 0));
    codec.decode(&codec.encode(&a)?)?;
    for capacity in [0, 1, 3] {
        let (context, mut a) = setup(capacity)?;
        a.enable_typing_history(&a.snapshot())?;
        for index in 0..6 {
            type_text(&mut a, "x", index)?;
        }
        assert_eq!(a.history_step_count(), capacity);
        let codec = RichTypingSessionJsonCodec::new(context);
        let mut b = codec.decode(&codec.encode(&a)?)?;
        a.undo(&a.snapshot())?;
        b.undo(&b.snapshot())?;
        assert_eq!(codec.encode(&a)?, codec.encode(&b)?);
        assert_eq!(text(&a)?, format!("a{}🙂b", "x".repeat((6 - capacity) as usize)));
        a.redo(&a.snapshot())?;
        b.redo(&b.snapshot())?;
        assert_eq!(codec.encode(&a)?, codec.encode(&b)?);
    }
    Ok(())
}

#[test]
fn strict_group_envelope_rejects_malformed_partitions_and_tight_limits() -> Result {
    let (context, mut a) = setup(100)?;
    a.enable_typing_history(&a.snapshot())?;
    for index in 0..3 {
        type_text(&mut a, "x", index)?;
    }
    let codec = RichTypingSessionJsonCodec::new(context.clone());
    let saved = codec.encode(&a)?;
    let valid: Value = serde_json::from_str(&saved)?;
    for groups in [json!([]), json!([0, 3]), json!([2]), json!([65]), json!([1, 1, 1, 1])] {
        let mut invalid = valid.clone();
        invalid["groups"] = groups;
        assert!(codec.decode(&invalid.to_string()).is_err());
    }
    let mut invalid = valid.clone();
    invalid["checkpoint"]["cursor"] = json!(1);
    assert!(codec.decode(&invalid.to_string()).is_err());
    let mut invalid = valid.clone();
    invalid["extra"] = json!(false);
    assert!(codec.decode(&invalid.to_string()).is_err());
    let duplicate = saved.replacen("\"groups\":", "\"groups\":[3],\"groups\":", 1);
    assert!(codec.decode(&duplicate).is_err());
    let tight =
        RichTypingSessionJsonCodec::new(context.clone()).with_max_json_bytes(saved.len() - 1);
    assert!(tight.encode(&a).is_err());
    assert!(tight.decode(&saved).is_err());
    let tight = RichTypingSessionJsonCodec::new(context)
        .with_max_history_entries(HistoryCapacity::try_new(2)?);
    assert!(tight.encode(&a).is_err());
    assert!(tight.decode(&saved).is_err());
    let mut restored = codec.decode(&saved)?;
    assert_eq!(codec.encode(&restored)?, saved);
    type_text(&mut restored, "next", 3)?;
    assert_eq!(restored.undo_depth(), 2);
    Ok(())
}

#[test]
fn enabling_keeps_existing_history_units_and_redundant_enable_is_exact_noop() -> Result {
    let (context, mut a) = setup(100)?;
    a.insert_plain_text(&a.snapshot(), "one")?;
    a.insert_plain_text(&a.snapshot(), "two")?;
    a.undo(&a.snapshot())?;
    a.enable_typing_history(&a.snapshot())?;
    assert_eq!((a.undo_depth(), a.redo_depth()), (1, 1));
    let codec = RichTypingSessionJsonCodec::new(context);
    let before = codec.encode(&a)?;
    let observed = a.snapshot();
    assert!(!a.enable_typing_history(&observed)?);
    a.validate_observation(&observed)?;
    assert_eq!(codec.encode(&a)?, before);
    a.redo(&a.snapshot())?;
    assert_eq!(a.undo_depth(), 2);
    a.undo(&a.snapshot())?;
    assert_eq!(text(&a)?, "aone🙂b");
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]
    #[test]
    fn random_input_boundaries_branches_and_small_capacities_keep_exact_replay(
        capacity in 0u32..10,
        events in prop::collection::vec((0u8..10,any::<u16>()),1..50),
    ) {
        let result=(|| -> Result {
            let (context,mut owner)=setup(capacity)?;
            owner.enable_typing_history(&owner.snapshot())?;
            let codec=RichTypingSessionJsonCodec::new(context);
            for (kind,clock) in events {
                match kind {
                    0|1 => type_text(&mut owner,"x",u64::from(clock))?,
                    2 => {owner.insert_plain_text(&owner.snapshot(),"p")?;},
                    3 => {owner.close_typing_group(&owner.snapshot())?;},
                    4|5 => {
                        let mut restored=codec.decode(&codec.encode(&owner)?)?;
                        if kind==4 {owner.undo(&owner.snapshot())?;restored.undo(&restored.snapshot())?;}
                        else {owner.redo(&owner.snapshot())?;restored.redo(&restored.snapshot())?;}
                        assert_eq!(codec.encode(&owner)?,codec.encode(&restored)?);
                    },
                    6 => {owner.set_selection(&owner.snapshot(),Some(range(0,0)?))?;},
                    7 => {owner.set_read_only(&owner.snapshot(),true)?;owner.set_read_only(&owner.snapshot(),false)?;},
                    8 => {owner.set_pending_formats(&owner.snapshot(),Some(FormatSet::default()))?;},
                    _ => {
                        let end=offset(&owner)?;
                        if end>0 {
                            let mut at=0u64;let mut start=0;
                            for scalar in text(&owner)?.chars() {
                                if at>=end {break;}start=at;at+=scalar.len_utf16() as u64;
                            }
                            owner.delete_typing_range(&owner.snapshot(),&range(start,end)?,RichTypingDeleteDirection::Backward,u64::from(clock))?;
                        }
                    }
                }
                assert!(owner.history_step_count()<=capacity);
                let saved=codec.encode(&owner)?;
                let restored=codec.decode(&saved)?;
                assert_eq!(codec.encode(&restored)?,saved);
                assert_eq!((owner.undo_depth(),owner.redo_depth()),(restored.undo_depth(),restored.redo_depth()));
            }
            Ok(())
        })();
        prop_assert!(result.is_ok(),"{result:?}");
    }
}

#[test]
fn revision_exhaustion_cannot_partially_undo_a_burst_or_change_policy() -> Result {
    let (context, mut owner) = setup(100)?;
    let original = RichSessionJsonCodec::new(context.clone());
    let mut initial: Value = serde_json::from_str(&original.encode(&owner)?)?;
    initial["currentState"]["revision"] = json!(u64::MAX.to_string());
    let mut exhausted = original.decode(&initial.to_string())?;
    let before = original.encode(&exhausted)?;
    assert!(exhausted.enable_typing_history(&exhausted.snapshot()).is_err());
    assert!(!exhausted.typing_history_enabled());
    assert_eq!(original.encode(&exhausted)?, before);
    owner.enable_typing_history(&owner.snapshot())?;
    type_text(&mut owner, "one", 1)?;
    type_text(&mut owner, "two", 2)?;
    let codec = RichTypingSessionJsonCodec::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&owner)?)?;
    value["checkpoint"]["currentState"]["revision"] = json!((u64::MAX - 1).to_string());
    let mut owner = codec.decode(&value.to_string())?;
    type_text(&mut owner, "last", 3)?;
    let before = codec.encode(&owner)?;
    let observed = owner.snapshot();
    assert!(owner.close_typing_group(&observed).is_err());
    assert!(owner.undo(&observed).is_err());
    assert!(owner.insert_typing_text(&observed, "overflow", 4).is_err());
    assert!(owner.set_read_only(&observed, true).is_err());
    owner.validate_observation(&observed)?;
    assert_eq!(codec.encode(&owner)?, before);
    assert!(!owner.is_read_only());
    Ok(())
}
