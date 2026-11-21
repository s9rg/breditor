//! Durable mention entities of the explicit rich V4.
//!
//! A mention is one native valued inline format, `breditor/mention`, over the
//! exact text `@` + label. It carries a stable host entity reference: a closed
//! kind token, a bounded opaque id and the display label captured at insertion.
//! The id (with its kind) is the durable identity; the label is a snapshot that
//! a host may re-resolve for display, while static output and export use the
//! stored label.
//!
//! Text blocks contain only text runs, so a mention is not a separate inline
//! node. Atomicity is instead a sealed V4 law plus native editing rules:
//!
//! - **Immutability law (admission).** Every maximal contiguous stretch of
//!   characters carrying one equal mention format is one or more whole copies of
//!   `@` + label. Other formats may vary inside it (a bold half is still the same
//!   mention), but a partial edit of the text is never admitted.
//! - **Selection snapping.** Every admitted text selection is snapped to mention
//!   boundaries: a caret inside a mention moves to its nearest edge and a range
//!   endpoint inside one expands outward, so deleting, replacing or formatting
//!   always covers whole mentions (Backspace after a mention deletes it whole).
//! - **No inheritance.** Effective caret formats never include a mention, so
//!   typing next to a mention produces plain text.
//! - **Search** never reports a match that intersects a mention.
use crate::{
    document::{ElementNode, Format, FormatSet, NodeRef, PropertyMap, PropertyValue},
    identity::QualifiedName,
    position::TextOffset,
};

use super::{RichDocument, RichSelectionKind, RichTextPoint};

/// Native inline format kind (rich V4 only).
pub const RICH_MENTION_FORMAT: &str = "breditor/mention";
/// Required closed entity kind token (`user`, `page` or `tag`).
pub const RICH_MENTION_KIND_PROPERTY: &str = "breditor/mention-kind";
/// Required bounded opaque host entity id.
pub const RICH_MENTION_ID_PROPERTY: &str = "breditor/mention-id";
/// Required display label snapshot captured at insertion (without the `@`).
pub const RICH_MENTION_LABEL_PROPERTY: &str = "breditor/mention-label";
/// Prefix of every mention's text; the text is exactly this plus the label.
pub const RICH_MENTION_PREFIX: char = '@';
/// Inclusive maximum UTF-8 bytes of an id (minimum 1).
pub const RICH_MENTION_ID_MAX_BYTES: u32 = 128;
/// Inclusive maximum UTF-8 bytes of a label (minimum 1).
pub const RICH_MENTION_LABEL_MAX_BYTES: u32 = 256;
/// Declared byte bounds of the kind token (`tag` to `user`/`page`).
pub(crate) const KIND_MIN_BYTES: u32 = 3;
pub(crate) const KIND_MAX_BYTES: u32 = 4;

/// Payload-free mention admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichMentionError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("mentions require the explicit rich V4 profile")]
    Profile,
    /// A mention replaces text inside one paragraph, heading or section summary only.
    #[error("a mention requires a range inside one paragraph, heading or section summary")]
    Target,
    /// The kind is not one of the closed tokens.
    #[error("invalid mention kind")]
    Kind,
    /// The id is empty, too long or outside its strict charset.
    #[error("invalid mention id")]
    Id,
    /// The label is empty, too long, padded or contains a control character.
    #[error("invalid mention label")]
    Label,
    /// The format literal has the wrong kind or a missing/extra/ill-typed property.
    #[error("invalid mention format")]
    Value,
}

/// Closed entity kinds of a V4 mention.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum RichMentionKind {
    /// A person or account.
    User,
    /// A page or document.
    Page,
    /// A tag, topic or label.
    Tag,
}

impl RichMentionKind {
    /// Stable stored token.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Page => "page",
            Self::Tag => "tag",
        }
    }
    /// Parse one exact lowercase token.
    /// # Errors
    /// Rejects anything but `user`, `page` and `tag`.
    pub fn parse(value: &str) -> Result<Self, RichMentionError> {
        match value {
            "user" => Ok(Self::User),
            "page" => Ok(Self::Page),
            "tag" => Ok(Self::Tag),
            _ => Err(RichMentionError::Kind),
        }
    }
}

/// One admitted opaque entity id: `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RichMentionId(Box<str>);

