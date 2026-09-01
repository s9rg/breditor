//! Black-box round-trip contracts for complete editor-state checkpoints.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DOCUMENT_FORMAT_VERSION, EDITOR_STATE_FORMAT, EDITOR_STATE_FORMAT_VERSION,
        EditorStateCodecError, EditorStateJsonCodec, TRANSACTION_REQUEST_FORMAT_VERSION,
        TransactionJsonCodec,
    },
    document::{Format, FormatSet, PropertyMap},
    identity::QualifiedName,
    position::{Affinity, Point},
    selection::{RangeOrder, RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::Transaction,
};
use serde::Deserialize;
use serde_json::{Value, json, value::RawValue};
use support::{
    TestResult, document_json, fixture_document_json, minimal_document_json, paragraph, path,
    test_error, text_node,
};

const CANONICAL_MINIMAL_STATE: &str = concat!(
    r#"{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"editor-state-canonical","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}},"selection":null,"pendingFormats":null}"#,
);

#[derive(Deserialize)]
struct BorrowedDocumentField<'a> {
    #[serde(borrow)]
    document: &'a RawValue,
}

fn document_codec(context: &EditorContext) -> breditor_core::codec::DocumentJsonCodec {
    breditor_core::codec::DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
}

fn state(
    context: &EditorContext,
    document_json: &str,
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let document = document_codec(context).decode(document_json)?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn strong_formats() -> Result<FormatSet, Box<dyn Error>> {
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])
    .map_err(Into::into)
}

fn text_point(
    indices: &[u32],
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(indices)?, utf16_offset, affinity })
}

fn child_point(
    indices: &[u32],
    child_index: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(indices)?, child_index, affinity })
}

fn mixed_collapsed_selection() -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(
        text_point(&[0, 0], 4, Affinity::After)?,
        child_point(&[0], 1, Affinity::Before)?,
    )
    .into())
}

fn checkpoint_json(document: &str, lineage: &str, revision: u64) -> Result<String, Box<dyn Error>> {
    let document: Value = serde_json::from_str(document)?;
    Ok(json!({
        "format": "breditor/editor-state",
        "formatVersion": 1,
        "snapshot": {"lineage": lineage, "revision": revision.to_string()},
        "document": document,
        "selection": null,
        "pendingFormats": null,
    })
    .to_string())
}

