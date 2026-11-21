//! Optional typographic replacements (`typography-v1`): bounded suffix recognition only.
//!
//! The typed trigger is retained first through ordinary typing. A match then
//! replaces only the recognized characters (never the trailing space of a
//! delimited rule) with one isolated native group, so one Undo restores exactly
//! what was typed. Code blocks and inline code never convert.
use super::{
    RichInputRuleError, RichInputRuleKind, RichInputRuleStep, RichTypographyConfig,
    RichTypographyRule, plan, source::Source,
};
use crate::{
    document::FormatSet,
    position::{Affinity, TextOffset},
    rich_content::{RichDocument, RichSelection, RichSelectionKind, RichTextPoint},
    state::EditorContext,
};

/// One recognized replacement, relative to the inspected text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichTypographyMatch {
    rule: RichTypographyRule,
    start: usize,
    end: usize,
    replacement: String,
}

impl RichTypographyMatch {
    /// Matched rule.
    #[must_use]
    pub const fn rule(&self) -> RichTypographyRule {
        self.rule
    }
    /// Inclusive UTF-8 byte start of the replaced characters.
    #[must_use]
    pub const fn start(&self) -> usize {
        self.start
    }
    /// Exclusive UTF-8 byte end of the replaced characters (a delimiting space follows it).
    #[must_use]
    pub const fn end(&self) -> usize {
        self.end
    }
    /// Replacement text.
    #[must_use]
    pub fn replacement(&self) -> &str {
        &self.replacement
    }
}

enum Pattern {
    /// Replace the suffix as soon as its last character is typed.
    Literal(&'static str, &'static str),
    /// Replace a whitespace/block-start delimited word when the following space is typed.
    Word(&'static str, &'static str),
    /// Contextual quote: `true` for double.
    Quote(bool),
}

const fn pattern(rule: RichTypographyRule) -> Pattern {
    use Pattern::{Literal, Quote, Word};
    use RichTypographyRule as R;
    match rule {
        R::Ellipsis => Literal("...", "…"),
        R::EnDash => Word("--", "–"),
        R::EmDash => Word("---", "—"),
        R::QuotesPrimary => Quote(true),
        R::QuotesSecondary => Quote(false),
        R::Copyright => Literal("(c)", "©"),
        R::RegisteredTrademark => Literal("(r)", "®"),
        R::Trademark => Literal("(tm)", "™"),
        R::OneHalf => Word("1/2", "½"),
        R::OneThird => Word("1/3", "⅓"),
        R::TwoThirds => Word("2/3", "⅔"),
        R::OneQuarter => Word("1/4", "¼"),
        R::ThreeQuarters => Word("3/4", "¾"),
        R::LessThanOrEqual => Literal("<=", "≤"),
        R::GreaterThanOrEqual => Literal(">=", "≥"),
        R::NotEqual => Literal("!=", "≠"),
        R::ArrowLeft => Word("<-", "←"),
        R::ArrowRight => Word("->", "→"),
        R::Servicemark => Literal("(sm)", "℠"),
        R::PlusMinus => Literal("+/-", "±"),
        R::Laquo => Literal("<<", "«"),
        R::Raquo => Literal(">>", "»"),
        R::SuperscriptTwo => Literal("^2", "²"),
        R::SuperscriptThree => Literal("^3", "³"),
    }
}

/// Whether one complete plain-input event can trigger some `typography-v1` rule.
#[must_use]
pub(super) fn is_trigger(input: &str) -> bool {
    matches!(input, "\"" | "'" | "." | ")" | "=" | "-" | ">" | "<" | " " | "2" | "3")
}

/// Recognize the replacement that ends exactly at the end of `text`.
///
/// `text` is the inspected prefix, ending with the typed trigger. `block_start`
/// says whether `text` begins at the start of its block; otherwise a match that
/// needs to see the character before its first replaced character is not
/// invented at the truncated start.
#[must_use]
pub fn rich_typography_replacement(
    text: &str,
    block_start: bool,
    config: &RichTypographyConfig,
) -> Option<RichTypographyMatch> {
    let last = text.chars().next_back()?;
    for rule in config.rules() {
        let found = match pattern(rule) {
            Pattern::Literal(from, to) => text.ends_with(from).then(|| {
                let start = text.len() - from.len();
                (start, text.len(), to.to_owned())
            }),
            Pattern::Word(from, to) => {
                let body = text.strip_suffix(' ').filter(|b| b.ends_with(from));
                body.and_then(|body| {
                    let start = body.len() - from.len();
                    let delimited = if start == 0 {
                        block_start
                    } else {
                        body[..start].chars().next_back().is_some_and(char::is_whitespace)
                    };
                    delimited.then(|| (start, body.len(), to.to_owned()))
                })
            }
            Pattern::Quote(double) if last == if double { '"' } else { '\'' } => {
                quote(text, block_start, double, config)
            }
            Pattern::Quote(_) => None,
        };
        if let Some((start, end, replacement)) = found {
            return Some(RichTypographyMatch { rule, start, end, replacement });
        }
    }
    None
}

