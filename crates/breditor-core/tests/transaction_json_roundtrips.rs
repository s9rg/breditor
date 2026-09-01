//! Black-box contracts for the strict exact-base transaction-request boundary.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, TRANSACTION_REQUEST_FORMAT,
        TRANSACTION_REQUEST_FORMAT_VERSION, TransactionCodecError, TransactionJsonCodec,
    },
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        DeletedPointPolicy, Operation, OperationKind, ParagraphJoin, ParagraphSplit,
        RootTextBoundary, RootTextRange, RootTextReplace, SelectionRelocationPolicy, TextRange,
        TextSplice,
    },
    position::{Affinity, Point, TextOffset},
    schema::CompiledSchema,
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn formats(strong: bool) -> Result<FormatSet, Box<dyn Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])
    .map_err(Into::into)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, strong)| -> Result<TextRun, Box<dyn Error>> {
                TextRun::try_new(*text, formats(*strong)?).map_err(Into::into)
            })
            .collect::<Result<Vec<_>, _>>()?,
    )
    .map_err(Into::into)
}

fn text_range(container_path: &[u32], start: u64, end: u64) -> Result<TextRange, Box<dyn Error>> {
    TextRange::try_new(path(container_path)?, offset(start)?, offset(end)?).map_err(Into::into)
}

fn root_range(
    start_paragraph: u32,
    start_offset: u64,
    end_paragraph: u32,
    end_offset: u64,
) -> Result<RootTextRange, Box<dyn Error>> {
    RootTextRange::try_new(
        RootTextBoundary::try_new(path(&[start_paragraph])?, offset(start_offset)?)?,
        RootTextBoundary::try_new(path(&[end_paragraph])?, offset(end_offset)?)?,
    )
    .map_err(Into::into)
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn text_point(offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[0, 0])?, utf16_offset: offset, affinity })
}

fn collapsed_selection(offset: u32) -> Result<Selection, Box<dyn Error>> {
    let point = text_point(offset, Affinity::Before)?;
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn mixed_point_selection() -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(
        Point::Children { parent_path: path(&[0])?, child_index: 0, affinity: Affinity::Before },
        text_point(2, Affinity::After)?,
    )
    .into())
}

fn round_trip(
    codec: &TransactionJsonCodec,
    transaction: &Transaction,
) -> Result<Transaction, Box<dyn Error>> {
    let encoded = codec.encode(transaction)?;
    let decoded = codec.decode(&encoded, transaction.base_state())?;
    assert_eq!(&decoded, transaction);
    assert_eq!(codec.encode(&decoded)?, encoded);
    Ok(decoded)
}

fn assert_apply_equivalent(context: &EditorContext, transaction: &Transaction) -> TestResult {
    let codec = TransactionJsonCodec::new(context.clone());
    let decoded = round_trip(&codec, transaction)?;
    let original = transaction.apply(context, transaction.base_state())?;
    let replayed = decoded.apply(context, transaction.base_state())?;
    assert_eq!(replayed, original);
    Ok(())
}

