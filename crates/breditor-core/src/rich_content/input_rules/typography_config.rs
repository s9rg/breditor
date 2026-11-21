//! Validated `typography-v1` selection: named rules, CKEditor-style groups and a quote style.
//!
//! The configuration is a host opt-in for one exclusive typing call, never a saved
//! document setting. Unknown names, duplicates, an empty result and unsafe quote
//! characters reject the whole selection before any input is routed.
use serde::Deserialize;

/// One named typographic replacement.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum RichTypographyRule {
    /// `...` becomes `…`.
    Ellipsis,
    /// ` -- ` becomes ` – ` (delimited by whitespace or the block start, applied on the space).
    EnDash,
    /// ` --- ` becomes ` — ` (delimited by whitespace or the block start, applied on the space).
    EmDash,
    /// Straight `"` becomes the configured opening or closing double quote.
    QuotesPrimary,
    /// Straight `'` becomes the configured single quote or the apostrophe `’`.
    QuotesSecondary,
    /// `(c)` becomes `©`.
    Copyright,
    /// `(r)` becomes `®`.
    RegisteredTrademark,
    /// `(tm)` becomes `™`.
    Trademark,
    /// A delimited `1/2` becomes `½`.
    OneHalf,
    /// A delimited `1/3` becomes `⅓`.
    OneThird,
    /// A delimited `2/3` becomes `⅔`.
    TwoThirds,
    /// A delimited `1/4` becomes `¼`.
    OneQuarter,
    /// A delimited `3/4` becomes `¾`.
    ThreeQuarters,
    /// `<=` becomes `≤`.
    LessThanOrEqual,
    /// `>=` becomes `≥`.
    GreaterThanOrEqual,
    /// `!=` becomes `≠`.
    NotEqual,
    /// A delimited `<-` becomes `←`.
    ArrowLeft,
    /// A delimited `->` becomes `→`.
    ArrowRight,
    /// `(sm)` becomes `℠` (not in the default set).
    Servicemark,
    /// `+/-` becomes `±` (not in the default set).
    PlusMinus,
    /// `<<` becomes `«` (not in the default set).
    Laquo,
    /// `>>` becomes `»` (not in the default set).
    Raquo,
    /// `^2` becomes `²` (not in the default set).
    SuperscriptTwo,
    /// `^3` becomes `³` (not in the default set).
    SuperscriptThree,
}

use RichTypographyRule as R;

/// Every rule with its stable configuration name and group, in recognition order.
pub(super) const RULES: [(RichTypographyRule, &str, &str); 24] = [
    (R::Ellipsis, "ellipsis", "typography"),
    (R::EnDash, "enDash", "typography"),
    (R::EmDash, "emDash", "typography"),
    (R::QuotesPrimary, "quotesPrimary", "quotes"),
    (R::QuotesSecondary, "quotesSecondary", "quotes"),
    (R::Copyright, "copyright", "symbols"),
    (R::RegisteredTrademark, "registeredTrademark", "symbols"),
    (R::Trademark, "trademark", "symbols"),
    (R::OneHalf, "oneHalf", "mathematical"),
    (R::OneThird, "oneThird", "mathematical"),
    (R::TwoThirds, "twoThirds", "mathematical"),
    (R::OneQuarter, "oneQuarter", "mathematical"),
    (R::ThreeQuarters, "threeQuarters", "mathematical"),
    (R::LessThanOrEqual, "lessThanOrEqual", "mathematical"),
    (R::GreaterThanOrEqual, "greaterThanOrEqual", "mathematical"),
    (R::NotEqual, "notEqual", "mathematical"),
    (R::ArrowLeft, "arrowLeft", "mathematical"),
    (R::ArrowRight, "arrowRight", "mathematical"),
    (R::Servicemark, "servicemark", "misc"),
    (R::PlusMinus, "plusMinus", "misc"),
    (R::Laquo, "laquo", "misc"),
    (R::Raquo, "raquo", "misc"),
    (R::SuperscriptTwo, "superscriptTwo", "misc"),
    (R::SuperscriptThree, "superscriptThree", "misc"),
];
/// Groups selected when a host does not list `include` (every group except `misc`).
pub const RICH_TYPOGRAPHY_DEFAULT_GROUPS: [&str; 4] =
    ["typography", "quotes", "symbols", "mathematical"];
/// Every selectable group name.
pub const RICH_TYPOGRAPHY_GROUPS: [&str; 5] =
    ["typography", "quotes", "symbols", "mathematical", "misc"];
const MAX_NAMES: usize = 64;

