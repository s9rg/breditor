//! Complete bounded search with original-domain anchors and scalar-safe coordinates.
use super::{
    RICH_SEARCH_MAX_ENGINE_BYTES, RICH_SEARCH_MAX_MATCHES, RICH_SEARCH_MAX_TEXT_BYTES,
    RichSearchError, RichSearchMatch, RichSearchQuery, RichSearchResults, domains, matcher,
};
use crate::{
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
};
use regex_automata::{Input, PatternID, meta::Regex};
use std::{collections::BTreeMap, ops::Range};
use unicode_segmentation::UnicodeSegmentation;

/// Search accepted visible body text without changing content, UI or history.
///
/// Searches across formatting runs but never invents cross-block separators.
/// Merged source partitions follow derived presentation order. Invalid queries
/// are admitted before traversal, including documents without searchable text.
/// No result escapes if any compilation, traversal, match or work bound fails.
/// # Errors
/// Returns payload-free syntax/resource failures and admitted-tree contradictions.
pub fn find_rich_text(
    document: &RichDocument,
    query: &RichSearchQuery,
) -> Result<RichSearchResults, RichSearchError> {
    let mut result = RichSearchResults {
        source: document.clone(),
        query: query.clone(),
        matches: Vec::new(),
        names: BTreeMap::new(),
        capture_count: 1,
    };
    if query.pattern().is_empty() {
        return Ok(result);
    }
    let compiled = matcher::compile(query)?;
    if let Some(regex) = &compiled {
        result.capture_count = regex.group_info().group_len(PatternID::ZERO);
        for (index, name) in regex.group_info().pattern_names(PatternID::ZERO).enumerate() {
            if let Some(name) = name {
                result.names.insert(name.to_owned(), index);
            }
        }
    }
    let mut text_bytes = 0usize;
    let mut engine_bytes = 0usize;
    let mut cache = compiled.as_ref().map(Regex::create_cache);
    let mut captures = compiled.as_ref().map(Regex::create_captures);
    for block in domains::domains(document)? {
        let text = domains::text(document, &block, RICH_SEARCH_MAX_TEXT_BYTES - text_bytes)?;
        text_bytes = text_bytes.checked_add(text.len()).ok_or(RichSearchError::DocumentLimit)?;
        if text_bytes > RICH_SEARCH_MAX_TEXT_BYTES {
            return Err(RichSearchError::DocumentLimit);
        }
        let boundaries = query.whole_words().then(|| word_boundaries(&text));
        // V4 mentions are atomic entities: no match may touch one.
        let protected = crate::rich_content::mention::byte_units(document, &block);
        let mut cursor = Coordinates::default();
        if let Some(regex) = &compiled {
            let cache = cache.as_mut().ok_or(RichSearchError::Invariant)?;
            let captures = captures.as_mut().ok_or(RichSearchError::Invariant)?;
            let mut start = 0usize;
            let mut last_end = None;
            while start <= text.len() {
                engine_bytes = engine_bytes
                    .checked_add(text.len() - start + 1)
                    .ok_or(RichSearchError::WorkLimit)?;
                if engine_bytes > RICH_SEARCH_MAX_ENGINE_BYTES {
                    return Err(RichSearchError::WorkLimit);
                }
                regex.search_captures_with(cache, &Input::new(&text).range(start..), captures);
                let Some(found) = captures.get_match() else {
                    break;
                };
                if found.is_empty() && last_end == Some(found.end()) {
                    let Some(next) = text.get(found.end()..).and_then(|tail| tail.chars().next())
                    else {
                        break;
                    };
                    start = found.end() + next.len_utf8();
                    continue;
                }
                if !whole_word(boundaries.as_deref(), found.start(), found.end())
                    || crate::rich_content::mention::intersects(
                        &protected,
                        found.start(),
                        found.end(),
                    )
                {
                    // A rejected candidate must not hide a later whole-word occurrence that
                    // starts inside it, so resume one scalar after its start, not its end.
                    let Some(next) = text.get(found.start()..).and_then(|tail| tail.chars().next())
                    else {
                        break;
                    };
                    start = found.start() + next.len_utf8();
                    continue;
                }
                start = found.end();
                last_end = Some(found.end());
                let spans = (0..captures.group_len())
                    .map(|index| captures.get_group(index).map(|span| span.start..span.end))
                    .collect();
                record(
                    &mut result.matches,
                    &block,
                    &text,
                    found.start()..found.end(),
                    spans,
                    &mut cursor,
                )?;
            }
        } else {
            scan_literal(
                &mut result.matches,
                &block,
                &text,
                query.pattern(),
                (boundaries.as_deref(), &protected),
                &mut cursor,
            )?;
        }
    }
    Ok(result)
}

