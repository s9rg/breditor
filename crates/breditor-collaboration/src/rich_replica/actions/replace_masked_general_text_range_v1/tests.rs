//! Native character identity, routing, selective Undo and exact local recovery, not browser evidence.
use super::*;
use crate::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, RangeTextRun},
        selection::{Selection, TextPoint},
        text_flow,
    },
};
use serde_json::json;
use std::collections::BTreeMap;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
type Characters = BTreeMap<Vec<u8>, (char, Vec<Value>)>;
fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    value["children"] = Value::Array(children);
    value
}
fn paragraph(id: &str, text: &str) -> Value {
    element("paragraph", id, vec![json!({"kind":"text","text":text,"formats":[]})])
}
fn setup(children: Vec<Value>) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/masked-shared","version":1},"extensions":[]}"#,
    )?;
    let mut root = element("document", "unused", children);
    root["properties"] = json!({"breditor/document-id":"room"});
    let source = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/masked-shared","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root});
    let a = profile.create(&source.to_string(), "101".into())?;
    let b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((profile, a, b))
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn span(block: &str, start: u32, end: u32) -> MaskedTextSpanV1 {
    MaskedTextSpanV1 { block: block.into(), start, end }
}
fn action(
    a: (&str, u32),
    b: (&str, u32),
    spans: Vec<MaskedTextSpanV1>,
) -> ReplaceMaskedGeneralTextRangeV1 {
    ReplaceMaskedGeneralTextRangeV1 {
        range: ReplaceTextRange {
            anchor: point(a.0, a.1),
            focus: point(b.0, b.1),
            runs: vec![RangeTextRun { text: "R".into(), formats: vec![] }],
        },
        spans,
        empty: vec![],
    }
}
fn insert(block: &str, offset: u32, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset, text: text.into() })
}
fn characters(a: &RichReplica) -> Result<Characters> {
    let coverage = breditor_core::rich_content::RichSelectionCoverage::document(&a.document)?;
    let blocks = coverage
        .text()
        .iter()
        .map(|span| (span.block().as_str().into(), span.end().get() == 0))
        .collect::<Vec<_>>();
    let mut result = BTreeMap::new();
    text_flow::visit_scalars(&a.doc, &blocks, |scalar| {
        if result.insert(scalar.identity, (scalar.character, scalar.formats.to_vec())).is_some() {
            return Err(crate::Error::Contract("duplicate native scalar"));
        }
        Ok(())
    })?;
    Ok(result)
}
fn assert_surviving(a: &RichReplica, before: &Characters, retained: &str) -> Result {
    let after = characters(a)?;
    for (identity, value) in before {
        if retained.contains(value.0) {
            assert_eq!(after.get(identity), Some(value), "original identity for {}", value.0);
        }
    }
    Ok(())
}
fn save(a: &RichReplica, document: bool, natural: bool) -> Result<String> {
    Ok(match (document, natural) {
        (false, false) => a.general_checkpoint()?,
        (false, true) => a.general_typing_checkpoint()?,
        (true, false) => a.document_checkpoint()?,
        (true, true) => a.document_typing_checkpoint()?,
    })
}
fn restore(
    p: &SharedRichProfile,
    saved: &str,
    document: bool,
    natural: bool,
) -> Result<RichReplica> {
    Ok(match (document, natural) {
        (false, false) => p.restore_general("room", saved)?,
        (false, true) => p.restore_general_typing("room", saved)?,
        (true, false) => p.restore_document("room", saved)?,
        (true, true) => p.restore_document_typing("room", saved)?,
    })
}
#[test]
fn joined_native_roots_preserve_all_peer_identities_and_future_offline_updates() -> Result {
    for document in [false, true] {
        for natural in [false, true] {
            for backward in [false, true] {
                let (p, mut a, mut b) = setup(vec![
                    paragraph("p", "aXb"),
                    paragraph("mid", "mY🙂"),
                    paragraph("q", "cZd"),
                ])?;
                a.enable_general_ranges_guarded(&a.observe()?)?;
                if document {
                    a.enable_document_selection_guarded(&a.observe()?)?;
                }
                if natural {
                    a.enable_typing_history_guarded(&a.observe()?)?;
                }
                let selection =
                    Selection::TextRange { anchor: point("q", 2), focus: point("q", 2) };
                a.set_selection(Some(&selection))?;
                let before = a.document_json().to_owned();
                let ids = characters(&a)?;
                let (start, end) =
                    if backward { (("q", 2), ("p", 1)) } else { (("p", 1), ("q", 2)) };
                a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(action(
                    start,
                    end,
                    vec![span("p", 2, 3), span("mid", 0, 1), span("mid", 2, 4), span("q", 0, 1)],
                ))])?;
                assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXYZd");
                assert_surviving(&a, &ids, "aXYZd")?;
                assert_eq!(a.undo_count(), 1);
                assert_eq!(text_flow::view(&a.doc, "mid")?.owner, "p");
                assert_eq!(text_flow::view(&a.doc, "q")?.owner, "p");
                assert_eq!(super::super::super::model::text(&a.doc, "mid")?.to_string(), "Y");
                let mut reopened = restore(&p, &save(&a, document, natural)?, document, natural)?;
                assert_eq!(save(&a, document, natural)?, save(&reopened, document, natural)?);
                for redo in [false, true, false, true] {
                    if redo {
                        assert!(a.redo()?);
                        assert!(reopened.redo()?);
                    } else {
                        assert!(a.undo()?);
                        assert!(reopened.undo()?);
                        assert_eq!(a.document_json(), before);
                    }
                    assert_eq!(save(&a, document, natural)?, save(&reopened, document, natural)?);
                    assert_surviving(&a, &ids, "aXYZd")?;
                }
                // This peer has never seen the join. Its write still targets the old mid source.
                b.apply(vec![insert("mid", 2, "!")])?;
                a.receive_frame(&b.update_frame()?)?;
                assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXY!Zd");
                assert!(a.undo()?);
                // Native selective Undo restores deleted scalars with the engine's causal
                // ordering; the unobserved peer insertion is retained, not repositioned/copied.
                assert_eq!(text_flow::view(&a.doc, "mid")?.text(), "mY🙂!");
                assert!(a.redo()?);
                assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXY!Zd");
            }
        }
    }
    Ok(())
}
fn table() -> Value {
    let cells = [paragraph("p0", "aXb"), paragraph("p1", "mYn"), paragraph("p2", "cZd")]
        .into_iter()
        .enumerate()
        .map(|(i, node)| {
            let mut cell = element("table-cell", &format!("cell{i}"), vec![node]);
            cell["properties"]["breditor/column-id"] = json!(format!("c{i}"));
            cell["properties"]["breditor/header"] = json!(false);
            cell
        })
        .collect();
    let mut row = element("table-row", "row", cells);
    row["properties"]["breditor/row-id"] = json!("r");
    let mut table = element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":(0..3).map(|i|json!({"id":format!("c{i}"),"width":120})).collect::<Vec<_>>(),"breditor/merges":[],"breditor/retracted-merges":[]});
    table
}
#[test]
fn protected_native_spans_keep_peer_owners_and_fresh_floors_have_exact_undo() -> Result {
    for floor in [false, true] {
        let (p, mut a, _) = setup(vec![table()])?;
        a.enable_general_ranges_guarded(&a.observe()?)?;
        let before = a.document_json().to_owned();
        let ids = characters(&a)?;
        let mut edit = action(
            ("p0", 1),
            ("p2", 2),
            if floor {
                vec![span("p0", 2, 3), span("p1", 0, 3), span("p2", 0, 1)]
            } else {
                vec![span("p0", 2, 3), span("p1", 0, 1), span("p1", 2, 3), span("p2", 0, 1)]
            },
        );
        if floor {
            edit.empty.push("fresh-floor".into());
        }
        a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(edit)])?;
        assert_eq!(text_flow::view(&a.doc, "p0")?.text(), "aRX");
        assert_eq!(text_flow::view(&a.doc, "p2")?.text(), "Zd");
        assert_surviving(&a, &ids, if floor { "aXZd" } else { "aXYZd" })?;
        if !floor {
            assert_eq!(text_flow::view(&a.doc, "p1")?.text(), "Y");
        }
        let mut reopened = restore(&p, &save(&a, false, false)?, false, false)?;
        assert!(a.undo()?);
        assert!(reopened.undo()?);
        assert_eq!(a.document_json(), before);
        assert_eq!(save(&a, false, false)?, save(&reopened, false, false)?);
        assert!(a.redo()?);
        assert!(reopened.redo()?);
        assert_eq!(save(&a, false, false)?, save(&reopened, false, false)?);
    }
    Ok(())
}
#[test]
fn malformed_masks_wrong_floors_disabled_history_and_batches_refuse_atomically() -> Result {
    let (_, mut a, _) = setup(vec![paragraph("p", "aX🙂Yb")])?;
    let edit = action(("p", 1), ("p", 6), vec![span("p", 2, 4), span("p", 5, 6)]);
    let before = a.checkpoint()?;
    assert!(a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(edit.clone())]).is_err());
    assert_eq!(a.checkpoint()?, before);
    a.enable_general_ranges_guarded(&a.observe()?)?;
    for spans in [
        vec![span("p", 2, 3)],
        vec![span("p", 0, 1)],
        vec![span("p", 5, 6), span("p", 2, 4)],
        vec![span("p", 2, 4), span("p", 3, 4)],
    ] {
        let mut invalid = edit.clone();
        invalid.spans = spans;
        let before = (a.general_checkpoint()?, a.update_frame()?, a.view_json()?);
        assert!(a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(invalid)]).is_err());
        assert_eq!((a.general_checkpoint()?, a.update_frame()?, a.view_json()?), before);
    }
    let before = a.general_checkpoint()?;
    assert!(
        a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(edit.clone()), insert("p", 0, "!")])
            .is_err()
    );
    let mut invalid = edit;
    invalid.empty.push("unexpected".into());
    assert!(a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(invalid)]).is_err());
    assert_eq!(a.general_checkpoint()?, before);
    Ok(())
}