impl RichTypographyRule {
    /// Stable configuration name (CKEditor/Tiptap spelling).
    #[must_use]
    pub fn name(self) -> &'static str {
        RULES.iter().find(|(r, ..)| *r == self).map_or("", |(_, n, _)| n)
    }
    /// Group this rule belongs to.
    #[must_use]
    pub fn group(self) -> &'static str {
        RULES.iter().find(|(r, ..)| *r == self).map_or("", |(.., g)| g)
    }
    /// Every rule, in recognition order.
    pub fn all() -> impl Iterator<Item = Self> {
        RULES.iter().map(|(r, ..)| *r)
    }
    fn bit(self) -> u32 {
        let index = RULES.iter().position(|(r, ..)| *r == self).unwrap_or(0);
        1 << index
    }
}

/// Opening/closing quote characters with optional inner spacing (French).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct RichQuoteStyle {
    double: [char; 2],
    single: [char; 2],
    space: Option<char>,
}

impl RichQuoteStyle {
    /// English “double” and ‘single’ (the default).
    pub const ENGLISH: Self = Self { double: ['“', '”'], single: ['‘', '’'], space: None };
    /// German „double“ and ‚single‘.
    pub const GERMAN: Self = Self { double: ['„', '“'], single: ['‚', '‘'], space: None };
    /// French « double » and ‹ single › with a no-break space inside.
    pub const FRENCH: Self =
        Self { double: ['«', '»'], single: ['‹', '›'], space: Some('\u{a0}') };
    /// Swiss «double» and ‹single› without inner spacing.
    pub const SWISS: Self = Self { double: ['«', '»'], single: ['‹', '›'], space: None };
    /// Polish „double” and ‚single’.
    pub const POLISH: Self = Self { double: ['„', '”'], single: ['‚', '’'], space: None };

    /// A named preset: `english`, `german`, `french`, `swiss` or `polish`.
    #[must_use]
    pub fn preset(name: &str) -> Option<Self> {
        Some(match name {
            "english" => Self::ENGLISH,
            "german" => Self::GERMAN,
            "french" => Self::FRENCH,
            "swiss" => Self::SWISS,
            "polish" => Self::POLISH,
            _ => return None,
        })
    }
    /// A custom pair. Quote characters must be non-ASCII, visible and not whitespace;
    /// `space` (inside the quotes) may only be U+00A0 or the narrow U+202F no-break space.
    /// # Errors
    /// Rejects unsafe characters.
    pub fn try_new(
        double: [char; 2],
        single: [char; 2],
        space: Option<char>,
    ) -> Result<Self, RichTypographyConfigError> {
        if double.iter().chain(&single).any(|c| {
            c.is_ascii()
                || c.is_whitespace()
                || c.is_control()
                || matches!(c, '\u{fffd}' | '\u{feff}')
        }) {
            return Err(RichTypographyConfigError::QuoteCharacter);
        }
        if space.is_some_and(|c| !matches!(c, '\u{a0}' | '\u{202f}')) {
            return Err(RichTypographyConfigError::QuoteSpace);
        }
        Ok(Self { double, single, space })
    }
    /// Opening and closing double quotes.
    #[must_use]
    pub const fn double(&self) -> [char; 2] {
        self.double
    }
    /// Opening and closing single quotes.
    #[must_use]
    pub const fn single(&self) -> [char; 2] {
        self.single
    }
    /// Optional no-break space inserted inside the quotes.
    #[must_use]
    pub const fn space(&self) -> Option<char> {
        self.space
    }
}

/// Invalid typography selection; the host must fix its options.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichTypographyConfigError {
    /// A rule or group name is not known.
    #[error("unknown typography rule or group")]
    UnknownName,
    /// A list names the same rule or group twice, or is too long.
    #[error("duplicate or excessive typography names")]
    Duplicate,
    /// The resulting selection has no rule.
    #[error("typography selection is empty")]
    Empty,
    /// A quote character is ASCII, whitespace or a control character.
    #[error("unsafe typography quote character")]
    QuoteCharacter,
    /// The inner quote spacing is not a no-break space.
    #[error("unsupported typography quote spacing")]
    QuoteSpace,
    /// The quote style is neither a known preset nor a valid custom pair.
    #[error("unknown typography quote style")]
    QuoteStyle,
}

/// Selected `typography-v1` rules and quote style.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct RichTypographyConfig {
    rules: u32,
    quotes: RichQuoteStyle,
}

impl Default for RichTypographyConfig {
    fn default() -> Self {
        Self::DEFAULT
    }
}

impl RichTypographyConfig {
    /// The default groups (`typography`, `quotes`, `symbols`, `mathematical`) with English quotes.
    pub const DEFAULT: Self = Self { rules: (1 << 18) - 1, quotes: RichQuoteStyle::ENGLISH };

