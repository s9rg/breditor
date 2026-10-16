//! Keep/set/remove is explicit for each independent layout property.
use super::{
    RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayout, RichBlockLayoutError,
    RichLineHeight, block_layout::integer,
};
use crate::document::PropertyValue;

/// One field's intent. Keep must never be confused with removing authored metadata.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum RichLayoutChange<T> {
    /// Retain the exact observed value, including absence.
    #[default]
    Keep,
    /// Author one checked native value.
    Set(T),
    /// Remove the authored property and restore inheritance.
    Clear,
}
impl<T: Copy> RichLayoutChange<T> {
    const fn apply(self, previous: Option<T>) -> Option<T> {
        match self {
            Self::Keep => previous,
            Self::Set(value) => Some(value),
            Self::Clear => None,
        }
    }
}
/// A nonempty typed patch; no arbitrary property name or CSS value crosses this boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RichBlockLayoutPatch {
    alignment: RichLayoutChange<RichBlockAlignment>,
    direction: RichLayoutChange<RichBlockDirection>,
    indent: RichLayoutChange<RichBlockIndent>,
    line_height: RichLayoutChange<RichLineHeight>,
}
impl RichBlockLayoutPatch {
    /// Construct one complete intent without silently filling omitted fields.
    /// # Errors
    /// Rejects an all-keep request. Value constructors enforce each field's bounds.
    pub fn try_new(
        alignment: RichLayoutChange<RichBlockAlignment>,
        direction: RichLayoutChange<RichBlockDirection>,
        indent: RichLayoutChange<RichBlockIndent>,
        line_height: RichLayoutChange<RichLineHeight>,
    ) -> Result<Self, RichBlockLayoutError> {
        if matches!(alignment, RichLayoutChange::Keep)
            && matches!(direction, RichLayoutChange::Keep)
            && matches!(indent, RichLayoutChange::Keep)
            && matches!(line_height, RichLayoutChange::Keep)
        {
            return Err(RichBlockLayoutError::EmptyPatch);
        }
        Ok(Self { alignment, direction, indent, line_height })
    }
    /// Exact alignment intent.
    #[must_use]
    pub const fn alignment(self) -> RichLayoutChange<RichBlockAlignment> {
        self.alignment
    }
    /// Exact direction intent.
    #[must_use]
    pub const fn direction(self) -> RichLayoutChange<RichBlockDirection> {
        self.direction
    }
    /// Exact logical indentation intent.
    #[must_use]
    pub const fn indent(self) -> RichLayoutChange<RichBlockIndent> {
        self.indent
    }
    /// Exact line-height intent.
    #[must_use]
    pub const fn line_height(self) -> RichLayoutChange<RichLineHeight> {
        self.line_height
    }
    /// Derive the exact complete result, retaining every kept observed field.
    #[must_use]
    pub const fn apply_to(self, previous: RichBlockLayout) -> RichBlockLayout {
        RichBlockLayout {
            alignment: self.alignment.apply(previous.alignment),
            direction: self.direction.apply(previous.direction),
            indent: self.indent.apply(previous.indent),
            line_height: self.line_height.apply(previous.line_height),
        }
    }
    pub(super) fn properties(self) -> Vec<(&'static str, Option<PropertyValue>)> {
        let mut result = vec![];
        property(&mut result, "block-align", self.alignment, |v| u16::from(v as u8));
        property(&mut result, "block-direction", self.direction, |v| u16::from(v as u8));
        property(&mut result, "block-indent", self.indent, |v| u16::from(v.get()));
        property(&mut result, "line-height-percent", self.line_height, RichLineHeight::get);
        result
    }
}
fn property<T>(
    out: &mut Vec<(&'static str, Option<PropertyValue>)>,
    name: &'static str,
    change: RichLayoutChange<T>,
    value: impl FnOnce(T) -> u16,
) {
    match change {
        RichLayoutChange::Keep => {}
        RichLayoutChange::Clear => out.push((name, None)),
        RichLayoutChange::Set(v) => out.push((name, Some(integer(value(v))))),
    }
}
