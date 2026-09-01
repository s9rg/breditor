//! Property, determinism, and replay laws for proved Commit V1 JSON.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{CommitJsonCodec, DocumentJsonCodec, EditorStateJsonCodec},
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionMetadata, TransactionOutcome,
    },
};
use proptest::{
    collection::vec,
    prelude::{Just, Strategy, any, prop_oneof},
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use serde_json::Value;
use support::{document_json, paragraph, text_node};

#[derive(Clone, Debug)]
struct RunSpec {
    text: String,
    strong: bool,
}

#[derive(Clone, Copy, Debug)]
enum PendingSpec {
    None,
    Empty,
    Strong,
}

#[derive(Clone, Copy, Debug)]
enum StateValueSpec {
    Unselected,
    Collapsed {
        at_end: bool,
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
        pending: PendingSpec,
    },
    Forward {
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
    },
    Backward {
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
    },
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
        "tests/commit_json_properties.proptest-regressions",
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

fn insertion_runs() -> impl Strategy<Value = Vec<RunSpec>> {
    vec((unicode_text(), any::<bool>()), 1..5)
        .prop_map(|runs| runs.into_iter().map(|(text, strong)| RunSpec { text, strong }).collect())
}

fn affinity_strategy() -> impl Strategy<Value = Affinity> {
    any::<bool>().prop_map(|after| if after { Affinity::After } else { Affinity::Before })
}

fn pending_strategy() -> impl Strategy<Value = PendingSpec> {
    select(vec![PendingSpec::None, PendingSpec::Empty, PendingSpec::Strong])
}

fn state_value_strategy() -> impl Strategy<Value = StateValueSpec> {
    prop_oneof![
        Just(StateValueSpec::Unselected),
        (any::<bool>(), affinity_strategy(), affinity_strategy(), pending_strategy()).prop_map(
            |(at_end, anchor_affinity, focus_affinity, pending)| StateValueSpec::Collapsed {
                at_end,
                anchor_affinity,
                focus_affinity,
                pending,
            },
        ),
        (affinity_strategy(), affinity_strategy()).prop_map(|(anchor_affinity, focus_affinity)| {
            StateValueSpec::Forward { anchor_affinity, focus_affinity }
        },),
        (affinity_strategy(), affinity_strategy()).prop_map(|(anchor_affinity, focus_affinity)| {
            StateValueSpec::Backward { anchor_affinity, focus_affinity }
        },),
    ]
}

fn revision_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(0),
        Just(1),
        Just(9_007_199_254_740_991),
        Just(9_007_199_254_740_993),
        Just(u64::MAX - 1),
        any::<u64>().prop_map(|revision| revision.min(u64::MAX - 1)),
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

fn text_range(offset: u64) -> Result<TextRange, TestCaseError> {
    TextRange::try_new(
        paragraph_path()?,
        TextOffset::try_new(offset).map_err(test_failure)?,
        TextOffset::try_new(offset).map_err(test_failure)?,
    )
    .map_err(test_failure)
}

fn child_count(document: &Document) -> Result<u32, TestCaseError> {
    let root = document
        .root()
        .as_element()
        .ok_or_else(|| TestCaseError::fail("validated document root was not an element"))?;
    let paragraph = root
        .children()
        .get(0)
        .and_then(|node| node.as_element())
        .ok_or_else(|| TestCaseError::fail("test document did not contain its paragraph"))?;
    u32::try_from(paragraph.children().len()).map_err(test_failure)
}

fn child_point(paragraph_path: &NodePath, child_index: u32, affinity: Affinity) -> Point {
    Point::Children { parent_path: paragraph_path.clone(), child_index, affinity }
}

fn state_values(
    spec: StateValueSpec,
    document: &Document,
) -> Result<(Option<Selection>, Option<FormatSet>), TestCaseError> {
    let paragraph_path = paragraph_path()?;
    let child_count = child_count(document)?;
    match spec {
        StateValueSpec::Unselected => Ok((None, None)),
        StateValueSpec::Collapsed { at_end, anchor_affinity, focus_affinity, pending } => {
            let child_index = if at_end { child_count } else { 0 };
            let anchor = child_point(&paragraph_path, child_index, anchor_affinity);
            // Opposite affinities can describe distinct spatial sides of the
            // same structural boundary. Pending typing formats require a
            // spatially collapsed range, so make those generated endpoints
            // exactly equal while retaining mixed-affinity coverage whenever
            // no pending override is present.
            let focus_affinity = match pending {
                PendingSpec::None => focus_affinity,
                PendingSpec::Empty | PendingSpec::Strong => anchor_affinity,
            };
            let focus = child_point(&paragraph_path, child_index, focus_affinity);
            let pending = match pending {
                PendingSpec::None => None,
                PendingSpec::Empty => Some(FormatSet::default()),
                PendingSpec::Strong => Some(formats(true)?),
            };
            Ok((Some(RangeSelection::new(anchor, focus).into()), pending))
        }
        StateValueSpec::Forward { anchor_affinity, focus_affinity } => {
            let anchor = child_point(&paragraph_path, 0, anchor_affinity);
            let focus = child_point(&paragraph_path, child_count, focus_affinity);
            Ok((Some(RangeSelection::new(anchor, focus).into()), None))
        }
        StateValueSpec::Backward { anchor_affinity, focus_affinity } => {
            let anchor = child_point(&paragraph_path, child_count, anchor_affinity);
            let focus = child_point(&paragraph_path, 0, focus_affinity);
            Ok((Some(RangeSelection::new(anchor, focus).into()), None))
        }
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

fn state_at_revision(
    context: &EditorContext,
    state: &EditorState,
    revision: u64,
) -> Result<EditorState, TestCaseError> {
    let codec = EditorStateJsonCodec::new(context.clone());
    let encoded = codec.encode(state).map_err(test_failure)?;
    let mut fixture: Value = serde_json::from_str(&encoded).map_err(test_failure)?;
    let revision_field = fixture
        .pointer_mut("/snapshot/revision")
        .ok_or_else(|| TestCaseError::fail("encoded state has no snapshot revision"))?;
    *revision_field = Value::String(revision.to_string());
    let fixture = serde_json::to_string(&fixture).map_err(test_failure)?;
    codec.decode(&fixture).map_err(test_failure)
}

fn base_state(
    context: &EditorContext,
    runs: &[RunSpec],
    values: StateValueSpec,
    lineage: &str,
    revision: u64,
) -> Result<EditorState, TestCaseError> {
    let children = runs.iter().map(|run| text_node(&run.text, run.strong)).collect::<Vec<_>>();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))
        .map_err(test_failure)?;
    let (selection, pending_formats) = state_values(values, &document)?;
    let initial = EditorState::try_new(
        context,
        LineageId::try_new(lineage).map_err(test_failure)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(test_failure)?;
    state_at_revision(context, &initial, revision)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, TestCaseError> {
    outcome.into_commit().ok_or_else(|| TestCaseError::fail("transaction was unchanged"))
}

fn capture_append(
    context: &EditorContext,
    document: &Document,
    offset: u64,
    replacement: TextFragment,
) -> Result<Operation, TestCaseError> {
    TextSplice::capture(context, document, text_range(offset)?, replacement)
        .map(Operation::from)
        .map_err(test_failure)
}

fn append_operations(
    context: &EditorContext,
    base: &EditorState,
    base_runs: &[RunSpec],
    insertions: &[RunSpec],
) -> Result<(Vec<Operation>, Document), TestCaseError> {
    let mut operations = Vec::with_capacity(insertions.len());
    let mut offset = fragment(base_runs)?.utf16_len().get();
    let mut final_document = base.document().clone();

    for insertion in insertions {
        let replacement = fragment(std::slice::from_ref(insertion))?;
        let replacement_length = replacement.utf16_len().get();
        operations.push(capture_append(context, &final_document, offset, replacement)?);

        // Replaying the complete prefix against the unchanged base proves that
        // every next optimistic guard was captured from its true predecessor.
        // One atomic prefix commit also remains valid when the base revision is
        // `u64::MAX - 1`, unlike publishing each intermediate operation.
        let prefix = committed(
            Transaction::new(base, operations.clone())
                .apply(context, base)
                .map_err(test_failure)?,
        )?;
        final_document = prefix.after().document().clone();
        offset = offset
            .checked_add(replacement_length)
            .ok_or_else(|| TestCaseError::fail("generated UTF-16 offset overflowed"))?;
    }
    Ok((operations, final_document))
}

fn operation_commit(
    context: &EditorContext,
    base: &EditorState,
    base_runs: &[RunSpec],
    insertions: &[RunSpec],
    result_values: StateValueSpec,
    metadata_spec: MetadataSpec,
) -> Result<Commit, TestCaseError> {
    let (operations, final_document) = append_operations(context, base, base_runs, insertions)?;
    let (selection, pending_formats) = state_values(result_values, &final_document)?;
    let transaction = Transaction::new(base, operations)
        .with_selection_update(SelectionUpdate::Set(selection))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats))
        .with_metadata(metadata(metadata_spec)?);
    committed(transaction.apply(context, base).map_err(test_failure)?)
}

fn state_only_commit(
    context: &EditorContext,
    base: &EditorState,
    result_values: StateValueSpec,
    metadata_spec: MetadataSpec,
) -> Result<Commit, TestCaseError> {
    let (mut selection, mut pending_formats) = state_values(result_values, base.document())?;
    if selection.as_ref() == base.selection() && pending_formats.as_ref() == base.pending_formats()
    {
        if selection.is_none() && pending_formats.is_none() {
            let path = paragraph_path()?;
            let point = child_point(&path, 0, Affinity::Before);
            selection = Some(RangeSelection::new(point.clone(), point).into());
        } else {
            selection = None;
            pending_formats = None;
        }
    }

    let transaction = Transaction::new(base, Vec::new())
        .with_selection_update(SelectionUpdate::Set(selection))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats))
        .with_metadata(metadata(metadata_spec)?);
    committed(transaction.apply(context, base).map_err(test_failure)?)
}

