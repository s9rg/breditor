use std::error::Error;

use crate::{
    codec::{
        LOCAL_LOG_FRAME_HEADER_BYTES, LOCAL_LOG_FRAME_V2_FORMAT_VERSION, LocalLogFrameBinding,
        LocalLogFrameCodecV2, LocalLogFrameLimits, LocalLogTailCursorV2, LocalLogTailErrorCode,
        LocalLogTailErrorV2,
    },
    document::{Document, ElementNode, FormatSet, NodeRef, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent, LocalLogId,
        LocalLogObservationOutcome, LocalLogRecovery, LocalLogRecoveryLimits, LocalLogSequence,
        LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, DurableSchemaBinding},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction},
};

type TestResult = Result<(), Box<dyn Error>>;

struct FreshTail {
    cursor: LocalLogTailCursorV2,
    context: EditorContext,
    session: LocalSessionId,
    active_log: LocalLogId,
}

fn empty_paragraph() -> Result<NodeRef, Box<dyn Error>> {
    ElementNode::try_new(
        QualifiedName::from_known_static("breditor/paragraph"),
        None,
        PropertyMap::default(),
        Vec::new(),
    )
    .map(NodeRef::element)
    .map_err(Into::into)
}

fn state(context: &EditorContext, lineage: &str) -> Result<EditorState, Box<dyn Error>> {
    let root = ElementNode::try_new(
        QualifiedName::from_known_static("breditor/document"),
        None,
        PropertyMap::default(),
        vec![empty_paragraph()?, empty_paragraph()?],
    )
    .map(NodeRef::element)?;
    let document = Document::try_new(context.schema(), root, context.limits())?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn fresh_tail(
    schema: CompiledSchema,
    label: &str,
    frame_limits: LocalLogFrameLimits,
) -> Result<FreshTail, Box<dyn Error>> {
    let context = EditorContext::new(schema, DocumentLimits::default());
    let session = LocalSessionId::try_new(format!("session:tail-v2:{label}"))?;
    let checkpoint = LocalLogId::try_new(format!("log:tail-v2:{label}:g0"))?;
    let active_log = LocalLogId::try_new(format!("log:tail-v2:{label}:g1"))?;
    let initial = state(&context, &format!("tail-v2-{label}"))?;
    let recovered = LocalLogRecovery::new(session.clone(), checkpoint)
        .recover(EditorSession::new(initial), Vec::new())?;
    let anchor = recovered
        .try_into_checkpoint_anchor(active_log.clone(), LocalLogCompactionLimits::new(4))?;
    let cursor = anchor.begin_successor_tail_v2(LocalLogRecoveryLimits::new(8, 8, 8), frame_limits);
    Ok(FreshTail { cursor, context, session, active_log })
}

fn control_entry(
    binding: DurableSchemaBinding,
    session: &LocalSessionId,
    log: &LocalLogId,
    sequence: u64,
    replay: &str,
) -> Result<LocalLogEntry, Box<dyn Error>> {
    Ok(LocalLogEntry::new_with_schema_binding(
        binding,
        session.clone(),
        log.clone(),
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay)?,
        LocalLogEvent::clear_history(),
    ))
}

