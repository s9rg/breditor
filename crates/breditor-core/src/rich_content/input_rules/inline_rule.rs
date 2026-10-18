//! Bounded literal delimiter recognition, with scalar-safe positions and explicit escape/boundary rules.
use super::{RichInputRuleError, source::Source};
use crate::{position::TextOffset, rich_content::StandardInlineFormatV1};

pub(super) struct Inline {
    pub start: TextOffset,
    pub content: TextOffset,
    pub closing: TextOffset,
    pub format: StandardInlineFormatV1,
}
fn escaped(text: &str, at: usize) -> bool {
    text.as_bytes()[..at].iter().rev().take_while(|b| **b == b'\\').count() % 2 == 1
}
pub(super) fn recognize(
    source: &Source<'_>,
    trigger: &str,
) -> Result<Option<Inline>, RichInputRuleError> {
    use StandardInlineFormatV1 as F;
    for (marker, format) in [
        ("**", F::Strong),
        ("__", F::Strong),
        ("~~", F::Strike),
        ("`", F::Code),
        ("*", F::Italic),
        ("_", F::Italic),
    ] {
        if !marker.ends_with(trigger) || !source.prefix.ends_with(marker) {
            continue;
        }
        let closing = source.prefix.len() - marker.len();
        if escaped(&source.prefix, closing) {
            continue;
        }
        let before = &source.prefix[..closing];
        for (start, _) in before.rmatch_indices(marker) {
            let content = start + marker.len();
            if content >= closing || escaped(&source.prefix, start) {
                continue;
            }
            let prior = source.prefix[..start].chars().next_back();
            if start == 0 && source.start != 0
                || prior.is_some_and(|c| {
                    !(c.is_whitespace() || c.is_ascii_punctuation()) || marker.contains(c)
                })
            {
                continue;
            }
            let text = &source.prefix[content..closing];
            if text.starts_with(char::is_whitespace)
                || text.ends_with(char::is_whitespace)
                || text.starts_with(|c| marker.contains(c))
                || text.ends_with(|c| marker.contains(c))
                || text.contains(['\n', '\r'])
                || text.contains(marker)
            {
                continue;
            }
            let start = source.offset(start)?;
            let content = source.offset(content)?;
            let closing = source.offset(closing)?;
            if source.inside_inert_inline(start.get(), source.caret) {
                continue;
            }
            return Ok(Some(Inline { start, content, closing, format }));
        }
    }
    Ok(None)
}
