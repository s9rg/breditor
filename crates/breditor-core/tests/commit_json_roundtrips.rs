//! Black-box round-trip contracts for self-contained replay-proved commits.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        COMMIT_FORMAT, COMMIT_FORMAT_VERSION, CommitJsonCodec, DocumentJsonCodec,
        EditorStateJsonCodec,
    },
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        DeletedPointPolicy, Operation, OperationKind, ParagraphJoin, ParagraphSplit,
        PointRelocation, RootTextBoundary, RootTextRange, RootTextReplace,
        SelectionRelocationPolicy, TextRange, TextSplice,
    },
    position::{Affinity, Point, TextOffset},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionMetadata, TransactionOutcome,
    },
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const CANONICAL_MINIMAL_COMMIT: &str = concat!(
    r#"{"format":"breditor/commit","formatVersion":1,"before":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"commit-json-canonical","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}},"selection":null,"pendingFormats":null},"forwardOperations":[],"resultSelection":{"kind":"range","anchor":{"kind":"children","parentPath":[0],"childIndex":0,"affinity":"before"},"focus":{"kind":"children","parentPath":[0],"childIndex":0,"affinity":"before"}},"resultPendingFormats":null,"metadata":{"action":null,"history":{"kind":"record"}}}"#,
);

const CANONICAL_INSERT_COMMIT: &str = concat!(
    r#"{"format":"breditor/commit","formatVersion":1,"before":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"commit-json-operation-golden","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}},"selection":null,"pendingFormats":null},"forwardOperations":[{"kind":"textSplice","range":{"containerPath":[0],"start":0,"end":0},"expectedRemoved":{"runs":[]},"replacement":{"runs":[{"text":"x","formats":[]}]}}],"resultSelection":null,"resultPendingFormats":null,"metadata":{"action":null,"history":{"kind":"record"}}}"#,
);

const CANONICAL_MIXED_COMMIT: &str = concat!(
    r#"{"format":"breditor/commit","formatVersion":1,"before":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"commit-json-all-operation-kinds","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"ab","formats":[]}]},{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"cd","formats":[]}]}]}},"selection":null,"pendingFormats":null},"forwardOperations":["#,
    r#"{"kind":"textSplice","range":{"containerPath":[0],"start":1,"end":1},"expectedRemoved":{"runs":[]},"replacement":{"runs":[{"text":"X","formats":[]}]}}"#,
    r#",{"kind":"paragraphSplit","paragraphPath":[0],"offset":2,"expected":{"runs":[{"text":"aXb","formats":[]}]}}"#,
    r#",{"kind":"paragraphJoin","leftPath":[0],"expectedLeft":{"runs":[{"text":"aX","formats":[]}]},"expectedRight":{"runs":[{"text":"b","formats":[]}]}}"#,
    r#",{"kind":"rootTextReplace","range":{"start":{"paragraphPath":[0],"offset":1},"end":{"paragraphPath":[1],"offset":1}},"expectedParagraphs":[{"runs":[{"text":"aXb","formats":[]}]},{"runs":[{"text":"cd","formats":[]}]}],"replacementParagraphs":[{"runs":[{"text":"Z","formats":[{"type":"breditor/strong","properties":{}}]}]}]}],"resultSelection":null,"resultPendingFormats":null,"metadata":{"action":null,"history":{"kind":"record"}}}"#,
);

fn document_codec(context: &EditorContext) -> DocumentJsonCodec {
    DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone())
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let document = document_codec(context).decode(&document_json(paragraphs))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn apply(context: &EditorContext, transaction: &Transaction) -> Result<Commit, Box<dyn Error>> {
    committed(transaction.apply(context, transaction.base_state())?)
}

fn round_trip(codec: &CommitJsonCodec, commit: &Commit) -> Result<Commit, Box<dyn Error>> {
    let encoded = codec.encode(commit)?;
    let decoded = codec.decode(&encoded)?;
    assert_eq!(&decoded, commit, "decode(encode(commit)) must preserve the exact commit");
    assert_eq!(codec.encode(&decoded)?, encoded, "canonical encoding must be stable");
    Ok(decoded)
}

fn offset(value: u64) -> Result<TextOffset, Box<dyn Error>> {
    TextOffset::try_new(value).map_err(Into::into)
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

fn text_point(offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[0, 0])?, utf16_offset: offset, affinity })
}

fn child_point(child_index: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(&[0])?, child_index, affinity })
}

fn collapsed_text_selection(offset: u32) -> Result<Selection, Box<dyn Error>> {
    Ok(RangeSelection::new(
        text_point(offset, Affinity::Before)?,
        text_point(offset, Affinity::After)?,
    )
    .into())
}

