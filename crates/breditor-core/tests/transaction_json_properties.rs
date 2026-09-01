//! Property and replay laws for exact-base transaction-request JSON.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{DocumentJsonCodec, TransactionJsonCodec},
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{DeletedPointPolicy, Operation, SelectionRelocationPolicy, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
    },
};
use proptest::{
    collection::vec,
    prelude::{Strategy, any, prop_oneof},
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use support::{document_json, paragraph, text_node};

#[derive(Clone, Debug)]
struct RunSpec {
    text: String,
    strong: bool,
}

#[derive(Clone, Copy, Debug)]
enum SelectionUpdateSpec {
    Relocate,
    Clear,
    SetCollapsed { anchor: Affinity, focus: Affinity },
}

#[derive(Clone, Copy, Debug)]
enum PendingUpdateSpec {
    Preserve,
    Clear,
    Empty,
    Strong,
}

#[derive(Clone, Copy, Debug)]
struct StateUpdateSpec {
    selection: SelectionUpdateSpec,
    pending: PendingUpdateSpec,
}

#[derive(Clone, Copy, Debug)]
enum ActionSpec {
    None,
    InsertText,
    PropertyReplay,
}

#[derive(Clone, Copy, Debug)]
enum HistorySpec {
    Record,
    MergeTyping,
    MergeProperty,
    Ignore,
}

#[derive(Clone, Copy, Debug)]
struct MetadataSpec {
    action: ActionSpec,
    history: HistorySpec,
}

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/transaction_json_properties.proptest-regressions",
    ));
    config.cases = 48;
    config
}

fn unicode_text() -> impl Strategy<Value = String> {
    vec(
        select(vec![
            'a',
            'Z',
            '0',
            ' ',
            '\n',
            '"',
            '\\',
            '\u{e9}',
            '\u{754c}',
            '\u{301}',
            '\u{1f600}',
            '\u{1f680}',
            '\u{1f1e8}',
            '\u{1f1e6}',
            '\u{200d}',
        ]),
        1..5,
    )
    .prop_map(|characters| characters.into_iter().collect())
}

fn canonical_runs(minimum: usize, maximum_exclusive: usize) -> impl Strategy<Value = Vec<RunSpec>> {
    (any::<bool>(), vec(unicode_text(), minimum..maximum_exclusive)).prop_map(
        |(first_strong, texts)| {
            texts
                .into_iter()
                .enumerate()
                .map(|(index, text)| RunSpec {
                    text,
                    strong: if index % 2 == 0 { first_strong } else { !first_strong },
                })
                .collect()
        },
    )
}

fn affinity_strategy() -> impl Strategy<Value = Affinity> {
    any::<bool>().prop_map(|after| if after { Affinity::After } else { Affinity::Before })
}

fn deleted_point_policy_strategy() -> impl Strategy<Value = DeletedPointPolicy> {
    select(vec![DeletedPointPolicy::Reject, DeletedPointPolicy::Before, DeletedPointPolicy::After])
}

fn relocation_strategy() -> impl Strategy<Value = SelectionRelocationPolicy> {
    (deleted_point_policy_strategy(), deleted_point_policy_strategy())
        .prop_map(|(anchor, focus)| SelectionRelocationPolicy::new(anchor, focus))
}

fn pending_update_strategy() -> impl Strategy<Value = PendingUpdateSpec> {
    select(vec![
        PendingUpdateSpec::Preserve,
        PendingUpdateSpec::Clear,
        PendingUpdateSpec::Empty,
        PendingUpdateSpec::Strong,
    ])
}

fn state_update_strategy() -> impl Strategy<Value = StateUpdateSpec> {
    prop_oneof![
        pending_update_strategy().prop_map(|pending| StateUpdateSpec {
            selection: SelectionUpdateSpec::Relocate,
            pending,
        }),
        (affinity_strategy(), affinity_strategy(), pending_update_strategy()).prop_map(
            |(anchor, focus, pending)| StateUpdateSpec {
                selection: SelectionUpdateSpec::SetCollapsed { anchor, focus },
                pending,
            },
        ),
        select(vec![PendingUpdateSpec::Preserve, PendingUpdateSpec::Clear]).prop_map(|pending| {
            StateUpdateSpec { selection: SelectionUpdateSpec::Clear, pending }
        }),
    ]
}

