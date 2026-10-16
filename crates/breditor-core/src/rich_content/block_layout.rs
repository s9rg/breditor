//! Closed native layout values. Inert AST integers never represent arbitrary CSS.
use crate::{
    document::{ElementNode, PropertyValue},
    identity::QualifiedName,
};

/// Payload-free layout admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichBlockLayoutError {
    /// An explicit rich V3 context is required; old profiles never widen.
    #[error("block layout requires the explicit rich V3 profile")]
    Profile,
    /// Layout belongs only to paragraphs, headings and code blocks.
    #[error("block layout requires a text block")]
    Target,
    /// A value is outside its closed type or inclusive native bounds.
    #[error("invalid bounded block layout value")]
    Value,
    /// An all-keep request is not an edit intent.
    #[error("block layout patch must change at least one field")]
    EmptyPatch,
}
/// Explicit logical and physical alignment, encoded durably as integers 1 through 6.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RichBlockAlignment {
    /// Logical start, not physical left.
    Start = 1,
    /// Center.
    Center = 2,
    /// Logical end, not physical right.
    End = 3,
    /// Justify.
    Justify = 4,
    /// Physical left, independent from text direction.
    Left = 5,
    /// Physical right, independent from text direction.
    Right = 6,
}
impl RichBlockAlignment {
    /// Stable authored code, retaining physical/logical distinctions.
    #[must_use]
    pub const fn code(self) -> u8 {
        self as u8
    }
    /// Closed intent/read token, never an arbitrary style string.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Center => "center",
            Self::End => "end",
            Self::Justify => "justify",
            Self::Left => "left",
            Self::Right => "right",
        }
    }
}
impl TryFrom<u8> for RichBlockAlignment {
    type Error = RichBlockLayoutError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Start),
            2 => Ok(Self::Center),
            3 => Ok(Self::End),
            4 => Ok(Self::Justify),
            5 => Ok(Self::Left),
            6 => Ok(Self::Right),
            _ => Err(RichBlockLayoutError::Value),
        }
    }
}
/// Text direction, encoded durably as integers 1 through 3.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RichBlockDirection {
    /// Left to right.
    LeftToRight = 1,
    /// Right to left.
    RightToLeft = 2,
    /// Let the host determine direction from text, not a persisted derived value.
    Auto = 3,
}
impl RichBlockDirection {
    /// Stable authored direction code.
    #[must_use]
    pub const fn code(self) -> u8 {
        self as u8
    }
    /// Closed intent/read token, without resolving automatic direction.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LeftToRight => "ltr",
            Self::RightToLeft => "rtl",
            Self::Auto => "auto",
        }
    }
}
impl TryFrom<u8> for RichBlockDirection {
    type Error = RichBlockLayoutError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::LeftToRight),
            2 => Ok(Self::RightToLeft),
            3 => Ok(Self::Auto),
            _ => Err(RichBlockLayoutError::Value),
        }
    }
}
/// Logical block indentation, independent from list nesting.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichBlockIndent(u8);
impl RichBlockIndent {
    /// Admit 0 through 12 inclusive; zero is an explicit value, not inheritance.
    /// # Errors
    /// Rejects larger levels without clamping.
    pub const fn try_new(level: u8) -> Result<Self, RichBlockLayoutError> {
        if level <= 12 { Ok(Self(level)) } else { Err(RichBlockLayoutError::Value) }
    }
    /// Exact logical level.
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}
/// Integer line-height percentage; no floating-point transport or arbitrary style.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichLineHeight(u16);
impl RichLineHeight {
    /// Admit 100 through 300 inclusive, independently from font size.
    /// # Errors
    /// Rejects values outside that range, never clamps or rounds.
    pub const fn try_new(percent: u16) -> Result<Self, RichBlockLayoutError> {
        if percent >= 100 && percent <= 300 {
            Ok(Self(percent))
        } else {
            Err(RichBlockLayoutError::Value)
        }
    }
    /// Exact integer percentage.
    #[must_use]
    pub const fn get(self) -> u16 {
        self.0
    }
}
/// Exact optional authored values. Absence preserves inheritance; it is not a guessed default.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RichBlockLayout {
    pub(super) alignment: Option<RichBlockAlignment>,
    pub(super) direction: Option<RichBlockDirection>,
    pub(super) indent: Option<RichBlockIndent>,
    pub(super) line_height: Option<RichLineHeight>,
}
impl RichBlockLayout {
    /// Authored alignment, retaining physical/logical distinctions, or inheritance.
    #[must_use]
    pub const fn alignment(self) -> Option<RichBlockAlignment> {
        self.alignment
    }
    /// Authored text direction, or inheritance.
    #[must_use]
    pub const fn direction(self) -> Option<RichBlockDirection> {
        self.direction
    }
    /// Authored logical indentation, or inheritance.
    #[must_use]
    pub const fn indent(self) -> Option<RichBlockIndent> {
        self.indent
    }
    /// Authored line height, or inheritance.
    #[must_use]
    pub const fn line_height(self) -> Option<RichLineHeight> {
        self.line_height
    }
    pub(crate) fn from_node(node: &ElementNode) -> Result<Self, RichBlockLayoutError> {
        if !supports_kind(node.kind().as_str()) {
            return Err(RichBlockLayoutError::Target);
        }
        let value = |local| {
            super::ast_properties::property(node, local)
                .map(|p| {
                    p.as_integer()
                        .map(crate::document::PropertyInteger::get)
                        .ok_or(RichBlockLayoutError::Value)
                })
                .transpose()
        };
        let alignment = value("block-align")?
            .map(|v| {
                RichBlockAlignment::try_from(
                    u8::try_from(v).map_err(|_| RichBlockLayoutError::Value)?,
                )
            })
            .transpose()?;
        let direction = value("block-direction")?
            .map(|v| {
                RichBlockDirection::try_from(
                    u8::try_from(v).map_err(|_| RichBlockLayoutError::Value)?,
                )
            })
            .transpose()?;
        let indent = value("block-indent")?
            .map(|v| {
                RichBlockIndent::try_new(u8::try_from(v).map_err(|_| RichBlockLayoutError::Value)?)
            })
            .transpose()?;
        let line_height = value("line-height-percent")?
            .map(|v| {
                RichLineHeight::try_new(u16::try_from(v).map_err(|_| RichBlockLayoutError::Value)?)
            })
            .transpose()?;
        Ok(Self { alignment, direction, indent, line_height })
    }
}
pub(crate) fn supports_kind(kind: &str) -> bool {
    matches!(kind, "breditor/paragraph" | "breditor/heading" | "breditor/code-block")
}
pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    supports_kind(kind)
        && name.namespace() == "breditor"
        && matches!(
            name.local_name(),
            "block-align" | "block-direction" | "block-indent" | "line-height-percent"
        )
}
pub(super) fn integer(value: u16) -> PropertyValue {
    PropertyValue::from_integer(
        crate::document::PropertyInteger::try_new(i64::from(value))
            .unwrap_or_else(|_| unreachable!("bounded layout integer")),
    )
}
