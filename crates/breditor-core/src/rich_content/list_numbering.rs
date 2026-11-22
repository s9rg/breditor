//! Bounded ordered-list numbering of the explicit rich V4.
//!
//! Each ordered list owns its own optional marker style and reversed flag. A
//! nested list never inherits either value from its ancestors, and legal
//! multilevel counters such as `1.2.3` are not part of this language. No value
//! is arbitrary CSS, a DOM attribute or an executable counter style.
use super::{BlockId, RichDocument, RichLayoutChange};
use crate::{
    block::{MAX_ORDERED_LIST_ORDINAL, OrderedListStart},
    document::{ElementNode, NodeRef, PropertyInteger, PropertyValue},
    identity::QualifiedName,
    state::EditorContext,
};

/// AST key of the optional marker style integer code.
pub(crate) const STYLE: &str = "list-style";
/// AST key of the optional reversed flag; only literal `true` is canonical.
pub(crate) const REVERSED: &str = "list-reversed";

/// Payload-free numbering admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichListNumberingError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("list numbering requires the explicit rich V4 profile")]
    Profile,
    /// Numbering belongs only to ordered lists.
    #[error("list numbering requires an ordered list")]
    Target,
    /// A value is outside its closed type, canonical form or inclusive bounds.
    #[error("invalid bounded list numbering value")]
    Value,
    /// An all-keep request is not an edit intent.
    #[error("list numbering patch must change at least one field")]
    EmptyPatch,
}

/// Closed ordered-list marker family, encoded durably as integers 1 through 5.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RichListNumberStyle {
    /// Decimal numbers, written explicitly (HTML `type="1"`).
    Decimal = 1,
    /// Lowercase ASCII letters (HTML `type="a"`).
    LowerAlpha = 2,
    /// Uppercase ASCII letters (HTML `type="A"`).
    UpperAlpha = 3,
    /// Lowercase roman numerals (HTML `type="i"`).
    LowerRoman = 4,
    /// Uppercase roman numerals (HTML `type="I"`).
    UpperRoman = 5,
}

impl RichListNumberStyle {
    /// Every style in code order.
    pub const ALL: [Self; 5] =
        [Self::Decimal, Self::LowerAlpha, Self::UpperAlpha, Self::LowerRoman, Self::UpperRoman];
    /// Stable authored code.
    #[must_use]
    pub const fn code(self) -> u8 {
        self as u8
    }
    /// Closed intent/read token, equal to the CSS `list-style-type` keyword.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Decimal => "decimal",
            Self::LowerAlpha => "lower-alpha",
            Self::UpperAlpha => "upper-alpha",
            Self::LowerRoman => "lower-roman",
            Self::UpperRoman => "upper-roman",
        }
    }
    /// Exact HTML `<ol type>` token.
    #[must_use]
    pub const fn html_type(self) -> &'static str {
        match self {
            Self::Decimal => "1",
            Self::LowerAlpha => "a",
            Self::UpperAlpha => "A",
            Self::LowerRoman => "i",
            Self::UpperRoman => "I",
        }
    }
    /// Parse one closed token; no case folding or CSS synonym is accepted.
    #[must_use]
    pub fn from_token(token: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|style| style.as_str() == token)
    }
}

impl TryFrom<u8> for RichListNumberStyle {
    type Error = RichListNumberingError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        Self::ALL
            .into_iter()
            .find(|style| style.code() == value)
            .ok_or(RichListNumberingError::Value)
    }
}

/// Exact admitted numbering of one ordered list.
///
/// `start` is always explicit (it is required on every rich ordered list). A
/// reversed list displays `start, start - 1, ...`; ordinals may reach zero or
/// below, exactly as an HTML `<ol reversed start>` presents them.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichListNumbering {
    start: OrderedListStart,
    style: Option<RichListNumberStyle>,
    reversed: bool,
}