fn decode_error(
    codec: &TransactionJsonCodec,
    json: &str,
    base: &EditorState,
) -> Result<TransactionCodecError, Box<dyn Error>> {
    match codec.decode(json, base) {
        Ok(_) => Err(test_error("invalid transaction JSON unexpectedly decoded").into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn zero_operation_request_has_exact_deterministic_json_and_round_trips() -> TestResult {
    assert_eq!(TRANSACTION_REQUEST_FORMAT, "breditor/transaction-request");
    assert_eq!(TRANSACTION_REQUEST_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let base = state(&context, &[paragraph(&[])], "transaction-json-canonical", None, None)?;
    let transaction = Transaction::new(&base, Vec::new());
    let codec = TransactionJsonCodec::new(context.clone());
    assert_eq!(codec.context(), &context);

    let expected = r#"{"format":"breditor/transaction-request","formatVersion":1,"schema":{"name":"breditor/base","version":1},"baseSnapshot":{"lineage":"transaction-json-canonical","revision":"0"},"operations":[],"selectionRelocation":{"anchor":"reject","focus":"reject"},"selectionUpdate":{"kind":"relocate"},"pendingFormatsUpdate":{"kind":"preserve"},"metadata":{"action":null,"history":{"kind":"record"}}}"#;
    let encoded = codec.encode(&transaction)?;
    assert_eq!(encoded, expected);
    assert_eq!(round_trip(&codec, &transaction)?, transaction);
    assert!(
        transaction.apply(&context, &base)?.is_unchanged(),
        "default zero-operation request must remain unchanged"
    );

    let reordered = r#"
        {
          "metadata": {"history": {"kind": "record"}, "action": null},
          "pendingFormatsUpdate": {"kind": "preserve"},
          "selectionUpdate": {"kind": "relocate"},
          "selectionRelocation": {"focus": "reject", "anchor": "reject"},
          "operations": [],
          "baseSnapshot": {"revision": "0", "lineage": "transaction-json-canonical"},
          "schema": {"version": 1, "name": "breditor/base"},
          "formatVersion": 1,
          "format": "breditor/transaction-request"
        }
    "#;
    let decoded = codec.decode(reordered, &base)?;
    assert_eq!(decoded, transaction);
    assert_eq!(codec.encode(&decoded)?, expected);

    let escaped = reordered
        .replace("breditor/transaction-request", r"breditor\/transaction-request")
        .replace("breditor/base", r"breditor\/base")
        .replace("transaction-json-canonical", r"transaction-json-\u0063anonical")
        .replace(r#""revision": "0""#, r#""revision": "\u0030""#);
    let decoded = codec.decode(&escaped, &base)?;
    assert_eq!(decoded, transaction);
    assert_eq!(codec.encode(&decoded)?, expected);
    Ok(())
}

#[test]
fn each_native_operation_kind_round_trips_and_applies_equivalently() -> TestResult {
    let context = EditorContext::default();

    let splice_base = state(
        &context,
        &[paragraph(&[text_node("a😀", false), text_node("Z", true)])],
        "transaction-json-splice",
        None,
        None,
    )?;
    let splice = TextSplice::capture(
        &context,
        splice_base.document(),
        text_range(&[0], 1, 3)?,
        fragment(&[("é", true), ("e\u{301}", false)])?,
    )?;
    assert_apply_equivalent(
        &context,
        &Transaction::new(&splice_base, vec![Operation::from(splice)]),
    )?;

    let split_base = state(
        &context,
        &[paragraph(&[text_node("a😀", false), text_node("e\u{301}", true)])],
        "transaction-json-split",
        None,
        None,
    )?;
    let split = ParagraphSplit::capture(&context, split_base.document(), path(&[0])?, offset(3)?)?;
    assert_apply_equivalent(
        &context,
        &Transaction::new(&split_base, vec![Operation::from(split)]),
    )?;

    let join_base = state(
        &context,
        &[paragraph(&[text_node("a", false)]), paragraph(&[text_node("😀", true)])],
        "transaction-json-join",
        None,
        None,
    )?;
    let join = ParagraphJoin::capture(&context, join_base.document(), path(&[0])?)?;
    assert_apply_equivalent(&context, &Transaction::new(&join_base, vec![Operation::from(join)]))?;

    let root_base = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("😀c", true)])],
        "transaction-json-root-replace",
        None,
        None,
    )?;
    let root_replace = RootTextReplace::capture(
        &context,
        root_base.document(),
        root_range(0, 1, 1, 2)?,
        vec![TextFragment::empty(), fragment(&[("e\u{301}", false)])?],
    )?;
    assert_apply_equivalent(
        &context,
        &Transaction::new(&root_base, vec![Operation::from(root_replace)]),
    )?;
    Ok(())
}

#[test]
fn one_ordered_batch_round_trips_all_four_operation_kinds() -> TestResult {
    let context = EditorContext::default();
    let base = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "transaction-json-all-kinds",
        None,
        None,
    )?;
    let operations = vec![
        Operation::from(TextSplice::try_new(
            text_range(&[0], 1, 1)?,
            TextFragment::empty(),
            fragment(&[("X", false)])?,
        )?),
        Operation::from(ParagraphSplit::try_new(
            path(&[0])?,
            offset(2)?,
            fragment(&[("aXb", false)])?,
        )?),
        Operation::from(ParagraphJoin::try_new(
            path(&[0])?,
            fragment(&[("aX", false)])?,
            fragment(&[("b", false)])?,
        )?),
        Operation::from(RootTextReplace::try_new(
            root_range(0, 1, 1, 1)?,
            vec![fragment(&[("aXb", false)])?, fragment(&[("cd", false)])?],
            vec![fragment(&[("Z", false)])?],
        )?),
    ];
    let transaction = Transaction::new(&base, operations);
    let codec = TransactionJsonCodec::new(context.clone());
    let decoded = round_trip(&codec, &transaction)?;
    assert_eq!(
        decoded.operations().iter().map(Operation::kind).collect::<Vec<_>>(),
        vec![
            OperationKind::TextSplice,
            OperationKind::ParagraphSplit,
            OperationKind::ParagraphJoin,
            OperationKind::RootTextReplace,
        ]
    );
    assert_eq!(decoded.apply(&context, &base)?, transaction.apply(&context, &base)?);
    Ok(())
}