fn insertion_commit(
    context: &EditorContext,
    before: &EditorState,
) -> Result<Commit, Box<dyn Error>> {
    let offset = TextOffset::try_new(0)?;
    let range = TextRange::try_new(NodePath::try_from_indices(vec![0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new("x", FormatSet::default())?.into();
    let splice = TextSplice::capture(context, before.document(), range, replacement)?;
    Transaction::new(before, vec![splice.into()])
        .apply(context, before)?
        .into_commit()
        .ok_or_else(|| "insertion transaction unexpectedly produced no commit".into())
}

fn assert_v2_binding(
    cursor: &LocalLogTailCursorV2,
    binding: &DurableSchemaBinding,
    offset: u64,
    observation_count: u64,
) {
    assert_eq!(cursor.frame_format_version(), LOCAL_LOG_FRAME_V2_FORMAT_VERSION);
    assert_eq!(cursor.schema_binding(), binding);
    assert_eq!(cursor.accepted_byte_offset(), offset);
    assert_eq!(cursor.owner().observation_count(), observation_count);
}

#[test]
fn variant_binding_survives_empty_truncated_control_failure_compaction_and_reauthorization()
-> TestResult {
    let schema = CompiledSchema::test_semantic_variant_same_id();
    let expected_binding = schema.durable_binding();
    let frame_limits = LocalLogFrameLimits::new(4096);
    let FreshTail { cursor, context, session, active_log } =
        fresh_tail(schema, "propagation", frame_limits)?;
    assert_v2_binding(&cursor, &expected_binding, 0, 0);

    let end = cursor.try_observe_frame(0, &[])?;
    assert!(end.status().is_end_of_input());
    assert_v2_binding(end.cursor(), &expected_binding, 0, 0);
    let (cursor, _) = end.into_parts();

    let entry = control_entry(
        expected_binding.clone(),
        &session,
        &active_log,
        1,
        "request:tail-v2:control",
    )?;
    let codec = LocalLogFrameCodecV2::new(
        context,
        LocalLogFrameBinding::new(session.clone(), active_log.clone()),
    )
    .with_limits(frame_limits);
    let frame = codec.encode(&entry)?;
    let truncated = cursor.try_observe_frame(0, &frame[..LOCAL_LOG_FRAME_HEADER_BYTES])?;
    assert!(truncated.status().truncation().is_some());
    assert_v2_binding(truncated.cursor(), &expected_binding, 0, 0);
    let (cursor, _) = truncated.into_parts();

    let Err(control_failure) = cursor.try_observe_frame(0, &frame) else {
        return Err("ineffective control event unexpectedly applied".into());
    };
    assert_eq!(control_failure.code(), LocalLogTailErrorCode::Admission);
    assert_eq!(control_failure.rejected_entry(), Some(&entry));
    assert_v2_binding(control_failure.cursor(), &expected_binding, 0, 0);
    let (cursor, _, _) = control_failure.into_parts();

    let successor = LocalLogId::try_new("log:tail-v2:propagation:g2")?;
    let outcome = cursor.try_into_checkpoint_anchor(successor.clone())?;
    assert_eq!(outcome.frame_format_version(), 2);
    assert_eq!(outcome.schema_binding(), &expected_binding);
    assert_eq!(outcome.accepted_prefix_bytes(), 0);
    assert_eq!(outcome.frame_limits(), frame_limits);
    let (anchor, accepted_prefix, retained_limits, retained_binding) = outcome.into_parts();
    assert_eq!(accepted_prefix, 0);
    assert_eq!(retained_limits, frame_limits);
    assert_eq!(retained_binding, expected_binding);

    let successor_cursor =
        anchor.begin_successor_tail_v2(LocalLogRecoveryLimits::new(8, 8, 8), retained_limits);
    assert_v2_binding(&successor_cursor, &retained_binding, 0, 0);
    assert_eq!(successor_cursor.owner().active_log_id(), &successor);

    let next_successor = LocalLogId::try_new("log:tail-v2:propagation:g3")?;
    let reauthorized = successor_cursor.try_into_checkpoint_anchor_with_compaction_limits(
        next_successor,
        LocalLogCompactionLimits::new(7),
    )?;
    assert_eq!(reauthorized.frame_format_version(), 2);
    assert_eq!(reauthorized.schema_binding(), &retained_binding);
    assert_eq!(reauthorized.frame_limits(), retained_limits);
    assert_eq!(reauthorized.accepted_prefix_bytes(), 0);
    assert_eq!(reauthorized.anchor().compaction_limits(), LocalLogCompactionLimits::new(7));
    Ok(())
}

#[test]
fn successful_commit_and_control_transitions_keep_the_v2_binding() -> TestResult {
    let FreshTail { cursor, context, session, active_log } = fresh_tail(
        CompiledSchema::breditor_base(),
        "control-success",
        LocalLogFrameLimits::default(),
    )?;
    let binding = context.schema().durable_binding();
    let commit = insertion_commit(&context, cursor.owner().session().state())?;
    let commit_entry = LocalLogEntry::new_with_schema_binding(
        binding.clone(),
        session.clone(),
        active_log.clone(),
        LocalLogSequence::FIRST,
        ReplayId::try_new("request:tail-v2:commit")?,
        LocalLogEvent::commit(commit),
    );
    let codec = LocalLogFrameCodecV2::new(
        context,
        LocalLogFrameBinding::new(session.clone(), active_log.clone()),
    );
    let commit_frame = codec.encode(&commit_entry)?;
    let commit_step = cursor.try_observe_frame(0, &commit_frame)?;
    assert_eq!(
        commit_step.status().observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    let commit_end = u64::try_from(commit_frame.len())?;
    assert_v2_binding(commit_step.cursor(), &binding, commit_end, 1);
    let (cursor, _) = commit_step.into_parts();

    let control = control_entry(
        binding.clone(),
        &session,
        &active_log,
        2,
        "request:tail-v2:control-success",
    )?;
    let control_frame = codec.encode(&control)?;
    let control_step = cursor.try_observe_frame(commit_end, &control_frame)?;
    assert_eq!(
        control_step.status().observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 1,
            sequence: LocalLogSequence::try_new(2)?,
        })
    );
    let control_end = commit_end
        .checked_add(u64::try_from(control_frame.len())?)
        .ok_or("test frame offset overflowed")?;
    assert_v2_binding(control_step.cursor(), &binding, control_end, 2);
    assert_eq!(control_step.cursor().owner().session().undo_depth(), 0);
    Ok(())
}

#[test]
fn every_v2_failure_returns_the_unchanged_bound_owner_and_input() -> TestResult {
    let FreshTail { cursor, context, session, active_log } =
        fresh_tail(CompiledSchema::breditor_base(), "failure", LocalLogFrameLimits::default())?;
    let expected_binding = context.schema().durable_binding();

    let Err(origin_failure) = cursor.try_observe_frame(1, &[]) else {
        return Err("wrong origin unexpectedly succeeded".into());
    };
    assert_eq!(origin_failure.code(), LocalLogTailErrorCode::InputOriginMismatch);
    assert_v2_binding(origin_failure.cursor(), &expected_binding, 0, 0);
    let (cursor, _, _) = origin_failure.into_parts();

    let variant = CompiledSchema::test_semantic_variant_same_id();
    let wrong_entry = control_entry(
        variant.durable_binding(),
        &session,
        &active_log,
        1,
        "request:tail-v2:wrong-schema",
    )?;
    let wrong_codec = LocalLogFrameCodecV2::new(
        EditorContext::new(variant, DocumentLimits::default()),
        LocalLogFrameBinding::new(session.clone(), active_log.clone()),
    );
    let wrong_frame = wrong_codec.encode(&wrong_entry)?;
    let original = wrong_frame.clone();
    let Err(schema_failure) = cursor.try_observe_frame(0, &wrong_frame) else {
        return Err("wrong fingerprint unexpectedly decoded".into());
    };
    assert_eq!(schema_failure.code(), LocalLogTailErrorCode::FrameDecode);
    assert!(schema_failure.rejected_entry().is_none());
    assert_v2_binding(schema_failure.cursor(), &expected_binding, 0, 0);
    assert_eq!(wrong_frame, original);
    let (cursor, _, error) = schema_failure.into_parts();
    assert!(matches!(error, LocalLogTailErrorV2::FrameDecode(_)));

    let out_of_order = control_entry(
        expected_binding.clone(),
        &session,
        &active_log,
        2,
        "request:tail-v2:out-of-order",
    )?;
    let frame =
        LocalLogFrameCodecV2::new(context, LocalLogFrameBinding::new(session, active_log.clone()))
            .encode(&out_of_order)?;
    let Err(admission_failure) = cursor.try_observe_frame(0, &frame) else {
        return Err("out-of-order entry unexpectedly admitted".into());
    };
    assert_eq!(admission_failure.code(), LocalLogTailErrorCode::Admission);
    assert_eq!(admission_failure.rejected_entry(), Some(&out_of_order));
    assert_v2_binding(admission_failure.cursor(), &expected_binding, 0, 0);
    let (cursor, _, _) = admission_failure.into_parts();

    let (owner, _, limits, returned_binding) = cursor.into_parts();
    assert_eq!(returned_binding, expected_binding);
    let Err(overflow) = LocalLogTailCursorV2::from_trusted_parts(owner, u64::MAX, limits)
        .try_observe_frame(u64::MAX, &frame)
    else {
        return Err("accepted byte offset unexpectedly wrapped".into());
    };
    assert_eq!(overflow.code(), LocalLogTailErrorCode::AcceptedOffsetOverflow);
    assert_v2_binding(overflow.cursor(), &returned_binding, u64::MAX, 0);
    let (cursor, _, _) = overflow.into_parts();

    let Err(compaction_failure) = cursor.try_into_checkpoint_anchor(active_log) else {
        return Err("same active-log successor unexpectedly compacted".into());
    };
    assert_v2_binding(compaction_failure.owner(), &returned_binding, u64::MAX, 0);
    Ok(())
}
