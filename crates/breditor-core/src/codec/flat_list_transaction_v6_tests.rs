//! V6 flat-list requests and durable commits: atomic replay and strict boundaries.
use super::structural_codec_test_support::{
    TestResult, block, extensions, formats, heading, name, state,
};
use super::*;
use crate::{
    block::{ListKind, OrderedListStart, TextBlockKind},
    document::{
        ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue, TextFragment, TextRun,
    },
    operation::{
        FlatListReframe, FlatListRootShape, FlatListTextRange, FlatListTextReplace,
        FlatListTextSplice, Operation, TextRange,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::prelude::*;
use serde_json::{Value, json};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-wire")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn path(indices: &[u32]) -> Result<NodePath, Box<dyn Error>> {
    Ok(NodePath::try_from_indices(indices.to_vec())?)
}
fn list(blocks: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    let items = blocks
        .into_iter()
        .map(|block| {
            Ok(NodeRef::element(ElementNode::try_new(
                name("breditor/list-item")?,
                None,
                PropertyMap::default(),
                vec![block],
            )?))
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/ordered-list")?,
        None,
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(8)?),
        )])?,
        items,
    )?))
}
fn base(context: &EditorContext) -> Result<EditorState, Box<dyn Error>> {
    let a =
        Point::Text { text_path: path(&[1, 0, 0, 0])?, utf16_offset: 1, affinity: Affinity::After };
    let b = Point::Text {
        text_path: path(&[1, 1, 0, 0])?,
        utf16_offset: 2,
        affinity: Affinity::Before,
    };
    state(
        context,
        vec![
            block(TextBlockKind::Paragraph, "before", formats()?)?,
            list(vec![
                block(heading(2)?, "a🙂b", formats()?)?,
                block(heading(4)?, "e\u{301}z", formats()?)?,
            ])?,
            block(TextBlockKind::Paragraph, "after", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(b, a)),
        None,
    )
}
fn splice(base: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListTextSplice(FlatListTextSplice::capture(
        base.context(),
        base.document(),
        TextRange::try_new(path(&[1, 0, 0])?, TextOffset::try_new(1)?, TextOffset::try_new(3)?)?,
        TextFragment::from(TextRun::try_new(text, formats()?)?),
    )?))
}
fn reframe(base: &EditorState) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListReframe(FlatListReframe::capture(
        base.context(),
        base.document(),
        1,
        1,
        vec![block(heading(2)?, "a🙂b", formats()?)?, block(heading(4)?, "e\u{301}z", formats()?)?],
    )?))
}
fn replace(base: &EditorState, text: &str) -> Result<Operation, Box<dyn Error>> {
    Ok(Operation::FlatListTextReplace(FlatListTextReplace::capture(
        base.context(),
        base.document(),
        FlatListTextRange::try_new(
            path(&[1, 0, 0])?,
            TextOffset::try_new(1)?,
            path(&[1, 1, 0])?,
            TextOffset::try_new(2)?,
        )?,
        vec![
            block(heading(2)?, text, formats()?)?,
            block(TextBlockKind::Paragraph, "Y", formats()?)?,
        ],
        vec![FlatListRootShape::List {
            kind: ListKind::Ordered(OrderedListStart::try_new(8)?),
            items: 2,
        }],
    )?))
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

fn chain(before: &EditorState) -> Result<Transaction, Box<dyn Error>> {
    let mut shadow = EditorSession::new(before.clone());
    let first = splice(before, "X")?;
    // This scratch session only captures consecutive document guards. The
    // real atomic request explicitly supplies its final selection below.
    shadow.apply_transaction(
        &Transaction::new(shadow.state(), vec![first.clone()])
            .with_selection_update(SelectionUpdate::Set(None)),
    )?;
    let second = replace(shadow.state(), "Q")?;
    shadow.apply_transaction(&Transaction::new(shadow.state(), vec![second.clone()]))?;
    let third = Operation::FlatListReframe(FlatListReframe::capture(
        before.context(),
        shadow.state().document(),
        1,
        1,
        vec![
            block(heading(2)?, "aQ", formats()?)?,
            block(TextBlockKind::Paragraph, "Yz", formats()?)?,
        ],
    )?);
    let point =
        Point::Text { text_path: path(&[2, 0])?, utf16_offset: 1, affinity: Affinity::After };
    Ok(Transaction::new(before, vec![first, second, third])
        .with_selection_update(SelectionUpdate::Set(Some(
            RangeSelection::new(point.clone(), point).into(),
        )))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(formats()?)))
        .with_metadata(TransactionMetadata::new(
            Some(name("example/list-edit")?),
            HistoryIntent::Record,
        )))
}