fn collapsed_child_selection(child_index: u32) -> Result<Selection, Box<dyn Error>> {
    let point = child_point(child_index, Affinity::Before)?;
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn assert_single_text(document: &Document, expected: &str) -> TestResult {
    let Some(paragraph) = document.node_at(&path(&[0])?)?.as_element() else {
        return Err(test_error("paragraph path did not resolve to an element").into());
    };
    let Some(text) = paragraph.children().get(0).and_then(|child| child.as_text()) else {
        return Err(test_error("paragraph did not contain a text leaf").into());
    };
    assert_eq!(text.text(), expected);
    Ok(())
}

fn assert_mixed_derived_contract(commit: &Commit) -> TestResult {
    assert_eq!(commit.forward_operations().len(), 4);
    assert_eq!(commit.inverse_operations().len(), 4);
    assert_eq!(commit.changes().len(), 4);
    assert_eq!(
        commit.inverse_operations().iter().map(Operation::kind).collect::<Vec<_>>(),
        vec![
            OperationKind::RootTextReplace,
            OperationKind::ParagraphSplit,
            OperationKind::ParagraphJoin,
            OperationKind::TextSplice,
        ]
    );
    assert_eq!(
        commit
            .changes()
            .iter()
            .map(breditor_core::operation::Change::operation_index)
            .collect::<Vec<_>>(),
        vec![0, 1, 2, 3]
    );
    assert!(
        commit
            .changes()
            .iter()
            .next()
            .and_then(breditor_core::operation::Change::as_text)
            .is_some()
    );
    assert!(commit.changes().iter().skip(1).all(|change| change.as_children().is_some()));

    let paragraph = commit
        .after()
        .document()
        .node_at(&path(&[0])?)?
        .as_element()
        .ok_or_else(|| test_error("mixed golden result is not a paragraph"))?;
    let strong = QualifiedName::try_new("breditor/strong")?;
    let result_runs = paragraph
        .children()
        .iter()
        .map(|child| {
            child
                .as_text()
                .map(|text| (text.text(), text.formats().get(&strong).is_some()))
                .ok_or_else(|| test_error("mixed golden result contains a non-text child"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(result_runs, vec![("a", false), ("Z", true), ("d", false)]);
    Ok(())
}

#[test]
fn minimal_state_only_commit_has_exact_deterministic_v1_json() -> TestResult {
    assert_eq!(COMMIT_FORMAT, "breditor/commit");
    assert_eq!(COMMIT_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let before = state(&context, &[paragraph(&[])], "commit-json-canonical", None, None)?;
    let transaction = Transaction::new(&before, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(collapsed_child_selection(0)?)));
    let commit = apply(&context, &transaction)?;
    let codec = CommitJsonCodec::new(context.clone());
    assert_eq!(codec.context(), &context);

    let encoded = codec.encode(&commit)?;
    assert_eq!(encoded, CANONICAL_MINIMAL_COMMIT);
    assert_eq!(round_trip(&codec, &commit)?, commit);

    let reordered = r#"
        {
          "metadata": {"history": {"kind": "record"}, "action": null},
          "resultPendingFormats": null,
          "resultSelection": {
            "focus": {"affinity": "before", "childIndex": 0, "parentPath": [0], "kind": "children"},
            "anchor": {"affinity": "before", "childIndex": 0, "parentPath": [0], "kind": "children"},
            "kind": "range"
          },
          "forwardOperations": [],
          "before": {
            "pendingFormats": null,
            "selection": null,
            "document": {
              "root": {
                "children": [{"children": [], "properties": {}, "entityId": null, "type": "breditor/paragraph", "kind": "element"}],
                "properties": {}, "entityId": null, "type": "breditor/document", "kind": "element"
              },
              "schema": {"version": 1, "name": "breditor/base"},
              "formatVersion": 1,
              "format": "breditor/document"
            },
            "snapshot": {"revision": "\u0030", "lineage": "commit-json-\u0063anonical"},
            "formatVersion": 1,
            "format": "breditor\/editor-state"
          },
          "formatVersion": 1,
          "format": "breditor\/commit"
        }
    "#;
    let decoded = codec.decode(reordered)?;
    assert_eq!(decoded, commit);
    assert_eq!(codec.encode(&decoded)?, CANONICAL_MINIMAL_COMMIT);
    Ok(())
}

#[test]
fn fixed_operation_commit_freezes_replay_inverse_relocation_and_change_semantics() -> TestResult {
    let context = EditorContext::default();
    let codec = CommitJsonCodec::new(context);
    let commit = codec.decode(CANONICAL_INSERT_COMMIT)?;

    assert_eq!(commit.base_revision(), Revision::ZERO);
    assert_eq!(commit.revision(), Revision::new(1));
    assert_single_text(commit.after().document(), "x")?;
    assert_eq!(commit.after().selection(), None);
    assert_eq!(commit.after().pending_formats(), None);

    let forward: Operation = TextSplice::try_new(
        text_range(&[0], 0, 0)?,
        TextFragment::empty(),
        fragment(&[("x", false)])?,
    )?
    .into();
    let inverse: Operation = TextSplice::try_new(
        text_range(&[0], 0, 1)?,
        fragment(&[("x", false)])?,
        TextFragment::empty(),
    )?
    .into();
    assert_eq!(commit.forward_operations(), &[forward]);
    assert_eq!(commit.inverse_operations(), &[inverse]);

    let before = child_point(0, Affinity::Before)?;
    let after = child_point(0, Affinity::After)?;
    assert_eq!(
        commit.relocation().relocate_point(commit.before(), &before)?,
        PointRelocation::Exact(text_point(0, Affinity::Before)?)
    );
    assert_eq!(
        commit.relocation().relocate_point(commit.before(), &after)?,
        PointRelocation::Exact(text_point(1, Affinity::After)?)
    );

    let mut changes = commit.changes().iter();
    let change = changes
        .next()
        .and_then(breditor_core::operation::Change::as_text)
        .ok_or_else(|| test_error("golden insertion did not derive one text change"))?;
    assert!(changes.next().is_none());
    assert_eq!(change.operation_index(), 0);
    assert_eq!(change.container_path(), &path(&[0])?);
    assert_eq!(change.old_text_range(), &text_range(&[0], 0, 0)?);
    assert_eq!(change.new_text_range(), &text_range(&[0], 0, 1)?);
    assert_eq!((change.old_child_range().start(), change.old_child_range().end()), (0, 0));
    assert_eq!((change.new_child_range().start(), change.new_child_range().end()), (0, 1));

    assert_eq!(codec.encode(&commit)?, CANONICAL_INSERT_COMMIT);
    Ok(())
}

#[test]
fn one_ordered_operation_commit_round_trips_all_native_operation_kinds() -> TestResult {
    let context = EditorContext::default();
    let before = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "commit-json-all-operation-kinds",
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
            vec![fragment(&[("Z", true)])?],
        )?),
    ];
    let commit = apply(&context, &Transaction::new(&before, operations))?;
    let codec = CommitJsonCodec::new(context);
    let encoded = codec.encode(&commit)?;
    assert_eq!(encoded, CANONICAL_MIXED_COMMIT);
    let encoded_value: Value = serde_json::from_str(&encoded)?;
    let operation_kinds = encoded_value
        .pointer("/forwardOperations")
        .and_then(Value::as_array)
        .ok_or_else(|| test_error("commit encoding has no forward operation array"))?
        .iter()
        .map(|operation| operation.get("kind").cloned())
        .collect::<Vec<_>>();
    assert_eq!(
        operation_kinds,
        vec![
            Some(json!("textSplice")),
            Some(json!("paragraphSplit")),
            Some(json!("paragraphJoin")),
            Some(json!("rootTextReplace")),
        ]
    );

    let decoded = codec.decode(CANONICAL_MIXED_COMMIT)?;
    assert_eq!(decoded, commit);
    assert_eq!(codec.encode(&decoded)?, CANONICAL_MIXED_COMMIT);
    assert_eq!(
        decoded.forward_operations().iter().map(Operation::kind).collect::<Vec<_>>(),
        vec![
            OperationKind::TextSplice,
            OperationKind::ParagraphSplit,
            OperationKind::ParagraphJoin,
            OperationKind::RootTextReplace,
        ]
    );
    assert_mixed_derived_contract(&decoded)?;
    Ok(())
}

#[test]
fn state_only_selection_and_pending_format_results_round_trip_without_collapsing_values()
-> TestResult {
    let context = EditorContext::default();
    let selection = collapsed_text_selection(1)?;
    let pending_cases = [
        ("null", Some(formats(true)?), None, Value::Null),
        ("empty", None, Some(FormatSet::default()), json!([])),
        (
            "strong",
            None,
            Some(formats(true)?),
            json!([{"type": "breditor/strong", "properties": {}}]),
        ),
    ];

    for (name, before_formats, result_formats, expected_wire) in pending_cases {
        let before = state(
            &context,
            &[paragraph(&[text_node("abc", false)])],
            &format!("commit-json-pending-{name}"),
            Some(selection.clone()),
            before_formats,
        )?;
        let transaction = Transaction::new(&before, Vec::new())
            .with_pending_formats_update(PendingFormatsUpdate::Set(result_formats.clone()));
        let commit = apply(&context, &transaction)?;
        assert!(commit.forward_operations().is_empty());
        assert!(commit.inverse_operations().is_empty());
        assert!(commit.changes().is_empty());

        let codec = CommitJsonCodec::new(context.clone());
        let encoded = codec.encode(&commit)?;
        let encoded_value: Value = serde_json::from_str(&encoded)?;
        assert_eq!(encoded_value.get("resultPendingFormats"), Some(&expected_wire));
        let decoded = round_trip(&codec, &commit)?;
        assert_eq!(decoded.after().pending_formats(), result_formats.as_ref());
        assert_eq!(decoded.after().selection(), Some(&selection));
    }

    let before = state(
        &context,
        &[paragraph(&[text_node("abc", false)])],
        "commit-json-selection-only",
        Some(collapsed_text_selection(0)?),
        None,
    )?;
    let result_selection: Selection =
        RangeSelection::new(text_point(3, Affinity::After)?, text_point(1, Affinity::Before)?)
            .into();
    let commit = apply(
        &context,
        &Transaction::new(&before, Vec::new())
            .with_selection_update(SelectionUpdate::Set(Some(result_selection.clone()))),
    )?;
    let decoded = round_trip(&CommitJsonCodec::new(context), &commit)?;
    assert_eq!(decoded.after().selection(), Some(&result_selection));
    Ok(())
}

#[test]
fn every_metadata_variant_round_trips_exactly() -> TestResult {
    let context = EditorContext::default();
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

    for (index, expected) in metadata.into_iter().enumerate() {
        let before = state(
            &context,
            &[paragraph(&[])],
            &format!("commit-json-metadata-{index}"),
            None,
            None,
        )?;
        let transaction = Transaction::new(&before, Vec::new())
            .with_selection_update(SelectionUpdate::Set(Some(collapsed_child_selection(0)?)))
            .with_metadata(expected.clone());
        let commit = apply(&context, &transaction)?;
        let decoded = round_trip(&CommitJsonCodec::new(context.clone()), &commit)?;
        assert_eq!(decoded.metadata(), &expected);
    }
    Ok(())
}

#[test]
fn commit_reaches_the_maximum_revision_without_losing_decimal_precision() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[paragraph(&[])], "commit-json-maximum-revision", None, None)?;
    let state_codec = EditorStateJsonCodec::new(context.clone());
    let mut checkpoint: Value = serde_json::from_str(&state_codec.encode(&initial)?)?;
    *checkpoint
        .pointer_mut("/snapshot/revision")
        .ok_or_else(|| test_error("editor-state encoding has no revision"))? =
        json!((u64::MAX - 1).to_string());
    let before = state_codec.decode(&serde_json::to_string(&checkpoint)?)?;
    assert_eq!(before.snapshot().revision(), Revision::new(u64::MAX - 1));

    let commit = apply(
        &context,
        &Transaction::new(&before, Vec::new())
            .with_selection_update(SelectionUpdate::Set(Some(collapsed_child_selection(0)?))),
    )?;
    assert_eq!(commit.base_revision(), Revision::new(u64::MAX - 1));
    assert_eq!(commit.revision(), Revision::new(u64::MAX));

    let codec = CommitJsonCodec::new(context);
    let encoded = codec.encode(&commit)?;
    let encoded_value: Value = serde_json::from_str(&encoded)?;
    assert_eq!(
        encoded_value.pointer("/before/snapshot/revision"),
        Some(&json!((u64::MAX - 1).to_string()))
    );
    let decoded = round_trip(&codec, &commit)?;
    assert_eq!(decoded.revision(), Revision::new(u64::MAX));
    Ok(())
}