fn quote(
    text: &str,
    block_start: bool,
    double: bool,
    config: &RichTypographyConfig,
) -> Option<(usize, usize, String)> {
    let style = config.quotes();
    let [open, close] = if double { style.double() } else { style.single() };
    let start = text.len() - 1;
    let before = &text[..start];
    let prev = before.chars().next_back();
    if prev.is_none() && !block_start {
        return None;
    }
    // Emphasis/code markers typed before a quote (`*"…"*`) do not decide its side.
    let context = before.trim_end_matches(['*', '_', '~', '`']);
    if context.is_empty() && !block_start {
        return None;
    }
    let opening = context.chars().next_back().is_none_or(|c| {
        c.is_whitespace()
            || matches!(c, '(' | '[' | '{' | '<' | '-' | '/' | '–' | '—')
            || [style.double()[0], style.single()[0]].contains(&c)
    });
    let space = style.space().map(String::from).unwrap_or_default();
    let replacement = if opening {
        format!("{open}{space}")
    } else if !double && prev.is_some_and(char::is_alphanumeric) {
        // An apostrophe inside or after a word, unless it closes an open single quote
        // whose closing character differs from the apostrophe (German, French…).
        let unmatched =
            before.rfind(open).is_some_and(|o| before.rfind(close).is_none_or(|c| c < o));
        if close != '’' && unmatched { format!("{space}{close}") } else { "’".to_owned() }
    } else {
        format!("{space}{close}")
    };
    Some((start, text.len(), replacement))
}

/// Plan an explicitly selected typographic replacement after the retained trigger.
pub(super) fn plan(
    context: &EditorContext,
    document: &RichDocument,
    selection: Option<&RichSelection>,
    trigger: &str,
    config: &RichTypographyConfig,
) -> Result<Option<plan::RichInputRulePlan>, RichInputRuleError> {
    if !is_trigger(trigger) {
        return Ok(None);
    }
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
    let source = Source::read(document, focus)?;
    if source.node.kind().as_str() == "breditor/code-block" || !source.prefix.ends_with(trigger) {
        return Ok(None);
    }
    let Some(found) = rich_typography_replacement(&source.prefix, source.start == 0, config) else {
        return Ok(None);
    };
    // A match whose context touches a truncated recognition window floor is never invented.
    if found.start == 0 && source.start != 0 {
        return Ok(None);
    }
    let start = source.offset(found.start)?;
    let end = source.offset(found.end)?;
    let Some(formats) = run_formats(&source, start.get(), end.get(), source.caret)? else {
        return Ok(None);
    };
    let width = u64::try_from(found.replacement.encode_utf16().count())
        .map_err(|_| RichInputRuleError::Selection)?;
    let caret = TextOffset::try_new(start.get() + width + (source.caret - end.get()))
        .map_err(|_| RichInputRuleError::Selection)?;
    plan::RichInputRulePlan::build(
        context,
        document,
        RichInputRuleKind::Typography(found.rule),
        focus.block().clone(),
        vec![
            RichInputRuleStep::Delete { start, end },
            RichInputRuleStep::Insert { at: start, text: found.replacement, formats },
        ],
        RichTextPoint::new(focus.block().clone(), caret, Affinity::After),
    )
    .map(Some)
}

/// Formats of the last replaced unit (`end - 1`), or `None` when inline code touches `start..caret`.
fn run_formats(
    source: &Source<'_>,
    start: u64,
    end: u64,
    caret: u64,
) -> Result<Option<FormatSet>, RichInputRuleError> {
    let last = end.checked_sub(1).ok_or(RichInputRuleError::Selection)?;
    let mut cursor = 0u64;
    let mut formats = None;
    for node in source.node.children() {
        let text = node.as_text().ok_or(RichInputRuleError::Selection)?;
        let next = cursor + u64::from(text.utf16_len());
        if cursor < caret
            && next > start
            && text.formats().iter().any(|f| f.kind().as_str() == "breditor-inline/code")
        {
            return Ok(None);
        }
        if (cursor..next).contains(&last) {
            formats = Some(text.formats().clone());
        }
        cursor = next;
    }
    formats.map(Some).ok_or(RichInputRuleError::Selection)
}

