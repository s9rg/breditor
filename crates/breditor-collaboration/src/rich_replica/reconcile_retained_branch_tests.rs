//! Real native branch union laws. No AST or serialized readiness flag is an admission proof.
#[path = "reconcile_retained_branch_generation_tests.rs"]
mod generation_tests;
use super::*;
use crate::rich_replica::{
    Command, ReviewedHistoryIdentity, SharedRichProfile, actions::InsertText,
    general_history::ReplayContract,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn setup(
    version: u32,
    standard: bool,
    scope: u8,
    mask: u8,
) -> Result<(SharedRichProfile, RichReplica)> {
    let config = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/native-branch","version":1},"extensions":[]}).to_string();
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
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/native-branch","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut owner = profile.create(&document, "101".into())?;
    if scope == 1 {
        owner.enable_general_ranges_guarded(&owner.observe()?)?;
    }
    if scope == 2 {
        owner.enable_document_selection_guarded(&owner.observe()?)?;
    }
    if mask & 1 != 0 {
        owner.enable_typing_history_guarded(&owner.observe()?)?;
    }
    if mask & 2 != 0 {
        owner.enable_reviewed_history_guarded(
            &owner.observe()?,
            serde_json::from_value::<ReviewedHistoryIdentity>(
                json!({"binding":"a".repeat(64),"principal":"alice","effectWriter":"900"}),
            )?,
        )?;
    }
    if mask & 4 != 0 {
        owner.enable_search_history_guarded(&owner.observe()?)?;
    }
    Ok((profile, owner))
}
fn insert(owner: &mut RichReplica, text: &str) -> Result {
    owner.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
fn save(owner: &RichReplica) -> Result<String> {
    Ok(if owner.segmented.is_some() {
        owner.segmented_checkpoint()?
    } else if owner.search_contract {
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
fn restart(profile: &SharedRichProfile, owner: &RichReplica) -> Result<RichReplica> {
    let saved = save(owner)?;
    Ok(if owner.segmented.is_some() {
        profile.restore_segmented("room", &saved)?
    } else if owner.search_contract {
        profile.restore_search("room", &saved)?
    } else if owner.reviewed_contract {
        profile.restore_reviewed("room", &saved)?
    } else {
        match (owner.replay_contract, owner.typing.is_some()) {
            (ReplayContract::Original, false) => profile.restore("room", &saved)?,
            (ReplayContract::Original, true) => profile.restore_typing("room", &saved)?,
            (ReplayContract::GeneralV1, false) => profile.restore_general("room", &saved)?,
            (ReplayContract::GeneralV1, true) => profile.restore_general_typing("room", &saved)?,
            (ReplayContract::DocumentV1, false) => profile.restore_document("room", &saved)?,
            (ReplayContract::DocumentV1, true) => {
                profile.restore_document_typing("room", &saved)?
            }
        }
    })
}
fn merge(current: &mut RichReplica, source: &RichReplica) -> Result<bool> {
    Ok(current.reconcile_retained_branch_guarded(
        &current.observe()?,
        source,
        &source.observe()?,
        8 * 1024 * 1024,
    )?)
}
fn covered(current: &RichReplica, source: &RichReplica) -> Result {
    current.verify_retained_branch_guarded(&current.observe()?, source, &source.observe()?)?;
    Ok(())
}

#[test]
fn compatible_branches_preserve_native_undo_redo_and_exact_old_origin_contract() -> Result {
    let mut cases = 0;
    for version in [1, 2, 3] {
        for standard in [false, true] {
            for scope in 0..3 {
                for mask in 0..8 {
                    let (profile, mut current) = setup(version, standard, scope, mask)?;
                    insert(&mut current, "Common local ")?;
                    let mut source = restart(&profile, &current)?;
                    let mut peer = profile.join_frame(
                        "room".into(),
                        "202".into(),
                        &current.update_frame()?,
                    )?;
                    insert(&mut peer, "Retained peer ")?;
                    source.receive_frame(&peer.update_frame()?)?;
                    insert(&mut current, "Offline suffix ")?;
                    let own_origin = restart(&profile, &current)?;
                    let source_before = save(&source)?;
                    assert!(covered(&current, &source).is_err());
                    assert!(merge(&mut current, &source)?);
                    covered(&current, &source)?;
                    current.verify_recovery_origin_guarded(
                        &current.observe()?,
                        &own_origin,
                        &own_origin.observe()?,
                    )?;
                    assert!(
                        current
                            .verify_recovery_origin_guarded(
                                &current.observe()?,
                                &source,
                                &source.observe()?
                            )
                            .is_err()
                    );
                    assert_eq!(save(&source)?, source_before);
                    let expected = current.document_json().to_owned();
                    let unchanged = save(&current)?;
                    assert!(!merge(&mut current, &source)?);
                    assert_eq!(save(&current)?, unchanged);
                    let mut cold = restart(&profile, &current)?;
                    assert!(cold.undo()?);
                    assert!(!cold.document_json().contains("Offline suffix"));
                    assert!(cold.document_json().contains("Retained peer"));
                    assert!(cold.undo()?);
                    assert!(!cold.document_json().contains("Common local"));
                    assert!(cold.document_json().contains("Retained peer"));
                    assert!(cold.redo()?);
                    assert!(cold.redo()?);
                    assert_eq!(cold.document_json(), expected);
                    cases += 1;
                }
            }
        }
    }
    assert_eq!(cases, 144);
    Ok(())
}

#[test]
fn own_ahead_fork_foreign_and_stale_branches_are_atomic_refusals() -> Result {
    let (profile, base) = setup(3, true, 2, 1)?;
    let mut current = restart(&profile, &base)?;
    let mut source = restart(&profile, &base)?;
    insert(&mut source, "Unknown own suffix")?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(merge(&mut current, &source).is_err());
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    insert(&mut current, "Different own suffix")?;
    let before = save(&current)?;
    assert!(merge(&mut current, &source).is_err());
    assert_eq!(save(&current)?, before);
    let stale = current.observe()?;
    insert(&mut current, "Later ")?;
    let before = save(&current)?;
    assert!(
        current
            .reconcile_retained_branch_guarded(&stale, &source, &source.observe()?, 8 * 1024 * 1024)
            .is_err()
    );
    assert_eq!(save(&current)?, before);
    let foreign = profile.join_frame("room".into(), "202".into(), &base.update_frame()?)?;
    assert!(merge(&mut current, &foreign).is_err());
    assert_eq!(save(&current)?, before);
    Ok(())
}

#[test]
fn foreign_operation_forks_cannot_hide_behind_equal_peer_counters() -> Result {
    let (profile, mut current) = setup(3, true, 0, 0)?;
    insert(&mut current, "Common ")?;
    let mut source = restart(&profile, &current)?;
    let mut peer_a = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    let mut peer_b = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer_a, "Peer A")?;
    insert(&mut peer_b, "Peer B")?;
    current.receive_frame(&peer_a.update_frame()?)?;
    source.receive_frame(&peer_b.update_frame()?)?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(merge(&mut current, &source).is_err());
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    Ok(())
}

#[test]
fn local_read_only_policy_survives_native_branch_union() -> Result {
    let (profile, mut current) = setup(3, true, 0, 0)?;
    insert(&mut current, "Common ")?;
    let mut source = restart(&profile, &current)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer, "Peer ")?;
    source.receive_frame(&peer.update_frame()?)?;
    current.set_read_only_guarded(&current.observe()?, true)?;
    assert!(merge(&mut current, &source)?);
    assert!(current.read_only);
    assert!(insert(&mut current, "Forbidden").is_err());
    assert!(current.undo().is_err());
    covered(&current, &source)?;
    Ok(())
}

#[test]
fn union_retains_causally_pending_inputs_and_late_dependencies_without_acknowledging_them() -> Result
{
    let (profile, mut current) = setup(3, true, 2, 1)?;
    insert(&mut current, "Common ")?;
    let mut source = restart(&profile, &current)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    let original = peer.doc.oplog_vv();
    insert(&mut peer, "First dependency ")?;
    let first = peer.doc.export(loro::ExportMode::updates(&original))?;
    let between = peer.doc.oplog_vv();
    insert(&mut peer, "Second pending ")?;
    let second = peer.doc.export(loro::ExportMode::updates(&between))?;
    source.receive(second.clone())?;
    assert!(!source.document_json().contains("Second pending"));
    insert(&mut current, "Own offline ")?;
    assert!(merge(&mut current, &source)?);
    assert!(!current.document_json().contains("Second pending"));
    assert!(current.journal.retained_updates().any(|bytes| bytes == second));
    covered(&current, &source)?;
    let mut cold = restart(&profile, &current)?;
    cold.receive(first)?;
    assert!(cold.document_json().contains("First dependency"));
    assert!(cold.document_json().contains("Second pending"));
    assert!(cold.undo()?);
    assert!(!cold.document_json().contains("Own offline"));
    assert!(cold.document_json().contains("Second pending"));
    Ok(())
}

#[test]
fn source_pending_bytes_are_not_dropped_just_because_current_already_knows_the_counters() -> Result
{
    let (profile, mut current) = setup(3, true, 2, 1)?;
    insert(&mut current, "Common ")?;
    let mut source = restart(&profile, &current)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer, "First dependency ")?;
    let between = peer.doc.oplog_vv();
    insert(&mut peer, "Pending input ")?;
    let pending = peer.doc.export(loro::ExportMode::updates(&between))?;
    source.receive(pending.clone())?;
    assert!(!source.document_json().contains("Pending input"));
    current.receive_frame(&peer.update_frame()?)?;
    assert!(current.document_json().contains("Pending input"));
    assert!(!current.journal.retained_updates().any(|bytes| bytes == pending));
    assert!(
        covered(&current, &source).is_err(),
        "A source-pending buffer needs exact retained bytes, not another owner's equal counters"
    );
    assert!(merge(&mut current, &source)?);
    assert!(current.journal.retained_updates().any(|bytes| bytes == pending));
    covered(&current, &source)?;
    let cold = restart(&profile, &current)?;
    covered(&cold, &source)?;
    Ok(())
}

#[test]
fn a_selected_incoming_byte_limit_refuses_atomically_and_an_exact_retry_remains_possible() -> Result
{
    let (profile, mut current) = setup(3, true, 0, 0)?;
    insert(&mut current, "Common ")?;
    let mut source = restart(&profile, &current)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer, "New peer input ")?;
    source.receive_frame(&peer.update_frame()?)?;
    let bytes = current.retained_branch_input_bytes_guarded(
        &current.observe()?,
        &source,
        &source.observe()?,
    )?;
    assert!(bytes > 1);
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(matches!(
        current.reconcile_retained_branch_guarded(
            &current.observe()?,
            &source,
            &source.observe()?,
            1
        ),
        Err(Error::Limit("retained branch incoming input bytes"))
    ));
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    assert!(current.reconcile_retained_branch_guarded(
        &current.observe()?,
        &source,
        &source.observe()?,
        bytes
    )?);
    assert_eq!(
        current.retained_branch_input_bytes_guarded(
            &current.observe()?,
            &source,
            &source.observe()?
        )?,
        0
    );
    assert!(!current.reconcile_retained_branch_guarded(
        &current.observe()?,
        &source,
        &source.observe()?,
        0
    )?);
    covered(&current, &source)?;
    Ok(())
}