fn roundtrip(before: &EditorState, operation: Operation) -> TestResult {
    let request_codec = TransactionJsonCodecV6::new(before.context().clone());
    let commit_codec = CommitJsonCodecV6::new(before.context().clone());
    let request = Transaction::new(before, vec![operation]);
    let encoded = request_codec.encode(&request)?;
    let decoded = request_codec.decode(&encoded, before)?;
    assert_eq!(request_codec.encode(&decoded)?, encoded);
    let direct = request.apply(before.context(), before)?.into_commit();
    let replayed = decoded.apply(before.context(), before)?.into_commit();
    assert_eq!(direct, replayed);
    if let Some(commit) = replayed {
        let bytes = commit_codec.encode(&commit)?;
        assert_eq!(commit_codec.decode(&bytes)?, commit);
        assert_eq!(commit_codec.encode(&commit_codec.decode(&bytes)?)?, bytes);
        let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec())
            .with_selection_update(SelectionUpdate::Set(before.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                before.pending_formats().cloned(),
            ));
        let decoded_inverse =
            request_codec.decode(&request_codec.encode(&inverse)?, commit.after())?;
        let restored = decoded_inverse
            .apply(before.context(), commit.after())?
            .into_commit()
            .ok_or("inverse")?;
        exact(restored.after(), before);
        assert_eq!(commit_codec.decode(&commit_codec.encode(&restored)?)?, restored);
    }
    Ok(())
}

#[test]
fn every_list_primitive_and_inverse_roundtrip_through_requests_and_commits() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    for op in [splice(&before, "X")?, replace(&before, "X")?, reframe(&before)?] {
        roundtrip(&before, op)?;
    }
    // Valid requests need not create commits or history.
    roundtrip(&before, splice(&before, "🙂")?)
}

#[test]
fn mixed_atomic_request_has_exact_selection_pending_formats_and_independent_replay() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let writer = TransactionJsonCodecV6::new(context.clone());
    let request = chain(&before)?;
    let bytes = writer.encode(&request)?;
    let direct = request.apply(&context, &before)?.into_commit().ok_or("commit")?;
    let independent = self::context(DocumentLimits::default())?;
    let saved = EditorStateJsonCodecV3::new(context.clone()).encode(&before)?;
    let restored = EditorStateJsonCodecV3::new(independent.clone()).decode(&saved)?;
    assert!(matches!(
        writer.decode(&bytes, &restored),
        Err(TransactionV6CodecError::ContextConfigurationMismatch)
    ));
    let reader = TransactionJsonCodecV6::new(independent.clone());
    let decoded = reader.decode(&bytes, &restored)?;
    assert_eq!(reader.encode(&decoded)?, bytes);
    let mut session = EditorSession::new(restored.clone());
    let applied = session.apply_transaction(&decoded)?.into_commit().ok_or("commit")?;
    exact(applied.after(), direct.after());
    assert_eq!(applied.metadata(), direct.metadata());
    assert_eq!(applied.inverse_operations(), direct.inverse_operations());
    let commit_bytes = CommitJsonCodecV6::new(context).encode(&direct)?;
    let independent_commit = CommitJsonCodecV6::new(independent.clone()).decode(&commit_bytes)?;
    assert_eq!(independent_commit, applied);
    assert_eq!(
        CommitJsonCodecV6::new(independent.clone()).encode(&independent_commit)?,
        commit_bytes
    );
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &restored);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), direct.after());
    let saved = SessionCheckpointJsonCodecV6::new(independent.clone()).encode(&session)?;
    let mut reopened = SessionCheckpointJsonCodecV6::new(independent).decode(&saved)?;
    reopened.undo()?.ok_or("restored undo")?;
    exact(reopened.state(), &before);
    Ok(())
}