#[test]
fn native_list_join_routes_retained_tail_characters_without_flattening_unselected_tail() -> Result {
    let left =
        element("list-item", "left", vec![paragraph("p", "aXb"), paragraph("left-tail", "L")]);
    let right =
        element("list-item", "right", vec![paragraph("q", "cYd"), paragraph("right-tail", "T")]);
    let (_, mut a, _) = setup(vec![element("bullet-list", "list", vec![left, right])])?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let before = a.document_json().to_owned();
    let identities = characters(&a)?;
    a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(action(
        ("p", 1),
        ("q", 2),
        vec![span("p", 2, 3), span("q", 0, 1)],
    ))])?;
    assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXLYd");
    assert_eq!(text_flow::view(&a.doc, "left-tail")?.owner, "p");
    assert_eq!(text_flow::view(&a.doc, "right-tail")?.text(), "T");
    assert_surviving(&a, &identities, "aXLYdT")?;
    assert!(a.undo()?);
    assert_eq!(a.document_json(), before);
    assert!(a.redo()?);
    assert_surviving(&a, &identities, "aXLYdT")?;
    Ok(())
}

#[test]
fn native_partial_caption_keeps_its_image_metadata_and_original_characters() -> Result {
    let mut image = element("image", "image", vec![paragraph("caption", "xZy")]);
    image["properties"] = json!({"breditor/block-id":"image","breditor/image-id":"i","breditor/asset-id":"asset","breditor/asset-generation":"generation","breditor/decorative":false,"breditor/alt-text":"Keep metadata"});
    let mut tree = table();
    tree["children"][0]["children"][2]["children"] = json!([image]);
    let (_, mut a, _) = setup(vec![tree])?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let before = a.document_json().to_owned();
    let identities = characters(&a)?;
    a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(action(
        ("p0", 1),
        ("caption", 2),
        vec![span("p0", 2, 3), span("p1", 0, 1), span("p1", 2, 3), span("caption", 0, 1)],
    ))])?;
    assert_eq!(text_flow::view(&a.doc, "caption")?.text(), "Zy");
    assert_eq!(text_flow::view(&a.doc, "caption")?.owner, "caption");
    assert!(a.document_json().contains("Keep metadata"));
    assert_surviving(&a, &identities, "aXYZy")?;
    assert!(a.undo()?);
    assert_eq!(a.document_json(), before);
    assert!(a.redo()?);
    assert_surviving(&a, &identities, "aXYZy")?;
    Ok(())
}