#[test]
fn every_endpoint_relocation_policy_pair_round_trips_exactly() -> TestResult {
    let context = EditorContext::default();
    let base =
        state(&context, &[paragraph(&[])], "transaction-json-relocation-policies", None, None)?;
    let codec = TransactionJsonCodec::new(context);
    let policies =
        [DeletedPointPolicy::Reject, DeletedPointPolicy::Before, DeletedPointPolicy::After];

    for &anchor in &policies {
        for &focus in &policies {
            let transaction = Transaction::new(&base, Vec::new())
                .with_selection_relocation(SelectionRelocationPolicy::new(anchor, focus));
            let decoded = round_trip(&codec, &transaction)?;
            assert_eq!(decoded.selection_relocation().anchor(), anchor);
            assert_eq!(decoded.selection_relocation().focus(), focus);
        }
    }
    Ok(())
}

#[test]
fn every_selection_update_and_both_point_kinds_round_trip_and_apply() -> TestResult {
    let context = EditorContext::default();
    let initial_selection = collapsed_selection(1)?;
    let base = state(
        &context,
        &[paragraph(&[text_node("abc", false)])],
        "transaction-json-selection-updates",
        Some(initial_selection),
        None,
    )?;

    let updates = [
        SelectionUpdate::Relocate,
        SelectionUpdate::Set(None),
        SelectionUpdate::Set(Some(mixed_point_selection()?)),
    ];
    for update in updates {
        let transaction = Transaction::new(&base, Vec::new()).with_selection_update(update);
        assert_apply_equivalent(&context, &transaction)?;
    }

    let transaction = Transaction::new(&base, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(mixed_point_selection()?)));
    let encoded = TransactionJsonCodec::new(context).encode(&transaction)?;
    assert!(encoded.contains(r#""kind":"children""#));
    assert!(encoded.contains(r#""affinity":"before""#));
    assert!(encoded.contains(r#""kind":"text""#));
    assert!(encoded.contains(r#""affinity":"after""#));
    Ok(())
}

#[test]
fn every_pending_format_update_round_trips_without_collapsing_option_states() -> TestResult {
    let context = EditorContext::default();
    let base = state(
        &context,
        &[paragraph(&[text_node("abc", false)])],
        "transaction-json-pending-formats",
        Some(collapsed_selection(1)?),
        None,
    )?;
    let updates = [
        PendingFormatsUpdate::Preserve,
        PendingFormatsUpdate::Set(None),
        PendingFormatsUpdate::Set(Some(FormatSet::default())),
        PendingFormatsUpdate::Set(Some(formats(true)?)),
    ];

    for update in updates {
        let transaction = Transaction::new(&base, Vec::new()).with_pending_formats_update(update);
        assert_apply_equivalent(&context, &transaction)?;
    }

    let codec = TransactionJsonCodec::new(context);
    let null_json = codec.encode(
        &Transaction::new(&base, Vec::new())
            .with_pending_formats_update(PendingFormatsUpdate::Set(None)),
    )?;
    let empty_json =
        codec
            .encode(&Transaction::new(&base, Vec::new()).with_pending_formats_update(
                PendingFormatsUpdate::Set(Some(FormatSet::default())),
            ))?;
    let strong_json = codec.encode(
        &Transaction::new(&base, Vec::new())
            .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats(true)?))),
    )?;
    assert!(null_json.contains(r#""formats":null"#));
    assert!(empty_json.contains(r#""formats":[]"#));
    assert!(strong_json.contains(r#""formats":[{"type":"breditor/strong","properties":{}}]"#));
    Ok(())
}

#[test]
fn every_history_intent_and_action_metadata_round_trip_exactly() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, &[paragraph(&[])], "transaction-json-metadata", None, None)?;
    let codec = TransactionJsonCodec::new(context);
    let metadata = [
        TransactionMetadata::new(None, HistoryIntent::Record),
        TransactionMetadata::new(
            Some(QualifiedName::try_new("test/merge-action")?),
            HistoryIntent::Merge { group: QualifiedName::try_new("test/merge-group")? },
        ),
        TransactionMetadata::new(
            Some(QualifiedName::try_new("test/ignored-action")?),
            HistoryIntent::Ignore,
        ),
    ];

    for expected in metadata {
        let transaction = Transaction::new(&base, Vec::new()).with_metadata(expected.clone());
        let decoded = round_trip(&codec, &transaction)?;
        assert_eq!(decoded.metadata(), &expected);
    }
    Ok(())
}

#[test]
fn revision_is_always_a_decimal_string_and_full_u64_input_is_lossless() -> TestResult {
    let context = EditorContext::default();
    let base = state(
        &context,
        &[paragraph(&[text_node("a", false)])],
        "transaction-json-revision",
        Some(collapsed_selection(0)?),
        None,
    )?;
    let codec = TransactionJsonCodec::new(context.clone());
    let transaction = Transaction::new(&base, Vec::new());
    let encoded = codec.encode(&transaction)?;
    let encoded_value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(encoded_value.pointer("/baseSnapshot/revision"), Some(&json!("0")));

    let advancing =
        Transaction::new(&base, Vec::new()).with_selection_update(SelectionUpdate::Set(None));
    let commit = advancing
        .apply(&context, &base)?
        .into_commit()
        .ok_or_else(|| test_error("selection clear unexpectedly produced no commit"))?;
    assert_eq!(commit.after().snapshot().revision(), Revision::new(1));
    let revision_one = codec.encode(&Transaction::new(commit.after(), Vec::new()))?;
    let revision_one: Value = serde_json::from_str(&revision_one)?;
    assert_eq!(revision_one.pointer("/baseSnapshot/revision"), Some(&json!("1")));

    let mut maximum_revision = encoded_value;
    *maximum_revision
        .pointer_mut("/baseSnapshot/revision")
        .ok_or_else(|| test_error("encoded transaction has no base revision"))? =
        Value::String(u64::MAX.to_string());
    let maximum_revision = serde_json::to_string(&maximum_revision)?;
    match decode_error(&codec, &maximum_revision, &base)? {
        TransactionCodecError::BaseSnapshotMismatch { found, .. } => {
            assert_eq!(found.revision(), Revision::new(u64::MAX));
        }
        other => {
            return Err(test_error(format!(
                "expected parsed maximum revision to reach snapshot comparison; got {other}"
            ))
            .into());
        }
    }
    Ok(())
}

#[test]
fn context_base_and_schema_mismatches_are_distinct() -> TestResult {
    let context = EditorContext::default();
    let base = state(&context, &[paragraph(&[])], "transaction-json-mismatch-base", None, None)?;
    let transaction = Transaction::new(&base, Vec::new());
    let codec = TransactionJsonCodec::new(context.clone());
    let encoded = codec.encode(&transaction)?;

    let other_context =
        EditorContext::new(CompiledSchema::breditor_base(), context.limits().clone())
            .with_max_operations_per_transaction(7);
    let other_codec = TransactionJsonCodec::new(other_context);
    let context_error = decode_error(&other_codec, &encoded, &base)?;
    assert_eq!(context_error.code(), CodecErrorCode::ContextMismatch);
    assert!(matches!(context_error, TransactionCodecError::ContextConfigurationMismatch));
    let encode_context_error = other_codec
        .encode(&transaction)
        .map_or_else(Ok, |_| Err(test_error("context-mismatched transaction encoded")))?;
    assert_eq!(encode_context_error.code(), CodecErrorCode::ContextMismatch);

    let other_base = state(&context, &[paragraph(&[])], "transaction-json-other-base", None, None)?;
    let base_error = decode_error(&codec, &encoded, &other_base)?;
    assert_eq!(base_error.code(), CodecErrorCode::SnapshotMismatch);
    assert!(matches!(base_error, TransactionCodecError::BaseSnapshotMismatch { .. }));

    let mut wrong_schema: Value = serde_json::from_str(&encoded)?;
    *wrong_schema
        .pointer_mut("/schema/name")
        .ok_or_else(|| test_error("encoded transaction has no schema name"))? =
        Value::String("other/base".to_owned());
    let schema_error = decode_error(&codec, &serde_json::to_string(&wrong_schema)?, &base)?;
    assert_eq!(schema_error.code(), CodecErrorCode::SchemaMismatch);
    assert!(matches!(schema_error, TransactionCodecError::SchemaMismatch { .. }));
    Ok(())
}
