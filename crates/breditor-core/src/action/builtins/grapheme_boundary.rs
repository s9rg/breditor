use std::{borrow::Cow, cmp::Ordering};

use unicode_segmentation::UnicodeSegmentation;

use crate::{action::ActionFault, document::TextFragment, position::TextOffset};

use super::support::fault;

/// Unicode data version used for extended-grapheme-cluster segmentation.
///
/// Pinning and exposing this value makes backspace/forward-delete behavior an
/// explicit part of semantic action-evaluation compatibility rather than an
/// accidental property of a host's Unicode implementation. Unicode 17.0.0 is
/// frozen for the current built-in action identities; a data upgrade requires
/// a new action generation or identity.
pub const GRAPHEME_UNICODE_VERSION: (u64, u64, u64) = unicode_segmentation::UNICODE_VERSION;

/// Returns the extended-grapheme boundary immediately before `caret`.
///
/// Segmentation treats the complete fragment as one string: formatting-run
/// seams never introduce grapheme boundaries. Multi-run fragments are copied
/// into one bounded contiguous segmentation view so library chunk-context
/// behavior cannot affect the result. `Ok(None)` means either that `caret` is
/// zero or that it is not itself an extended-grapheme boundary. Invalid UTF-16
/// coordinates are unexpected action faults.
pub(super) fn previous_grapheme_boundary(
    fragment: &TextFragment,
    caret: TextOffset,
) -> Result<Option<TextOffset>, ActionFault> {
    grapheme_boundary(fragment, caret, Direction::Previous)
}

/// Returns the extended-grapheme boundary immediately after `caret`.
///
/// Segmentation treats the complete fragment as one string: formatting-run
/// seams never introduce grapheme boundaries. Multi-run fragments are copied
/// into one bounded contiguous segmentation view so library chunk-context
/// behavior cannot affect the result. `Ok(None)` means either that `caret` is
/// at the end or that it is not itself an extended-grapheme boundary. Invalid
/// UTF-16 coordinates are unexpected action faults.
pub(super) fn next_grapheme_boundary(
    fragment: &TextFragment,
    caret: TextOffset,
) -> Result<Option<TextOffset>, ActionFault> {
    grapheme_boundary(fragment, caret, Direction::Next)
}

/// Returns the closest extended-grapheme boundary at or before `caret`.
///
/// This is reserved for canonicalizing a core-produced text-deletion or
/// structural-join seam; ordinary protocol carets inside a cluster remain
/// disabled by the directional deletion helpers above.
pub(super) fn grapheme_boundary_at_or_before(
    fragment: &TextFragment,
    caret: TextOffset,
) -> Result<TextOffset, ActionFault> {
    snap_grapheme_boundary(fragment, caret, SnapDirection::Before)
}

/// Returns the closest extended-grapheme boundary at or after `caret`.
///
/// This is reserved for canonicalizing a core-produced text-deletion or
/// structural-join seam; ordinary protocol carets inside a cluster remain
/// disabled by the directional deletion helpers above.
pub(super) fn grapheme_boundary_at_or_after(
    fragment: &TextFragment,
    caret: TextOffset,
) -> Result<TextOffset, ActionFault> {
    snap_grapheme_boundary(fragment, caret, SnapDirection::After)
}

#[derive(Clone, Copy)]
enum Direction {
    Previous,
    Next,
}

#[derive(Clone, Copy)]
enum SnapDirection {
    Before,
    After,
}

fn grapheme_boundary(
    fragment: &TextFragment,
    caret: TextOffset,
    direction: Direction,
) -> Result<Option<TextOffset>, ActionFault> {
    let (text, caret_byte) = segmentation_view(fragment, caret)?;
    if text.is_empty() {
        return Ok(None);
    }

    let boundary = match direction {
        Direction::Previous => previous_boundary(&text, caret_byte),
        Direction::Next => next_boundary(&text, caret_byte),
    };
    boundary.map(|boundary| byte_to_utf16(&text, boundary)).transpose()
}

fn snap_grapheme_boundary(
    fragment: &TextFragment,
    caret: TextOffset,
    direction: SnapDirection,
) -> Result<TextOffset, ActionFault> {
    let (text, caret_byte) = segmentation_view(fragment, caret)?;
    let boundary = match direction {
        SnapDirection::Before => boundary_at_or_before(&text, caret_byte),
        SnapDirection::After => boundary_at_or_after(&text, caret_byte),
    };
    byte_to_utf16(&text, boundary)
}

fn segmentation_view(
    fragment: &TextFragment,
    caret: TextOffset,
) -> Result<(Cow<'_, str>, usize), ActionFault> {
    if caret > fragment.utf16_len() {
        return Err(fault("breditor/grapheme-caret-coordinate-fault"));
    }
    let text = contiguous_text(fragment)?;
    let caret_byte = byte_offset_at_utf16(&text, caret.get())
        .ok_or_else(|| fault("breditor/grapheme-caret-coordinate-fault"))?;
    Ok((text, caret_byte))
}

