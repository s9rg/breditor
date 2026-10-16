//! Field-only intent over an existing typed inline format.
//!
//! The template supplies admitted values, not a replacement map. Only explicitly
//! named properties are copied; every other observed property is retained. Missing
//! formats reject instead of manufacturing a partial Link or silently skipping
//! unformatted characters. Local inverses and shared annotations remain the
//! existing complete-format operations; this is not a new wire conflict policy.

use super::RichActionError;
use crate::{
    document::{Format, PropertyMap},
    identity::QualifiedName,
    position::TextOffset,
    rich_content::{BlockId, RichDocument},
};
use std::collections::{BTreeMap, BTreeSet};

/// A nonempty, unambiguous property patch with a complete typed-value template.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichFormatPropertyPatch {
    template: Format,
    properties: Vec<QualifiedName>,
}

/// One changed scalar-aligned interval; lowered to an existing format operation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichPatchedFormatRun {
    /// Logical UTF-16 start in the observed block.
    pub start: TextOffset,
    /// Logical UTF-16 end in the observed block.
    pub end: TextOffset,
    /// Complete resulting format, retaining all omitted observed properties.
    pub format: Format,
}

impl RichFormatPropertyPatch {
    /// Capture explicitly named template fields without changing omitted fields.
    ///
    /// Template and merged values still require the active schema's admission at
    /// publication. Property names must be unique and present in the template.
    /// # Errors
    /// Rejects empty, duplicate or absent property names.
    pub fn try_new(
        template: Format,
        properties: Vec<QualifiedName>,
    ) -> Result<Self, RichActionError> {
        let mut seen = BTreeSet::new();
        if properties.is_empty()
            || properties
                .iter()
                .any(|name| !seen.insert(name.clone()) || template.properties().get(name).is_none())
        {
            return Err(RichActionError::FormatChanges);
        }
        Ok(Self { template, properties })
    }

    /// The only format kind this patch may update.
    #[must_use]
    pub fn kind(&self) -> &QualifiedName {
        self.template.kind()
    }
    /// Complete immutable template; callers must admit it before using named fields.
    #[must_use]
    pub const fn template(&self) -> &Format {
        &self.template
    }

    /// Merge named fields into an existing value; this does not grant admission.
    /// # Errors
    /// Rejects a different format kind or an inconsistent captured template.
    pub fn apply_to(&self, existing: &Format) -> Result<Format, RichActionError> {
        if existing.kind() != self.kind() {
            return Err(RichActionError::FormatChanges);
        }
        let mut values: BTreeMap<_, _> = existing
            .properties()
            .iter()
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        for name in &self.properties {
            values.insert(
                name.clone(),
                self.template.properties().get(name).ok_or(RichActionError::FormatChanges)?.clone(),
            );
        }
        Ok(Format::new(
            self.kind().clone(),
            PropertyMap::try_from_sorted(values.into_iter().collect())
                .map_err(|_| RichActionError::FormatChanges)?,
        ))
    }

    /// Plan changed intervals without modifying content or granting publication authority.
    ///
    /// Every selected character must already carry this format. Adjacent equal
    /// results coalesce even when unrelated formats differ. Unchanged intervals
    /// author no annotation and consume no history entry. Callers must still
    /// admit resulting formats and the complete transaction under their context.
    /// # Errors
    /// Rejects non-prose, empty/reversed/non-scalar ranges and missing formats.
    pub fn capture_runs(
        &self,
        document: &RichDocument,
        block: &BlockId,
        start: TextOffset,
        end: TextOffset,
    ) -> Result<Vec<RichPatchedFormatRun>, RichActionError> {
        if start >= end {
            return Err(RichActionError::TextRange);
        }
        let node = super::text_patch::block_node(document, block)?;
        if !node.as_element().is_some_and(|element| {
            matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading")
        }) {
            return Err(RichActionError::TextTarget);
        }
        let (_, rest) = super::text_patch::fragment(node)?
            .split_at(start)
            .map_err(|_| RichActionError::TextRange)?;
        let (selected, _) = rest
            .split_at(
                TextOffset::try_new(end.get() - start.get())
                    .map_err(|_| RichActionError::TextRange)?,
            )
            .map_err(|_| RichActionError::TextRange)?;
        let mut offset = start;
        let mut output: Vec<RichPatchedFormatRun> = Vec::new();
        for run in &selected {
            let existing = run.formats().get(self.kind()).ok_or(RichActionError::FormatChanges)?;
            let format = self.apply_to(existing)?;
            let next = TextOffset::try_new(
                offset
                    .get()
                    .checked_add(u64::from(run.utf16_len()))
                    .ok_or(RichActionError::TextRange)?,
            )
            .map_err(|_| RichActionError::TextRange)?;
            if &format != existing {
                match output.last_mut() {
                    Some(previous) if previous.end == offset && previous.format == format => {
                        previous.end = next;
                    }
                    _ => output.push(RichPatchedFormatRun { start: offset, end: next, format }),
                }
            }
            offset = next;
        }
        Ok(output)
    }
}