#[test]
fn net_zero_nonempty_operation_batch_remains_a_durable_event() -> TestResult {
    let context = EditorContext::default();
    let before = state(
        &context,
        &[paragraph(&[text_node("ab", false)])],
        "commit-json-net-zero-event",
        None,
        None,
    )?;
    let insert = TextSplice::try_new(
        text_range(&[0], 1, 1)?,
        TextFragment::empty(),
        fragment(&[("X", false)])?,
    )?;
    let remove = TextSplice::try_new(
        text_range(&[0], 1, 2)?,
        fragment(&[("X", false)])?,
        TextFragment::empty(),
    )?;
    let commit = apply(
        &context,
        &Transaction::new(&before, vec![insert.into(), remove.into()]).with_metadata(
            TransactionMetadata::new(
                Some(QualifiedName::try_new("test/net-zero")?),
                HistoryIntent::Record,
            ),
        ),
    )?;
    assert_eq!(commit.before().document(), commit.after().document());
    assert_ne!(commit.before().snapshot(), commit.after().snapshot());
    assert_eq!(commit.forward_operations().len(), 2);
    assert_eq!(commit.inverse_operations().len(), 2);
    assert_eq!(commit.changes().len(), 2);

    let decoded = round_trip(&CommitJsonCodec::new(context), &commit)?;
    assert_eq!(decoded.before().document(), decoded.after().document());
    assert_eq!(decoded.forward_operations().len(), 2);
    Ok(())
}