impl RichListNumbering {
    /// Explicit first displayed ordinal.
    #[must_use]
    pub const fn start(self) -> OrderedListStart {
        self.start
    }
    /// Authored marker style; `None` leaves the host/user-agent default (decimal).
    #[must_use]
    pub const fn style(self) -> Option<RichListNumberStyle> {
        self.style
    }
    /// Whether ordinals count down from `start`.
    #[must_use]
    pub const fn reversed(self) -> bool {
        self.reversed
    }
    /// Displayed ordinal of the zero-based item, which may be zero or negative when reversed.
    #[must_use]
    pub fn ordinal_at(self, index: u32) -> i64 {
        let start = i64::from(self.start.get());
        if self.reversed { start - i64::from(index) } else { start + i64::from(index) }
    }
    pub(crate) fn from_node(node: &ElementNode) -> Result<Self, RichListNumberingError> {
        if !supports_kind(node.kind().as_str()) {
            return Err(RichListNumberingError::Target);
        }
        let start = super::ast_properties::property(node, "start")
            .and_then(PropertyValue::as_integer)
            .map(PropertyInteger::get)
            .and_then(|value| u32::try_from(value).ok())
            .and_then(|value| OrderedListStart::try_new(value).ok())
            .ok_or(RichListNumberingError::Value)?;
        let style = super::ast_properties::property(node, STYLE)
            .map(|value| {
                value
                    .as_integer()
                    .map(PropertyInteger::get)
                    .and_then(|value| u8::try_from(value).ok())
                    .ok_or(RichListNumberingError::Value)
                    .and_then(RichListNumberStyle::try_from)
            })
            .transpose()?;
        let reversed = match super::ast_properties::property(node, REVERSED) {
            None => false,
            Some(value) if value.as_boolean() == Some(true) => true,
            Some(_) => return Err(RichListNumberingError::Value),
        };
        Ok(Self { start, style, reversed })
    }
    /// Read one admitted ordered list under its exact explicit rich V4 context.
    /// # Errors
    /// Rejects incompatible profile/proof/limits, absent IDs and non-ordered nodes.
    pub fn read(
        context: &EditorContext,
        document: &RichDocument,
        list: &BlockId,
    ) -> Result<Self, RichListNumberingError> {
        if !context.schema().supports_rich_list_numbering()
            || !document.document().is_proven_for(context.schema(), context.limits())
        {
            return Err(RichListNumberingError::Profile);
        }
        let path = document.block_path(list).ok_or(RichListNumberingError::Target)?;
        let node = document.document().node_at(path).map_err(|_| RichListNumberingError::Target)?;
        Self::from_node(node.as_element().ok_or(RichListNumberingError::Target)?)
    }
}

/// A nonempty typed numbering patch; no arbitrary property name crosses this boundary.
///
/// Style distinguishes keep, set and clear. `reversed` is keep (`None`) or an
/// explicit Boolean; `false` removes the canonical flag. `start` is keep or one
/// checked explicit ordinal, so a reversal and its start change can be one edit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichListNumberingPatch {
    style: RichLayoutChange<RichListNumberStyle>,
    reversed: Option<bool>,
    start: Option<OrderedListStart>,
}

