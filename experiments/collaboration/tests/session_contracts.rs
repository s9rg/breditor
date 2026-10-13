//! Native checks of the actual journal coordinator, not a parallel test mock.

use breditor_collab_feasibility::{
    Error,
    actions::{
        Command, DeleteText, InsertText, ResizeColumn, SetImageAlt, SetImageAsset, TextTarget,
    },
    anchor::{Affinity, TextAnchor},
    session::Session,
};
use loro::{ExportMode, LoroDoc};

type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn noncanonical_cell_keys_cannot_create_aliases_for_the_same_stable_cell() -> TestResult {
    let mut a = session("2801")?;
    let before = a.checkpoint()?;
    let b = LoroDoc::new();
    b.set_peer_id(2802)?;
    b.get_map("cells")
        .ensure_mergeable_map("01:t1:r1:c")?
        .ensure_mergeable_text("body")?
        .insert(0, "alias")?;
    b.commit();
    assert!(matches!(a.receive(b.export(ExportMode::all_updates())?), Err(Error::Contract(_))));
    assert_eq!(a.checkpoint()?, before);
    assert_eq!(a.view()["cells"], serde_json::json!({}));
    Ok(())
}

fn strong(offset: u32, length: u32, enabled: bool) -> Command {
    Command::SetStrong(breditor_collab_feasibility::actions::SetStrong {
        target: TextTarget::Body,
        offset,
        length,
        enabled,
    })
}

#[test]
fn undo_of_strong_format_retains_another_authors_overlapping_format() -> TestResult {
    let mut a = session("2401")?;
    let mut b = session("2402")?;
    a.apply(vec![insert(0, "a🙂b")])?;
    b.receive(a.updates()?)?;
    a.apply(vec![strong(0, 4, true)])?;
    b.apply(vec![strong(1, 2, true)])?;
    let a_bytes = a.updates()?;
    a.receive(b.updates()?)?;
    b.receive(a_bytes)?;
    assert_eq!(a.view(), b.view());
    a.undo()?;
    assert_eq!(
        a.view()["body_runs"],
        serde_json::json!([
            { "text": "a", "strong": false }, { "text": "🙂", "strong": true }, { "text": "b", "strong": false }
        ])
    );
    let mut restored = Session::restore(&a.checkpoint()?)?;
    restored.redo()?;
    assert_eq!(
        restored.view()["body_runs"],
        serde_json::json!([{ "text": "a🙂b", "strong": true }])
    );
    checkpoint_oracle(&restored)
}

#[test]
fn disabling_then_undoing_format_reveals_the_other_authors_prior_contribution() -> TestResult {
    let mut a = session("2501")?;
    let mut b = session("2502")?;
    a.apply(vec![insert(0, "text"), strong(0, 4, true)])?;
    b.receive(a.updates()?)?;
    b.apply(vec![strong(0, 4, false)])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.view()["body_runs"][0]["strong"], false);
    b.undo()?;
    a.receive(b.updates()?)?;
    assert_eq!(a.view()["body_runs"][0]["strong"], true);
    assert_eq!(a.body(), "text");
    b.redo()?;
    a.receive(b.updates()?)?;
    assert_eq!(a.view()["body_runs"][0]["strong"], false);
    checkpoint_oracle(&a)
}

#[test]
fn text_undo_redo_retains_remote_formatting_of_the_restored_text() -> TestResult {
    let mut a = session("2601")?;
    let mut b = session("2602")?;
    a.apply(vec![insert(0, "a🙂b")])?;
    b.receive(a.updates()?)?;
    b.apply(vec![strong(1, 2, true)])?;
    a.receive(b.updates()?)?;
    let formatted = a.view()["body_runs"].clone();
    a.undo()?;
    assert_eq!(a.body(), "");
    a.redo()?;
    assert_eq!(a.view()["body_runs"], formatted);
    checkpoint_oracle(&a)
}

