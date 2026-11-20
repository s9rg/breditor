//! Optional typed autolink: bounded URL-candidate recognition against the native safe link subset.
//!
//! This is not a linkifier for arbitrary text, HTML or paste. It only inspects
//! the non-whitespace run that ends exactly where an explicitly routed typed
//! boundary (one ASCII space, or an Enter split at the block end) was retained.
//! The resulting target must be admitted unchanged by the same canonical
//! `safeLinkV1` subset that native image links enforce; anything else stays literal.
use super::{RichInputRuleError, RichInputRuleKind, RichInputRuleStep, plan, source::Source};
use crate::{
    position::Affinity,
    rich_content::{
        RichDocument, RichSelection, RichSelectionKind, RichTextPoint, StandardInlineFormatV1,
        image_link::is_canonical_href,
    },
    state::EditorContext,
};

/// One recognized autolink candidate, relative to the inspected text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichAutolinkCandidate {
    start: usize,
    end: usize,
    href: String,
}

impl RichAutolinkCandidate {
    /// Inclusive UTF-8 byte start of the linked characters in the inspected text.
    #[must_use]
    pub const fn start(&self) -> usize {
        self.start
    }
    /// Exclusive UTF-8 byte end; excluded trailing punctuation follows it.
    #[must_use]
    pub const fn end(&self) -> usize {
        self.end
    }
    /// Admitted canonical target stored in the link format.
    #[must_use]
    pub fn href(&self) -> &str {
        &self.href
    }
}

/// Characters that may open a candidate inside a run without belonging to it.
const OPENERS: &[char] = &['(', '[', '{', '<', '"', '\''];
/// Trailing characters that never end a typed URL (prose punctuation).
const TRAILING: &[char] = &['.', ',', ':', ';', '!', '?', '\'', '"', '*', '_', '~', '>'];

/// Recognize the URL candidate that ends exactly at the end of `text`.
///
/// `text` is the inspected prefix before the typed boundary. The candidate is
/// the final whitespace-free run, after leading opening punctuation, that starts
/// with `https://`, `http://` or `www.` (lowercase). Trailing prose punctuation
/// and unbalanced closing `)`, `]` or `}` are excluded. A `www.` candidate
/// targets `https://www.…`; a missing path is serialized as `/`. The target must
/// then be an already canonical, credential-free, ASCII HTTP(S) URL of at most
/// 2,048 bytes, exactly as the native safe link subset admits it. Other
/// schemes (`javascript:`, `data:`, `mailto:`…), non-ASCII text, uppercase
/// hosts, default ports and other non-canonical spellings stay literal.
#[must_use]
pub fn rich_autolink_candidate(text: &str) -> Option<RichAutolinkCandidate> {
    let run_start = text
        .rfind(char::is_whitespace)
        .map_or(0, |i| i + text[i..].chars().next().map_or(1, char::len_utf8));
    let mut start = run_start;
    while let Some(c) = text[start..].chars().next().filter(|c| OPENERS.contains(c)) {
        start += c.len_utf8();
    }
    let run = &text[start..];
    let www = run.starts_with("www.");
    if !(www || run.starts_with("https://") || run.starts_with("http://")) {
        return None;
    }
    let mut url = run;
    loop {
        let last = url.chars().next_back()?;
        let unbalanced = |open: char, close: char| {
            last == close && url.matches(open).count() < url.matches(close).count()
        };
        if TRAILING.contains(&last)
            || unbalanced('(', ')')
            || unbalanced('[', ']')
            || unbalanced('{', '}')
        {
            url = &url[..url.len() - last.len_utf8()];
        } else {
            break;
        }
    }
    // Stripping can never leave only a scheme or bare "www" prefix behind.
    let body = ["https://", "http://", "www."].iter().find_map(|p| url.strip_prefix(p));
    if !url.is_ascii() || body.is_none_or(str::is_empty) {
        return None;
    }
    let mut href = if www { format!("https://{url}") } else { url.to_owned() };
    // WHATWG serializes a special URL with an empty path as "/". This is the only repair.
    let scheme = href.find("://").map_or(0, |i| i + 3);
    let authority = href[scheme..].find(['/', '?', '#']).map_or(href.len(), |i| scheme + i);
    if !href[authority..].starts_with('/') {
        href.insert(authority, '/');
    }
    if !is_canonical_href(&href) {
        return None;
    }
    Some(RichAutolinkCandidate { start, end: start + url.len(), href })
}