#[test]
fn explicit_result_values_make_nondefault_relocation_policy_safely_derivable() -> TestResult {
    let context = EditorContext::default();
    let before_selection = collapsed_text_selection(1)?;
    let before_formats = formats(true)?;
    let before = state(
        &context,
        &[paragraph(&[text_node("abc", false)])],
        "commit-json-derived-relocation-policy",
        Some(before_selection),
        Some(before_formats.clone()),
    )?;
    let deletion = TextSplice::try_new(
        text_range(&[0], 0, 2)?,
        fragment(&[("ab", false)])?,
        TextFragment::empty(),
    )?;
    let commit = apply(
        &context,
        &Transaction::new(&before, vec![deletion.into()]).with_selection_relocation(
            SelectionRelocationPolicy::new(DeletedPointPolicy::Before, DeletedPointPolicy::After),
        ),
    )?;
    assert_single_text(commit.after().document(), "c")?;
    assert_eq!(commit.after().pending_formats(), Some(&before_formats));

    let decoded = round_trip(&CommitJsonCodec::new(context), &commit)?;
    assert_eq!(decoded.after().selection(), commit.after().selection());
    assert_eq!(decoded.relocation(), commit.relocation());
    assert_eq!(decoded.inverse_operations(), commit.inverse_operations());
    Ok(())
}

