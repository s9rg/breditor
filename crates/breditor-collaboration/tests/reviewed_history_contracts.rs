//! Public opt-in owner contracts: real host effects, exact local ordering and independent recovery.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, DocumentSuggestionDraft as Draft, DocumentSuggestionEdit as Edit,
        DocumentSuggestionEffectVerification as Verification,
        DocumentSuggestionPreparation as Preparation, DocumentSuggestionScope as Scope,
        OwnedSuggestionAcceptance, ReviewedHistoryIdentity, RichReplica, SharedRichProfile,
        WriterGroupPreparation,
        actions::{
            DeleteText, InsertRow, InsertText, ListStyle, RangeTextRun, ReplaceGeneralTextRangeV1,
            ReplaceTextRange, SetFormat, SetHeading, SetImageCaption, WrapList,
        },
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup() -> Result<(SharedRichProfile, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/reviewed-history","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let owner = profile.create(&json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/reviewed-history","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string(), "101".into())?;
    Ok((profile, owner))
}
fn identity() -> Result<ReviewedHistoryIdentity> {
    Ok(ReviewedHistoryIdentity {
        binding: "b".repeat(64),
        principal: ReviewPrincipalId::try_new("alice")?,
        effect_writer: "404".into(),
    })
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn configure(a: &mut RichReplica, scope: u8, typing: bool) -> Result {
    if scope == 1 {
        a.enable_general_ranges_guarded(&a.observe()?)?;
    }
    if scope == 2 {
        a.enable_document_selection_guarded(&a.observe()?)?;
    }
    if typing {
        a.enable_typing_history_guarded(&a.observe()?)?;
    }
    Ok(())
}
fn accept(
    profile: &SharedRichProfile,
    a: &mut RichReplica,
    commands: Vec<Command>,
) -> Result<(String, OwnedSuggestionAcceptance)> {
    let mut host = profile.join_frame("room".into(), "404".into(), &a.update_frame()?)?;
    accept_on(&mut host, a, commands, "1")
}
fn accept_on(
    host: &mut RichReplica,
    a: &mut RichReplica,
    commands: Vec<Command>,
    sequence: &str,
) -> Result<(String, OwnedSuggestionAcceptance)> {
    host.receive_frame(&a.update_frame()?)?;
    let packet = host.capture_document_suggestion_guarded(
        &host.observe()?,
        "Review",
        ReviewPrincipalId::try_new("proposer")?,
        "0",
        Draft { scope: Scope::Commands, edit: Edit::Commands(commands) },
    )?;
    let Preparation::Ready(preview) =
        host.prepare_document_suggestion_guarded(&host.observe()?, &packet)?
    else {
        return Err("ready".into());
    };
    let prepared = host.prepare_document_suggestion_effect(&preview)?;
    let effect = host.commit_document_suggestion_effect(prepared)?;
    a.receive_frame(&host.update_frame()?)?;
    let acceptance = OwnedSuggestionAcceptance {
        binding: identity()?.binding,
        sequence: sequence.into(),
        principal: identity()?.principal,
        accepting_writer: a.writer().into(),
        effect,
    };
    Ok((packet, acceptance))
}
fn adopt(a: &mut RichReplica, packet: &str, receipt: &OwnedSuggestionAcceptance) -> Result<bool> {
    let observed = if a.document_selected() { a.observe_document()? } else { a.observe()? };
    let Verification::Verified(proof) =
        a.verify_document_suggestion_effect_guarded(&observed, packet, &receipt.effect)?
    else {
        return Err("verified".into());
    };
    Ok(a.adopt_suggestion_history_guarded(&proof, packet, receipt.clone())?)
}
fn reopen(profile: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    let saved = a.reviewed_checkpoint()?;
    let restored = profile.restore_reviewed("room", &saved)?;
    assert_eq!(restored.reviewed_checkpoint()?, saved);
    assert_eq!(restored.update_frame()?, a.update_frame()?);
    let mut before: Value = serde_json::from_str(&a.view_json()?)?;
    let mut after: Value = serde_json::from_str(&restored.view_json()?)?;
    // Recovery deliberately restores no runtime permission or its local revision marker.
    for value in [&mut before, &mut after] {
        value.as_object_mut().ok_or("view")?.remove("readOnly");
        value.as_object_mut().ok_or("view")?.remove("readOnlyRevision");
    }
    assert_eq!(after, before);
    Ok(restored)
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn range(block: &str, a: u32, b: u32) -> Selection {
    Selection::TextRange { anchor: point(block, a), focus: point(block, b) }
}
fn text(a: &RichReplica, block: &str) -> Result<String> {
    fn find<'a>(node: &'a Value, id: &str) -> Option<&'a Value> {
        if node["properties"]["breditor/block-id"] == id {
            Some(node)
        } else {
            node["children"].as_array()?.iter().find_map(|child| find(child, id))
        }
    }
    let value: Value = serde_json::from_str(a.document_json())?;
    Ok(find(&value["root"], block).ok_or("block")?["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .filter_map(|run| run["text"].as_str())
        .collect())
}
#[test]
fn explicit_activation_retains_existing_undo_and_redo_in_all_six_policies() -> Result {
    for scope in 0..=2 {
        for typing in [false, true] {
            let (profile, mut a) = setup()?;
            configure(&mut a, scope, typing)?;
            a.apply(vec![insert("p", "First ")])?;
            a.apply(vec![insert("caption", "Second ")])?;
            a.undo()?;
            let frame = a.update_frame()?;
            let baseline = a.document_json().to_owned();
            let old = a.observe()?;
            assert!(a.enable_reviewed_history_guarded(&old, identity()?)?);
            assert!(a.check(&old).is_err());
            assert_eq!((a.undo_count(), a.redo_count()), (1, 1));
            assert_eq!(a.update_frame()?, frame);
            assert!(!a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?);
            let mut b = reopen(&profile, &a)?;
            for redo in [true, false, false, true, true] {
                assert_eq!(
                    if redo { a.redo()? } else { a.undo()? },
                    if redo { b.redo()? } else { b.undo()? }
                );
                assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
                b = reopen(&profile, &a)?;
            }
            assert_ne!(a.document_json(), baseline);
        }
    }
    Ok(())
}
#[test]
fn owned_effect_is_once_only_and_ordered_between_local_edits_with_exact_future_recovery() -> Result
{
    let cases = vec![
        vec![insert("p", "Accepted ")],
        vec![Command::SetHeading(SetHeading { block: "p".into(), level: Some(3) })],
        vec![Command::WrapList(WrapList {
            first: "p".into(),
            last: "p".into(),
            container: "accepted-list".into(),
            items: vec!["accepted-item".into()],
            style: ListStyle::Bullet,
        })],
        vec![Command::InsertRow(InsertRow {
            block: "table-block".into(),
            row_block: "accepted-row-block".into(),
            row: "accepted-row".into(),
            before: None,
        })],
        vec![Command::SetImageCaption(SetImageCaption {
            block: "image-block".into(),
            caption: Some(
                json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"accepted-caption"},"children":[{"kind":"text","text":"New caption 日本 🙂","formats":[]}]}),
            ),
        })],
    ];
    for commands in cases {
        let (profile, mut a) = setup()?;
        a.apply(vec![insert("p", "Before ")])?;
        a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
        let before_effect = a.document_json().to_owned();
        let (packet, receipt) = accept(&profile, &mut a, commands)?;
        let accepted = a.document_json().to_owned();
        let frame = a.update_frame()?;
        assert!(adopt(&mut a, &packet, &receipt)?);
        assert_eq!(a.update_frame()?, frame, "adoption creates no document operations");
        assert_eq!(a.undo_count(), 2);
        let saved = a.reviewed_checkpoint()?;
        assert!(!adopt(&mut a, &packet, &receipt)?);
        assert_eq!(a.reviewed_checkpoint()?, saved);
        a.apply(vec![insert("p", "After ")])?;
        let completed = a.document_json().to_owned();
        let mut b = reopen(&profile, &a)?;
        for (redo, expected) in
            [(false, &accepted), (false, &before_effect), (true, &accepted), (true, &completed)]
        {
            assert!(if redo { a.redo()? } else { a.undo()? });
            assert!(if redo { b.redo()? } else { b.undo()? });
            assert_eq!(a.document_json(), expected);
            assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
            b = reopen(&profile, &a)?;
        }
        a.undo()?;
        a.undo()?;
        a.apply(vec![insert("p", "New branch ")])?;
        let saved = a.reviewed_checkpoint()?;
        assert!(!adopt(&mut a, &packet, &receipt)?);
        assert_eq!(a.reviewed_checkpoint()?, saved);
        assert_eq!(a.adopted_suggestion(&receipt.effect.suggestion_id), Some(&receipt));
        reopen(&profile, &a)?;
    }
    Ok(())
}
#[test]
fn ownership_and_stale_proof_failures_are_atomic_and_old_readers_stay_closed() -> Result {
    let (profile, mut a) = setup()?;
    let old = a.checkpoint()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let (packet, receipt) = accept(&profile, &mut a, vec![insert("p", "Accepted ")])?;
    let original = a.reviewed_checkpoint()?;
    for case in 0..6 {
        let mut wrong = receipt.clone();
        match case {
            0 => wrong.binding = "a".repeat(64),
            1 => wrong.principal = ReviewPrincipalId::try_new("other")?,
            2 => wrong.accepting_writer = "202".into(),
            3 => wrong.sequence = "01".into(),
            4 => wrong.sequence = "0".into(),
            5 => wrong.effect.writer_group.writer = "303".into(),
            _ => unreachable!(),
        }
        let Verification::Verified(proof) =
            a.verify_document_suggestion_effect_guarded(&a.observe()?, &packet, &receipt.effect)?
        else {
            return Err("proof".into());
        };
        assert!(a.adopt_suggestion_history_guarded(&proof, &packet, wrong).is_err());
        assert_eq!(a.reviewed_checkpoint()?, original);
    }
    let Verification::Verified(proof) =
        a.verify_document_suggestion_effect_guarded(&a.observe()?, &packet, &receipt.effect)?
    else {
        return Err("proof".into());
    };
    let mut foreign = reopen(&profile, &a)?;
    assert!(foreign.adopt_suggestion_history_guarded(&proof, &packet, receipt.clone()).is_err());
    a.set_selection(Some(&range("p", 1, 1)))?;
    let current = a.reviewed_checkpoint()?;
    assert!(a.adopt_suggestion_history_guarded(&proof, &packet, receipt.clone()).is_err());
    assert_eq!(a.reviewed_checkpoint()?, current);
    assert!(adopt(&mut a, &packet, &receipt)?);
    assert!(a.checkpoint().is_err());
    assert!(a.general_checkpoint().is_err());
    assert!(a.typing_checkpoint().is_err());
    let saved = a.reviewed_checkpoint()?;
    let value: Value = serde_json::from_str(&saved)?;
    for input in [&saved, &value["journal"].to_string()] {
        assert!(profile.restore("room", input).is_err());
        assert!(profile.restore_general("room", input).is_err());
        assert!(profile.restore_document("room", input).is_err());
        assert!(profile.restore_typing("room", input).is_err());
    }
    assert!(profile.restore_reviewed("room", &old).is_err());
    for case in 0..6 {
        let mut wrong = value.clone();
        match case {
            0 => wrong["formatVersion"] = json!(2),
            1 => wrong["unknown"] = json!(true),
            2 => wrong["journal"]["entries"][0]["identity"]["effectWriter"] = json!("101"),
            3 => {
                wrong["journal"]["entries"].as_array_mut().ok_or("entries")?.remove(0);
            }
            4 => wrong["journal"]["entries"][2]["acceptance"]["acceptingWriter"] = json!("202"),
            5 => wrong["joins"] = json!([0]),
            _ => unreachable!(),
        }
        assert!(profile.restore_reviewed("room", &wrong.to_string()).is_err(), "tamper {case}");
    }
    Ok(())
}
#[test]
fn typing_group_boundary_and_recreated_text_cursors_survive_reviewed_replay() -> Result {
    let (profile, mut a) = setup()?;
    configure(&mut a, 0, true)?;
    a.set_selection(Some(&range("p", 1, 1)))?;
    a.insert_typing_text_guarded(&a.observe()?, "A", 1)?;
    a.insert_typing_text_guarded(&a.observe()?, "B", 2)?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    assert_eq!((a.undo_count(), a.history_step_count()), (1, 2));
    a.insert_typing_text_guarded(&a.observe()?, "C", 3)?;
    assert_eq!(a.undo_count(), 2, "activation closes typing continuation");
    let mut b = reopen(&profile, &a)?;
    for redo in [false, false, true, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
        b = reopen(&profile, &a)?;
    }
    assert_eq!(a.selection()?, Some(range("p", 4, 4)));
    a.set_selection(Some(&range("p", 1, 4)))?;
    a.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 1, length: 3 })])?;
    a.undo()?;
    assert_eq!(a.selection()?, Some(range("p", 1, 4)));
    assert_eq!(text(&a, "p")?, "aABC🙂b");
    reopen(&profile, &a)?;
    Ok(())
}
#[test]
fn six_policies_keep_peer_text_and_arrival_order_instead_of_original_accept_click() -> Result {
    for scope in 0..=2 {
        for typing in [false, true] {
            let (profile, mut a) = setup()?;
            configure(&mut a, scope, typing)?;
            a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
            let (packet, receipt) = accept(&profile, &mut a, vec![insert("p", "Accepted ")])?;
            a.apply(vec![insert("caption", "Typed while waiting ")])?;
            let mut peer = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
            peer.apply(vec![insert("p", "Peer ")])?;
            a.receive_frame(&peer.update_frame()?)?;
            // The owned decision arrives after this device has continued editing. Its item is
            // appended here, never retroactively inserted at the original offline Accept click.
            assert!(adopt(&mut a, &packet, &receipt)?);
            let mut b = reopen(&profile, &a)?;
            for redo in [false, true, false, true] {
                assert!(if redo { a.redo()? } else { a.undo()? });
                assert!(if redo { b.redo()? } else { b.undo()? });
                assert!(text(&a, "caption")?.starts_with("Typed while waiting "));
                assert_eq!(text(&a, "p")?, if redo { "Peer Accepted a🙂b" } else { "Peer a🙂b" });
                assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
                b = reopen(&profile, &a)?;
            }
        }
    }
    Ok(())
}
#[test]
fn invisible_ordinary_item_cannot_skip_an_intervening_owned_accept() -> Result {
    let (profile, mut a) = setup()?;
    a.apply(vec![insert("p", "Older ")])?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let (packet, receipt) = accept(&profile, &mut a, vec![insert("caption", "Accepted ")])?;
    adopt(&mut a, &packet, &receipt)?;
    a.apply(vec![insert("p", "Invisible ")])?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    peer.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 10 })])?;
    a.receive_frame(&peer.update_frame()?)?;
    let mut b = reopen(&profile, &a)?;
    assert!(a.undo()?);
    assert!(b.undo()?);
    assert_eq!((a.undo_count(), a.redo_count()), (1, 1));
    assert_eq!(text(&a, "p")?, "Older a🙂b");
    assert_eq!(text(&a, "caption")?, "xy🙂");
    assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
    b = reopen(&profile, &a)?;
    assert!(a.redo()?);
    assert!(b.redo()?);
    assert_eq!(text(&a, "p")?, "Older a🙂b");
    assert_eq!(text(&a, "caption")?, "Accepted xy🙂");
    assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
    Ok(())
}
#[test]
fn original_decision_order_is_unique_and_read_only_adoption_does_not_grant_writes() -> Result {
    let (profile, mut a) = setup()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    assert!(a.enable_reviewed_history_guarded(&a.observe()?, identity()?).is_err());
    a.set_read_only_guarded(&a.observe()?, false)?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let mut host = profile.join_frame("room".into(), "404".into(), &a.update_frame()?)?;
    let (packet, receipt) = accept_on(&mut host, &mut a, vec![insert("p", "First ")], "1")?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    assert!(adopt(&mut a, &packet, &receipt)?);
    let saved = a.reviewed_checkpoint()?;
    assert!(a.undo().is_err());
    assert!(a.redo().is_err());
    assert_eq!(a.reviewed_checkpoint()?, saved);
    a.set_read_only_guarded(&a.observe()?, false)?;
    let (second, mut second_receipt) =
        accept_on(&mut host, &mut a, vec![insert("caption", "Second ")], "1")?;
    let saved = a.reviewed_checkpoint()?;
    assert!(adopt(&mut a, &second, &second_receipt).is_err());
    assert_eq!(a.reviewed_checkpoint()?, saved);
    second_receipt.sequence = "2".into();
    assert!(adopt(&mut a, &second, &second_receipt)?);
    assert_eq!(a.undo_count(), 2);
    let mut b = reopen(&profile, &a)?;
    for redo in [false, false, true, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
    }
    Ok(())
}
#[test]
fn wholly_invisible_pop_publishes_history_without_authoring_an_inverse() -> Result {
    let (profile, mut a) = setup()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    a.apply(vec![insert("p", "Invisible ")])?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    peer.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 10 })])?;
    a.receive_frame(&peer.update_frame()?)?;
    let mut b = reopen(&profile, &a)?;
    let observed = a.observe()?;
    let frame = a.update_frame()?;
    assert!(!a.undo()?);
    assert!(!b.undo()?);
    assert!(a.check(&observed).is_err());
    assert_eq!((a.undo_count(), a.redo_count()), (0, 0));
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
    let saved = a.reviewed_checkpoint()?;
    assert!(!a.undo()?);
    assert_eq!(a.reviewed_checkpoint()?, saved);
    reopen(&profile, &a)?;
    Ok(())
}
#[test]
fn overlapping_native_effect_cannot_be_adopted_under_a_second_proposal_identity() -> Result {
    let (profile, mut a) = setup()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let mut host = profile.join_frame("room".into(), "404".into(), &a.update_frame()?)?;
    let commands = vec![insert("p", "Accepted ")];
    let alternate = host.capture_document_suggestion_guarded(
        &host.observe()?,
        "Same commands, different proposal",
        ReviewPrincipalId::try_new("other-proposer")?,
        "0",
        Draft { scope: Scope::Commands, edit: Edit::Commands(commands.clone()) },
    )?;
    let (packet, receipt) = accept_on(&mut host, &mut a, commands, "1")?;
    adopt(&mut a, &packet, &receipt)?;
    let mut other = receipt.clone();
    other.sequence = "2".into();
    other.effect.suggestion_id = a.read_document_suggestion(&alternate)?.id;
    let Verification::Verified(proof) =
        a.verify_document_suggestion_effect_guarded(&a.observe()?, &alternate, &other.effect)?
    else {
        return Err("matching native range".into());
    };
    let saved = a.reviewed_checkpoint()?;
    assert!(a.adopt_suggestion_history_guarded(&proof, &alternate, other).is_err());
    assert_eq!(a.reviewed_checkpoint()?, saved);
    Ok(())
}
#[test]
fn opt_in_scope_upgrades_and_whole_document_selection_preserve_reviewed_history() -> Result {
    let (profile, mut a) = setup()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let (packet, receipt) = accept(&profile, &mut a, vec![insert("p", "Accepted ")])?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.enable_document_selection_guarded(&a.observe()?)?;
    a.enable_typing_history_guarded(&a.observe()?)?;
    a.select_document_guarded(&a.observe()?)?;
    assert!(adopt(&mut a, &packet, &receipt)?);
    assert!(a.document_selected());
    let mut b = profile.restore_reviewed("room", &a.reviewed_checkpoint()?)?;
    assert_eq!(b.document_view_json()?, a.document_view_json()?);
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert!(a.document_selected());
        assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
        b = profile.restore_reviewed("room", &a.reviewed_checkpoint()?)?;
    }
    Ok(())
}
#[test]
fn accepted_effect_uses_the_accepting_devices_selection_and_recovers_it_after_redo() -> Result {
    for backward in [false, true] {
        let (profile, mut a) = setup()?;
        a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
        let (packet, receipt) = accept(&profile, &mut a, vec![insert("p", "Accepted ")])?;
        let selection = if backward { range("p", 7, 1) } else { range("p", 1, 7) };
        a.set_selection(Some(&selection))?;
        adopt(&mut a, &packet, &receipt)?;
        let mut b = reopen(&profile, &a)?;
        for redo in [false, true, false, true] {
            assert_eq!(
                if redo { a.redo()? } else { a.undo()? },
                if redo { b.redo()? } else { b.undo()? }
            );
            assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
            if redo {
                assert_eq!(a.selection()?, Some(selection.clone()));
            } else {
                assert_eq!(a.selection()?, Some(range("p", 0, 0)));
            }
            b = reopen(&profile, &a)?;
        }
    }
    Ok(())
}
#[test]
fn protected_general_ranges_share_the_same_ordered_stack_and_recovery() -> Result {
    for scope in [1, 2] {
        for typing in [false, true] {
            for backward in [false, true] {
                let (profile, mut a) = setup()?;
                configure(&mut a, scope, typing)?;
                a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
                let target = Selection::TextRange {
                    anchor: point(if backward { "caption" } else { "p" }, 1),
                    focus: point(if backward { "p" } else { "caption" }, 1),
                };
                let request = |selection: &Selection, text: &str, prefix: &str| {
                    json!({"selection":selection,"runs":[{"text":text,"formatsJson":"[]"}],"prefix":prefix}).to_string()
                };
                a.replace_general_range_text_namespace_json_guarded(
                    &a.observe()?,
                    &request(&target, "First", "first-range"),
                )?;
                let before = a.document_json().to_owned();
                let mut host =
                    profile.join_frame("room".into(), "404".into(), &a.update_frame()?)?;
                configure(&mut host, scope, typing)?;
                let Selection::TextRange { anchor, focus } = &target else {
                    unreachable!();
                };
                let packet = host.capture_document_suggestion_guarded(
                    &host.observe()?,
                    "Protected range",
                    ReviewPrincipalId::try_new("proposer")?,
                    "0",
                    Draft {
                        scope: Scope::Commands,
                        edit: Edit::GeneralText(ReplaceGeneralTextRangeV1 {
                            range: ReplaceTextRange {
                                anchor: anchor.clone(),
                                focus: focus.clone(),
                                runs: vec![RangeTextRun {
                                    text: "Accepted".into(),
                                    formats: vec![],
                                }],
                            },
                            empty: vec![],
                        }),
                    },
                )?;
                let Preparation::Ready(preview) =
                    host.prepare_document_suggestion_guarded(&host.observe()?, &packet)?
                else {
                    return Err("preview".into());
                };
                let prepared = host.prepare_document_suggestion_effect(&preview)?;
                let effect = host.commit_document_suggestion_effect(prepared)?;
                a.receive_frame(&host.update_frame()?)?;
                let receipt = OwnedSuggestionAcceptance {
                    binding: identity()?.binding,
                    sequence: "1".into(),
                    principal: identity()?.principal,
                    accepting_writer: a.writer().into(),
                    effect,
                };
                adopt(&mut a, &packet, &receipt)?;
                let accepted = a.document_json().to_owned();
                // The second replacement has consumed x and y; the caption now begins with
                // a surrogate pair. Offset 1 would split that pair and must remain invalid.
                let after_target = if backward {
                    Selection::TextRange { anchor: point("caption", 0), focus: point("p", 1) }
                } else {
                    Selection::TextRange { anchor: point("p", 1), focus: point("caption", 0) }
                };
                a.replace_general_range_text_namespace_json_guarded(
                    &a.observe()?,
                    &request(&after_target, "After", "after-range"),
                )?;
                let after = a.document_json().to_owned();
                let mut b = reopen(&profile, &a)?;
                for (redo, expected) in
                    [(false, &accepted), (false, &before), (true, &accepted), (true, &after)]
                {
                    assert_eq!(
                        if redo { a.redo()? } else { a.undo()? },
                        if redo { b.redo()? } else { b.undo()? }
                    );
                    assert_eq!(a.document_json(), expected);
                    assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
                    b = reopen(&profile, &a)?;
                }
            }
        }
    }
    Ok(())
}
#[test]
fn later_peer_format_choice_keeps_priority_through_owned_undo_and_redo() -> Result {
    let (profile, mut a) = setup()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let format = json!({"type":"breditor-inline/italic","properties":{}});
    let action = |enabled| {
        Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: format.clone(),
            enabled,
        })
    };
    let (packet, receipt) = accept(&profile, &mut a, vec![action(true)])?;
    adopt(&mut a, &packet, &receipt)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    peer.apply(vec![action(false)])?;
    a.receive_frame(&peer.update_frame()?)?;
    let expected = a.document_json().to_owned();
    let mut b = reopen(&profile, &a)?;
    for redo in [false, true, false, true] {
        assert_eq!(
            if redo { a.redo()? } else { a.undo()? },
            if redo { b.redo()? } else { b.undo()? }
        );
        assert_eq!(a.document_json(), expected);
        assert_eq!(a.reviewed_checkpoint()?, b.reviewed_checkpoint()?);
        b = reopen(&profile, &a)?;
    }
    Ok(())
}
#[test]
fn owned_inverses_are_ordinary_atomic_local_writer_groups_with_reviewed_receiver_saves() -> Result {
    let (profile, mut a) = setup()?;
    a.enable_reviewed_history_guarded(&a.observe()?, identity()?)?;
    let (packet, receipt) = accept(&profile, &mut a, vec![insert("p", "Accepted ")])?;
    let before = a.writer_clock_v2("101")?;
    adopt(&mut a, &packet, &receipt)?;
    assert_eq!(a.writer_clock_v2("101")?, before);
    let mut peer = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    peer.enable_reviewed_history_guarded(&peer.observe()?, identity()?)?;
    let mut after = before.through;
    for redo in [false, true, false, true] {
        assert!(if redo { a.redo()? } else { a.undo()? });
        let batch: Value =
            serde_json::from_str(&a.writer_groups_v2_guarded(&a.observe()?, &after)?)?;
        let groups = batch["groups"].as_array().ok_or("groups")?;
        assert_eq!(groups.len(), 1);
        let group = groups[0].as_str().ok_or("group")?;
        let WriterGroupPreparation::Prepared(prepared) =
            peer.prepare_writer_group_v2("101", group)?
        else {
            return Err("prepared inverse".into());
        };
        assert!(prepared.checkpoint().is_err());
        let saved = prepared.reviewed_checkpoint()?;
        let recovered = profile.restore_reviewed("room", &saved)?;
        peer.commit_writer_group(*prepared)?;
        assert_eq!(peer.reviewed_checkpoint()?, saved);
        assert_eq!(peer.document_json(), a.document_json());
        assert_eq!(peer.update_frame()?, recovered.update_frame()?);
        assert_eq!(peer.undo_count(), 0, "the accepting device alone owns this inverse");
        assert!(matches!(
            peer.prepare_writer_group_v2("101", group)?,
            WriterGroupPreparation::Duplicate(_)
        ));
        after = batch["through"].as_str().ok_or("through")?.into();
    }
    Ok(())
}