fn metadata_strategy() -> impl Strategy<Value = MetadataSpec> {
    (
        select(vec![ActionSpec::None, ActionSpec::InsertText, ActionSpec::PropertyReplay]),
        select(vec![
            HistorySpec::Record,
            HistorySpec::MergeTyping,
            HistorySpec::MergeProperty,
            HistorySpec::Ignore,
        ]),
    )
        .prop_map(|(action, history)| MetadataSpec { action, history })
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn formats(strong: bool) -> Result<FormatSet, TestCaseError> {
    if !strong {
        return Ok(FormatSet::default());
    }
    let kind = QualifiedName::try_new("breditor/strong").map_err(test_failure)?;
    FormatSet::try_from_formats(vec![Format::new(kind, PropertyMap::default())])
        .map_err(test_failure)
}

fn fragment(specs: &[RunSpec]) -> Result<TextFragment, TestCaseError> {
    let runs = specs
        .iter()
        .map(|spec| TextRun::try_new(&spec.text, formats(spec.strong)?).map_err(test_failure))
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(test_failure)
}

fn paragraph_path() -> Result<NodePath, TestCaseError> {
    NodePath::try_from_indices(vec![0]).map_err(test_failure)
}

fn text_range(start: u64, end: u64) -> Result<TextRange, TestCaseError> {
    TextRange::try_new(
        paragraph_path()?,
        TextOffset::try_new(start).map_err(test_failure)?,
        TextOffset::try_new(end).map_err(test_failure)?,
    )
    .map_err(test_failure)
}

fn collapsed_selection(anchor: Affinity, focus: Affinity) -> Result<Selection, TestCaseError> {
    let parent_path = paragraph_path()?;
    Ok(RangeSelection::new(
        Point::Children { parent_path: parent_path.clone(), child_index: 0, affinity: anchor },
        Point::Children { parent_path, child_index: 0, affinity: focus },
    )
    .into())
}

fn base_state(
    context: &EditorContext,
    runs: &[RunSpec],
    lineage: &str,
    affinity: Affinity,
) -> Result<EditorState, TestCaseError> {
    let children = runs.iter().map(|run| text_node(&run.text, run.strong)).collect::<Vec<_>>();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))
        .map_err(test_failure)?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage).map_err(test_failure)?,
        document,
        Some(collapsed_selection(affinity, affinity)?),
        None,
    )
    .map_err(test_failure)
}

fn selection_update(spec: SelectionUpdateSpec) -> Result<SelectionUpdate, TestCaseError> {
    match spec {
        SelectionUpdateSpec::Relocate => Ok(SelectionUpdate::Relocate),
        SelectionUpdateSpec::Clear => Ok(SelectionUpdate::Set(None)),
        SelectionUpdateSpec::SetCollapsed { anchor, focus } => {
            Ok(SelectionUpdate::Set(Some(collapsed_selection(anchor, focus)?)))
        }
    }
}

fn pending_update(spec: PendingUpdateSpec) -> Result<PendingFormatsUpdate, TestCaseError> {
    match spec {
        PendingUpdateSpec::Preserve => Ok(PendingFormatsUpdate::Preserve),
        PendingUpdateSpec::Clear => Ok(PendingFormatsUpdate::Set(None)),
        PendingUpdateSpec::Empty => Ok(PendingFormatsUpdate::Set(Some(FormatSet::default()))),
        PendingUpdateSpec::Strong => Ok(PendingFormatsUpdate::Set(Some(formats(true)?))),
    }
}

fn metadata(spec: MetadataSpec) -> Result<TransactionMetadata, TestCaseError> {
    let action = match spec.action {
        ActionSpec::None => None,
        ActionSpec::InsertText => {
            Some(QualifiedName::try_new("breditor/insert-text").map_err(test_failure)?)
        }
        ActionSpec::PropertyReplay => {
            Some(QualifiedName::try_new("test/property-replay").map_err(test_failure)?)
        }
    };
    let history = match spec.history {
        HistorySpec::Record => HistoryIntent::Record,
        HistorySpec::MergeTyping => HistoryIntent::Merge {
            group: QualifiedName::try_new("breditor/typing").map_err(test_failure)?,
        },
        HistorySpec::MergeProperty => HistoryIntent::Merge {
            group: QualifiedName::try_new("test/property-group").map_err(test_failure)?,
        },
        HistorySpec::Ignore => HistoryIntent::Ignore,
    };
    Ok(TransactionMetadata::new(action, history))
}

fn configure_transaction(
    transaction: Transaction,
    relocation: SelectionRelocationPolicy,
    updates: StateUpdateSpec,
    metadata_spec: MetadataSpec,
) -> Result<Transaction, TestCaseError> {
    Ok(transaction
        .with_selection_relocation(relocation)
        .with_selection_update(selection_update(updates.selection)?)
        .with_pending_formats_update(pending_update(updates.pending)?)
        .with_metadata(metadata(metadata_spec)?))
}

