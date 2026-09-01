//! Property laws for deterministic paragraph split and join operations.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, NodeRef, PropertyMap, PropertyValue},
    operation::{ParagraphJoin, ParagraphSplit},
    position::{NodePath, TextOffset},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use proptest::{
    collection::vec,
    prelude::{Strategy, any},
    proptest,
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use support::{document_json, paragraph, text_node};

#[derive(Clone, Debug)]
struct RunSpec {
    text: String,
    strong: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct SummaryOracle {
    node_count: u64,
    max_node_depth: u32,
    total_text_bytes: u64,
    property_value_count: u64,
}

impl SummaryOracle {
    fn scan(document: &Document) -> Result<Self, TestCaseError> {
        let mut summary = Self::default();
        summary.visit(document.root(), 0)?;
        Ok(summary)
    }

    fn visit(&mut self, node: &NodeRef, depth: u32) -> Result<(), TestCaseError> {
        self.node_count = self
            .node_count
            .checked_add(1)
            .ok_or_else(|| TestCaseError::fail("oracle node count overflowed"))?;
        self.max_node_depth = self.max_node_depth.max(depth);

        if let Some(element) = node.as_element() {
            self.property_value_count = self
                .property_value_count
                .checked_add(property_value_count(element.properties())?)
                .ok_or_else(|| TestCaseError::fail("oracle property count overflowed"))?;
            let child_depth = depth
                .checked_add(1)
                .ok_or_else(|| TestCaseError::fail("oracle node depth overflowed"))?;
            for child in element.children() {
                self.visit(child, child_depth)?;
            }
            return Ok(());
        }

        let Some(text) = node.as_text() else {
            return Err(TestCaseError::fail("a node had no public structural variant"));
        };
        self.total_text_bytes = self
            .total_text_bytes
            .checked_add(u64::try_from(text.text().len()).map_err(test_failure)?)
            .ok_or_else(|| TestCaseError::fail("oracle text byte count overflowed"))?;
        for format in text.formats() {
            self.property_value_count = self
                .property_value_count
                .checked_add(property_value_count(format.properties())?)
                .ok_or_else(|| TestCaseError::fail("oracle property count overflowed"))?;
        }
        Ok(())
    }
}

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/paragraph_structure_properties.proptest-regressions",
    ));
    config.cases = 72;
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
            '\u{e9}',
            '\u{754c}',
            '\u{301}',
            '\u{1f600}',
            '\u{1f680}',
            '\u{1f1e8}',
            '\u{1f1e6}',
            '\u{200d}',
            '\u{915}',
        ]),
        1..5,
    )
    .prop_map(|characters| characters.into_iter().collect())
}

fn canonical_runs(maximum_exclusive: usize) -> impl Strategy<Value = Vec<RunSpec>> {
    (any::<bool>(), vec(unicode_text(), 0..maximum_exclusive)).prop_map(|(first_strong, texts)| {
        texts
            .into_iter()
            .enumerate()
            .map(|(index, text)| RunSpec {
                text,
                strong: if index % 2 == 0 { first_strong } else { !first_strong },
            })
            .collect()
    })
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn property_value_count(properties: &PropertyMap) -> Result<u64, TestCaseError> {
    let mut count = 0_u64;
    for (_, value) in properties {
        count = count
            .checked_add(nested_property_value_count(value)?)
            .ok_or_else(|| TestCaseError::fail("oracle property count overflowed"))?;
    }
    Ok(count)
}

fn nested_property_value_count(value: &PropertyValue) -> Result<u64, TestCaseError> {
    let mut count = 1_u64;
    if let Some(values) = value.as_array() {
        for child in values {
            count = count
                .checked_add(nested_property_value_count(child)?)
                .ok_or_else(|| TestCaseError::fail("oracle property count overflowed"))?;
        }
    }
    if let Some(values) = value.as_object() {
        for (_, child) in values {
            count = count
                .checked_add(nested_property_value_count(child)?)
                .ok_or_else(|| TestCaseError::fail("oracle property count overflowed"))?;
        }
    }
    Ok(count)
}

fn state_for_paragraphs(
    context: &EditorContext,
    paragraphs: &[&[RunSpec]],
    lineage: &str,
) -> Result<EditorState, TestCaseError> {
    let paragraphs = paragraphs
        .iter()
        .map(|runs| {
            let children =
                runs.iter().map(|run| text_node(&run.text, run.strong)).collect::<Vec<_>>();
            paragraph(&children)
        })
        .collect::<Vec<_>>();
    let encoded = document_json(&paragraphs);
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&encoded)
        .map_err(test_failure)?;
    let lineage = LineageId::try_new(lineage).map_err(test_failure)?;
    EditorState::try_new(context, lineage, document, None, None).map_err(test_failure)
}

fn scalar_boundaries(runs: &[RunSpec]) -> Vec<u64> {
    let mut boundaries = vec![0_u64];
    let mut offset = 0_u64;
    for character in runs.iter().flat_map(|run| run.text.chars()) {
        offset += if character.len_utf16() == 1 { 1 } else { 2 };
        boundaries.push(offset);
    }
    boundaries
}

fn split_offset(runs: &[RunSpec], choice: usize) -> Result<TextOffset, TestCaseError> {
    let boundaries = scalar_boundaries(runs);
    TextOffset::try_new(boundaries[choice % boundaries.len()]).map_err(test_failure)
}

