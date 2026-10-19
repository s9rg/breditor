//! Same native owner histories, explicit family matrix and legitimate-looking forks.
use super::*;
use crate::{
    anchor::Affinity,
    rich_replica::{
        Command, ReviewedHistoryIdentity, SharedRichProfile,
        actions::InsertText,
        general_history::ReplayContract,
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn setup(version: u32, standard: bool) -> Result<(SharedRichProfile, String)> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/recovery-origin","version":1},"extensions":[]})
    .to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&config)?,
        (1, true) => SharedRichProfile::from_standard_configuration_json_v1(&config)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&config)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&config)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&config)?,
        _ => SharedRichProfile::from_standard_configuration_json_v3(&config)?,
    };
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let doc=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/recovery-origin","version":1},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    Ok((profile, doc))
}
fn insert(text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })
}
fn save(owner: &RichReplica) -> Result<String> {
    Ok(if owner.search_contract {
        owner.search_checkpoint()?
    } else if owner.reviewed_contract {
        owner.reviewed_checkpoint()?
    } else {
        match (owner.replay_contract, owner.typing.is_some()) {
            (ReplayContract::Original, false) => owner.checkpoint()?,
            (ReplayContract::Original, true) => owner.typing_checkpoint()?,
            (ReplayContract::GeneralV1, false) => owner.general_checkpoint()?,
            (ReplayContract::GeneralV1, true) => owner.general_typing_checkpoint()?,
            (ReplayContract::DocumentV1, false) => owner.document_checkpoint()?,
            (ReplayContract::DocumentV1, true) => owner.document_typing_checkpoint()?,
        }
    })
}
fn check(current: &RichReplica, origin: &RichReplica) -> Result {
    let current_guard = if current.document_selection_enabled() {
        current.observe_document()?
    } else {
        current.observe()?
    };
    let origin_guard = if origin.document_selection_enabled() {
        origin.observe_document()?
    } else {
        origin.observe()?
    };
    current.verify_recovery_origin_guarded(&current_guard, origin, &origin_guard)?;
    Ok(())
}
fn scenario(profile: &SharedRichProfile, document: &str, scope: u8, mask: u8) -> Result {
    let mut current = profile.create(document, "101".into())?;
    if scope == 1 {
        current.enable_general_ranges_guarded(&current.observe()?)?;
    }
    if scope == 2 {
        current.enable_document_selection_guarded(&current.observe()?)?;
    }
    if mask & 1 != 0 {
        current.enable_typing_history_guarded(&current.observe()?)?;
    }
    if mask & 2 != 0 {
        current.enable_reviewed_history_guarded(
            &current.observe()?,
            serde_json::from_value::<ReviewedHistoryIdentity>(
                json!({"binding":"a".repeat(64),"principal":"alice","effectWriter":"900"}),
            )?,
        )?;
    }
    if mask & 4 != 0 {
        current.enable_search_history_guarded(&current.observe()?)?;
    }
    current.apply(vec![insert("retained ")])?;
    current.apply(vec![insert("redo ")])?;
    assert!(current.undo()?);
    let origin = current.staged()?;
    let source = save(&origin)?;
    let before = save(&current)?;
    check(&current, &origin)?;
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&origin)?, source);
    current.set_read_only_guarded(&current.observe()?, true)?;
    check(&current, &origin)?;
    current.set_read_only_guarded(&current.observe()?, false)?;
    assert!(current.redo()?);
    check(&current, &origin)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    peer.apply(vec![insert("peer ")])?;
    current.receive_frame(&peer.update_frame()?)?;
    check(&current, &origin)?;
    for redo in [false, true, false, false, true, true] {
        if redo {
            assert!(current.redo()?);
        } else {
            assert!(current.undo()?);
        }
        check(&current, &origin)?;
        assert!(current.document_json().contains("peer"));
        let restarted = current.staged()?;
        check(&restarted, &origin)?;
        assert_eq!(save(&restarted)?, save(&current)?);
    }
    Ok(())
}
#[test]
fn all_native_profiles_scopes_typing_reviewed_and_search_modes_preserve_future_history() -> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            let (profile, doc) = setup(version, standard)?;
            for scope in 0..3 {
                for mask in 0..8 {
                    scenario(&profile, &doc, scope, mask)?;
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 144);
    Ok(())
}
#[test]
fn equal_final_documents_and_equal_history_depths_do_not_hide_a_valid_journal_fork() -> Result {
    let (profile, doc) = setup(3, true)?;
    let base = profile.create(&doc, "101".into())?;
    let mut origin = base.staged()?;
    let mut fork = base.staged()?;
    origin.apply(vec![insert("original")])?;
    origin.undo()?;
    fork.apply(vec![insert("changed")])?;
    fork.undo()?;
    assert_eq!(origin.document_json(), fork.document_json());
    assert_eq!(origin.undo_count(), fork.undo_count());
    assert_eq!(origin.redo_count(), fork.redo_count());
    assert!(check(&fork, &origin).is_err());
    assert!(check(&base, &origin).is_err());
    Ok(())
}
#[test]
fn stale_and_foreign_guards_and_changed_families_do_not_create_continuity() -> Result {
    let (profile, doc) = setup(3, true)?;
    let mut current = profile.create(&doc, "101".into())?;
    let origin = current.staged()?;
    let stale = current.observe()?;
    current.apply(vec![insert("later")])?;
    assert!(current.verify_recovery_origin_guarded(&stale, &origin, &origin.observe()?).is_err());
    assert!(
        current
            .verify_recovery_origin_guarded(&current.observe()?, &origin, &current.observe()?)
            .is_err()
    );
    let other = profile.create(&doc, "202".into())?;
    assert!(check(&current, &other).is_err());
    let mut different = origin.staged()?;
    different.enable_search_history_guarded(&different.observe()?)?;
    assert!(check(&different, &origin).is_err());
    check(&current, &origin)?;
    Ok(())
}
#[test]
fn native_admitted_regrouping_of_old_typing_inputs_is_not_a_continuation() -> Result {
    let (profile, doc) = setup(3, true)?;
    let mut current = profile.create(&doc, "101".into())?;
    current.enable_typing_history_guarded(&current.observe()?)?;
    let point = TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After };
    current.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    current.insert_typing_text_guarded(&current.observe()?, "A", 1)?;
    current.insert_typing_text_guarded(&current.observe()?, "B", 2)?;
    let origin = current.staged()?;
    let original = current.typing_checkpoint()?;
    let mut changed: Value = serde_json::from_str(&original)?;
    changed["joins"] = json!([]);
    let fork = profile.restore_typing("room", &changed.to_string())?;
    assert_eq!(fork.document_json(), origin.document_json());
    assert!(check(&fork, &origin).is_err());
    check(&current, &origin)?;
    Ok(())
}