#[test]
fn malformed_remote_format_is_isolated_and_does_not_erase_the_undo_owner() -> TestResult {
    let mut a = session("2701")?;
    a.apply(vec![insert(0, "local")])?;
    let before = a.checkpoint()?;
    let b = LoroDoc::new();
    b.set_peer_id(2702)?;
    b.import(&a.updates()?)?;
    b.get_text("body").mark(0..5, "bold", true)?;
    b.commit();
    assert!(matches!(a.receive(b.export(ExportMode::all_updates())?), Err(Error::Contract(_))));
    assert_eq!(a.checkpoint()?, before);
    a.undo()?;
    assert_eq!(a.body(), "");
    Ok(())
}

fn session(peer: &str) -> Result<Session, Error> {
    Session::new("room-one".into(), peer.into())
}
fn insert(offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { target: TextTarget::Body, offset, text: text.into() })
}
fn checkpoint_oracle(session: &Session) -> TestResult {
    let recovered = Session::restore(&session.checkpoint()?)?;
    assert_eq!(recovered.view(), session.view());
    assert_eq!(recovered.version(), session.version());
    assert_eq!(recovered.undo_count(), session.undo_count());
    assert_eq!(recovered.redo_count(), session.redo_count());
    assert_eq!(recovered.selection_offsets()?, session.selection_offsets()?);
    Ok(())
}

#[test]
fn directional_selection_and_history_survive_remote_edits_and_restart() -> TestResult {
    let mut a = session("2201")?;
    a.set_body_selection(0, 0)?;
    a.apply(vec![insert(0, "a🙂b")])?;
    a.set_body_selection(3, 1)?;
    let version = a.version();
    let count = a.undo_count();
    a.apply(vec![insert(3, "X")])?;
    a.set_body_selection(4, 4)?;
    assert_eq!(a.undo_count(), count + 1);
    assert_ne!(a.version(), version);
    let mut b = session("2202")?;
    b.receive(a.updates()?)?;
    b.apply(vec![insert(0, "remote ")])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.selection_offsets()?, Some((11, 11)));
    let mut recovered = Session::restore(&a.checkpoint()?)?;
    assert!(recovered.undo()?);
    assert_eq!(recovered.body(), "remote a🙂b");
    assert_eq!(recovered.selection_offsets()?, Some((10, 8)));
    assert!(recovered.redo()?);
    assert_eq!(recovered.body(), "remote a🙂Xb");
    assert_eq!(recovered.selection_offsets()?, Some((11, 11)));
    checkpoint_oracle(&recovered)
}

#[test]
fn superseded_metadata_undo_consumes_history_even_when_it_has_no_content_effect() -> TestResult {
    let mut a = session("2301")?;
    let mut b = session("2302")?;
    a.apply(vec![Command::ResizeColumn(ResizeColumn { column: "c".into(), width: 260 })])?;
    b.receive(a.updates()?)?;
    b.apply(vec![Command::ResizeColumn(ResizeColumn { column: "c".into(), width: 300 })])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.view()["columns"]["c"]["width"], 300);
    a.undo()?;
    assert_eq!(a.undo_count(), 0);
    assert_eq!(a.view()["columns"]["c"]["width"], 300);
    b.receive(a.updates()?)?;
    b.undo()?;
    a.receive(b.updates()?)?;
    assert!(
        a.view()["columns"]["c"].get("width").is_none(),
        "undoing both authors must not resurrect an earlier undone value"
    );
    a.redo()?;
    assert_eq!(a.view()["columns"]["c"]["width"], 260);
    b.receive(a.updates()?)?;
    b.redo()?;
    a.receive(b.updates()?)?;
    assert_eq!(a.view()["columns"]["c"]["width"], 300);
    checkpoint_oracle(&a)
}

