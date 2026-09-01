//! Property laws for atomic text replacement across direct-root paragraphs.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{
        Document, Format, FormatSet, NodeRef, PropertyMap, PropertyValue, TextFragment, TextRun,
    },
    identity::QualifiedName,
    operation::{RootTextBoundary, RootTextRange, RootTextReplace},
    position::{NodePath, TextOffset},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use proptest::{
    collection::vec,
    prelude::{Strategy, any},
    prop_assert, proptest,
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use support::{document_json, paragraph, text_node};

const DISTINCT_REPLACEMENT_MARKER: char = '\u{e000}';

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
        "tests/root_text_replace_properties.proptest-regressions",
    ));
    config.cases = 64;
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

fn formats(strong: bool) -> Result<FormatSet, TestCaseError> {
    if !strong {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong").map_err(test_failure)?,
        PropertyMap::default(),
    )])
    .map_err(test_failure)
}

fn fragment(specs: &[RunSpec]) -> Result<TextFragment, TestCaseError> {
    TextFragment::try_from_runs(
        specs
            .iter()
            .map(|spec| {
                TextRun::try_new(spec.text.clone(), formats(spec.strong)?).map_err(test_failure)
            })
            .collect::<Result<Vec<_>, _>>()?,
    )
    .map_err(test_failure)
}

fn distinct_replacement(mut paragraphs: Vec<Vec<RunSpec>>) -> Vec<Vec<RunSpec>> {
    let first = &mut paragraphs[0];
    if let Some(run) = first.first_mut() {
        run.text.push(DISTINCT_REPLACEMENT_MARKER);
    } else {
        first.push(RunSpec { text: DISTINCT_REPLACEMENT_MARKER.to_string(), strong: false });
    }
    paragraphs
}

fn initial_state(
    context: &EditorContext,
    paragraphs: &[Vec<RunSpec>],
) -> Result<EditorState, TestCaseError> {
    let paragraphs = paragraphs
        .iter()
        .map(|runs| {
            let children =
                runs.iter().map(|run| text_node(&run.text, run.strong)).collect::<Vec<_>>();
            paragraph(&children)
        })
        .collect::<Vec<_>>();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&paragraphs))
        .map_err(test_failure)?;
    let lineage = LineageId::try_new("root-text-replace-properties").map_err(test_failure)?;
    EditorState::try_new(context, lineage, document, None, None).map_err(test_failure)
}

fn scalar_boundaries(specs: &[RunSpec]) -> Vec<u64> {
    let mut boundaries = vec![0_u64];
    let mut cursor = 0_u64;
    for character in specs.iter().flat_map(|run| run.text.chars()) {
        cursor += u64::try_from(character.len_utf16()).unwrap_or(2);
        boundaries.push(cursor);
    }
    boundaries
}

fn endpoint(
    paragraphs: &[Vec<RunSpec>],
    paragraph_choice: usize,
    offset_choice: usize,
) -> (usize, u64) {
    let paragraph_index = paragraph_choice % paragraphs.len();
    let boundaries = scalar_boundaries(&paragraphs[paragraph_index]);
    (paragraph_index, boundaries[offset_choice % boundaries.len()])
}

fn normalized_range(
    paragraphs: &[Vec<RunSpec>],
    first_paragraph_choice: usize,
    first_offset_choice: usize,
    second_paragraph_choice: usize,
    second_offset_choice: usize,
) -> Result<RootTextRange, TestCaseError> {
    let first = endpoint(paragraphs, first_paragraph_choice, first_offset_choice);
    let second = endpoint(paragraphs, second_paragraph_choice, second_offset_choice);
    let (start, end) = if first <= second { (first, second) } else { (second, first) };
    let start_path =
        NodePath::try_from_indices(vec![u32::try_from(start.0).map_err(test_failure)?])
            .map_err(test_failure)?;
    let end_path = NodePath::try_from_indices(vec![u32::try_from(end.0).map_err(test_failure)?])
        .map_err(test_failure)?;
    let start =
        RootTextBoundary::try_new(start_path, TextOffset::try_new(start.1).map_err(test_failure)?)
            .map_err(test_failure)?;
    let end =
        RootTextBoundary::try_new(end_path, TextOffset::try_new(end.1).map_err(test_failure)?)
            .map_err(test_failure)?;
    RootTextRange::try_new(start, end).map_err(test_failure)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, TestCaseError> {
    outcome
        .into_commit()
        .ok_or_else(|| TestCaseError::fail("marker-bearing root replacement was unchanged"))
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
        return Err(TestCaseError::fail("fresh validation changed the root replacement result"));
    }
    if revalidated.summary() != document.summary() {
        return Err(TestCaseError::fail(format!(
            "incremental summary {:?} differs from fresh-validation summary {:?}",
            document.summary(),
            revalidated.summary()
        )));
    }
    assert_summary_matches_public_tree(&revalidated)
}