    /// Select rules: `include` (groups or rule names) replaces the default groups,
    /// then `exclude` (groups or rule names) removes rules.
    /// # Errors
    /// Unknown names, duplicates within one list, more than 64 names or an empty result.
    pub fn try_new(
        include: Option<&[&str]>,
        exclude: &[&str],
        quotes: RichQuoteStyle,
    ) -> Result<Self, RichTypographyConfigError> {
        let mask = |names: &[&str]| -> Result<u32, RichTypographyConfigError> {
            if names.len() > MAX_NAMES {
                return Err(RichTypographyConfigError::Duplicate);
            }
            let mut seen = std::collections::BTreeSet::new();
            let mut bits = 0;
            for name in names {
                if !seen.insert(*name) {
                    return Err(RichTypographyConfigError::Duplicate);
                }
                bits |= named(name).ok_or(RichTypographyConfigError::UnknownName)?;
            }
            Ok(bits)
        };
        let included = match include {
            Some(names) => mask(names)?,
            None => Self::DEFAULT.rules,
        };
        let rules = included & !mask(exclude)?;
        if rules == 0 {
            return Err(RichTypographyConfigError::Empty);
        }
        Ok(Self { rules, quotes })
    }
    /// Whether one rule is selected.
    #[must_use]
    pub fn contains(&self, rule: RichTypographyRule) -> bool {
        self.rules & rule.bit() != 0
    }
    /// Selected rules, in recognition order.
    pub fn rules(&self) -> impl Iterator<Item = RichTypographyRule> + '_ {
        RichTypographyRule::all().filter(|r| self.contains(*r))
    }
    /// Configured quote style.
    #[must_use]
    pub const fn quotes(&self) -> &RichQuoteStyle {
        &self.quotes
    }
}

fn named(name: &str) -> Option<u32> {
    if RICH_TYPOGRAPHY_GROUPS.contains(&name) {
        return Some(RULES.iter().filter(|(.., g)| *g == name).fold(0, |m, (r, ..)| m | r.bit()));
    }
    RULES.iter().find(|(_, n, _)| *n == name).map(|(r, ..)| r.bit())
}

/// Strict JSON request shape shared by the local and shared Wasm owners.
///
/// `{"include"?: [names], "exclude"?: [names], "quotes"?: preset | {"double": [o, c],
/// "single": [o, c], "space"?: "nbsp" | "narrow-nbsp"}}`; each quote is one scalar.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RichTypographyRequest {
    #[serde(default)]
    include: Option<Vec<String>>,
    #[serde(default)]
    exclude: Vec<String>,
    #[serde(default)]
    quotes: Option<QuotesRequest>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
enum QuotesRequest {
    Preset(String),
    Custom(CustomQuotes),
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CustomQuotes {
    double: [String; 2],
    single: [String; 2],
    #[serde(default)]
    space: Option<String>,
}

impl RichTypographyRequest {
    /// Validate this request into a configuration.
    /// # Errors
    /// Any invalid name, quote or spacing rejects the whole request.
    pub fn into_config(self) -> Result<RichTypographyConfig, RichTypographyConfigError> {
        let quotes = match self.quotes {
            None => RichQuoteStyle::ENGLISH,
            Some(QuotesRequest::Preset(name)) => {
                RichQuoteStyle::preset(&name).ok_or(RichTypographyConfigError::QuoteStyle)?
            }
            Some(QuotesRequest::Custom(custom)) => {
                let scalar = |s: &str| {
                    let mut chars = s.chars();
                    match (chars.next(), chars.next()) {
                        (Some(c), None) => Ok(c),
                        _ => Err(RichTypographyConfigError::QuoteCharacter),
                    }
                };
                let space = match custom.space.as_deref() {
                    None => None,
                    Some("nbsp") => Some('\u{a0}'),
                    Some("narrow-nbsp") => Some('\u{202f}'),
                    Some(_) => return Err(RichTypographyConfigError::QuoteSpace),
                };
                RichQuoteStyle::try_new(
                    [scalar(&custom.double[0])?, scalar(&custom.double[1])?],
                    [scalar(&custom.single[0])?, scalar(&custom.single[1])?],
                    space,
                )?
            }
        };
        let include: Option<Vec<&str>> =
            self.include.as_ref().map(|v| v.iter().map(String::as_str).collect());
        let exclude: Vec<&str> = self.exclude.iter().map(String::as_str).collect();
        RichTypographyConfig::try_new(include.as_deref(), &exclude, quotes)
    }
}