#[test]
fn recovered_selective_group_retains_remote_alt_and_text() -> TestResult {
    let mut a = session("1001")?;
    let mut b = session("1002")?;
    a.apply(vec![insert(0, "a🙂b")])?;
    a.apply(vec![insert(3, " local")])?;
    checkpoint_oracle(&a)?;
    b.receive(a.updates()?)?;
    b.apply(vec![
        insert(0, "remote "),
        Command::SetImageAlt(SetImageAlt {
            image: "image-1".into(),
            alt: "remote description".into(),
        }),
    ])?;
    a.receive(b.updates()?)?;
    a.apply(vec![
        Command::ResizeColumn(ResizeColumn { column: "column-1".into(), width: 260 }),
        Command::SetImageAsset(SetImageAsset { image: "image-1".into(), asset: "asset-1".into() }),
    ])?;
    assert_eq!(a.undo_count(), 3);
    assert!(a.undo()?);
    let mut recovered = Session::restore(&a.checkpoint()?)?;
    assert!(recovered.redo()?);
    assert!(recovered.undo()?);
    assert!(recovered.undo()?);
    assert!(recovered.undo()?);
    assert_eq!(recovered.body(), "remote ");
    assert_eq!(recovered.view()["images"]["image-1"]["alt"], "remote description");
    assert!(recovered.redo()?);
    assert!(recovered.redo()?);
    assert!(recovered.redo()?);
    assert_eq!(recovered.body(), "remote a🙂 localb");
    b.receive(recovered.updates()?)?;
    recovered.receive(b.updates()?)?;
    assert_eq!(b.view(), recovered.view());
    assert_eq!(b.version(), recovered.version());
    checkpoint_oracle(&recovered)
}

#[test]
fn rejected_later_step_does_not_publish_earlier_steps_or_clear_redo() -> TestResult {
    let mut a = session("1101")?;
    a.apply(vec![insert(0, "retained")])?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let version = a.version();
    let result = a.apply(vec![
        insert(0, "must-not-appear"),
        Command::ResizeColumn(ResizeColumn { column: "c".into(), width: 0 }),
    ]);
    assert!(matches!(result, Err(Error::Contract(_))));
    assert_eq!(a.checkpoint()?, checkpoint);
    assert_eq!(a.version(), version);
    assert_eq!(a.body(), "");
    assert_eq!(a.redo_count(), 1);
    assert!(a.redo()?);
    assert_eq!(a.body(), "retained");
    Ok(())
}

#[test]
fn malformed_remote_and_unknown_root_preserve_published_state_and_undo_owner() -> TestResult {
    let mut a = session("1201")?;
    a.apply(vec![insert(0, "local")])?;
    let before = a.checkpoint()?;
    assert!(a.receive(vec![0, 1, 2]).is_err());
    assert_eq!(a.checkpoint()?, before);
    let other = LoroDoc::new();
    other.set_peer_id(1202)?;
    other.get_text("body").insert(0, "remote")?;
    other.get_map("unsupported").insert("bad", true)?;
    other.commit();
    assert!(matches!(a.receive(other.export(ExportMode::all_updates())?), Err(Error::Contract(_))));
    assert_eq!(a.checkpoint()?, before);
    assert_eq!(a.body(), "local");
    assert_eq!(a.undo_count(), 1);
    assert!(a.undo()?);
    assert_eq!(a.body(), "");
    Ok(())
}

#[test]
fn remote_cannot_extend_local_writer_even_when_causally_pending() -> TestResult {
    let mut a = session("1301")?;
    let impostor = LoroDoc::new();
    impostor.set_peer_id(1301)?;
    impostor.get_text("body").insert(0, "other-writer")?;
    impostor.commit();
    assert!(matches!(
        a.receive(impostor.export(ExportMode::all_updates())?),
        Err(Error::WriterCollision)
    ));
    assert_eq!(a.body(), "");
    assert_eq!(a.undo_count(), 0);
    Ok(())
}

