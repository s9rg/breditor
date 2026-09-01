//! Property laws for the strict, singular operation JSON boundary.

use std::fmt::Display;

use breditor_core::{
    codec::OperationJsonCodec,
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace,
        TextRange, TextSplice,
    },
    position::{NodePath, TextOffset},
    state::EditorContext,
};
use proptest::{
    collection::vec,
    prelude::{Strategy, any},
    proptest,
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};

#[derive(Clone, Debug)]
struct RunSpec {
    text: String,
    strong: bool,
}

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/operation_json_properties.proptest-regressions",
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

fn paragraph_path(index: u32) -> Result<NodePath, TestCaseError> {
    NodePath::try_from_indices(vec![index]).map_err(test_failure)
}

fn offset(value: u64) -> Result<TextOffset, TestCaseError> {
    TextOffset::try_new(value).map_err(test_failure)
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

fn selected_boundary(specs: &[RunSpec], choice: usize) -> u64 {
    let boundaries = scalar_boundaries(specs);
    boundaries[choice % boundaries.len()]
}

fn assert_exact_guards(original: &Operation, decoded: &Operation) -> Result<(), TestCaseError> {
    let exact = match (original, decoded) {
        (Operation::TextSplice(left), Operation::TextSplice(right)) => {
            left.expected_removed() == right.expected_removed()
        }
        (Operation::ParagraphSplit(left), Operation::ParagraphSplit(right)) => {
            left.expected() == right.expected()
        }
        (Operation::ParagraphJoin(left), Operation::ParagraphJoin(right)) => {
            left.expected_left() == right.expected_left()
                && left.expected_right() == right.expected_right()
        }
        (Operation::RootTextReplace(left), Operation::RootTextReplace(right)) => {
            left.expected_paragraphs() == right.expected_paragraphs()
        }
        _ => false,
    };
    if !exact {
        return Err(TestCaseError::fail(
            "decoded operation changed its kind or optimistic source guard",
        ));
    }
    Ok(())
}

fn assert_codec_laws(operation: &Operation) -> Result<(), TestCaseError> {
    let codec = OperationJsonCodec::new(EditorContext::default());
    let encoded = codec.encode(operation).map_err(test_failure)?;
    let repeated = codec.encode(operation).map_err(test_failure)?;
    if repeated != encoded {
        return Err(TestCaseError::fail(
            "repeated encoding of one operation was not byte-identical",
        ));
    }

    let decoded = codec.decode(&encoded).map_err(test_failure)?;
    if &decoded != operation {
        return Err(TestCaseError::fail(
            "decode(encode(operation)) did not preserve the operation",
        ));
    }
    assert_exact_guards(operation, &decoded)?;

    let reencoded = codec.encode(&decoded).map_err(test_failure)?;
    if reencoded != encoded {
        return Err(TestCaseError::fail("decode followed by re-encode changed the wire bytes"));
    }
    let decoded_again = codec.decode(&reencoded).map_err(test_failure)?;
    if decoded_again != decoded {
        return Err(TestCaseError::fail("a second codec round trip changed the operation"));
    }
    Ok(())
}

proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn text_splice_codec_laws_preserve_unicode_ranges_formats_and_guards(
        paragraph_index in 0_u32..8,
        start in 0_u64..24,
        expected in canonical_runs(5),
        replacement in canonical_runs(5),
    ) {
        let expected_fragment = fragment(&expected)?;
        let end = start
            .checked_add(expected_fragment.utf16_len().get())
            .ok_or_else(|| TestCaseError::fail("text-splice test range overflowed"))?;
        let range = TextRange::try_new(
            paragraph_path(paragraph_index)?,
            offset(start)?,
            offset(end)?,
        )
        .map_err(test_failure)?;
        let operation = TextSplice::try_new(range, expected_fragment, fragment(&replacement)?)
            .map_err(test_failure)?;
        assert_codec_laws(&operation.into())?;
    }

    #[test]
    fn paragraph_split_codec_laws_preserve_scalar_boundaries_formats_and_guard(
        paragraph_index in 0_u32..8,
        expected in canonical_runs(6),
        boundary_choice in any::<usize>(),
    ) {
        let split_offset = selected_boundary(&expected, boundary_choice);
        let operation = ParagraphSplit::try_new(
            paragraph_path(paragraph_index)?,
            offset(split_offset)?,
            fragment(&expected)?,
        )
        .map_err(test_failure)?;
        assert_codec_laws(&operation.into())?;
    }

    #[test]
    fn paragraph_join_codec_laws_preserve_both_formatted_guards(
        paragraph_index in 0_u32..8,
        expected_left in canonical_runs(5),
        expected_right in canonical_runs(5),
    ) {
        let operation = ParagraphJoin::try_new(
            paragraph_path(paragraph_index)?,
            fragment(&expected_left)?,
            fragment(&expected_right)?,
        )
        .map_err(test_failure)?;
        assert_codec_laws(&operation.into())?;
    }

    #[test]
    fn root_text_replace_codec_laws_preserve_cross_paragraph_guards(
        start_paragraph in 0_u32..6,
        expected in vec(canonical_runs(5), 1..4),
        replacement in vec(canonical_runs(5), 1..4),
        start_choice in any::<usize>(),
        end_choice in any::<usize>(),
    ) {
        let end_delta = u32::try_from(expected.len() - 1).map_err(test_failure)?;
        let end_paragraph = start_paragraph
            .checked_add(end_delta)
            .ok_or_else(|| TestCaseError::fail("root-text test paragraph span overflowed"))?;
        let mut start_value = selected_boundary(&expected[0], start_choice);
        let mut end_value = selected_boundary(&expected[expected.len() - 1], end_choice);
        if expected.len() == 1 && start_value > end_value {
            std::mem::swap(&mut start_value, &mut end_value);
        }

        let start = RootTextBoundary::try_new(
            paragraph_path(start_paragraph)?,
            offset(start_value)?,
        )
        .map_err(test_failure)?;
        let end = RootTextBoundary::try_new(paragraph_path(end_paragraph)?, offset(end_value)?)
            .map_err(test_failure)?;
        let range = RootTextRange::try_new(start, end).map_err(test_failure)?;
        let expected = expected
            .iter()
            .map(|specs| fragment(specs))
            .collect::<Result<Vec<_>, _>>()?;
        let replacement = replacement
            .iter()
            .map(|specs| fragment(specs))
            .collect::<Result<Vec<_>, _>>()?;
        let operation = RootTextReplace::try_new(range, expected, replacement)
            .map_err(test_failure)?;
        assert_codec_laws(&operation.into())?;
    }
}
