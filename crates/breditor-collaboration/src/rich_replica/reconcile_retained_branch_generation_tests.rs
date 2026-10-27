//! Genuine typing partitions and immutable-generation files survive compatible union.
use super::*;

#[test]
fn original_typing_partition_is_preserved_and_regrouped_source_is_a_refusal() -> Result {
    use crate::{
        anchor::Affinity,
        rich_replica::selection::{Selection, TextPoint},
    };
    let (profile, mut current) = setup(3, true, 0, 1)?;
    let point = TextPoint { block: "p".into(), offset: 0, affinity: Affinity::After };
    current.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    current.insert_typing_text_guarded(&current.observe()?, "A", 1)?;
    current.insert_typing_text_guarded(&current.observe()?, "B", 2)?;
    let mut source = restart(&profile, &current)?;
    let mut changed: Value = serde_json::from_str(&save(&source)?)?;
    changed["joins"] = json!([]);
    let regrouped = profile.restore_typing("room", &changed.to_string())?;
    let before = save(&current)?;
    assert!(merge(&mut current, &regrouped).is_err());
    assert_eq!(save(&current)?, before);
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer, "Peer ")?;
    source.receive_frame(&peer.update_frame()?)?;
    current.insert_typing_text_guarded(&current.observe()?, "C", 3)?;
    assert!(merge(&mut current, &source)?);
    let expected = current.document_json().to_owned();
    let mut cold = restart(&profile, &current)?;
    assert!(cold.undo()?);
    assert!(!cold.document_json().contains("ABC"));
    assert!(cold.document_json().contains("Peer "));
    assert!(cold.redo()?);
    assert_eq!(cold.document_json(), expected);
    covered(&current, &source)?;
    Ok(())
}

#[test]
fn compatible_segmented_branches_keep_every_original_root_and_sealed_file_exact() -> Result {
    for mask in 0..8 {
        let (profile, mut current) = setup(3, true, 2, mask)?;
        insert(&mut current, "Common ")?;
        current.enable_segmented_history_guarded(
            &current.observe()?,
            "root".into(),
            "active".into(),
        )?;
        let mut source = restart(&profile, &current)?;
        let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
        insert(&mut peer, "Peer ")?;
        source.receive_frame(&peer.update_frame()?)?;
        insert(&mut current, "Offline ")?;
        current.seal_history_segment_guarded(&current.observe()?, "next".into())?;
        let before: Value = serde_json::from_str(&save(&current)?)?;
        let old = restart(&profile, &current)?;
        let source_before = save(&source)?;
        assert!(merge(&mut current, &source)?);
        covered(&current, &source)?;
        current.verify_segmented_recovery_origin_guarded(
            &current.observe()?,
            &old,
            &old.observe()?,
        )?;
        let after: Value = serde_json::from_str(&save(&current)?)?;
        assert_eq!(before["rootCheckpoint"], after["rootCheckpoint"]);
        assert_eq!(before["sealed"], after["sealed"]);
        assert_eq!(save(&source)?, source_before);
        let expected = current.document_json().to_owned();
        let mut cold = restart(&profile, &current)?;
        assert!(cold.undo()?);
        assert!(!cold.document_json().contains("Offline"));
        assert!(cold.undo()?);
        assert!(!cold.document_json().contains("Common"));
        assert!(cold.document_json().contains("Peer"));
        assert!(cold.redo()?);
        assert!(cold.redo()?);
        assert_eq!(cold.document_json(), expected);
    }
    Ok(())
}

#[test]
fn immutable_generation_forks_refuse_even_when_own_contributions_are_compatible() -> Result {
    let (profile, mut current) = setup(3, true, 2, 1)?;
    insert(&mut current, "Common ")?;
    current.enable_segmented_history_guarded(
        &current.observe()?,
        "root".into(),
        "active".into(),
    )?;
    let mut source = restart(&profile, &current)?;
    let mut peer = profile.join_frame("room".into(), "202".into(), &current.update_frame()?)?;
    insert(&mut peer, "Peer ")?;
    source.receive_frame(&peer.update_frame()?)?;
    insert(&mut current, "Own ")?;
    current.seal_history_segment_guarded(&current.observe()?, "next".into())?;
    source.seal_history_segment_guarded(&source.observe()?, "next".into())?;
    let before = save(&current)?;
    let source_before = save(&source)?;
    assert!(merge(&mut current, &source).is_err());
    assert_eq!(save(&current)?, before);
    assert_eq!(save(&source)?, source_before);
    Ok(())
}