fn assert_canonical_paragraphs(document: &Document) -> Result<(), TestCaseError> {
    let Some(root) = document.root().as_element() else {
        return Err(TestCaseError::fail("document root was not an element"));
    };
    for paragraph in root.children() {
        let Some(paragraph) = paragraph.as_element() else {
            return Err(TestCaseError::fail("root child was not a paragraph element"));
        };
        let runs = paragraph
            .children()
            .iter()
            .map(|child| {
                let Some(text) = child.as_text() else {
                    return Err(TestCaseError::fail("paragraph child was not text"));
                };
                TextRun::try_new(text.text(), text.formats().clone()).map_err(test_failure)
            })
            .collect::<Result<Vec<_>, _>>()?;
        TextFragment::try_from_runs(runs).map_err(test_failure)?;
    }
    Ok(())
}

proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn root_text_replace_obeys_direction_determinism_inverse_and_summary_laws(
        source in vec(canonical_runs(5), 1..6),
        replacement in vec(canonical_runs(5), 1..5),
        first_paragraph_choice in 0_usize..128,
        first_offset_choice in 0_usize..128,
        second_paragraph_choice in 0_usize..128,
        second_offset_choice in 0_usize..128,
    ) {
        let context = EditorContext::default();
        let initial = initial_state(&context, &source)?;
        assert_summary_matches_public_tree(initial.document())?;

        let forward_range = normalized_range(
            &source,
            first_paragraph_choice,
            first_offset_choice,
            second_paragraph_choice,
            second_offset_choice,
        )?;
        let reversed_input_range = normalized_range(
            &source,
            second_paragraph_choice,
            second_offset_choice,
            first_paragraph_choice,
            first_offset_choice,
        )?;
        prop_assert!(forward_range == reversed_input_range);

        let replacement = distinct_replacement(replacement)
            .iter()
            .map(|paragraph| fragment(paragraph))
            .collect::<Result<Vec<_>, _>>()?;
        let operation = RootTextReplace::capture(
            &context,
            initial.document(),
            forward_range,
            replacement,
        )
        .map_err(test_failure)?;
        let transaction = Transaction::new(&initial, vec![operation.into()]);
        let first = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
        let repeated = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;

        assert_canonical_paragraphs(first.after().document())?;
        assert_summary_matches_public_tree(first.after().document())?;
        assert_fresh_validation_parity(&context, first.after().document())?;
        prop_assert!(first.after().document() == repeated.after().document());
        prop_assert!(first.after().document().summary() == repeated.after().document().summary());
        prop_assert!(first.forward_operations() == repeated.forward_operations());
        prop_assert!(first.inverse_operations() == repeated.inverse_operations());
        prop_assert!(first.changes() == repeated.changes());
        prop_assert!(first.relocation() == repeated.relocation());

        let inverse = Transaction::new(first.after(), first.inverse_operations().to_vec());
        let restored = committed(inverse.apply(&context, first.after()).map_err(test_failure)?)?;
        assert_canonical_paragraphs(restored.after().document())?;
        assert_summary_matches_public_tree(restored.after().document())?;
        assert_fresh_validation_parity(&context, restored.after().document())?;
        prop_assert!(restored.after().document() == initial.document());
        prop_assert!(restored.after().document().summary() == initial.document().summary());
        prop_assert!(restored.inverse_operations() == first.forward_operations());
    }
}