fn assert_codec_and_replay_laws(
    context: &EditorContext,
    base: &EditorState,
    transaction: &Transaction,
) -> Result<(), TestCaseError> {
    let codec = TransactionJsonCodec::new(context.clone());
    let encoded = codec.encode(transaction).map_err(test_failure)?;
    let repeated = codec.encode(transaction).map_err(test_failure)?;
    if repeated != encoded {
        return Err(TestCaseError::fail(
            "repeated encoding of one transaction was not byte-identical",
        ));
    }

    let decoded = codec.decode(&encoded, base).map_err(test_failure)?;
    if &decoded != transaction {
        return Err(TestCaseError::fail(
            "decode(encode(transaction), base) did not preserve the exact request",
        ));
    }

    let reencoded = codec.encode(&decoded).map_err(test_failure)?;
    if reencoded != encoded {
        return Err(TestCaseError::fail(
            "decoded transaction changed deterministic wire bytes on re-encode",
        ));
    }

    let original_outcome = transaction.apply(context, base).map_err(test_failure)?;
    let decoded_outcome = decoded.apply(context, base).map_err(test_failure)?;
    if original_outcome != decoded_outcome {
        return Err(TestCaseError::fail(
            "transaction application changed across the codec round trip",
        ));
    }
    Ok(())
}

fn capture_splice(
    context: &EditorContext,
    document: &Document,
    start: u64,
    end: u64,
    replacement: TextFragment,
) -> Result<Operation, TestCaseError> {
    TextSplice::capture(context, document, text_range(start, end)?, replacement)
        .map(Operation::from)
        .map_err(test_failure)
}

fn scalar_boundaries(specs: &[RunSpec]) -> Vec<u64> {
    let mut boundaries = vec![0_u64];
    let mut cursor = 0_u64;
    for character in specs.iter().flat_map(|spec| spec.text.chars()) {
        cursor += if character.len_utf16() == 1 { 1 } else { 2 };
        boundaries.push(cursor);
    }
    boundaries
}

fn selected_range(specs: &[RunSpec], first: usize, second: usize) -> (u64, u64) {
    let boundaries = scalar_boundaries(specs);
    let first = boundaries[first % boundaries.len()];
    let second = boundaries[second % boundaries.len()];
    if first <= second { (first, second) } else { (second, first) }
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn transaction_round_trip_preserves_guarded_splice_state_policies_and_metadata(
        base_runs in canonical_runs(1, 5),
        replacement_runs in canonical_runs(0, 5),
        first_boundary in any::<usize>(),
        second_boundary in any::<usize>(),
        base_affinity in affinity_strategy(),
        relocation in relocation_strategy(),
        updates in state_update_strategy(),
        metadata_spec in metadata_strategy(),
    ) {
        let context = EditorContext::default();
        let base = base_state(
            &context,
            &base_runs,
            "transaction-json-single-property",
            base_affinity,
        )?;
        let (start, end) = selected_range(&base_runs, first_boundary, second_boundary);
        let operation = capture_splice(
            &context,
            base.document(),
            start,
            end,
            fragment(&replacement_runs)?,
        )?;
        let transaction = configure_transaction(
            Transaction::new(&base, vec![operation]),
            relocation,
            updates,
            metadata_spec,
        )?;
        assert_codec_and_replay_laws(&context, &base, &transaction)?;
    }

    #[test]
    fn ordered_multi_operation_round_trip_preserves_sequential_guards_and_replay(
        base_runs in canonical_runs(1, 5),
        first_replacement_runs in canonical_runs(1, 4),
        second_replacement_runs in canonical_runs(1, 4),
        base_affinity in affinity_strategy(),
        relocation in relocation_strategy(),
        updates in state_update_strategy(),
        metadata_spec in metadata_strategy(),
    ) {
        let context = EditorContext::default();
        let base = base_state(
            &context,
            &base_runs,
            "transaction-json-sequential-property",
            base_affinity,
        )?;
        let base_end = fragment(&base_runs)?.utf16_len().get();
        let first_replacement = fragment(&first_replacement_runs)?;
        let first_length = first_replacement.utf16_len().get();
        let first = capture_splice(
            &context,
            base.document(),
            base_end,
            base_end,
            first_replacement,
        )?;

        let first_outcome = Transaction::new(&base, vec![first.clone()])
            .apply(&context, &base)
            .map_err(test_failure)?;
        let intermediate = first_outcome
            .into_commit()
            .ok_or_else(|| TestCaseError::fail("nonempty first insertion was unchanged"))?
            .into_after();
        let second_start = base_end
            .checked_add(first_length)
            .ok_or_else(|| TestCaseError::fail("sequential insertion offset overflowed"))?;
        let second = capture_splice(
            &context,
            intermediate.document(),
            second_start,
            second_start,
            fragment(&second_replacement_runs)?,
        )?;

        if Transaction::new(&base, vec![second.clone()]).apply(&context, &base).is_ok() {
            return Err(TestCaseError::fail(
                "second guarded operation unexpectedly applied without its predecessor",
            ));
        }

        let transaction = configure_transaction(
            Transaction::new(&base, vec![first, second]),
            relocation,
            updates,
            metadata_spec,
        )?;
        assert_codec_and_replay_laws(&context, &base, &transaction)?;
    }
}
