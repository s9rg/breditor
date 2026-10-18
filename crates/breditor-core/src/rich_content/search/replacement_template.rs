//! Checked capture templates with pre-allocation expansion bounds and identity detection.
use super::{
    MAX_REPLACEMENT_PARTS, RichSearchError, RichSearchMatch, RichSearchReplacement,
    RichSearchReplacementMode, RichSearchResults,
};
use std::ops::Range;

enum Part {
    Text(Range<usize>),
    Dollar,
    Capture(usize),
}

pub(super) struct Template<'a> {
    text: &'a str,
    parts: Vec<Part>,
}

impl<'a> Template<'a> {
    pub(super) fn compile(
        replacement: &'a RichSearchReplacement,
        results: &RichSearchResults,
    ) -> Result<Self, RichSearchError> {
        let text = replacement.text();
        let mut template = Self { text, parts: Vec::new() };
        if replacement.mode() == RichSearchReplacementMode::Literal {
            template.push(Part::Text(0..text.len()))?;
            return Ok(template);
        }
        let mut cursor = 0;
        while let Some(relative) = text[cursor..].find('$') {
            let start = cursor + relative;
            if start > cursor {
                template.push(Part::Text(cursor..start))?;
            }
            let (part, end) = reference(text, start + 1, results)?;
            template.push(part)?;
            cursor = end;
        }
        if cursor < text.len() {
            template.push(Part::Text(cursor..text.len()))?;
        }
        Ok(template)
    }

    fn push(&mut self, part: Part) -> Result<(), RichSearchError> {
        if self.parts.len() >= MAX_REPLACEMENT_PARTS {
            return Err(RichSearchError::ReplacementLimit);
        }
        self.parts.push(part);
        Ok(())
    }

    fn piece<'b>(
        &'b self,
        part: &Part,
        text: &'b str,
        found: &RichSearchMatch,
    ) -> Result<&'b str, RichSearchError> {
        match part {
            Part::Text(span) => self.text.get(span.clone()).ok_or(RichSearchError::Invariant),
            Part::Dollar => Ok("$"),
            Part::Capture(index) => match found.captures.get(*index) {
                Some(Some(span)) => text.get(span.clone()).ok_or(RichSearchError::Invariant),
                Some(None) => Ok(""),
                None => Err(RichSearchError::Invariant),
            },
        }
    }

    /// `None` means exact original bytes: retain all original formats and identities.
    pub(super) fn expand(
        &self,
        text: &str,
        found: &RichSearchMatch,
        remaining_bytes: usize,
    ) -> Result<Option<String>, RichSearchError> {
        let span =
            found.captures.first().and_then(Option::as_ref).ok_or(RichSearchError::Invariant)?;
        let original = text.get(span.clone()).ok_or(RichSearchError::Invariant)?;
        let length = self.parts.iter().try_fold(0usize, |total, part| {
            total
                .checked_add(self.piece(part, text, found)?.len())
                .ok_or(RichSearchError::ReplacementLimit)
        })?;
        if length == original.len() {
            let mut cursor = 0;
            let mut same = true;
            for part in &self.parts {
                let piece = self.piece(part, text, found)?;
                let end = cursor + piece.len();
                same &= original.as_bytes().get(cursor..end) == Some(piece.as_bytes());
                cursor = end;
            }
            if same {
                return Ok(None);
            }
        }
        if length > remaining_bytes {
            return Err(RichSearchError::ReplacementLimit);
        }
        let mut output = String::with_capacity(length);
        for part in &self.parts {
            output.push_str(self.piece(part, text, found)?);
        }
        Ok(Some(output))
    }
}

fn reference(
    text: &str,
    start: usize,
    results: &RichSearchResults,
) -> Result<(Part, usize), RichSearchError> {
    if text.as_bytes().get(start) == Some(&b'$') {
        return Ok((Part::Dollar, start + 1));
    }
    let (name, end) = if text.as_bytes().get(start) == Some(&b'{') {
        let tail = text.get(start + 1..).ok_or(RichSearchError::Template)?;
        let close = tail.find('}').ok_or(RichSearchError::Template)?;
        (&tail[..close], start + close + 2)
    } else {
        let count = text[start..].bytes().take_while(u8::is_ascii_digit).count();
        (&text[start..start + count], start + count)
    };
    if name.is_empty() {
        return Err(RichSearchError::Template);
    }
    let index = if name.bytes().all(|byte| byte.is_ascii_digit()) {
        name.parse::<usize>().map_err(|_| RichSearchError::Template)?
    } else {
        results.capture_index(name).ok_or(RichSearchError::Template)?
    };
    if index >= results.capture_count() {
        return Err(RichSearchError::Template);
    }
    Ok((Part::Capture(index), end))
}