fn contiguous_text(fragment: &TextFragment) -> Result<Cow<'_, str>, ActionFault> {
    if fragment.is_empty() {
        return Ok(Cow::Borrowed(""));
    }
    if fragment.len() == 1 {
        let run = fragment
            .iter()
            .next()
            .ok_or_else(|| fault("breditor/grapheme-fragment-summary-fault"))?;
        return Ok(Cow::Borrowed(run.text()));
    }

    let mut text = String::with_capacity(fragment.text_bytes());
    for run in fragment {
        text.push_str(run.text());
    }
    let utf16_length = u64::try_from(text.encode_utf16().count())
        .map_err(|_| fault("breditor/grapheme-utf16-coordinate-fault"))?;
    if text.len() != fragment.text_bytes() || utf16_length != fragment.utf16_len().get() {
        return Err(fault("breditor/grapheme-fragment-summary-fault"));
    }
    Ok(Cow::Owned(text))
}

fn byte_offset_at_utf16(text: &str, requested: u64) -> Option<usize> {
    let mut utf16 = 0_u64;
    for (byte, character) in text.char_indices() {
        if requested == utf16 {
            return Some(byte);
        }
        utf16 = utf16.checked_add(u64::try_from(character.len_utf16()).ok()?)?;
        if requested < utf16 {
            return None;
        }
    }
    (requested == utf16).then_some(text.len())
}

fn previous_boundary(text: &str, caret: usize) -> Option<usize> {
    if caret == 0 {
        return None;
    }
    let mut previous = None;
    for (boundary, _) in text.grapheme_indices(true) {
        match boundary.cmp(&caret) {
            Ordering::Less => previous = Some(boundary),
            Ordering::Equal => return previous,
            Ordering::Greater => return None,
        }
    }
    (caret == text.len()).then_some(previous).flatten()
}

fn next_boundary(text: &str, caret: usize) -> Option<usize> {
    if caret == text.len() {
        return None;
    }
    let mut boundaries = text.grapheme_indices(true).map(|(boundary, _)| boundary);
    while let Some(boundary) = boundaries.next() {
        match boundary.cmp(&caret) {
            Ordering::Less => {}
            Ordering::Equal => return Some(boundaries.next().unwrap_or(text.len())),
            Ordering::Greater => return None,
        }
    }
    None
}

fn boundary_at_or_before(text: &str, caret: usize) -> usize {
    if caret == text.len() {
        return caret;
    }
    let mut closest = 0;
    for (boundary, _) in text.grapheme_indices(true) {
        if boundary > caret {
            break;
        }
        closest = boundary;
    }
    closest
}

fn boundary_at_or_after(text: &str, caret: usize) -> usize {
    text.grapheme_indices(true)
        .map(|(boundary, _)| boundary)
        .find(|boundary| *boundary >= caret)
        .unwrap_or(text.len())
}