#[test]
fn decoded_commit_reconstructs_exact_undo_and_redo_boundaries() -> TestResult {
    let context = EditorContext::default();
    let before_selection = collapsed_text_selection(1)?;
    let before_formats = formats(true)?;
    let before = state(
        &context,
        &[paragraph(&[text_node("abc", false)])],
        "commit-json-replay-boundaries",
        Some(before_selection.clone()),
        Some(before_formats.clone()),
    )?;
    let insertion = TextSplice::try_new(
        text_range(&[0], 0, 0)?,
        TextFragment::empty(),
        fragment(&[("X", false)])?,
    )?;
    let after_selection = collapsed_text_selection(3)?;
    let after_formats = FormatSet::default();
    let commit = apply(
        &context,
        &Transaction::new(&before, vec![insertion.into()])
            .with_selection_update(SelectionUpdate::Set(Some(after_selection.clone())))
            .with_pending_formats_update(PendingFormatsUpdate::Set(Some(after_formats.clone())))
            .with_metadata(TransactionMetadata::new(
                Some(QualifiedName::try_new("test/replay-boundary")?),
                HistoryIntent::Merge { group: QualifiedName::try_new("test/typing")? },
            )),
    )?;
    assert_single_text(commit.after().document(), "Xabc")?;

    let decoded = round_trip(&CommitJsonCodec::new(context.clone()), &commit)?;
    assert_eq!(
        decoded.undo_transaction(decoded.after())?,
        commit.undo_transaction(commit.after())?
    );

    let undo = decoded.undo_transaction(decoded.after())?;
    assert_eq!(undo.metadata().history(), &HistoryIntent::Ignore);
    let undo_commit = apply(&context, &undo)?;
    assert_eq!(undo_commit.after().document(), before.document());
    assert_eq!(undo_commit.after().selection(), Some(&before_selection));
    assert_eq!(undo_commit.after().pending_formats(), Some(&before_formats));

    let redo = decoded.redo_transaction(undo_commit.after())?;
    assert_eq!(redo.metadata().history(), &HistoryIntent::Ignore);
    let redo_commit = apply(&context, &redo)?;
    assert_eq!(redo_commit.after().document(), decoded.after().document());
    assert_eq!(redo_commit.after().selection(), Some(&after_selection));
    assert_eq!(redo_commit.after().pending_formats(), Some(&after_formats));
    assert_eq!(redo_commit.forward_operations(), decoded.forward_operations());
    Ok(())
}