/// Plan an explicitly selected typed autolink after the retained boundary.
///
/// `end` is the exclusive end of the candidate in its block. A space boundary
/// requires the current collapsed caret immediately after a retained ASCII space
/// at `end`; an Enter boundary requires `end` to be the end of its block.
pub(super) fn plan(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    paragraph_end: Option<&RichTextPoint>,
) -> Result<Option<plan::RichInputRulePlan>, RichInputRuleError> {
    let Some(selection) = selection else {
        return Ok(None);
    };
    selection.resolve(document).map_err(|_| RichInputRuleError::Selection)?;
    let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
        return Ok(None);
    };
    if anchor.block() != focus.block() || anchor.offset() != focus.offset() {
        return Ok(None);
    }
    let link = StandardInlineFormatV1::Link.kind();
    if context.schema().inline_format_property_contract(&link).is_none() {
        return Ok(None);
    }
    let (point, source) = if let Some(end) = paragraph_end {
        let source = Source::read(document, end)?;
        if source.caret != source.length {
            return Ok(None);
        }
        (end, source)
    } else {
        let source = Source::read(document, focus)?;
        if !source.prefix.ends_with(' ') {
            return Ok(None);
        }
        (focus, source)
    };
    if source.node.kind().as_str() == "breditor/code-block" {
        return Ok(None);
    }
    let text = if paragraph_end.is_some() {
        source.prefix.as_str()
    } else {
        &source.prefix[..source.prefix.len() - 1]
    };
    let Some(found) = rich_autolink_candidate(text) else {
        return Ok(None);
    };
    // A candidate touching a truncated recognition window floor is never invented.
    if found.start == 0 && source.start != 0 {
        return Ok(None);
    }
    let start = source.offset(found.start)?;
    let end = source.offset(found.end)?;
    if source.inside_inert_inline(start.get(), end.get()) {
        return Ok(None);
    }
    let caret = RichTextPoint::new(focus.block().clone(), focus.offset(), Affinity::After);
    plan::RichInputRulePlan::build(
        context,
        document,
        RichInputRuleKind::Link,
        point.block().clone(),
        vec![RichInputRuleStep::Link { start, end, href: found.href }],
        caret,
    )
    .map(Some)
}

#[cfg(test)]
mod tests {
    use super::rich_autolink_candidate;

    fn linked(text: &str) -> Option<(&str, String)> {
        rich_autolink_candidate(text).map(|c| (&text[c.start()..c.end()], c.href().to_owned()))
    }

    #[test]
    fn accepts_canonical_candidates_and_excludes_trailing_punctuation() {
        for (text, run, href) in [
            ("https://example.com", "https://example.com", "https://example.com/"),
            (
                "see https://example.com/a?b=c#d",
                "https://example.com/a?b=c#d",
                "https://example.com/a?b=c#d",
            ),
            ("http://localhost:8080/x", "http://localhost:8080/x", "http://localhost:8080/x"),
            ("www.example.com", "www.example.com", "https://www.example.com/"),
            ("https://example.com.", "https://example.com", "https://example.com/"),
            ("https://example.com/a,", "https://example.com/a", "https://example.com/a"),
            ("(https://example.com)", "https://example.com", "https://example.com/"),
            (
                "https://en.example.org/wiki/A_(b)",
                "https://en.example.org/wiki/A_(b)",
                "https://en.example.org/wiki/A_(b)",
            ),
            (
                "https://en.example.org/wiki/A_(b)).",
                "https://en.example.org/wiki/A_(b)",
                "https://en.example.org/wiki/A_(b)",
            ),
            ("<https://example.com/>", "https://example.com/", "https://example.com/"),
            ("\"https://example.com/\"!?", "https://example.com/", "https://example.com/"),
            ("猫 https://example.com", "https://example.com", "https://example.com/"),
            ("https://example.com?q", "https://example.com?q", "https://example.com/?q"),
        ] {
            assert_eq!(linked(text), Some((run, href.to_owned())), "{text}");
        }
    }

    #[test]
    fn rejects_unsafe_or_non_canonical_candidates() {
        let long = format!("https://example.com/{}", "a".repeat(2048));
        for text in [
            "",
            "example.com",
            "javascript:alert(1)",
            "data:text/html,x",
            "mailto:a@example.com",
            "ftp://example.com/",
            "xhttps://example.com",
            "HTTPS://example.com/",
            "https://Example.com/",
            "https://user:pw@example.com/",
            "https://example.com:443/",
            "https://example.com/ü",
            "https://例え.jp/",
            "https://example.com/a\\b",
            "https://example.com/a<b",
            "https://",
            "https://.",
            "www.",
            "www..",
            "https://example.com/ www.",
            "http:///example.com",
            "https://example.com/%zz",
            "https://example.com/a/../b",
            long.as_str(),
        ] {
            assert_eq!(linked(text), None, "{text}");
        }
    }
}
