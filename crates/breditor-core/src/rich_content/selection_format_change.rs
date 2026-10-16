//! Explicit selection formatting intent; original persisted format actions stay unchanged.
use super::{
    RichLocalSessionError,
    actions::{RichActionError, RichFormatChange, RichFormatPropertyPatch},
};
use crate::{
    document::{Format, FormatSet},
    identity::QualifiedName,
    state::EditorContext,
};
use std::collections::{BTreeMap, BTreeSet};
/// Typed selection-level change, including an admitted removal literal for shared lowering.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichSelectionFormatChange {
    /// Set one complete typed value across selected characters.
    Set(Format),
    /// Remove this kind. The complete valid literal supplies the original shared annotation shape.
    Remove(Format),
    /// Preserve omitted observed fields; every selected character must already carry this kind.
    Patch(RichFormatPropertyPatch),
}
impl RichSelectionFormatChange {
    /// The unique semantic kind changed by this intent.
    #[must_use]
    pub fn kind(&self) -> &QualifiedName {
        self.template().kind()
    }
    /// Complete schema-admitted value/template, never a partly typed removal record.
    #[must_use]
    pub fn template(&self) -> &Format {
        match self {
            Self::Set(f) | Self::Remove(f) => f,
            Self::Patch(p) => p.template(),
        }
    }
    /// Lower only to an original local format change, not a new persisted tag.
    #[must_use]
    pub fn local_change(&self) -> RichFormatChange {
        match self {
            Self::Set(f) => RichFormatChange::Set(f.clone()),
            Self::Remove(f) => RichFormatChange::Remove(f.kind().clone()),
            Self::Patch(p) => RichFormatChange::Patch(p.clone()),
        }
    }
}
pub(super) fn admit(
    context: &EditorContext,
    changes: &[RichSelectionFormatChange],
) -> Result<(), RichLocalSessionError> {
    let mut seen = BTreeSet::new();
    if changes.is_empty() {
        return Err(RichActionError::FormatChanges.into());
    }
    for change in changes {
        if !seen.insert(change.kind()) || !context.schema().allows_text_format(change.kind()) {
            return Err(RichActionError::FormatChanges.into());
        }
        context.schema().validate_inline_format_instance(context.limits(), change.template())?;
    }
    Ok(())
}
pub(super) fn pending(
    formats: &FormatSet,
    changes: &[RichSelectionFormatChange],
) -> Result<FormatSet, RichLocalSessionError> {
    let mut values: BTreeMap<_, _> =
        formats.iter().map(|f| (f.kind().clone(), f.clone())).collect();
    for change in changes {
        match change {
            RichSelectionFormatChange::Set(f) => {
                values.insert(f.kind().clone(), f.clone());
            }
            RichSelectionFormatChange::Remove(f) => {
                values.remove(f.kind());
            }
            RichSelectionFormatChange::Patch(p) => {
                let old = values.get(p.kind()).ok_or(RichActionError::FormatChanges)?;
                values.insert(p.kind().clone(), p.apply_to(old)?);
            }
        }
    }
    FormatSet::try_from_formats(values.into_values().collect())
        .map_err(|_| RichActionError::TextPrimitive.into())
}