#[test]
fn minimal_checkpoint_has_exact_compact_v1_json_and_round_trips() -> TestResult {
    assert_eq!(EDITOR_STATE_FORMAT, "breditor/editor-state");
    assert_eq!(EDITOR_STATE_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let initial = state(&context, &minimal_document_json(), "editor-state-canonical", None, None)?;
    let codec = EditorStateJsonCodec::new(context.clone());
    assert_eq!(codec.context(), &context);

    let encoded = codec.encode(&initial)?;
    assert_eq!(encoded, CANONICAL_MINIMAL_STATE);
    assert_eq!(codec.decode(&encoded)?, initial);
    assert_eq!(codec.encode(&codec.decode(&encoded)?)?, encoded);

    let reordered = r#"
        {
          "pendingFormats": null,
          "selection": null,
          "document": {
            "root": {
              "children": [{
                "children": [], "properties": {}, "entityId": null,
                "type": "breditor/paragraph", "kind": "element"
              }],
              "properties": {}, "entityId": null,
              "type": "breditor/document", "kind": "element"
            },
            "schema": {"version": 1, "name": "breditor/base"},
            "formatVersion": 1,
            "format": "breditor/document"
          },
          "snapshot": {"revision": "\u0030", "lineage": "editor-state-\u0063anonical"},
          "formatVersion": 1,
          "format": "breditor\/editor-state"
        }
    "#;
    assert_eq!(codec.encode(&codec.decode(reordered)?)?, CANONICAL_MINIMAL_STATE);
    Ok(())
}

#[test]
fn embedded_document_is_byte_exact_document_v1_and_preserves_unicode() -> TestResult {
    assert_eq!(DOCUMENT_FORMAT_VERSION, 1);
    assert_eq!(TRANSACTION_REQUEST_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let document_json = document_json(&[
        paragraph(&[text_node("é", false), text_node("e\u{301}", true)]),
        paragraph(&[text_node("😀", false)]),
    ]);
    let initial = state(&context, &document_json, "editor-state-document-v1", None, None)?;
    let document_codec = document_codec(&context);
    let standalone_document = document_codec.encode(initial.document())?;
    let codec = EditorStateJsonCodec::new(context);
    let encoded = codec.encode(&initial)?;
    let borrowed: BorrowedDocumentField<'_> = serde_json::from_str(&encoded)?;

    assert_eq!(borrowed.document.get(), standalone_document);
    assert!(borrowed.document.get().contains('é'));
    assert!(borrowed.document.get().contains("e\u{301}"));
    assert!(borrowed.document.get().contains("😀"));

    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded, initial);
    assert_eq!(decoded.document().summary(), initial.document().summary());
    assert_eq!(document_codec.encode(decoded.document())?, standalone_document);
    Ok(())
}

#[test]
fn forward_backward_and_mixed_point_selections_round_trip_exactly() -> TestResult {
    let context = EditorContext::default();
    let document_json = fixture_document_json();
    let earlier = text_point(&[0, 0], 1, Affinity::Before)?;
    let later = text_point(&[0, 1], 1, Affinity::After)?;
    let selections = [
        (
            "editor-state-forward-selection",
            RangeSelection::new(earlier.clone(), later.clone()).into(),
            RangeOrder::Forward,
        ),
        (
            "editor-state-backward-selection",
            RangeSelection::new(later, earlier).into(),
            RangeOrder::Backward,
        ),
        ("editor-state-mixed-selection", mixed_collapsed_selection()?, RangeOrder::Collapsed),
    ];

    for (lineage, selection, order) in selections {
        let initial = state(&context, &document_json, lineage, Some(selection.clone()), None)?;
        let codec = EditorStateJsonCodec::new(context.clone());
        let encoded = codec.encode(&initial)?;
        let decoded = codec.decode(&encoded)?;

        assert_eq!(decoded, initial);
        assert_eq!(decoded.selection(), Some(&selection));
        let Some(Selection::Range(range)) = decoded.selection() else {
            return Err(test_error("decoded state did not retain its range selection").into());
        };
        assert_eq!(range.resolve(context.schema(), decoded.document())?.order(), order);
    }
    Ok(())
}

#[test]
fn pending_format_null_empty_and_strong_states_remain_distinct() -> TestResult {
    let context = EditorContext::default();
    let document_json = fixture_document_json();
    let selection = mixed_collapsed_selection()?;
    let cases = [
        ("editor-state-pending-null", None, Value::Null),
        ("editor-state-pending-empty", Some(FormatSet::default()), json!([])),
        (
            "editor-state-pending-strong",
            Some(strong_formats()?),
            json!([{"type": "breditor/strong", "properties": {}}]),
        ),
    ];

    for (lineage, pending_formats, expected_wire) in cases {
        let initial = state(
            &context,
            &document_json,
            lineage,
            Some(selection.clone()),
            pending_formats.clone(),
        )?;
        let codec = EditorStateJsonCodec::new(context.clone());
        let encoded = codec.encode(&initial)?;
        let encoded_value: Value = serde_json::from_str(&encoded)?;
        assert_eq!(encoded_value.get("pendingFormats"), Some(&expected_wire));

        let decoded = codec.decode(&encoded)?;
        assert_eq!(decoded, initial);
        assert_eq!(decoded.pending_formats(), pending_formats.as_ref());
    }
    Ok(())
}

#[test]
fn full_u64_revisions_decode_reencode_and_bind_transaction_requests_exactly() -> TestResult {
    let context = EditorContext::default();
    let document_json = minimal_document_json();
    let codec = EditorStateJsonCodec::new(context.clone());
    let boundaries = [0, 1, 9_007_199_254_740_991, 9_007_199_254_740_993, u64::MAX - 1, u64::MAX];

    let mut maximum_state = None;
    for revision in boundaries {
        let json = checkpoint_json(&document_json, "editor-state-revision-boundaries", revision)?;
        let decoded = codec.decode(&json)?;
        assert_eq!(decoded.snapshot().revision(), Revision::new(revision));

        let encoded = codec.encode(&decoded)?;
        let encoded_value: Value = serde_json::from_str(&encoded)?;
        assert_eq!(encoded_value.pointer("/snapshot/revision"), Some(&json!(revision.to_string())));
        assert_eq!(codec.decode(&encoded)?, decoded);
        if revision == u64::MAX {
            maximum_state = Some(decoded);
        }
    }

    let maximum_state =
        maximum_state.ok_or_else(|| test_error("maximum revision fixture was not retained"))?;
    let transaction = Transaction::new(&maximum_state, Vec::new());
    let transaction_codec = TransactionJsonCodec::new(context);
    let encoded_transaction = transaction_codec.encode(&transaction)?;
    let transaction_value: Value = serde_json::from_str(&encoded_transaction)?;
    assert_eq!(
        transaction_value.pointer("/baseSnapshot/revision"),
        Some(&json!(u64::MAX.to_string()))
    );
    assert_eq!(
        transaction_value.pointer("/baseSnapshot/lineage"),
        Some(&json!("editor-state-revision-boundaries"))
    );
    assert_eq!(transaction_codec.decode(&encoded_transaction, &maximum_state)?, transaction);
    Ok(())
}

#[test]
fn encoding_requires_the_callers_complete_context() -> TestResult {
    let source_context = EditorContext::default();
    let source =
        state(&source_context, &minimal_document_json(), "editor-state-context", None, None)?;
    let source_codec = EditorStateJsonCodec::new(source_context.clone());
    let encoded = source_codec.encode(&source)?;

    let other_context = EditorContext::default().with_max_operations_per_transaction(7);
    let other_codec = EditorStateJsonCodec::new(other_context.clone());
    let error = other_codec
        .encode(&source)
        .map_or_else(Ok, |_| Err(test_error("context-mismatched state encoded")))?;
    assert_eq!(error.code(), CodecErrorCode::ContextMismatch);
    assert!(matches!(error, EditorStateCodecError::ContextConfigurationMismatch));

    let restored = other_codec.decode(&encoded)?;
    assert_eq!(restored.context(), &other_context);
    assert_eq!(restored.snapshot(), source.snapshot());
    assert_eq!(restored.document(), source.document());
    assert_ne!(restored, source);
    Ok(())
}
