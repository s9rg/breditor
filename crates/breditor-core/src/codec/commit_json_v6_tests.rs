//! Commit V6 replay, strict admission, and exact resource-budget contracts.
use super::{
    CommitJsonCodecV3, CommitJsonCodecV6, CommitV6CodecError,
    structural_codec_test_support::{TestResult, block, context, fixture, formats, heading, state},
};
use crate::{
    block::TextBlockKind,
    document::{FormatSet, TextFragment, TextRun},
    operation::{
        Operation, RootTextBoundary, RootTextRange, TextBlockKindChange, TextBlockReplace,
        TextBlockSplice, TextRange,
    },
    position::{NodePath, TextOffset},
    schema::DocumentLimits,
    state::{EditorContext, EditorState},
    transaction::{Commit, PendingFormatsUpdate, Transaction, TransactionOutcome},
};
use serde_json::{Value, json};
use std::{error::Error, io};

fn apply(base: &EditorState, operations: Vec<Operation>) -> Result<Commit, Box<dyn Error>> {
    let TransactionOutcome::Committed(commit) =
        Transaction::new(base, operations).apply(base.context(), base)?
    else {
        return Err(io::Error::other("expected a changed transaction").into());
    };
    Ok(*commit)
}

fn kind_commit(context: &EditorContext) -> Result<Commit, Box<dyn Error>> {
    let base =
        state(context, vec![block(TextBlockKind::Paragraph, "🙂abc", formats()?)?], None, None)?;
    let operation = TextBlockKindChange::capture(context, base.document(), 0..1, heading(2)?)?;
    apply(&base, vec![Operation::TextBlockKindChange(operation)])
}

#[test]
fn heading_kind_splice_and_replace_replay_exactly_with_typed_formats() -> TestResult {
    let (context, base, operation) = fixture()?;
    let codec = CommitJsonCodecV6::new(context.clone());
    let kind = apply(&base, vec![operation])?;
    let splice = TextBlockSplice::capture(
        &context,
        kind.after().document(),
        TextRange::try_new(
            NodePath::try_from_indices(vec![0])?,
            TextOffset::try_new(1)?,
            TextOffset::try_new(3)?,
        )?,
        TextFragment::try_from_runs(vec![TextRun::try_new("🦀", formats()?)?])?,
    )?;
    let spliced = apply(kind.after(), vec![Operation::TextBlockSplice(splice)])?;
    let range = RootTextRange::try_new(
        RootTextBoundary::try_new(NodePath::try_from_indices(vec![0])?, TextOffset::try_new(1)?)?,
        RootTextBoundary::try_new(NodePath::try_from_indices(vec![0])?, TextOffset::try_new(3)?)?,
    )?;
    let replace = TextBlockReplace::capture(
        &context,
        spliced.after().document(),
        range,
        vec![
            block(heading(3)?, "x", formats()?)?,
            block(TextBlockKind::Paragraph, "y", FormatSet::default())?,
        ],
    )?;
    let replaced = apply(spliced.after(), vec![Operation::TextBlockReplace(replace)])?;
    for commit in [kind, spliced, replaced] {
        let encoded = codec.encode(&commit)?;
        let value: Value = serde_json::from_str(&encoded)?;
        assert_eq!(value["formatVersion"], 6);
        assert_eq!(value["before"]["formatVersion"], 3);
        let decoded = codec.decode(&encoded)?;
        assert_eq!(decoded, commit);
        assert_eq!(codec.encode(&decoded)?, encoded);
        assert!(CommitJsonCodecV3::new(context.clone()).decode(&encoded).is_err());
        assert!(CommitJsonCodecV3::new(context.clone()).encode(&commit).is_err());
    }
    Ok(())
}

#[test]
fn state_only_commit_round_trips_without_inventing_operations() -> TestResult {
    let (context, base, _) = fixture()?;
    let TransactionOutcome::Committed(commit) = Transaction::new(&base, vec![])
        .with_pending_formats_update(PendingFormatsUpdate::Set(None))
        .apply(&context, &base)?
    else {
        return Err(io::Error::other("pending formats did not change").into());
    };
    let codec = CommitJsonCodecV6::new(context);
    let encoded = codec.encode(&commit)?;
    assert_eq!(codec.decode(&encoded)?, *commit);
    assert!(commit.forward_operations().is_empty());
    Ok(())
}

#[test]
fn strict_records_bindings_and_replay_guards_reject_tampering() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let codec = CommitJsonCodecV6::new(context.clone());
    let encoded = codec.encode(&kind_commit(&context)?)?;
    for (pointer, replacement) in [
        ("/formatVersion", json!(3)),
        ("/before/formatVersion", json!(2)),
        ("/schema/version", json!(2)),
        ("/schemaFingerprint", json!("invalid")),
        ("/before/document/root/children/0/children/0/text", json!("changed")),
        ("/resultSelection", json!({"kind":"unknown"})),
    ] {
        let mut value: Value = serde_json::from_str(&encoded)?;
        *value.pointer_mut(pointer).ok_or_else(|| io::Error::other(pointer))? = replacement;
        assert!(codec.decode(&value.to_string()).is_err(), "accepted {pointer}");
    }
    let mut unknown: Value = serde_json::from_str(&encoded)?;
    unknown["inverseOperations"] = json!([]);
    assert!(codec.decode(&unknown.to_string()).is_err());
    let duplicate =
        encoded.replacen("\"formatVersion\":6", "\"formatVersion\":6,\"formatVersion\":6", 1);
    assert!(codec.decode(&duplicate).is_err());
    let mut unknown_operation: Value = serde_json::from_str(&encoded)?;
    unknown_operation["forwardOperations"][0]["extra"] = json!(true);
    assert!(matches!(
        codec.decode(&unknown_operation.to_string()),
        Err(CommitV6CodecError::OperationPayload { operation_index: 0, .. })
    ));
    Ok(())
}

#[test]
fn exact_byte_limits_context_and_operation_count_are_enforced() -> TestResult {
    let original = context(DocumentLimits::default())?;
    let commit = kind_commit(&original)?;
    let encoded = CommitJsonCodecV6::new(original).encode(&commit)?;
    for delta in [0, 1] {
        let limited =
            context(DocumentLimits::default().with_max_json_bytes(encoded.len() - delta))?;
        let codec = CommitJsonCodecV6::new(limited.clone());
        let own_commit = kind_commit(&limited)?;
        if delta == 0 {
            assert_eq!(codec.encode(&own_commit)?, encoded);
            assert_eq!(codec.decode(&encoded)?, own_commit);
        } else {
            assert!(matches!(
                codec.encode(&own_commit),
                Err(CommitV6CodecError::OutputTooLarge { .. })
            ));
            assert!(matches!(
                codec.decode(&encoded),
                Err(CommitV6CodecError::InputTooLarge { .. })
            ));
        }
        assert!(matches!(
            codec.encode(&commit),
            Err(CommitV6CodecError::ContextConfigurationMismatch)
        ));
    }
    let limited = context(DocumentLimits::default())?.with_max_operations_per_transaction(1);
    let mut excess: Value = serde_json::from_str(&encoded)?;
    let op = excess["forwardOperations"][0].clone();
    excess["forwardOperations"] = json!([op, null]);
    // Count rejection must precede malformed payload and before-state decoding.
    excess["before"]["document"] = json!(null);
    assert!(matches!(
        CommitJsonCodecV6::new(limited).decode(&excess.to_string()),
        Err(CommitV6CodecError::InvalidCommit(_))
    ));
    Ok(())
}