impl RichMentionId {
    /// Admit one exact id; no case folding or trimming is performed.
    /// # Errors
    /// Rejects empty, over-long and out-of-charset values.
    pub fn try_new(value: &str) -> Result<Self, RichMentionError> {
        if is_valid_id(value) { Ok(Self(value.into())) } else { Err(RichMentionError::Id) }
    }
    /// Stored id text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One admitted display label snapshot (stored without the `@` prefix).
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RichMentionLabel(Box<str>);

impl RichMentionLabel {
    /// Admit one exact label; no trimming or normalization is performed.
    /// # Errors
    /// Rejects empty or over-long labels, leading/trailing whitespace, control
    /// characters, line/paragraph separators and bidirectional embedding,
    /// override and isolate controls.
    pub fn try_new(value: &str) -> Result<Self, RichMentionError> {
        if is_valid_label(value) { Ok(Self(value.into())) } else { Err(RichMentionError::Label) }
    }
    /// Stored label text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One complete admitted mention entity reference.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RichMention {
    kind: RichMentionKind,
    id: RichMentionId,
    label: RichMentionLabel,
}

impl RichMention {
    /// Combine checked parts.
    #[must_use]
    pub const fn new(kind: RichMentionKind, id: RichMentionId, label: RichMentionLabel) -> Self {
        Self { kind, id, label }
    }
    /// Closed entity kind.
    #[must_use]
    pub const fn kind(&self) -> RichMentionKind {
        self.kind
    }
    /// Durable host identity (with the kind).
    #[must_use]
    pub const fn id(&self) -> &RichMentionId {
        &self.id
    }
    /// Display snapshot captured at insertion.
    #[must_use]
    pub const fn label(&self) -> &RichMentionLabel {
        &self.label
    }
    /// The exact document text of one mention: `@` + label.
    #[must_use]
    pub fn text(&self) -> String {
        let mut text = String::with_capacity(self.label.0.len() + 1);
        text.push(RICH_MENTION_PREFIX);
        text.push_str(&self.label.0);
        text
    }
    /// Native format kind.
    #[must_use]
    pub fn format_kind() -> QualifiedName {
        QualifiedName::from_known_static(RICH_MENTION_FORMAT)
    }
    /// Complete native format literal carrying this entity reference.
    #[must_use]
    pub fn format(&self) -> Format {
        let property = |name: &'static str, value: &str| {
            (QualifiedName::from_known_static(name), PropertyValue::from_string(value))
        };
        // Sorted by name: id < kind < label.
        let properties = PropertyMap::try_from_sorted(vec![
            property(RICH_MENTION_ID_PROPERTY, self.id.as_str()),
            property(RICH_MENTION_KIND_PROPERTY, self.kind.as_str()),
            property(RICH_MENTION_LABEL_PROPERTY, self.label.as_str()),
        ])
        .unwrap_or_else(|_| unreachable!("three sorted properties"));
        Format::new(Self::format_kind(), properties)
    }
    /// Read the strict entity reference of one `breditor/mention` format.
    /// # Errors
    /// Rejects another kind, a missing/extra/ill-typed property or an invalid value.
    pub fn from_format(format: &Format) -> Result<Self, RichMentionError> {
        if format.kind().as_str() != RICH_MENTION_FORMAT || format.properties().len() != 3 {
            return Err(RichMentionError::Value);
        }
        let read = |name: &'static str| {
            format
                .properties()
                .get(&QualifiedName::from_known_static(name))
                .and_then(PropertyValue::as_string)
                .ok_or(RichMentionError::Value)
        };
        Ok(Self {
            kind: RichMentionKind::parse(read(RICH_MENTION_KIND_PROPERTY)?)?,
            id: RichMentionId::try_new(read(RICH_MENTION_ID_PROPERTY)?)?,
            label: RichMentionLabel::try_new(read(RICH_MENTION_LABEL_PROPERTY)?)?,
        })
    }
}

fn is_valid_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= RICH_MENTION_ID_MAX_BYTES as usize
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

