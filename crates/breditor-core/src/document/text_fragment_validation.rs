//! Shared, allocation-free admission of owned or borrowed canonical text runs.
use super::{FormatSet, TextFragmentError};
use crate::position::TextOffset;

/// Both passes read the same immutable sequence. Preserve the public fragment
/// constructor's error precedence: first adjacent-equal formats, then checked
/// aggregate UTF-16/byte lengths in run order. Local leaf validity is supplied
/// by TextNode/TextRun, not inferred from arbitrary strings here.
pub(super) fn measure_runs<'a, I>(
    runs: impl Fn() -> I,
) -> Result<(TextOffset, usize), TextFragmentError>
where
    I: Iterator<Item = (&'a FormatSet, u64, usize)>,
{
    let mut previous = None;
    for (index, (formats, _, _)) in runs().enumerate() {
        if previous == Some(formats) {
            return Err(TextFragmentError::AdjacentEqualFormats {
                left_index: index - 1,
                right_index: index,
            });
        }
        previous = Some(formats);
    }
    let mut utf16_length = TextOffset::ZERO;
    let mut text_bytes = 0_usize;
    for (_, utf16, bytes) in runs() {
        utf16_length = utf16_length.checked_add(utf16)?;
        text_bytes =
            text_bytes.checked_add(bytes).ok_or(TextFragmentError::TextByteLengthOverflow)?;
    }
    Ok((utf16_length, text_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        document::{Format, PropertyMap, TextFragment, TextNode, TextRun},
        identity::QualifiedName,
        position::MAX_TEXT_OFFSET,
    };
    type TestResult = Result<(), Box<dyn std::error::Error>>;

    fn strong() -> Result<FormatSet, Box<dyn std::error::Error>> {
        Ok(FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        )])?)
    }

    #[test]
    fn checked_lengths_keep_exact_boundaries_and_error_precedence() -> TestResult {
        let plain = FormatSet::default();
        let strong = strong()?;
        let exact = [(&plain, MAX_TEXT_OFFSET, usize::MAX)];
        assert_eq!(
            measure_runs(|| exact.into_iter())?,
            (TextOffset::try_new(MAX_TEXT_OFFSET)?, usize::MAX)
        );
        let offset_overflow = [(&plain, MAX_TEXT_OFFSET, 0), (&strong, 1, 0)];
        assert!(matches!(
            measure_runs(|| offset_overflow.into_iter()),
            Err(TextFragmentError::TextOffset(_))
        ));
        let byte_overflow = [(&plain, 1, usize::MAX), (&strong, 1, 1)];
        assert_eq!(
            measure_runs(|| byte_overflow.into_iter()),
            Err(TextFragmentError::TextByteLengthOverflow)
        );
        let both = [(&plain, MAX_TEXT_OFFSET, usize::MAX), (&strong, 1, 1)];
        assert!(matches!(measure_runs(|| both.into_iter()), Err(TextFragmentError::TextOffset(_))));
        let later_equal = [(&plain, u64::MAX, usize::MAX), (&strong, 1, 1), (&strong, 1, 1)];
        assert_eq!(
            measure_runs(|| later_equal.into_iter()),
            Err(TextFragmentError::AdjacentEqualFormats { left_index: 1, right_index: 2 })
        );
        Ok(())
    }

    #[test]
    fn owned_and_borrowed_unicode_runs_match_an_independent_canonical_oracle() -> TestResult {
        let plain = FormatSet::default();
        let strong = strong()?;
        for len in 0..=8 {
            for mask in 0..(1_u16 << len) {
                let nodes = (0..len)
                    .map(|i| {
                        TextNode::try_new(
                            ["a", "🙂", "e\u{301}"][i % 3].to_owned(),
                            if mask & (1 << i) == 0 { plain.clone() } else { strong.clone() },
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                let expected_error =
                    nodes.windows(2).position(|p| p[0].formats() == p[1].formats());
                let owned = TextFragment::try_from_runs(
                    nodes.iter().map(TextRun::from_text_node).collect(),
                );
                #[cfg(feature = "experimental-structural-properties")]
                assert_eq!(
                    TextFragment::validate_text_nodes(|| nodes.iter()),
                    owned.as_ref().map(|_| ()).map_err(Clone::clone)
                );
                let borrowed = measure_runs(|| {
                    nodes.iter().map(|n| (n.formats(), u64::from(n.utf16_len()), n.text().len()))
                });
                if let Some(left_index) = expected_error {
                    let expected = TextFragmentError::AdjacentEqualFormats {
                        left_index,
                        right_index: left_index + 1,
                    };
                    assert_eq!(owned, Err(expected.clone()));
                    assert_eq!(borrowed, Err(expected));
                } else {
                    let owned = owned?;
                    let expected_units: u64 = nodes.iter().map(|n| u64::from(n.utf16_len())).sum();
                    let expected_bytes: usize = nodes.iter().map(|n| n.text().len()).sum();
                    assert_eq!(borrowed?, (TextOffset::try_new(expected_units)?, expected_bytes));
                    assert_eq!(owned.utf16_len().get(), expected_units);
                    assert_eq!(owned.text_bytes(), expected_bytes);
                }
            }
        }
        Ok(())
    }
}
