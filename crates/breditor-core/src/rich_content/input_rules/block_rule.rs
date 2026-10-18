//! Anchored block shortcuts: no indentation stripping, guessed ordinal or formatted-code loss.
use super::{RichInputRuleKind, source::Source};
use crate::{
    block::OrderedListStart,
    rich_content::{CodeLanguage, RichListKind},
};

pub(super) fn recognize(source: &Source<'_>) -> Option<RichInputRuleKind> {
    if source.start != 0 || source.node.kind().as_str() != "breditor/paragraph" {
        return None;
    }
    let marker = source.prefix.strip_suffix(' ')?;
    if (1..=6).contains(&marker.len()) && marker.bytes().all(|b| b == b'#') {
        return Some(RichInputRuleKind::Heading(u8::try_from(marker.len()).ok()?));
    }
    match marker {
        "-" | "+" | "*" => return Some(RichInputRuleKind::List(RichListKind::Bullet)),
        ">" => return Some(RichInputRuleKind::Blockquote),
        "[ ]" => return Some(RichInputRuleKind::Task(false)),
        "[x]" | "[X]" => return Some(RichInputRuleKind::Task(true)),
        "---" | "***" | "___" if source.caret == source.length => {
            return Some(RichInputRuleKind::HorizontalRule);
        }
        _ => {}
    }
    if let Some(language) = marker.strip_prefix("```") {
        let language =
            if language.is_empty() { None } else { Some(CodeLanguage::try_new(language).ok()?) };
        return Some(RichInputRuleKind::Code(language));
    }
    let ordinal = marker.strip_suffix('.').or_else(|| marker.strip_suffix(')'))?;
    if ordinal.is_empty()
        || ordinal.starts_with('0')
        || !ordinal.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    Some(RichInputRuleKind::List(RichListKind::Ordered(
        OrderedListStart::try_new(ordinal.parse().ok()?).ok()?,
    )))
}
