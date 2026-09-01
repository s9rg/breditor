//! Direct algebraic contracts for canonical operation fragments.

use breditor_core::{
    document::{Format, FormatSet, PropertyMap, TextFragment, TextFragmentSplitError, TextRun},
    identity::QualifiedName,
    position::TextOffset,
};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn formats(strong: bool) -> Result<FormatSet, Box<dyn std::error::Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])
    .map_err(Into::into)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn std::error::Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, strong)| TextRun::try_new(*text, formats(*strong)?).map_err(Into::into))
            .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?,
    )
    .map_err(Into::into)
}

#[test]
fn concat_has_empty_identity_and_is_associative_across_seam_merges() -> TestResult {
    let empty = TextFragment::empty();
    let value = fragment(&[("a", false), ("B", true)])?;
    assert_eq!(empty.try_concat(&value)?, value);
    assert_eq!(value.try_concat(&empty)?, value);

    for (left, middle, right) in [
        (fragment(&[("a", false)])?, fragment(&[("b", false)])?, fragment(&[("c", false)])?),
        (
            fragment(&[("a", false)])?,
            fragment(&[("B", true)])?,
            fragment(&[("C", true), ("d", false)])?,
        ),
        (TextFragment::empty(), fragment(&[("😀", false)])?, TextFragment::empty()),
    ] {
        let left_grouped = left.try_concat(&middle)?.try_concat(&right)?;
        let right_grouped = left.try_concat(&middle.try_concat(&right)?)?;
        assert_eq!(left_grouped, right_grouped);
    }
    Ok(())
}

#[test]
fn every_scalar_split_reconcatenates_to_the_exact_fragment() -> TestResult {
    let source = fragment(&[("a😀", false), ("B", true), ("ç", false)])?;
    for value in [0, 1, 3, 4, 5] {
        let offset = TextOffset::try_new(value)?;
        let (left, right) = source.split_at(offset)?;
        assert_eq!(left.utf16_len().get() + right.utf16_len().get(), source.utf16_len().get());
        assert_eq!(left.try_concat(&right)?, source);
    }
    Ok(())
}

#[test]
fn split_reports_out_of_bounds_and_surrogate_interior_distinctly() -> TestResult {
    let source = fragment(&[("a😀b", false)])?;
    let inside_scalar = TextOffset::try_new(2)?;
    assert_eq!(
        source.split_at(inside_scalar),
        Err(TextFragmentSplitError::OffsetSplitsScalar { requested: inside_scalar })
    );

    let requested = TextOffset::try_new(5)?;
    assert_eq!(
        source.split_at(requested),
        Err(TextFragmentSplitError::OffsetOutOfBounds { requested, length: source.utf16_len() })
    );
    Ok(())
}
