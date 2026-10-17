//! A different encoding of known causal operations must not consume semantic journal capacity.
use super::*;
use crate::rich_replica::{SharedRichProfile, actions::InsertText};
use serde_json::json;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn owner(document: bool, natural: bool) -> Result<(SharedRichProfile, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(&json!({"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/known-remote","version":1},"extensions":[]}).to_string())?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/known-remote","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let mut a = p.create(&input, "101".into())?;
    if document {
        a.enable_document_selection_guarded(&a.observe()?)?;
    } else {
        a.enable_general_ranges_guarded(&a.observe()?)?;
    }
    if natural {
        let observation = if document { a.observe_document()? } else { a.observe()? };
        a.enable_typing_history_guarded(&observation)?;
    }
    Ok((p, a))
}
fn checkpoint(a: &RichReplica) -> Result<String> {
    Ok(match (a.document_selection_enabled(), a.typing_history_enabled()) {
        (true, true) => a.document_typing_checkpoint()?,
        (true, false) => a.document_checkpoint()?,
        (false, true) => a.general_typing_checkpoint()?,
        (false, false) => a.general_checkpoint()?,
    })
}
fn alternate_known(a: &RichReplica) -> Result<Vec<u8>> {
    let doc = LoroDoc::new();
    doc.import(&a.updates()?)?;
    let bytes = doc.export(ExportMode::Snapshot)?;
    assert_ne!(bytes, a.updates()?);
    Ok(bytes)
}
#[test]
fn a_known_causal_snapshot_is_an_exact_semantic_noop_in_all_four_history_families() -> Result {
    for document in [false, true] {
        for natural in [false, true] {
            let (_, mut a) = owner(document, natural)?;
            a.apply(vec![Command::InsertText(InsertText {
                block: "p".into(),
                offset: 1,
                text: "X".into(),
            })])?;
            let before = checkpoint(&a)?;
            let view = if document { a.document_view_json()? } else { a.view_json()? };
            let bytes = alternate_known(&a)?;
            let observed = if document { a.observe_document()? } else { a.observe()? };
            a.receive(bytes)?;
            assert!(
                checkpoint(&a)? == before,
                "known operations grew the journal: document={document}, natural={natural}"
            );
            assert_eq!(if document { a.document_view_json()? } else { a.view_json()? }, view);
            a.check(&observed)?;
        }
    }
    Ok(())
}

fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    let bytes = checkpoint(a)?;
    Ok(match (a.document_selection_enabled(), a.typing_history_enabled()) {
        (true, true) => p.restore_document_typing(a.document_id(), &bytes)?,
        (true, false) => p.restore_document(a.document_id(), &bytes)?,
        (false, true) => p.restore_general_typing(a.document_id(), &bytes)?,
        (false, false) => p.restore_general(a.document_id(), &bytes)?,
    })
}
fn insert(a: &mut RichReplica, value: &str) -> Result {
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: value.into(),
    })])?;
    Ok(())
}

#[test]
fn cumulative_remote_records_retain_only_new_ops_and_recover_exact_future_history() -> Result {
    for document in [false, true] {
        for natural in [false, true] {
            let (p, mut a) = owner(document, natural)?;
            let mut b = p.join_frame(a.document_id().into(), "202".into(), &a.update_frame()?)?;
            insert(&mut a, "OWN")?;
            let mut supplied = 0;
            for _ in 0..8 {
                insert(&mut b, "PEER")?;
                let bytes = b.updates()?;
                supplied += bytes.len();
                a.receive(bytes.clone())?;
                let before = checkpoint(&a)?;
                a.receive(bytes)?;
                assert_eq!(checkpoint(&a)?, before);
            }
            let retained: usize =
                a.journal
                    .entries
                    .iter()
                    .filter_map(|e| {
                        if let Entry::Remote { bytes } = e { Some(bytes.len()) } else { None }
                    })
                    .sum();
            assert!(
                retained < supplied / 2,
                "cumulative prefixes were retained: {retained}/{supplied}"
            );
            let mut recovered = restore(&p, &a)?;
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
            for redo in [false, true, false, true] {
                assert_eq!(a.history(redo)?, recovered.history(redo)?);
                assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
                assert!(a.document_json().contains("PEER"));
            }
        }
    }
    Ok(())
}

#[test]
fn causally_pending_operations_are_retained_even_when_the_integrated_vector_did_not_move() -> Result
{
    for document in [false, true] {
        for natural in [false, true] {
            let (p, mut a) = owner(document, natural)?;
            let mut b = p.join_frame(a.document_id().into(), "202".into(), &a.update_frame()?)?;
            insert(&mut b, "FIRST")?;
            let middle = b.doc.oplog_vv();
            insert(&mut b, "SECOND")?;
            let later = b.doc.export(ExportMode::updates(&middle))?;
            let before = a.doc.oplog_vv();
            a.receive(later.clone())?;
            assert_eq!(a.doc.oplog_vv(), before);
            assert!(
                matches!(a.journal.entries.last(),Some(Entry::Remote{bytes}) if *bytes == later)
            );
            let mut recovered = restore(&p, &a)?;
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
            let full = b.updates()?;
            a.receive(full.clone())?;
            recovered.receive(full)?;
            assert_eq!(a.document_json(), b.document_json());
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
        }
    }
    Ok(())
}

#[test]
fn original_replay_retains_exact_remote_bytes_and_semantic_noops_do_not_bypass_admission() -> Result
{
    let (p, mut a) = owner(true, false)?;
    let mut original = p.join_frame(a.document_id().into(), "202".into(), &a.update_frame()?)?;
    let blob = alternate_known(&original)?;
    original.receive(blob.clone())?;
    assert!(matches!(original.journal.entries.last(),Some(Entry::Remote{bytes}) if *bytes == blob));
    a.set_read_only_guarded(&a.observe_document()?, true)?;
    let before = checkpoint(&a)?;
    let observation = a.observe_document()?;
    let mut blob = alternate_known(&a)?;
    a.receive(blob.clone())?;
    assert_eq!(checkpoint(&a)?, before);
    a.check(&observation)?;
    if let Some(last) = blob.last_mut() {
        *last ^= 1;
    }
    assert!(a.receive(blob).is_err());
    assert_eq!(checkpoint(&a)?, before);
    a.check(&observation)?;
    Ok(())
}

#[test]
fn known_causal_echo_does_not_split_a_live_typing_burst() -> Result {
    use crate::{
        anchor::Affinity,
        rich_replica::selection::{Selection, TextPoint},
    };
    for document in [false, true] {
        let (p, mut a) = owner(document, true)?;
        let point = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
        a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
        let observation = if document { a.observe_document()? } else { a.observe()? };
        a.insert_typing_text_guarded(&observation, "A", 1)?;
        let bytes = alternate_known(&a)?;
        let exact = checkpoint(&a)?;
        a.receive(bytes)?;
        assert_eq!(checkpoint(&a)?, exact);
        let observation = if document { a.observe_document()? } else { a.observe()? };
        a.insert_typing_text_guarded(&observation, "B", 2)?;
        assert_eq!((a.undo_count(), a.history_step_count()), (1, 2));
        let mut recovered = restore(&p, &a)?;
        for redo in [false, true] {
            assert_eq!(a.history(redo)?, recovered.history(redo)?);
            assert_eq!(checkpoint(&a)?, checkpoint(&recovered)?);
        }
    }
    Ok(())
}