#[test]
fn late_stale_guard_is_atomic_and_commit_replay_rejects_it() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let op = splice(&before, "X")?;
    let mut session = EditorSession::new(before.clone());
    let commit = session
        .apply_transaction(&Transaction::new(&before, vec![op.clone()]))?
        .into_commit()
        .ok_or("commit")?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let request = Transaction::new(&current, vec![op.clone(), op]);
    let codec = TransactionJsonCodecV6::new(context.clone());
    let decoded = codec.decode(&codec.encode(&request)?, &current)?;
    assert!(session.apply_transaction(&decoded).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    let codec = CommitJsonCodecV6::new(context);
    let mut value: Value = serde_json::from_str(&codec.encode(&commit)?)?;
    let op = value["forwardOperations"][0].clone();
    value["forwardOperations"] = json!([op.clone(), op]);
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(CommitV6CodecError::InvalidCommit(CommitCodecError::Apply(_)))
    ));
    session.redo()?.ok_or("redo survives")?;
    exact(session.state(), commit.after());
    Ok(())
}

#[test]
fn legacy_formats_stay_closed_and_heading_payload_bytes_stay_unchanged() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let request = chain(&before)?;
    let commit = request.apply(&context, &before)?.into_commit().ok_or("commit")?;
    let request_bytes = TransactionJsonCodecV6::new(context.clone()).encode(&request)?;
    let commit_bytes = CommitJsonCodecV6::new(context.clone()).encode(&commit)?;
    let old_request = TransactionJsonCodecV5::new(context.clone());
    let old_commit = CommitJsonCodecV5::new(context);
    assert!(old_request.encode(&request).is_err());
    assert!(old_commit.encode(&commit).is_err());
    for version in [5, 6] {
        assert!(
            old_request
                .decode(
                    &request_bytes.replacen(
                        "\"formatVersion\":6",
                        &format!("\"formatVersion\":{version}"),
                        1
                    ),
                    &before
                )
                .is_err()
        );
        assert!(
            old_commit
                .decode(&commit_bytes.replacen(
                    "\"formatVersion\":6",
                    &format!("\"formatVersion\":{version}"),
                    1
                ))
                .is_err()
        );
    }
    let (context, before, operation) = super::structural_codec_test_support::fixture()?;
    let request = Transaction::new(&before, vec![operation]);
    assert_eq!(
        TransactionJsonCodecV6::new(context.clone()).encode(&request)?.replacen(
            "\"formatVersion\":6",
            "\"formatVersion\":5",
            1
        ),
        TransactionJsonCodecV5::new(context.clone()).encode(&request)?
    );
    let commit = request.apply(&context, &before)?.into_commit().ok_or("heading commit")?;
    assert_eq!(
        CommitJsonCodecV6::new(context.clone()).encode(&commit)?.replacen(
            "\"formatVersion\":6",
            "\"formatVersion\":5",
            1
        ),
        CommitJsonCodecV5::new(context).encode(&commit)?
    );
    Ok(())
}

#[test]
fn request_binding_snapshot_and_count_reject_before_operation_payloads() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(1);
    let before = base(&context)?;
    let codec = TransactionJsonCodecV6::new(context.clone());
    let mut value: Value =
        serde_json::from_str(&codec.encode(&Transaction::new(&before, vec![]))?)?;
    value["operations"] = json!([null, null]);
    assert!(matches!(
        codec.decode(&value.to_string(), &before),
        Err(TransactionV6CodecError::OperationLimit { actual: 2, maximum: 1 })
    ));
    let changed = Transaction::new(&before, vec![splice(&before, "X")?])
        .apply(&context, &before)?
        .into_commit()
        .ok_or("commit")?;
    assert!(matches!(
        codec.decode(&value.to_string(), changed.after()),
        Err(TransactionV6CodecError::BaseSnapshotMismatch { .. })
    ));
    value["schemaFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    assert_eq!(
        codec.decode(&value.to_string(), &before).err().ok_or("binding")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    let mut commit: Value =
        serde_json::from_str(&CommitJsonCodecV6::new(context.clone()).encode(&changed)?)?;
    commit["forwardOperations"] = json!([null, null]);
    commit["before"]["document"] = json!(null);
    let codec = CommitJsonCodecV6::new(context);
    assert_eq!(
        codec.decode(&commit.to_string()).err().ok_or("count")?.code(),
        CodecErrorCode::ResourceLimit
    );
    commit["schemaFingerprint"] = value["schemaFingerprint"].clone();
    assert_eq!(
        codec.decode(&commit.to_string()).err().ok_or("binding")?.code(),
        CodecErrorCode::SchemaMismatch
    );
    Ok(())
}

