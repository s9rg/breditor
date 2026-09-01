//! Black-box Unicode and UTF-16 boundary conformance tests.

mod support;

use breditor_core::position::{Affinity, Point, PointError, ResolvedPoint};
use proptest::{
    collection::vec,
    prelude::any,
    prop_assert, prop_assert_eq, proptest,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use support::{TestResult, codec, document_json, paragraph, path, test_error, text_node};

struct BoundaryCase {
    text: &'static str,
    valid: &'static [(u32, usize)],
    split_scalars: &'static [u32],
}

const BOUNDARY_CASES: &[BoundaryCase] = &[
    BoundaryCase { text: "ab", valid: &[(0, 0), (1, 1), (2, 2)], split_scalars: &[] },
    BoundaryCase { text: "a😀b", valid: &[(0, 0), (1, 1), (3, 5), (4, 6)], split_scalars: &[2] },
    BoundaryCase { text: "e\u{301}", valid: &[(0, 0), (1, 1), (2, 3)], split_scalars: &[] },
    BoundaryCase { text: "🇨🇦", valid: &[(0, 0), (2, 4), (4, 8)], split_scalars: &[1, 3] },
    BoundaryCase {
        text: "👨\u{200d}👩",
        valid: &[(0, 0), (2, 4), (3, 7), (5, 11)],
        split_scalars: &[1, 4],
    },
];

#[test]
fn utf16_storage_accepts_scalar_boundaries_not_only_grapheme_boundaries() -> TestResult {
    let paragraphs = BOUNDARY_CASES
        .iter()
        .map(|case| paragraph(&[text_node(case.text, false)]))
        .collect::<Vec<_>>();
    let json = document_json(&paragraphs);
    let document = codec().decode(&json)?;

    for (paragraph_index, case) in BOUNDARY_CASES.iter().enumerate() {
        let text_path = path(&[u32::try_from(paragraph_index)?, 0])?;
        for &(utf16_offset, expected_byte_offset) in case.valid {
            let point = Point::Text {
                text_path: text_path.clone(),
                utf16_offset,
                affinity: Affinity::Before,
            };
            let ResolvedPoint::Text { byte_offset, node, .. } = point.resolve(&document)? else {
                return Err(test_error("Unicode text point resolved as children").into());
            };
            assert_eq!(node.text(), case.text);
            assert_eq!(byte_offset, expected_byte_offset);
        }
        for &utf16_offset in case.split_scalars {
            let point = Point::Text {
                text_path: text_path.clone(),
                utf16_offset,
                affinity: Affinity::After,
            };
            let Err(error) = point.resolve(&document) else {
                return Err(test_error("interior surrogate offset unexpectedly resolved").into());
            };
            assert_eq!(
                error,
                PointError::Utf16OffsetSplitsScalar {
                    path: text_path.clone(),
                    offset: utf16_offset,
                }
            );
        }
    }
    Ok(())
}

proptest! {
    #![proptest_config(Config::with_failure_persistence(
        FileFailurePersistence::Direct("tests/unicode_boundaries.proptest-regressions")
    ))]

    #[test]
    fn every_unicode_scalar_boundary_round_trips_to_its_utf8_byte_boundary(
        characters in vec(any::<char>(), 1..64),
        affinity in proptest::sample::select(vec![Affinity::Before, Affinity::After]),
    ) {
        let text: String = characters.iter().collect();
        let json = document_json(&[paragraph(&[text_node(&text, false)])]);
        let document = codec()
            .decode(&json)
            .map_err(|error| TestCaseError::fail(error.to_string()))?;
        let text_path = path(&[0, 0]).map_err(|error| TestCaseError::fail(error.to_string()))?;
        let mut utf16_offset = 0_u32;

        for (expected_byte_offset, character) in text.char_indices() {
            let point = Point::Text {
                text_path: text_path.clone(),
                utf16_offset,
                affinity,
            };
            let resolved = point
                .resolve(&document)
                .map_err(|error| TestCaseError::fail(error.to_string()))?;
            let ResolvedPoint::Text {
                byte_offset,
                utf16_offset: resolved_offset,
                affinity: resolved_affinity,
                ..
            } = resolved else {
                return Err(TestCaseError::fail("text point resolved as children"));
            };
            prop_assert_eq!(byte_offset, expected_byte_offset);
            prop_assert_eq!(resolved_offset, utf16_offset);
            prop_assert_eq!(resolved_affinity, affinity);

            let scalar_width = u32::try_from(character.len_utf16())
                .map_err(|error| TestCaseError::fail(error.to_string()))?;
            if scalar_width == 2 {
                let interior = Point::Text {
                    text_path: text_path.clone(),
                    utf16_offset: utf16_offset + 1,
                    affinity,
                };
                prop_assert!(matches!(
                    interior.resolve(&document),
                    Err(PointError::Utf16OffsetSplitsScalar { .. })
                ), "interior UTF-16 offset should split a scalar");
            }
            utf16_offset += scalar_width;
        }

        let end = Point::Text {
            text_path: text_path.clone(),
            utf16_offset,
            affinity,
        };
        let ResolvedPoint::Text { byte_offset, .. } = end
            .resolve(&document)
            .map_err(|error| TestCaseError::fail(error.to_string()))?
        else {
            return Err(TestCaseError::fail("text end resolved as children"));
        };
        prop_assert_eq!(byte_offset, text.len());

        let past_end = Point::Text {
            text_path,
            utf16_offset: utf16_offset + 1,
            affinity,
        };
        prop_assert!(matches!(
            past_end.resolve(&document),
            Err(PointError::Utf16OffsetOutOfBounds { .. })
        ), "offset after the text end should be out of bounds");

        let encoded = codec()
            .encode(&document)
            .map_err(|error| TestCaseError::fail(error.to_string()))?;
        let round_tripped = codec()
            .decode(&encoded)
            .map_err(|error| TestCaseError::fail(error.to_string()))?;
        prop_assert_eq!(round_tripped, document);
    }
}