/// Literal occurrences, retrying overlapping candidates so a rejected occurrence cannot hide a
/// whole-word occurrence that starts inside it.
fn scan_literal(
    output: &mut Vec<RichSearchMatch>,
    block: &BlockId,
    text: &str,
    pattern: &str,
    (boundaries, protected): (Option<&[usize]>, &[(usize, usize)]),
    cursor: &mut Coordinates,
) -> Result<(), RichSearchError> {
    let mut from = 0usize;
    while let Some(offset) = text.get(from..).and_then(|tail| tail.find(pattern)) {
        let start = from + offset;
        let end = start + pattern.len();
        if whole_word(boundaries, start, end)
            && !crate::rich_content::mention::intersects(protected, start, end)
        {
            record(output, block, text, start..end, vec![Some(start..end)], cursor)?;
            from = end;
        } else {
            let Some(next) = text.get(start..).and_then(|tail| tail.chars().next()) else {
                break;
            };
            from = start + next.len_utf8();
        }
    }
    Ok(())
}

#[derive(Default)]
struct Coordinates {
    byte: usize,
    utf16: u64,
}

fn record(
    output: &mut Vec<RichSearchMatch>,
    block: &BlockId,
    text: &str,
    span: Range<usize>,
    captures: Vec<Option<Range<usize>>>,
    cursor: &mut Coordinates,
) -> Result<(), RichSearchError> {
    if output.len() >= RICH_SEARCH_MAX_MATCHES {
        return Err(RichSearchError::MatchLimit);
    }
    if captures.iter().flatten().any(|span| text.get(span.clone()).is_none()) {
        return Err(RichSearchError::Invariant);
    }
    let gap = text.get(cursor.byte..span.start).ok_or(RichSearchError::Invariant)?;
    let matched = text.get(span.clone()).ok_or(RichSearchError::Invariant)?;
    let start = cursor
        .utf16
        .checked_add(
            u64::try_from(gap.encode_utf16().count()).map_err(|_| RichSearchError::Invariant)?,
        )
        .ok_or(RichSearchError::Invariant)?;
    let end = start
        .checked_add(
            u64::try_from(matched.encode_utf16().count())
                .map_err(|_| RichSearchError::Invariant)?,
        )
        .ok_or(RichSearchError::Invariant)?;
    cursor.byte = span.end;
    cursor.utf16 = end;
    output.push(RichSearchMatch {
        block: block.clone(),
        start: TextOffset::try_new(start).map_err(|_| RichSearchError::Invariant)?,
        end: TextOffset::try_new(end).map_err(|_| RichSearchError::Invariant)?,
        captures,
    });
    Ok(())
}

fn word_boundaries(text: &str) -> Vec<usize> {
    std::iter::once(0)
        .chain(text.split_word_bound_indices().map(|(start, segment)| start + segment.len()))
        .collect()
}
fn whole_word(boundaries: Option<&[usize]>, start: usize, end: usize) -> bool {
    boundaries.is_none_or(|values| {
        values.binary_search(&start).is_ok() && values.binary_search(&end).is_ok()
    })
}