fn assert_restored_values(
    actual: &EditorState,
    expected: &EditorState,
) -> Result<(), TestCaseError> {
    if actual.context() != expected.context()
        || actual.snapshot().lineage() != expected.snapshot().lineage()
        || actual.document() != expected.document()
        || actual.selection() != expected.selection()
        || actual.pending_formats() != expected.pending_formats()
    {
        return Err(TestCaseError::fail(
            "history replay did not restore the expected document and editor values",
        ));
    }
    Ok(())
}

fn assert_commit_codec_and_replay_laws(
    context: &EditorContext,
    commit: &Commit,
) -> Result<(), TestCaseError> {
    let codec = CommitJsonCodec::new(context.clone());
    let encoded = codec.encode(commit).map_err(test_failure)?;
    let repeated = codec.encode(commit).map_err(test_failure)?;
    if repeated != encoded {
        return Err(TestCaseError::fail("repeated encoding of one commit was not byte-identical"));
    }

    let decoded = codec.decode(&encoded).map_err(test_failure)?;
    if &decoded != commit {
        return Err(TestCaseError::fail(
            "decode(encode(commit)) did not preserve the proved commit",
        ));
    }
    let reencoded = codec.encode(&decoded).map_err(test_failure)?;
    if reencoded != encoded {
        return Err(TestCaseError::fail(
            "decoded commit changed deterministic wire bytes on re-encode",
        ));
    }

    let original_redo = commit.redo_transaction(commit.before()).map_err(test_failure)?;
    let decoded_redo = decoded.redo_transaction(decoded.before()).map_err(test_failure)?;
    let original_redo = original_redo.apply(context, commit.before()).map_err(test_failure)?;
    let decoded_redo = decoded_redo.apply(context, decoded.before()).map_err(test_failure)?;
    if original_redo != decoded_redo {
        return Err(TestCaseError::fail(
            "forward replay behavior changed across the commit codec round trip",
        ));
    }
    let replayed = original_redo
        .commit()
        .ok_or_else(|| TestCaseError::fail("commit redo replay was unexpectedly unchanged"))?;
    if replayed.after() != commit.after() {
        return Err(TestCaseError::fail(
            "forward replay did not reconstruct the commit result state",
        ));
    }

    let original_undo = commit.undo_transaction(commit.after()).map_err(test_failure)?;
    let decoded_undo = decoded.undo_transaction(decoded.after()).map_err(test_failure)?;
    let original_undo = original_undo.apply(context, commit.after());
    let decoded_undo = decoded_undo.apply(context, decoded.after());
    if original_undo != decoded_undo {
        return Err(TestCaseError::fail(
            "inverse replay behavior changed across the commit codec round trip",
        ));
    }
    if let Ok(outcome) = original_undo {
        let replayed = outcome
            .commit()
            .ok_or_else(|| TestCaseError::fail("commit undo replay was unexpectedly unchanged"))?;
        assert_restored_values(replayed.after(), commit.before())?;
    }
    Ok(())
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn commit_codec_preserves_sequential_guards_unicode_state_values_metadata_and_replay(
        base_runs in canonical_runs(0, 5),
        insertions in insertion_runs(),
        base_values in state_value_strategy(),
        result_values in state_value_strategy(),
        revision in revision_strategy(),
        metadata_spec in metadata_strategy(),
        lineage_suffix in 0_u16..1_000,
    ) {
        let context = EditorContext::default();
        let lineage = format!("commit-operation-property-{lineage_suffix}");
        let base = base_state(
            &context,
            &base_runs,
            base_values,
            &lineage,
            revision,
        )?;
        let commit = operation_commit(
            &context,
            &base,
            &base_runs,
            &insertions,
            result_values,
            metadata_spec,
        )?;

        if commit.base_revision() != Revision::new(revision)
            || commit.revision() != Revision::new(revision + 1)
        {
            return Err(TestCaseError::fail(
                "generated operation commit did not preserve the full-u64 revision boundary",
            ));
        }
        assert_commit_codec_and_replay_laws(&context, &commit)?;
    }

    #[test]
    fn state_only_commit_codec_preserves_selection_pending_format_and_revision_boundaries(
        base_runs in canonical_runs(0, 5),
        base_values in state_value_strategy(),
        result_values in state_value_strategy(),
        revision in revision_strategy(),
        metadata_spec in metadata_strategy(),
        lineage_suffix in 0_u16..1_000,
    ) {
        let context = EditorContext::default();
        let lineage = format!("commit-state-only-property-{lineage_suffix}");
        let base = base_state(
            &context,
            &base_runs,
            base_values,
            &lineage,
            revision,
        )?;
        let commit = state_only_commit(&context, &base, result_values, metadata_spec)?;

        if !commit.forward_operations().is_empty() || !commit.inverse_operations().is_empty() {
            return Err(TestCaseError::fail(
                "state-only transaction published content operations",
            ));
        }
        if commit.before().document() != commit.after().document() {
            return Err(TestCaseError::fail(
                "state-only transaction changed the document",
            ));
        }
        if commit.base_revision() != Revision::new(revision)
            || commit.revision() != Revision::new(revision + 1)
        {
            return Err(TestCaseError::fail(
                "generated state-only commit did not preserve the full-u64 revision boundary",
            ));
        }
        assert_commit_codec_and_replay_laws(&context, &commit)?;
    }
}