impl RichListNumberingPatch {
    /// Construct one complete intent without silently filling omitted fields.
    /// # Errors
    /// Rejects an all-keep request.
    pub const fn try_new(
        style: RichLayoutChange<RichListNumberStyle>,
        reversed: Option<bool>,
        start: Option<OrderedListStart>,
    ) -> Result<Self, RichListNumberingError> {
        if matches!(style, RichLayoutChange::Keep) && reversed.is_none() && start.is_none() {
            return Err(RichListNumberingError::EmptyPatch);
        }
        Ok(Self { style, reversed, start })
    }
    /// Remove both optional V4 numbering properties, keeping the explicit start.
    #[must_use]
    pub const fn clear() -> Self {
        Self { style: RichLayoutChange::Clear, reversed: Some(false), start: None }
    }
    /// Exact style intent.
    #[must_use]
    pub const fn style(self) -> RichLayoutChange<RichListNumberStyle> {
        self.style
    }
    /// Exact reversed intent; `None` keeps the observed value.
    #[must_use]
    pub const fn reversed(self) -> Option<bool> {
        self.reversed
    }
    /// Exact start intent; `None` keeps the observed start.
    #[must_use]
    pub const fn start(self) -> Option<OrderedListStart> {
        self.start
    }
    /// Derive the exact complete result, retaining every kept observed field.
    #[must_use]
    pub const fn apply_to(self, previous: RichListNumbering) -> RichListNumbering {
        RichListNumbering {
            start: match self.start {
                Some(start) => start,
                None => previous.start,
            },
            style: match self.style {
                RichLayoutChange::Keep => previous.style,
                RichLayoutChange::Set(style) => Some(style),
                RichLayoutChange::Clear => None,
            },
            reversed: match self.reversed {
                Some(reversed) => reversed,
                None => previous.reversed,
            },
        }
    }
    pub(crate) fn properties(self) -> Vec<(&'static str, Option<PropertyValue>)> {
        let mut result = vec![];
        match self.style {
            RichLayoutChange::Keep => {}
            RichLayoutChange::Clear => result.push((STYLE, None)),
            RichLayoutChange::Set(style) => {
                result.push((STYLE, Some(integer(style.code().into()))));
            }
        }
        if let Some(reversed) = self.reversed {
            result.push((REVERSED, reversed.then(|| PropertyValue::boolean(true))));
        }
        if let Some(start) = self.start {
            result.push(("start", Some(integer(start.get().into()))));
        }
        result
    }
}

fn integer(value: i64) -> PropertyValue {
    PropertyValue::from_integer(
        PropertyInteger::try_new(value).unwrap_or_else(|_| unreachable!("bounded list integer")),
    )
}

pub(crate) fn supports_kind(kind: &str) -> bool {
    kind == "breditor/ordered-list"
}

pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    supports_kind(kind)
        && name.namespace() == "breditor"
        && matches!(name.local_name(), STYLE | REVERSED)
}

/// Whether an ordered list counts down. Old profiles never admit the flag.
pub(crate) fn is_reversed(node: &ElementNode) -> bool {
    super::ast_properties::property(node, REVERSED).and_then(PropertyValue::as_boolean)
        == Some(true)
}

/// First ordinal of a continuation that begins `offset` items into `source`.
///
/// Ascending lists add the offset. Reversed lists subtract it. `None` means
/// the continuation start is outside the positive native ordinal domain.
pub(crate) fn continuation_start(source: &ElementNode, offset: usize) -> Option<u32> {
    let start = super::ast_properties::property(source, "start")
        .and_then(PropertyValue::as_integer)
        .map(PropertyInteger::get)?;
    let offset = i64::try_from(offset).ok()?;
    let value =
        if is_reversed(source) { start.checked_sub(offset)? } else { start.checked_add(offset)? };
    u32::try_from(value).ok().filter(|value| (1..=MAX_ORDERED_LIST_ORDINAL).contains(value))
}

/// Rebuilt ordered-list nodes keep the source list's own V4 numbering properties.
///
/// A replacement that is not an ordered list (for example a bullet list) never
/// acquires them. Sources without these properties return the replacement
/// unchanged, so V1–V3 rewrites stay byte-exact.
pub(crate) fn retain(source: &NodeRef, replacement: NodeRef) -> Option<NodeRef> {
    let source = source.as_element()?;
    if !replacement.as_element().is_some_and(|node| supports_kind(node.kind().as_str())) {
        return Some(replacement);
    }
    let changes = [STYLE, REVERSED]
        .map(|local| (local, super::ast_properties::property(source, local).cloned()));
    if changes.iter().all(|(_, value)| value.is_none()) {
        return Some(replacement);
    }
    super::actions::rewrite_properties::with_properties(&replacement, changes).ok()
}

/// Complete-tree value law for V4 numbering properties on one ordered list.
pub(crate) fn validate(node: &ElementNode) -> Result<(), &'static str> {
    RichListNumbering::from_node(node)
        .map(|_| ())
        .map_err(|_| "invalid bounded list numbering value")
}
