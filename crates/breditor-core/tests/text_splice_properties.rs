//! Property laws for deterministic, canonical formatted-text transactions.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{
        Document, Format, FormatSet, NodeRef, PropertyMap, PropertyValue, TextFragment, TextRun,
    },
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
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

const DISTINCT_REPLACEMENT_MARKER: &str = "\u{e000}";

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
        let text_bytes = u64::try_from(text.text().len()).map_err(test_failure)?;
        self.total_text_bytes = self
            .total_text_bytes
            .checked_add(text_bytes)
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
        "tests/text_splice_properties.proptest-regressions",
    ));
    config.cases = 96;
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

fn alternating_runs(count: std::ops::Range<usize>) -> impl Strategy<Value = Vec<RunSpec>> {
    (any::<bool>(), vec(unicode_text(), count)).prop_map(|(first_strong, texts)| {
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

fn assert_summary_matches_public_tree(document: &Document) -> Result<(), TestCaseError> {
    let expected = SummaryOracle::scan(document)?;
    let actual = document.summary();
    let actual = SummaryOracle {
        node_count: actual.node_count(),
        max_node_depth: actual.max_node_depth(),
        total_text_bytes: actual.total_text_bytes(),
        property_value_count: actual.property_value_count(),
    };
    if actual != expected {
        return Err(TestCaseError::fail(format!(
            "cached summary {actual:?} differs from public-tree oracle {expected:?}"
        )));
    }
    Ok(())
}

fn freshly_revalidated(
    context: &EditorContext,
    document: &Document,
) -> Result<Document, TestCaseError> {
    let codec =
        DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
    let encoded = codec.encode(document).map_err(test_failure)?;
    codec.decode(&encoded).map_err(test_failure)
}

fn assert_summary_survives_full_validation(
    context: &EditorContext,
    document: &Document,
) -> Result<(), TestCaseError> {
    let revalidated = freshly_revalidated(context, document)?;
    if revalidated != *document {
        return Err(TestCaseError::fail("fresh full validation changed the generated document"));
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
        .map(|spec| {
            TextRun::try_new(spec.text.clone(), formats(spec.strong)?).map_err(test_failure)
        })
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(test_failure)
}

fn initial_state(context: &EditorContext, specs: &[RunSpec]) -> Result<EditorState, TestCaseError> {
    let children = specs.iter().map(|spec| text_node(&spec.text, spec.strong)).collect::<Vec<_>>();
    let encoded = document_json(&[paragraph(&children)]);
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&encoded)
        .map_err(test_failure)?;
    let lineage = LineageId::try_new("text-splice-properties").map_err(test_failure)?;
    EditorState::try_new(context, lineage, document, None, None).map_err(test_failure)
}

fn scalar_boundaries(specs: &[RunSpec]) -> Vec<u64> {
    let mut boundaries = vec![0_u64];
    let mut offset = 0_u64;
    for character in specs.iter().flat_map(|spec| spec.text.chars()) {
        offset += if character.len_utf16() == 1 { 1 } else { 2 };
        boundaries.push(offset);
    }
    boundaries
}

fn range_from_choices(
    specs: &[RunSpec],
    left_choice: usize,
    right_choice: usize,
) -> Result<TextRange, TestCaseError> {
    let boundaries = scalar_boundaries(specs);
    let left = boundaries[left_choice % boundaries.len()];
    let right = boundaries[right_choice % boundaries.len()];
    let (start, end) = if left <= right { (left, right) } else { (right, left) };
    let path = NodePath::try_from_indices(vec![0]).map_err(test_failure)?;
    let start = TextOffset::try_new(start).map_err(test_failure)?;
    let end = TextOffset::try_new(end).map_err(test_failure)?;
    TextRange::try_new(path, start, end).map_err(test_failure)
}

fn distinct_splice(
    context: &EditorContext,
    state: &EditorState,
    range: TextRange,
    replacement: TextFragment,
) -> Result<TextSplice, TestCaseError> {
    let candidate = TextSplice::capture(context, state.document(), range.clone(), replacement)
        .map_err(test_failure)?;
    if candidate.expected_removed() != candidate.replacement() {
        return Ok(candidate);
    }

    let marker = TextFragment::from(
        TextRun::try_new(DISTINCT_REPLACEMENT_MARKER, FormatSet::default())
            .map_err(test_failure)?,
    );
    TextSplice::capture(context, state.document(), range, marker).map_err(test_failure)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, TestCaseError> {
    outcome
        .into_commit()
        .ok_or_else(|| TestCaseError::fail("a deliberately changing splice was unchanged"))
}

fn assert_canonical_paragraph(document: &Document) -> Result<(), TestCaseError> {
    let paragraph_path = NodePath::try_from_indices(vec![0]).map_err(test_failure)?;
    let paragraph = document.node_at(&paragraph_path).map_err(test_failure)?;
    let Some(paragraph) = paragraph.as_element() else {
        return Err(TestCaseError::fail("the paragraph path resolved to text"));
    };
    let runs = paragraph
        .children()
        .iter()
        .map(|child| {
            let Some(text) = child.as_text() else {
                return Err(TestCaseError::fail("a paragraph child was not text"));
            };
            TextRun::try_new(text.text(), text.formats().clone()).map_err(test_failure)
        })
        .collect::<Result<Vec<_>, _>>()?;
    TextFragment::try_from_runs(runs).map_err(test_failure)?;
    Ok(())
}

proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn formatted_text_splice_obeys_apply_canonical_inverse_and_determinism_laws(
        source in alternating_runs(1..5),
        replacement in alternating_runs(0..5),
        left_choice in 0_usize..128,
        right_choice in 0_usize..128,
    ) {
        let context = EditorContext::default();
        let initial = initial_state(&context, &source)?;
        assert_summary_matches_public_tree(initial.document())?;
        let range = range_from_choices(&source, left_choice, right_choice)?;
        let replacement = fragment(&replacement)?;
        let splice = distinct_splice(&context, &initial, range, replacement)?;
        let transaction = Transaction::new(&initial, vec![splice.into()]);

        let first = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;
        let repeated = committed(transaction.apply(&context, &initial).map_err(test_failure)?)?;

        assert_canonical_paragraph(first.after().document())?;
        assert_summary_matches_public_tree(first.after().document())?;
        assert_summary_survives_full_validation(&context, first.after().document())?;
        assert_summary_matches_public_tree(repeated.after().document())?;
        assert_summary_survives_full_validation(&context, repeated.after().document())?;
        prop_assert!(first.after().document() == repeated.after().document());
        prop_assert!(first.after().document().summary() == repeated.after().document().summary());
        prop_assert!(first.forward_operations() == repeated.forward_operations());
        prop_assert!(first.inverse_operations() == repeated.inverse_operations());
        prop_assert!(first.changes() == repeated.changes());
        prop_assert!(first.relocation() == repeated.relocation());

        let inverse = Transaction::new(first.after(), first.inverse_operations().to_vec());
        let restored = committed(
            inverse.apply(&context, first.after()).map_err(test_failure)?,
        )?;
        assert_summary_matches_public_tree(restored.after().document())?;
        assert_summary_survives_full_validation(&context, restored.after().document())?;
        prop_assert!(restored.after().document() == initial.document());
        prop_assert!(restored.after().document().summary() == initial.document().summary());
    }
}
