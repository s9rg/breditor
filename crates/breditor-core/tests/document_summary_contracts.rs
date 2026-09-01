//! Black-box contracts for exact validator-produced document summaries.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{DocumentCodecError, DocumentJsonCodec},
    document::{Document, FormatSet, NodeRef, PropertyMap, PropertyValue, TextFragment, TextRun},
    operation::{TextRange, TextSplice},
    position::TextOffset,
    schema::{CompiledSchema, DocumentLimits, LimitKind, ValidationDetail},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use serde_json::Value;
use support::{
    TestResult, codec, document_json, fixture_document_json, minimal_document_json, paragraph,
    path, test_error, text_node,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct SummaryOracle {
    node_count: u64,
    max_node_depth: u32,
    total_text_bytes: u64,
    property_value_count: u64,
}

impl SummaryOracle {
    fn scan(document: &Document) -> Self {
        let mut summary = Self::default();
        summary.visit(document.root(), 0);
        summary
    }

    fn visit(&mut self, node: &NodeRef, depth: usize) {
        self.node_count += 1;
        self.max_node_depth = self.max_node_depth.max(u32::try_from(depth).unwrap_or(u32::MAX));
        if let Some(element) = node.as_element() {
            self.property_value_count += property_value_count(element.properties());
            for child in element.children() {
                self.visit(child, depth + 1);
            }
        } else if let Some(text) = node.as_text() {
            self.total_text_bytes += u64::try_from(text.text().len()).unwrap_or(u64::MAX);
            self.property_value_count += text
                .formats()
                .iter()
                .map(|format| property_value_count(format.properties()))
                .sum::<u64>();
        }
    }
}

fn property_value_count(properties: &PropertyMap) -> u64 {
    properties.iter().map(|(_, value)| nested_property_value_count(value)).sum()
}

fn nested_property_value_count(value: &PropertyValue) -> u64 {
    let array_children =
        value.as_array().map_or(0, |values| values.iter().map(nested_property_value_count).sum());
    let object_children = value.as_object().map_or(0, |values| {
        values.iter().map(|(_, value)| nested_property_value_count(value)).sum()
    });
    1 + array_children + object_children
}

fn assert_matches_independent_oracle(document: &Document) {
    let actual = document.summary();
    let expected = SummaryOracle::scan(document);
    assert_eq!(actual.node_count(), expected.node_count);
    assert_eq!(actual.max_node_depth(), expected.max_node_depth);
    assert_eq!(actual.total_text_bytes(), expected.total_text_bytes);
    assert_eq!(actual.property_value_count(), expected.property_value_count);
}

fn plain_fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    TextRun::try_new(text, FormatSet::default()).map(TextFragment::from).map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly produced no commit").into())
}

#[test]
fn minimal_summary_counts_root_and_empty_paragraph() -> TestResult {
    let document = codec().decode(&minimal_document_json())?;
    assert_eq!(document.summary().node_count(), 2);
    assert_eq!(document.summary().max_node_depth(), 1);
    assert_eq!(document.summary().total_text_bytes(), 0);
    assert_eq!(document.summary().property_value_count(), 0);
    assert_matches_independent_oracle(&document);
    Ok(())
}

#[test]
fn unicode_summary_survives_clone_and_wire_round_trip_without_entering_json() -> TestResult {
    let codec = codec();
    let document = codec.decode(&fixture_document_json())?;
    assert_eq!(document.summary().node_count(), 5);
    assert_eq!(document.summary().max_node_depth(), 2);
    assert_eq!(document.summary().total_text_bytes(), 7);
    assert_matches_independent_oracle(&document);

    let clone = document.clone();
    assert_eq!(clone.summary(), document.summary());

    let encoded = codec.encode(&clone)?;
    let encoded_value: Value = serde_json::from_str(&encoded)?;
    assert!(encoded_value.get("summary").is_none());
    assert!(encoded_value.get("root").and_then(|root| root.get("summary")).is_none());

    let decoded = codec.decode(&encoded)?;
    assert_eq!(decoded.summary(), document.summary());
    assert_matches_independent_oracle(&decoded);
    Ok(())
}

#[test]
fn seam_merging_splice_and_inverse_keep_summary_exact() -> TestResult {
    let context = EditorContext::default();
    let source_json = document_json(&[
        paragraph(&[text_node("ab", false), text_node("X", true), text_node("cd", false)]),
        paragraph(&[text_node("tail", false)]),
    ]);
    let source_document = DocumentJsonCodec::new(context.schema().clone()).decode(&source_json)?;
    let source = EditorState::try_new(
        &context,
        LineageId::try_new("document-summary-splice")?,
        source_document,
        None,
        None,
    )?;
    assert_eq!(source.document().summary().node_count(), 7);
    assert_eq!(source.document().summary().total_text_bytes(), 9);
    assert_matches_independent_oracle(source.document());

    let range = TextRange::try_new(path(&[0])?, TextOffset::try_new(2)?, TextOffset::try_new(3)?)?;
    let splice = TextSplice::capture(&context, source.document(), range, plain_fragment("😀")?)?;
    let commit =
        committed(Transaction::new(&source, vec![splice.into()]).apply(&context, &source)?)?;
    let changed = commit.after().document();
    assert_eq!(changed.summary().node_count(), 5);
    assert_eq!(changed.summary().total_text_bytes(), 12);
    assert_matches_independent_oracle(changed);

    let revalidated = DocumentJsonCodec::new(context.schema().clone())
        .decode(&DocumentJsonCodec::new(context.schema().clone()).encode(changed)?)?;
    assert_eq!(revalidated.summary(), changed.summary());

    let inverse = Transaction::new(commit.after(), commit.inverse_operations().to_vec());
    let restored = committed(inverse.apply(&context, commit.after())?)?;
    assert_eq!(restored.after().document(), source.document());
    assert_eq!(restored.after().document().summary(), source.document().summary());
    assert_matches_independent_oracle(restored.after().document());
    Ok(())
}

#[test]
fn summary_uses_the_same_exact_boundary_as_validation_limits() -> TestResult {
    let schema = CompiledSchema::breditor_base();
    let json = document_json(&[paragraph(&[text_node("😀", false)])]);
    let accepted_limits = DocumentLimits::default()
        .with_max_nodes(3)
        .with_max_text_bytes(4)
        .with_max_total_text_bytes(4);
    let accepted =
        DocumentJsonCodec::new(schema.clone()).with_limits(accepted_limits).decode(&json)?;
    assert_eq!(accepted.summary().node_count(), 3);
    assert_eq!(accepted.summary().total_text_bytes(), 4);
    assert_matches_independent_oracle(&accepted);

    let rejected_limits = DocumentLimits::default()
        .with_max_nodes(3)
        .with_max_text_bytes(4)
        .with_max_total_text_bytes(3);
    let error = DocumentJsonCodec::new(schema)
        .with_limits(rejected_limits)
        .decode(&json)
        .err()
        .ok_or_else(|| test_error("document above the total-text limit was accepted"))?;
    let DocumentCodecError::Validation(report) = error else {
        return Err(test_error(format!("expected validation error, got {error}")).into());
    };
    assert!(report.iter().any(|issue| {
        matches!(
            issue.detail(),
            ValidationDetail::Limit { kind: LimitKind::TotalTextBytes, actual: 4, maximum: 3 }
        )
    }));
    Ok(())
}