#[test]
fn malformed_indexed_payloads_and_untrusted_result_fields_are_rejected() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let request = chain(&before)?;
    let request_codec = TransactionJsonCodecV6::new(context.clone());
    let bytes = request_codec.encode(&request)?;
    let commit = request.apply(&context, &before)?.into_commit().ok_or("commit")?;
    let commit_codec = CommitJsonCodecV6::new(context);
    let commit_bytes = commit_codec.encode(&commit)?;
    for index in 0..3 {
        let mut value: Value = serde_json::from_str(&bytes)?;
        value["operations"][index]["extra"] = json!(true);
        assert!(
            matches!(request_codec.decode(&value.to_string(), &before), Err(TransactionV6CodecError::OperationPayload {operation_index, ..}) if operation_index == index as u64)
        );
        let mut value: Value = serde_json::from_str(&commit_bytes)?;
        value["forwardOperations"][index]["extra"] = json!(true);
        assert!(
            matches!(commit_codec.decode(&value.to_string()), Err(CommitV6CodecError::OperationPayload {operation_index, ..}) if operation_index == index as u64)
        );
    }
    for key in ["inverseOperations", "mapping", "summary"] {
        let mut value: Value = serde_json::from_str(&commit_bytes)?;
        value[key] = json!([]);
        assert!(commit_codec.decode(&value.to_string()).is_err());
    }
    for (pointer, replacement) in [
        ("/before/formatVersion", json!(2)),
        ("/resultSelection", json!({"kind":"unknown"})),
        ("/resultPendingFormats", json!([{"kind":"unknown"}])),
        ("/forwardOperations/1/layout/0/start", json!(2_147_483_647)),
        ("/forwardOperations/0/replacement/runs/0/formats/1/properties/example~1href", json!(42)),
    ] {
        let mut value: Value = serde_json::from_str(&commit_bytes)?;
        *value.pointer_mut(pointer).ok_or(pointer)? = replacement;
        assert!(commit_codec.decode(&value.to_string()).is_err(), "accepted {pointer}");
    }
    assert!(
        request_codec
            .decode(
                &bytes.replacen(
                    "\"formatVersion\":6",
                    "\"formatVersion\":6,\"formatVersion\":6",
                    1
                ),
                &before
            )
            .is_err()
    );
    assert!(
        commit_codec
            .decode(&commit_bytes.replacen(
                "\"formatVersion\":6",
                "\"formatVersion\":6,\"formatVersion\":6",
                1
            ))
            .is_err()
    );
    Ok(())
}

#[test]
fn exact_byte_budgets_and_process_local_contexts_are_enforced() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let request = chain(&before)?;
    let commit = request.apply(&context, &before)?.into_commit().ok_or("commit")?;
    let requests = TransactionJsonCodecV6::new(context.clone()).encode(&request)?;
    let commits = CommitJsonCodecV6::new(context).encode(&commit)?;
    for delta in [0, 1] {
        let limited =
            self::context(DocumentLimits::default().with_max_json_bytes(requests.len() - delta))?;
        let own = base(&limited)?;
        let codec = TransactionJsonCodecV6::new(limited);
        if delta == 0 {
            assert_eq!(codec.encode(&chain(&own)?)?, requests);
            assert_eq!(codec.encode(&codec.decode(&requests, &own)?)?, requests);
        } else {
            assert!(matches!(
                codec.encode(&chain(&own)?),
                Err(TransactionV6CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                codec.decode(&requests, &own),
                Err(TransactionV6CodecError::InputTooLarge { .. })
            ));
        }
        assert!(matches!(
            codec.encode(&request),
            Err(TransactionV6CodecError::ContextConfigurationMismatch)
        ));
        let limited =
            self::context(DocumentLimits::default().with_max_json_bytes(commits.len() - delta))?;
        let own = base(&limited)?;
        let own_commit = chain(&own)?.apply(&limited, &own)?.into_commit().ok_or("own commit")?;
        let codec = CommitJsonCodecV6::new(limited);
        if delta == 0 {
            assert_eq!(codec.encode(&own_commit)?, commits);
            assert_eq!(codec.decode(&commits)?, own_commit);
        } else {
            assert!(matches!(
                codec.encode(&own_commit),
                Err(CommitV6CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                codec.decode(&commits),
                Err(CommitV6CodecError::InputTooLarge { .. })
            ));
        }
        assert!(matches!(
            codec.encode(&commit),
            Err(CommitV6CodecError::ContextConfigurationMismatch)
        ));
    }
    Ok(())
}

#[test]
fn state_only_commits_roundtrip_and_noop_commit_recipes_are_rejected() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let request =
        Transaction::new(&before, vec![]).with_selection_update(SelectionUpdate::Set(None));
    let request_codec = TransactionJsonCodecV6::new(context.clone());
    let request = request_codec.decode(&request_codec.encode(&request)?, &before)?;
    let commit = request.apply(&context, &before)?.into_commit().ok_or("selection commit")?;
    assert!(commit.forward_operations().is_empty());
    let codec = CommitJsonCodecV6::new(context);
    let bytes = codec.encode(&commit)?;
    assert_eq!(codec.decode(&bytes)?, commit);
    let mut value: Value = serde_json::from_str(&bytes)?;
    value["resultSelection"] = value["before"]["selection"].clone();
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(CommitV6CodecError::InvalidCommit(CommitCodecError::UnexpectedUnchanged))
    ));
    Ok(())
}