#[test]
fn empty_collapsed_mask_does_not_discard_redo_or_consume_a_history_unit() -> Result {
    let (_, mut a, _) = setup(vec![paragraph("p", "aXb")])?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    a.apply(vec![insert("p", 0, "!")])?;
    assert!(a.undo()?);
    let before = (a.general_checkpoint()?, a.update_frame()?, a.view_json()?);
    let mut empty = action(("p", 1), ("p", 1), vec![]);
    empty.range.runs.clear();
    assert!(!a.apply(vec![Command::ReplaceMaskedGeneralTextRangeV1(empty)])?);
    assert_eq!((a.general_checkpoint()?, a.update_frame()?, a.view_json()?), before);
    assert!(a.redo()?);
    assert_eq!(text_flow::view(&a.doc, "p")?.text(), "!aXb");
    Ok(())
}

#[test]
fn automatic_rebase_and_committed_native_effect_keep_actual_peer_character_identities() -> Result {
    use crate::rich_replica::{
        DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionPreparation,
        DocumentSuggestionScope, DocumentSuggestionTextRebase, DocumentSuggestionTextRebasePolicy,
    };
    let (_, mut a, mut b) = setup(vec![paragraph("p", "ab🙂cd")])?;
    a.enable_general_ranges_guarded(&a.observe()?)?;
    let previous = a.capture_document_suggestion_guarded(
        &a.observe()?,
        "Original replacement",
        breditor_core::rich_content::review::ReviewPrincipalId::try_new("alice")?,
        "0",
        DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![Command::ReplaceTextRange(
                ReplaceTextRange {
                    anchor: point("p", 1),
                    focus: point("p", 5),
                    runs: vec![RangeTextRun { text: "R".into(), formats: vec![] }],
                },
            )]),
        },
    )?;
    b.apply(vec![insert("p", 2, "X")])?;
    a.receive_frame(&b.update_frame()?)?;
    let identities = characters(&a)?;
    let source = a.general_checkpoint()?;
    let DocumentSuggestionTextRebase::Captured { revision_packet_json } = a
        .rebase_document_suggestion_text_guarded(
            &a.observe()?,
            &previous,
            "Preserving replacement",
            "1",
            "native-peer-proof",
            DocumentSuggestionTextRebasePolicy::PreserveInterveningText,
        )?
    else {
        return Err("native preserving child".into());
    };
    assert_eq!(a.general_checkpoint()?, source);
    let child = a.document_suggestion_revision_packet(&previous, &revision_packet_json)?;
    let DocumentSuggestionPreparation::Ready(preview) =
        a.prepare_document_suggestion_guarded(&a.observe()?, &child)?
    else {
        return Err("native preserving Ready".into());
    };
    let effect = a.prepare_document_suggestion_effect(&preview)?;
    assert_eq!(a.general_checkpoint()?, source);
    a.commit_document_suggestion_effect(effect)?;
    assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXd");
    assert_surviving(&a, &identities, "aXd")?;
    assert!(a.undo()?);
    assert_eq!(text_flow::view(&a.doc, "p")?.text(), "abX🙂cd");
    assert_surviving(&a, &identities, "aXd")?;
    assert!(a.redo()?);
    assert_eq!(text_flow::view(&a.doc, "p")?.text(), "aRXd");
    assert_surviving(&a, &identities, "aXd")?;
    Ok(())
}
