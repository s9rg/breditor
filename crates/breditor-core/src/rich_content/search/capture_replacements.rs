//! Admit complete original-coordinate semantic splices without replaying search syntax.
use super::{
    RICH_SEARCH_MAX_INSERTED_BYTES, RICH_SEARCH_MAX_MATCHES, RICH_SEARCH_MAX_TEXT_BYTES,
    RichSearchError, RichSearchReplacePlan, RichSearchTextEdit, RichSearchTextReplacement, domains,
    replacement_plan::Domain,
};
use crate::{
    document::{TextFragment, TextRun},
    position::TextOffset,
    rich_content::RichDocument,
};

impl RichSearchReplacePlan {
    /// Re-admit captured semantic intervals for exact native history replay.
    ///
    /// Targets must follow visible semantic domain order and non-overlapping
    /// original scalar-aligned offsets. Formatting is derived from the retained
    /// source, never accepted from serialized caller markup. This checked
    /// constructor does not prove query completeness or grant writer authority:
    /// a shared journal must separately bind its exact source and replay effects.
    /// # Errors
    /// Rejects traversal/insertion limits, hidden/foreign/missing targets, reversed
    /// ordering, overlap and half-surrogate coordinates without returning a prefix.
    pub fn try_from_semantic_replacements(
        document: &RichDocument,
        replacements: &[RichSearchTextReplacement],
    ) -> Result<Self, RichSearchError> {
        if replacements.len() > RICH_SEARCH_MAX_MATCHES {
            return Err(RichSearchError::MatchLimit);
        }
        let mut plan = Self {
            source: document.clone(),
            edits: Vec::new(),
            selected_matches: replacements.len(),
            inserted_bytes: 0,
        };
        if replacements.is_empty() {
            return Ok(plan);
        }
        let mut next = 0;
        let mut text_bytes = 0;
        for block in domains::domains(document)? {
            let text = domains::text(document, &block, RICH_SEARCH_MAX_TEXT_BYTES - text_bytes)?;
            text_bytes += text.len();
            if replacements.get(next).is_none_or(|replacement| replacement.block != block) {
                continue;
            }
            let domain = Domain::from_text(document, &block, text)?;
            let mut cursor = Coordinates::default();
            let mut previous: Option<(TextOffset, TextOffset)> = None;
            while let Some(replacement) =
                replacements.get(next).filter(|replacement| replacement.block == block)
            {
                if previous.is_some_and(|(start, end)| {
                    replacement.start < end
                        || (replacement.start == end
                            && (start == end || replacement.start == replacement.end))
                }) {
                    return Err(RichSearchError::ReplacementTarget);
                }
                let start = cursor.byte_at(&domain.text, replacement.start)?;
                let end = cursor.byte_at(&domain.text, replacement.end)?;
                previous = Some((replacement.start, replacement.end));
                next += 1;
                if domain.text.get(start..end) == Some(replacement.text.as_str()) {
                    continue;
                }
                plan.inserted_bytes = plan
                    .inserted_bytes
                    .checked_add(replacement.text.len())
                    .ok_or(RichSearchError::ReplacementLimit)?;
                if plan.inserted_bytes > RICH_SEARCH_MAX_INSERTED_BYTES {
                    return Err(RichSearchError::ReplacementLimit);
                }
                let inserted = if replacement.text.is_empty() {
                    TextFragment::empty()
                } else {
                    TextRun::try_new(&replacement.text, domain.formats(start))
                        .map(TextFragment::from)
                        .map_err(|_| RichSearchError::ReplacementLimit)?
                };
                plan.edits.push(RichSearchTextEdit {
                    block: block.clone(),
                    start: replacement.start,
                    end: replacement.end,
                    bytes: start..end,
                    inserted,
                });
            }
        }
        if next != replacements.len() {
            return Err(RichSearchError::ReplacementTarget);
        }
        Ok(plan)
    }
}

#[derive(Default)]
struct Coordinates {
    byte: usize,
    utf16: u64,
}
impl Coordinates {
    fn byte_at(&mut self, text: &str, offset: TextOffset) -> Result<usize, RichSearchError> {
        if offset.get() < self.utf16 {
            return Err(RichSearchError::ReplacementTarget);
        }
        while self.utf16 < offset.get() {
            let scalar = text
                .get(self.byte..)
                .and_then(|tail| tail.chars().next())
                .ok_or(RichSearchError::ReplacementTarget)?;
            let end = self.utf16
                + u64::try_from(scalar.len_utf16()).map_err(|_| RichSearchError::Invariant)?;
            if end > offset.get() {
                return Err(RichSearchError::ReplacementTarget);
            }
            self.utf16 = end;
            self.byte += scalar.len_utf8();
        }
        Ok(self.byte)
    }
}