#[test]
fn duplicate_and_reordered_remote_updates_recover_causal_dependencies() -> TestResult {
    let mut a = session("1401")?;
    let other = LoroDoc::new();
    other.set_peer_id(1402)?;
    other.get_text("body").insert(0, "first")?;
    other.commit();
    let first = other.export(ExportMode::all_updates())?;
    let before = other.oplog_vv();
    other.get_text("body").insert(5, " second")?;
    other.commit();
    let second = other.export(ExportMode::updates(&before))?;
    a.receive(second.clone())?;
    checkpoint_oracle(&a)?;
    a = Session::restore(&a.checkpoint()?)?;
    a.receive(first.clone())?;
    assert_eq!(a.body(), "first second");
    let version = a.version();
    a.receive(second)?;
    a.receive(first)?;
    assert_eq!(a.version(), version);
    assert_eq!(a.undo_count(), 0);
    checkpoint_oracle(&a)
}

#[test]
fn concurrent_cell_activation_and_writer_local_undo_keep_other_body() -> TestResult {
    let mut a = session("1501")?;
    let mut b = session("1502")?;
    let target = TextTarget::Cell { table: "t".into(), row: "r".into(), column: "c".into() };
    a.apply(vec![Command::InsertText(InsertText {
        target: target.clone(),
        offset: 0,
        text: "alpha".into(),
    })])?;
    b.apply(vec![Command::InsertText(InsertText { target, offset: 0, text: "beta".into() })])?;
    let a_bytes = a.updates()?;
    a.receive(b.updates()?)?;
    b.receive(a_bytes)?;
    assert_eq!(a.view(), b.view());
    let merged = a.view()["cells"]["1:t1:r1:c"]["body"].as_str().unwrap().to_owned();
    assert!(merged.contains("alpha") && merged.contains("beta"));
    a.undo()?;
    assert_eq!(a.view()["cells"]["1:t1:r1:c"]["body"], "beta");
    a.redo()?;
    assert_eq!(a.view()["cells"]["1:t1:r1:c"]["body"], merged);
    checkpoint_oracle(&a)
}

#[test]
fn every_scalar_boundary_round_trips_but_half_surrogates_are_rejected() -> TestResult {
    let mut a = session("1601")?;
    let text = "a🙂e\u{301}👩‍👩‍👧‍👧終";
    a.apply(vec![insert(0, text)])?;
    let mut boundary = 0_u32;
    for scalar in text.chars() {
        let anchor = a.body_anchor(boundary, Affinity::After)?;
        let serialized = serde_json::to_string(&anchor)?;
        let decoded: TextAnchor = serde_json::from_str(&serialized)?;
        assert_eq!(a.resolve_body_anchor(&decoded)?, boundary);
        if scalar.len_utf16() == 2 {
            assert!(matches!(a.body_anchor(boundary + 1, Affinity::After), Err(Error::Offset)));
            let checkpoint = a.checkpoint()?;
            assert!(a.apply(vec![insert(boundary + 1, "bad")]).is_err());
            assert_eq!(a.checkpoint()?, checkpoint);
        }
        boundary += u32::try_from(scalar.len_utf16())?;
    }
    assert_eq!(a.resolve_body_anchor(&a.body_anchor(boundary, Affinity::After)?)?, boundary);
    assert!(a.body_anchor(boundary + 1, Affinity::After).is_err());
    Ok(())
}

#[test]
fn insertion_affinity_anchors_survive_remote_text_and_restart() -> TestResult {
    let mut a = session("1701")?;
    a.apply(vec![insert(0, "a🙂b")])?;
    let before = a.body_anchor(3, Affinity::Before)?;
    let after = a.body_anchor(3, Affinity::After)?;
    assert_eq!(a.resolve_body_anchor(&before)?, 3);
    assert_eq!(a.resolve_body_anchor(&after)?, 3);
    let mut b = session("1702")?;
    b.receive(a.updates()?)?;
    b.apply(vec![insert(3, "X")])?;
    a.receive(b.updates()?)?;
    assert_eq!(a.body(), "a🙂Xb");
    assert_eq!(a.resolve_body_anchor(&before)?, 3);
    assert_eq!(a.resolve_body_anchor(&after)?, 4);
    let recovered = Session::restore(&a.checkpoint()?)?;
    assert_eq!(recovered.resolve_body_anchor(&before)?, 3);
    assert_eq!(recovered.resolve_body_anchor(&after)?, 4);
    Ok(())
}