fn paragraph_path(index: u32) -> Result<NodePath, TestCaseError> {
    NodePath::try_from_indices(vec![index]).map_err(test_failure)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, TestCaseError> {
    outcome
        .into_commit()
        .ok_or_else(|| TestCaseError::fail("a structural operation unexpectedly made no change"))
}

fn assert_summary_matches_public_tree(document: &Document) -> Result<(), TestCaseError> {
    let expected = SummaryOracle::scan(document)?;
    let summary = document.summary();
    let actual = SummaryOracle {
        node_count: summary.node_count(),
        max_node_depth: summary.max_node_depth(),
        total_text_bytes: summary.total_text_bytes(),
        property_value_count: summary.property_value_count(),
    };
    if actual != expected {
        return Err(TestCaseError::fail(format!(
            "cached summary {actual:?} differs from public-tree oracle {expected:?}"
        )));
    }
    Ok(())
}

fn assert_fresh_validation_parity(
    context: &EditorContext,
    document: &Document,
) -> Result<(), TestCaseError> {
    let codec =
        DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
    let encoded = codec.encode(document).map_err(test_failure)?;
    let revalidated = codec.decode(&encoded).map_err(test_failure)?;
    if revalidated != *document {
        return Err(TestCaseError::fail("fresh full validation changed the document"));
    }
    if revalidated.summary() != document.summary() {
        return Err(TestCaseError::fail(format!(
            "operation summary {:?} differs from fresh-validation summary {:?}",
            document.summary(),
            revalidated.summary()
        )));
    }
    assert_summary_matches_public_tree(&revalidated)
}

fn assert_deterministic(first: &Commit, repeated: &Commit) -> Result<(), TestCaseError> {
    if first.after().document() != repeated.after().document()
        || first.after().document().summary() != repeated.after().document().summary()
        || first.forward_operations() != repeated.forward_operations()
        || first.inverse_operations() != repeated.inverse_operations()
        || first.changes() != repeated.changes()
        || first.relocation() != repeated.relocation()
    {
        return Err(TestCaseError::fail(
            "repeated structural application produced a different commit contract",
        ));
    }
    Ok(())
}

fn assert_inverse_restores(
    context: &EditorContext,
    initial: &EditorState,
    commit: &Commit,
) -> Result<(), TestCaseError> {
    let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec());
    let restored = committed(inverse.apply(context, commit.after()).map_err(test_failure)?)?;
    assert_summary_matches_public_tree(restored.after().document())?;
    assert_fresh_validation_parity(context, restored.after().document())?;
    if restored.after().document() != initial.document()
        || restored.after().document().summary() != initial.document().summary()
    {
        return Err(TestCaseError::fail(
            "structural inverse did not restore the exact source document and summary",
        ));
    }
    Ok(())
}

fn exercise_split(source: &[RunSpec], offset_choice: usize) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = state_for_paragraphs(&context, &[source], "paragraph-split-properties")?;
    assert_summary_matches_public_tree(initial.document())?;
    let operation = ParagraphSplit::capture(
        &context,
        initial.document(),
        paragraph_path(0)?,
        split_offset(source, offset_choice)?,
    )
    .map_err(test_failure)?;
    let transaction = Transaction::new(&initial, vec![operation.into()]);
    let first = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
    let repeated = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
    assert_deterministic(&first, &repeated)?;
    assert_summary_matches_public_tree(first.after().document())?;
    assert_fresh_validation_parity(&context, first.after().document())?;
    assert_inverse_restores(&context, &initial, &first)
}

fn exercise_join(left: &[RunSpec], right: &[RunSpec]) -> Result<(), TestCaseError> {
    let context = EditorContext::default();
    let initial = state_for_paragraphs(&context, &[left, right], "paragraph-join-properties")?;
    assert_summary_matches_public_tree(initial.document())?;
    let operation = ParagraphJoin::capture(&context, initial.document(), paragraph_path(0)?)
        .map_err(test_failure)?;
    let transaction = Transaction::new(&initial, vec![operation.into()]);
    let first = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
    let repeated = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
    assert_deterministic(&first, &repeated)?;
    assert_summary_matches_public_tree(first.after().document())?;
    assert_fresh_validation_parity(&context, first.after().document())?;
    assert_inverse_restores(&context, &initial, &first)
}

#[test]
fn empty_and_non_bmp_structural_edges_obey_the_same_laws() -> Result<(), TestCaseError> {
    let unicode = vec![
        RunSpec { text: "a\u{1f600}".to_owned(), strong: false },
        RunSpec { text: "\u{301}\u{1f680}".to_owned(), strong: true },
    ];
    exercise_split(&[], 0)?;
    exercise_split(&unicode, 2)?;
    exercise_join(&[], &unicode)?;
    exercise_join(&unicode, &[])
}

proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn paragraph_split_and_join_obey_determinism_inverse_and_summary_laws(
        split_source in canonical_runs(5),
        split_choice in 0_usize..128,
        join_left in canonical_runs(4),
        join_right in canonical_runs(4),
    ) {
        exercise_split(&split_source, split_choice)?;
        exercise_join(&join_left, &join_right)?;
    }
}