/// Characters a label never contains.
fn forbidden(character: char) -> bool {
    character.is_control()
        || matches!(character, '\u{2028}' | '\u{2029}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

fn is_valid_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= RICH_MENTION_LABEL_MAX_BYTES as usize
        && !value.starts_with(char::is_whitespace)
        && !value.ends_with(char::is_whitespace)
        && !value.chars().any(forbidden)
}

/// Whether one format is a mention (any value).
pub(crate) fn is_mention(format: &Format) -> bool {
    format.kind().as_str() == RICH_MENTION_FORMAT
}

/// The same set without any mention format; typing never inherits a mention.
pub(crate) fn without_mentions(formats: &FormatSet) -> FormatSet {
    if !formats.iter().any(is_mention) {
        return formats.clone();
    }
    FormatSet::try_from_formats(
        formats.iter().filter(|format| !is_mention(format)).cloned().collect(),
    )
    .unwrap_or_else(|_| unreachable!("a subsequence of a canonical set stays canonical"))
}

/// `base` without mentions, plus one mention format, in canonical order.
pub(crate) fn with_mention(base: &FormatSet, mention: &RichMention) -> FormatSet {
    let mut formats: Vec<Format> =
        base.iter().filter(|format| !is_mention(format)).cloned().collect();
    formats.push(mention.format());
    formats.sort_by(|left, right| left.kind().cmp(right.kind()));
    FormatSet::try_from_formats(formats)
        .unwrap_or_else(|_| unreachable!("distinct kinds sorted canonically"))
}

/// Per-format value law (the declared contract supplies presence and byte bounds).
pub(crate) fn validate_format(format: &Format) -> Result<(), &'static str> {
    match RichMention::from_format(format) {
        Ok(_) => Ok(()),
        Err(RichMentionError::Kind) => Err("mention kind is not user, page or tag"),
        Err(RichMentionError::Id) => Err("mention id is outside its bounded charset"),
        Err(RichMentionError::Label) => Err("mention label is not a bounded plain label"),
        Err(_) => Err("invalid mention format"),
    }
}

/// One maximal stretch of text children carrying one equal mention format.
struct Segment<'a> {
    format: &'a Format,
    text: String,
    start_utf16: u64,
    start_byte: usize,
}

/// Visit every mention segment of one text block, in order.
fn segments<'a>(node: &'a ElementNode, mut visit: impl FnMut(&Segment<'a>)) {
    let mut current: Option<Segment<'a>> = None;
    let mut utf16 = 0u64;
    let mut bytes = 0usize;
    for text in node.children().iter().filter_map(NodeRef::as_text) {
        let mention = text.formats().iter().find(|format| is_mention(format));
        let continues = matches!(
            (&current, mention),
            (Some(segment), Some(format)) if segment.format == format
        );
        if continues {
            if let Some(segment) = current.as_mut() {
                segment.text.push_str(text.text());
            }
        } else {
            if let Some(segment) = current.take() {
                visit(&segment);
            }
            current = mention.map(|format| Segment {
                format,
                text: text.text().to_owned(),
                start_utf16: utf16,
                start_byte: bytes,
            });
        }
        utf16 += u64::from(text.utf16_len());
        bytes += text.text().len();
    }
    if let Some(segment) = current.take() {
        visit(&segment);
    }
}

/// Number of whole `@label` units a segment holds, if it holds only whole units.
fn whole_units(segment: &Segment<'_>) -> Option<usize> {
    let mention = RichMention::from_format(segment.format).ok()?;
    let unit = mention.text();
    let count = segment.text.len() / unit.len();
    (count >= 1
        && segment.text.len().is_multiple_of(unit.len())
        && segment.text == unit.repeat(count))
    .then_some(count)
}

/// Complete-tree immutability law for one text block's children.
pub(crate) fn validate_segments(node: &ElementNode) -> Result<(), &'static str> {
    let mut valid = true;
    segments(node, |segment| valid &= whole_units(segment).is_some());
    if valid { Ok(()) } else { Err("mention text must be whole copies of @ plus its label") }
}

/// Atomic mention units of one text block as `[start, end)` coordinates.
fn units(node: &ElementNode, utf16: bool) -> Vec<(u64, u64)> {
    let mut result = Vec::new();
    segments(node, |segment| {
        let (Some(count), Ok(mention)) =
            (whole_units(segment), RichMention::from_format(segment.format))
        else {
            return;
        };
        let text = mention.text();
        let wide = |value: usize| u64::try_from(value).unwrap_or(u64::MAX);
        let (start, width) = if utf16 {
            (segment.start_utf16, wide(text.encode_utf16().count()))
        } else {
            (wide(segment.start_byte), wide(text.len()))
        };
        let mut cursor = start;
        for _ in 0..count {
            let end = cursor.saturating_add(width);
            result.push((cursor, end));
            cursor = end;
        }
    });
    result
}

/// Byte ranges of every mention unit in one block's concatenated text (search protection).
pub(crate) fn byte_units(document: &RichDocument, block: &super::BlockId) -> Vec<(usize, usize)> {
    document
        .block_path(block)
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .map(|node| units(node, false))
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(start, end)| Some((usize::try_from(start).ok()?, usize::try_from(end).ok()?)))
        .collect()
}

/// Whether `[start, end)` (or an empty match strictly inside a unit) touches a mention.
pub(crate) fn intersects(units: &[(usize, usize)], start: usize, end: usize) -> bool {
    units.iter().any(|&(unit_start, unit_end)| start < unit_end && end > unit_start)
}