#[test]
fn deletion_checks_both_scalar_boundaries_and_restores_emoji_exactly() -> TestResult {
    let mut a = session("1801")?;
    a.apply(vec![insert(0, "a🙂b")])?;
    let before = a.checkpoint()?;
    assert!(
        a.apply(vec![Command::DeleteText(DeleteText {
            target: TextTarget::Body,
            offset: 1,
            length: 1
        })])
        .is_err()
    );
    assert_eq!(a.checkpoint()?, before);
    a.apply(vec![Command::DeleteText(DeleteText {
        target: TextTarget::Body,
        offset: 1,
        length: 2,
    })])?;
    assert_eq!(a.body(), "ab");
    a.undo()?;
    assert_eq!(a.body(), "a🙂b");
    a.redo()?;
    assert_eq!(a.body(), "ab");
    checkpoint_oracle(&a)
}

#[test]
fn tampered_replay_effects_and_incompatible_envelopes_fail_restore() -> TestResult {
    let mut a = session("1901")?;
    a.apply(vec![insert(0, "saved")])?;
    let mut journal: serde_json::Value = serde_json::from_str(&a.checkpoint()?)?;
    journal["entries"][0]["commands"][0]["data"]["text"] = "changed".into();
    assert!(matches!(Session::restore(&journal.to_string()), Err(Error::ReplayMismatch)));
    journal["version"] = 2.into();
    assert!(matches!(Session::restore(&journal.to_string()), Err(Error::Contract(_))));
    assert_eq!(a.body(), "saved");
    Ok(())
}

#[test]
fn invalid_remote_metadata_cannot_bypass_the_typed_local_command_contract() -> TestResult {
    let mut a = session("2001")?;
    a.apply(vec![insert(0, "local")])?;
    let before = a.checkpoint()?;
    let b = LoroDoc::new();
    b.set_peer_id(2002)?;
    b.get_map("columns").ensure_mergeable_map("c")?.insert("width", -20)?;
    b.commit();
    assert!(matches!(a.receive(b.export(ExportMode::all_updates())?), Err(Error::Contract(_))));
    assert_eq!(a.checkpoint()?, before);
    assert!(a.undo()?);
    assert_eq!(a.body(), "");
    Ok(())
}

#[test]
fn start_end_empty_and_deleted_anchor_affinities_are_explicit() -> TestResult {
    let mut a = session("2101")?;
    let empty_before = a.body_anchor(0, Affinity::Before)?;
    let empty_after = a.body_anchor(0, Affinity::After)?;
    a.apply(vec![insert(0, "a🙂b")])?;
    assert_eq!(a.resolve_body_anchor(&empty_before)?, 0);
    assert_eq!(a.resolve_body_anchor(&empty_after)?, 4);
    let start_before = a.body_anchor(0, Affinity::Before)?;
    let start_after = a.body_anchor(0, Affinity::After)?;
    let end_before = a.body_anchor(4, Affinity::Before)?;
    let end_after = a.body_anchor(4, Affinity::After)?;
    let deleted_before = a.body_anchor(3, Affinity::Before)?;
    a.apply(vec![insert(0, "prefix"), insert(10, "suffix")])?;
    assert_eq!(a.resolve_body_anchor(&start_before)?, 0);
    assert_eq!(a.resolve_body_anchor(&start_after)?, 6);
    assert_eq!(a.resolve_body_anchor(&end_before)?, 10);
    assert_eq!(a.resolve_body_anchor(&end_after)?, 16);
    a.apply(vec![Command::DeleteText(DeleteText {
        target: TextTarget::Body,
        offset: 7,
        length: 2,
    })])?;
    assert_eq!(a.resolve_body_anchor(&deleted_before)?, 7);
    checkpoint_oracle(&a)
}