fn byte_to_utf16(text: &str, boundary: usize) -> Result<TextOffset, ActionFault> {
    let prefix =
        text.get(..boundary).ok_or_else(|| fault("breditor/grapheme-byte-coordinate-fault"))?;
    let utf16 = u64::try_from(prefix.encode_utf16().count())
        .map_err(|_| fault("breditor/grapheme-utf16-coordinate-fault"))?;
    TextOffset::try_new(utf16).map_err(|_| fault("breditor/grapheme-utf16-coordinate-fault"))
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        document::{Format, FormatSet, PropertyMap, TextRun},
        identity::QualifiedName,
    };
    use unicode_segmentation::UnicodeSegmentation;

    use super::*;

    type TestResult = Result<(), Box<dyn Error>>;

    fn formats(name: &str) -> Result<FormatSet, Box<dyn Error>> {
        Ok(FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new(name)?,
            PropertyMap::default(),
        )])?)
    }

    #[test]
    fn boundaries_ignore_formatting_run_seams() -> TestResult {
        let fragment = TextFragment::try_from_runs(vec![
            TextRun::try_new("a", FormatSet::default())?,
            TextRun::try_new("\u{301}b", formats("test/strong")?)?,
        ])?;

        assert_eq!(
            previous_grapheme_boundary(&fragment, TextOffset::try_new(2)?)?,
            Some(TextOffset::ZERO)
        );
        assert_eq!(
            next_grapheme_boundary(&fragment, TextOffset::ZERO)?,
            Some(TextOffset::try_new(2)?)
        );
        assert_eq!(previous_grapheme_boundary(&fragment, TextOffset::try_new(1)?)?, None);
        assert_eq!(next_grapheme_boundary(&fragment, TextOffset::try_new(1)?)?, None);
        Ok(())
    }

    #[test]
    fn zwj_and_regional_sequences_span_multiple_runs() -> TestResult {
        let emoji = TextFragment::try_from_runs(vec![
            TextRun::try_new("\u{1f469}", FormatSet::default())?,
            TextRun::try_new("\u{200d}", formats("test/one")?)?,
            TextRun::try_new("\u{1f52c}", formats("test/two")?)?,
        ])?;
        assert_eq!(previous_grapheme_boundary(&emoji, emoji.utf16_len())?, Some(TextOffset::ZERO));

        let flags = TextFragment::try_from_runs(vec![
            TextRun::try_new("\u{1f1f7}", FormatSet::default())?,
            TextRun::try_new("\u{1f1f8}\u{1f1ee}", formats("test/one")?)?,
            TextRun::try_new("\u{1f1f4}", formats("test/two")?)?,
        ])?;
        assert_eq!(
            previous_grapheme_boundary(&flags, flags.utf16_len())?,
            Some(TextOffset::try_new(4)?)
        );
        assert_eq!(
            next_grapheme_boundary(&flags, TextOffset::ZERO)?,
            Some(TextOffset::try_new(4)?)
        );
        Ok(())
    }

    #[test]
    fn prepend_before_controls_is_a_boundary_across_formatting_runs() -> TestResult {
        for control in ["\r", "\n", "\0"] {
            let fragment = TextFragment::try_from_runs(vec![
                TextRun::try_new("\u{6dd}", FormatSet::default())?,
                TextRun::try_new(control, formats("test/control")?)?,
            ])?;
            let seam = TextOffset::try_new(1)?;

            assert_eq!(previous_grapheme_boundary(&fragment, seam)?, Some(TextOffset::ZERO));
            assert_eq!(next_grapheme_boundary(&fragment, seam)?, Some(TextOffset::try_new(2)?));
        }
        Ok(())
    }

    #[test]
    fn one_grapheme_can_span_thousands_of_formatting_runs() -> TestResult {
        const COMBINING_RUNS: usize = 4_096;

        let alternate = formats("test/alternate")?;
        let mut runs = Vec::with_capacity(COMBINING_RUNS + 1);
        runs.push(TextRun::try_new("a", FormatSet::default())?);
        for index in 0..COMBINING_RUNS {
            let formats = if index % 2 == 0 { alternate.clone() } else { FormatSet::default() };
            runs.push(TextRun::try_new("\u{301}", formats)?);
        }
        let fragment = TextFragment::try_from_runs(runs)?;

        assert_eq!(
            previous_grapheme_boundary(&fragment, fragment.utf16_len())?,
            Some(TextOffset::ZERO)
        );
        assert_eq!(
            next_grapheme_boundary(&fragment, TextOffset::ZERO)?,
            Some(fragment.utf16_len())
        );
        Ok(())
    }

    #[test]
    fn chunked_boundaries_match_contiguous_unicode_segmentation() -> TestResult {
        assert_eq!(GRAPHEME_UNICODE_VERSION, (17, 0, 0));
        let text = concat!(
            "a\u{301}|",                             // combining mark
            "\u{1f44d}\u{1f3fd}|",                   // emoji modifier
            "\u{1f469}\u{200d}\u{1f52c}|",           // emoji ZWJ sequence
            "\u{1f1f7}\u{1f1f8}\u{1f1ee}\u{1f1f4}|", // two RI flags
            "\u{915}\u{94d}\u{937}|",                // Indic conjunct
            "\u{1100}\u{1161}\u{11a8}|",             // Hangul L/V/T sequence
            "\u{6dd}\r|\u{6dd}\n|\u{6dd}\0|",        // Prepend before controls
            "\r\n",                                  // CRLF
        );
        let alternate = formats("test/alternate")?;
        let runs = text
            .chars()
            .enumerate()
            .map(|(index, character)| {
                TextRun::try_new(
                    character.to_string(),
                    if index % 2 == 0 { FormatSet::default() } else { alternate.clone() },
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let fragment = TextFragment::try_from_runs(runs)?;

        let mut grapheme_bytes =
            text.grapheme_indices(true).map(|(byte, _)| byte).collect::<Vec<_>>();
        grapheme_bytes.push(text.len());
        let mut scalar_bytes = text.char_indices().map(|(byte, _)| byte).collect::<Vec<_>>();
        scalar_bytes.push(text.len());

        for caret_byte in scalar_bytes {
            let caret = utf16_offset_for_byte(text, caret_byte)?;
            let expected = grapheme_bytes.binary_search(&caret_byte).ok();
            let expected_previous = expected
                .and_then(|index| index.checked_sub(1))
                .map(|index| utf16_offset_for_byte(text, grapheme_bytes[index]))
                .transpose()?;
            let expected_next = expected
                .and_then(|index| grapheme_bytes.get(index + 1).copied())
                .map(|byte| utf16_offset_for_byte(text, byte))
                .transpose()?;

            assert_eq!(
                previous_grapheme_boundary(&fragment, caret)?,
                expected_previous,
                "previous boundary disagreed at byte {caret_byte}"
            );
            assert_eq!(
                next_grapheme_boundary(&fragment, caret)?,
                expected_next,
                "next boundary disagreed at byte {caret_byte}"
            );
        }
        Ok(())
    }

    fn utf16_offset_for_byte(text: &str, byte: usize) -> Result<TextOffset, Box<dyn Error>> {
        let prefix = text
            .get(..byte)
            .ok_or_else(|| std::io::Error::other("test byte offset must be a scalar boundary"))?;
        Ok(TextOffset::try_new(u64::try_from(prefix.encode_utf16().count())?)?)
    }
}