#[cfg(test)]
mod tests {
    use super::{RichTypographyConfig, rich_typography_replacement};
    use crate::rich_content::{RichQuoteStyle, RichTypographyRule};

    fn replace(text: &str, config: &RichTypographyConfig) -> Option<String> {
        rich_typography_replacement(text, true, config)
            .map(|m| format!("{}{}{}", &text[..m.start()], m.replacement(), &text[m.end()..]))
    }

    #[test]
    fn default_rules_replace_suffixes() {
        let c = RichTypographyConfig::DEFAULT;
        for (typed, result) in [
            ("wait...", "wait…"),
            ("a -- ", "a – "),
            ("a --- ", "a — "),
            ("-- ", "– "),
            ("(c)", "©"),
            ("x (r)", "x ®"),
            ("Brand(tm)", "Brand™"),
            ("1/2 ", "½ "),
            ("add 3/4 ", "add ¾ "),
            ("a <= ", "a <= "),
            ("a <=", "a ≤"),
            ("b >=", "b ≥"),
            ("c !=", "c ≠"),
            ("go -> ", "go → "),
            ("<- ", "← "),
            ("\"", "“"),
            ("say \"", "say “"),
            ("“hi\"", "“hi”"),
            ("'", "‘"),
            ("it'", "it’"),
            ("(\"", "(“"),
            ("end.\"", "end.”"),
        ] {
            assert_eq!(replace(typed, &c).as_deref().unwrap_or(typed), result, "{typed}");
        }
    }

    #[test]
    fn delimiters_and_context_stay_literal() {
        let c = RichTypographyConfig::DEFAULT;
        for typed in ["11/2 ", "1/20", "a--", "x-- ", "a->", "x-> ", "(sm)", "+/-", "^2", "a.."] {
            assert_eq!(replace(typed, &c), None, "{typed}");
        }
        // The character before the first replaced one is unknown at a truncated window floor.
        assert_eq!(rich_typography_replacement("\"", false, &c), None);
        assert_eq!(rich_typography_replacement("-- ", false, &c), None);
        assert!(rich_typography_replacement("...", false, &c).is_some());
    }

    #[test]
    fn misc_group_and_exclusions() -> Result<(), super::super::RichTypographyConfigError> {
        let c = RichTypographyConfig::try_new(Some(&["misc"]), &[], RichQuoteStyle::ENGLISH)?;
        for (typed, result) in
            [("(sm)", "℠"), ("+/-", "±"), ("<<", "«"), (">>", "»"), ("m^2", "m²"), ("m^3", "m³")]
        {
            assert_eq!(replace(typed, &c).as_deref(), Some(result), "{typed}");
        }
        assert_eq!(replace("...", &c), None);
        let c =
            RichTypographyConfig::try_new(None, &["quotes", "ellipsis"], RichQuoteStyle::ENGLISH)?;
        assert!(!c.contains(RichTypographyRule::QuotesPrimary));
        assert_eq!(replace("\"", &c), None);
        assert_eq!(replace("...", &c), None);
        assert_eq!(replace("(c)", &c).as_deref(), Some("©"));
        Ok(())
    }

    #[test]
    fn locale_quotes() -> Result<(), super::super::RichTypographyConfigError> {
        let german = RichTypographyConfig::try_new(None, &[], RichQuoteStyle::GERMAN)?;
        assert_eq!(replace("\"", &german).as_deref(), Some("„"));
        assert_eq!(replace("„Hallo\"", &german).as_deref(), Some("„Hallo“"));
        assert_eq!(replace("'", &german).as_deref(), Some("‚"));
        assert_eq!(replace("‚Wort'", &german).as_deref(), Some("‚Wort‘"));
        assert_eq!(replace("geht's'", &german).as_deref(), Some("geht's’"));
        let french = RichTypographyConfig::try_new(None, &[], RichQuoteStyle::FRENCH)?;
        assert_eq!(replace("dit \"", &french).as_deref(), Some("dit «\u{a0}"));
        assert_eq!(replace("«\u{a0}oui\"", &french).as_deref(), Some("«\u{a0}oui\u{a0}»"));
        assert_eq!(replace("l'", &french).as_deref(), Some("l’"));
        Ok(())
    }
}