#[test]
fn full_document_result_limits_roll_back_all_steps_and_preserve_redo() -> TestResult {
    // Guards cover only the list. Untouched roots still count toward the full
    // document budget: the source has 21 UTF-8 bytes, the final result has 25.
    let limited = context(DocumentLimits::default().with_max_total_text_bytes(21))?;
    let before = base(&limited)?;
    let first = splice(&before, "X")?;
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![first.clone()]))?;
    let second = Operation::FlatListTextSplice(FlatListTextSplice::capture(
        &limited,
        session.state().document(),
        TextRange::try_new(path(&[1, 0, 0])?, TextOffset::try_new(1)?, TextOffset::try_new(2)?)?,
        TextFragment::from(TextRun::try_new("12345678", formats()?)?),
    )?);
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    let operations = vec![first, second];
    let request = Transaction::new(&current, operations.clone());
    let codec = TransactionJsonCodecV6::new(limited.clone());
    let decoded = codec.decode(&codec.encode(&request)?, &current)?;
    assert!(matches!(
        session.apply_transaction(&decoded),
        Err(crate::transaction::TransactionApplyError::Operation { operation_index: 1, .. })
    ));
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("retained redo")?;
    let generous = context(DocumentLimits::default())?;
    let own = base(&generous)?;
    let commit = Transaction::new(&own, operations)
        .apply(&generous, &own)?
        .into_commit()
        .ok_or("generous commit")?;
    let bytes = CommitJsonCodecV6::new(generous).encode(&commit)?;
    assert!(matches!(
        CommitJsonCodecV6::new(limited).decode(&bytes),
        Err(CommitV6CodecError::InvalidCommit(CommitCodecError::Apply(_)))
    ));
    Ok(())
}

#[test]
fn commit_recipes_reject_redundant_noop_operations() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = base(&context)?;
    let noop = splice(&before, "🙂")?;
    let change = splice(&before, "X")?;
    let request = Transaction::new(&before, vec![noop.clone(), change]);
    let request_codec = TransactionJsonCodecV6::new(context.clone());
    let decoded = request_codec.decode(&request_codec.encode(&request)?, &before)?;
    let commit = decoded.apply(&context, &before)?.into_commit().ok_or("commit")?;
    assert_eq!(commit.forward_operations().len(), 1);
    let codec = CommitJsonCodecV6::new(context.clone());
    let mut value: Value = serde_json::from_str(&codec.encode(&commit)?)?;
    let encoded_noop: Value =
        serde_json::from_str(&OperationJsonCodecV6::new(context).encode(&noop)?)?;
    value["forwardOperations"]
        .as_array_mut()
        .ok_or("operations")?
        .insert(0, encoded_noop["operation"].clone());
    assert!(matches!(
        codec.decode(&value.to_string()),
        Err(CommitV6CodecError::InvalidCommit(CommitCodecError::NonCanonicalForwardOperations {
            operation_index: 0
        }))
    ));
    Ok(())
}

proptest! {
    #[test]
    fn unicode_requests_commits_and_derived_inverses_replay_exactly(text in "[a-z🙂\u{301}]{1,12}") {
        let context = context(DocumentLimits::default()).map_err(|e| TestCaseError::fail(e.to_string()))?;
        let before = base(&context).map_err(|e| TestCaseError::fail(e.to_string()))?;
        for op in [splice(&before, &text), replace(&before, &text)] {
            let op = op.map_err(|e| TestCaseError::fail(e.to_string()))?;
            roundtrip(&before, op).map_err(|e| TestCaseError::fail(e.to_string()))?;
        }
    }
}