fn block_units(document: &RichDocument, point: &RichTextPoint) -> Vec<(u64, u64)> {
    document
        .block_path(point.block())
        .and_then(|path| document.document().node_at(path).ok())
        .and_then(NodeRef::as_element)
        .map(|node| units(node, true))
        .unwrap_or_default()
}

#[derive(Clone, Copy)]
enum Snap {
    Nearest,
    Down,
    Up,
}

fn snap_point(point: &RichTextPoint, units: &[(u64, u64)], snap: Snap) -> RichTextPoint {
    let offset = point.offset().get();
    let Some(&(start, end)) = units.iter().find(|(start, end)| *start < offset && offset < *end)
    else {
        return point.clone();
    };
    let target = match snap {
        Snap::Down => start,
        Snap::Up => end,
        Snap::Nearest => {
            if offset - start < end - offset {
                start
            } else {
                end
            }
        }
    };
    TextOffset::try_new(target).map_or_else(
        |_| point.clone(),
        |offset| RichTextPoint::new(point.block().clone(), offset, point.affinity()),
    )
}

/// Snap text endpoints out of mentions: a caret moves to the nearest edge and a
/// range expands outward so it always covers whole mentions. Direction is kept.
/// Documents without mentions (every V1–V3 document) are returned unchanged.
pub(crate) fn snap_selection(
    document: &RichDocument,
    kind: RichSelectionKind,
) -> RichSelectionKind {
    let RichSelectionKind::TextRange { anchor, focus } = &kind else {
        return kind;
    };
    let anchor_units = block_units(document, anchor);
    let same_block = anchor.block() == focus.block();
    let focus_units = if same_block { anchor_units.clone() } else { block_units(document, focus) };
    if anchor_units.is_empty() && focus_units.is_empty() {
        return kind;
    }
    if same_block && anchor.offset() == focus.offset() {
        let caret = snap_point(focus, &focus_units, Snap::Nearest);
        return RichSelectionKind::TextRange { anchor: caret.clone(), focus: caret };
    }
    let anchor_first = if same_block {
        anchor.offset() < focus.offset()
    } else {
        document.block_path(anchor.block()) <= document.block_path(focus.block())
    };
    let (anchor_snap, focus_snap) =
        if anchor_first { (Snap::Down, Snap::Up) } else { (Snap::Up, Snap::Down) };
    RichSelectionKind::TextRange {
        anchor: snap_point(anchor, &anchor_units, anchor_snap),
        focus: snap_point(focus, &focus_units, focus_snap),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_domains_accept_and_reject_exactly() {
        for good in ["user", "page", "tag"] {
            assert_eq!(RichMentionKind::parse(good).map(RichMentionKind::as_str), Ok(good));
        }
        for bad in ["", "User", "USER", "users", "team", " user", "group"] {
            assert_eq!(RichMentionKind::parse(bad), Err(RichMentionError::Kind), "{bad}");
        }
        let longest = "a".repeat(128);
        for good in ["a", "0", "u-1", "A.b_c:d-e", longest.as_str()] {
            assert!(RichMentionId::try_new(good).is_ok(), "{good}");
        }
        let over = "a".repeat(129);
        for bad in ["", "-a", ".a", "a b", "a/b", "a@b", "é", "a\u{0}", over.as_str()] {
            assert_eq!(RichMentionId::try_new(bad), Err(RichMentionError::Id), "{bad}");
        }
        let widest = "é".repeat(128);
        for good in ["Ann", "Ann Lee", "Zoë", "@twice", "日本", "a", widest.as_str()] {
            assert!(RichMentionLabel::try_new(good).is_ok(), "{good}");
        }
        let wider = format!("{widest}a");
        for bad in [
            "",
            " Ann",
            "Ann ",
            "\u{a0}Ann",
            "An\nn",
            "An\tn",
            "A\u{7f}",
            "A\u{85}",
            "A\u{2028}",
            "A\u{2029}",
            "A\u{202E}",
            "A\u{2067}",
            wider.as_str(),
        ] {
            assert_eq!(RichMentionLabel::try_new(bad), Err(RichMentionError::Label), "{bad:?}");
        }
    }

    #[test]
    fn format_literal_round_trips_and_text_is_prefix_plus_label() -> Result<(), RichMentionError> {
        let mention = RichMention::new(
            RichMentionKind::User,
            RichMentionId::try_new("u-1")?,
            RichMentionLabel::try_new("Ann Lee")?,
        );
        assert_eq!(mention.text(), "@Ann Lee");
        assert_eq!(RichMention::from_format(&mention.format())?, mention);
        assert_eq!(validate_format(&mention.format()), Ok(()));
        Ok(())
    }
}
