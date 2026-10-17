//! Prove the complete original scalar set and retain every non-text source witness.
use super::{
    DocumentSuggestionDraft, DocumentSuggestionTextRebase as Rebase,
    DocumentSuggestionTextRebaseConflict as Conflict, DocumentSuggestionTextRebasePolicy as Policy,
    SuggestionConflictTarget, read_set::ReadSet,
};
use crate::{
    Error,
    rich_replica::{
        AffineTextRangeResolution, AffineTextSegment, RichReplica, actions::ReplaceTextRange,
        affine_text_range::resolve_source_selection, selection::Selection,
    },
};
use breditor_core::rich_content::{RichDocument, RichSelectionCoverage};
use serde_json::Value;
use std::collections::BTreeSet;

pub(super) struct Source<'a> {
    pub doc: &'a loro::LoroDoc,
    pub document: &'a RichDocument,
    pub canonical: &'a str,
    pub anchor: &'a str,
    pub draft: &'a DocumentSuggestionDraft,
}
pub(super) enum Target {
    Ready(Selection),
    NotReady(Rebase),
}
fn targets(
    owner: &RichReplica,
    source: &Source<'_>,
    selection: &Selection,
) -> Result<Vec<SuggestionConflictTarget>, Error> {
    let coverage =
        RichSelectionCoverage::capture(source.document, &selection.admit(source.document)?)
            .map_err(|_| Error::Contract("text rebase source coverage"))?;
    let blocks = coverage
        .text()
        .iter()
        .map(|span| span.block().as_str().to_owned())
        .collect::<BTreeSet<_>>();
    let before: Value = serde_json::from_str(source.canonical)?;
    let current: Value = serde_json::from_str(owner.document_json())?;
    ReadSet::capture(&before["root"], source.document, source.doc, &owner.codec, source.draft)?
        .text_rebase_conflicts(&current["root"], &owner.doc, &blocks)
}
fn only_originals(
    owner: &RichReplica,
    target: &Selection,
    segments: &[AffineTextSegment],
) -> Result<bool, Error> {
    let coverage = RichSelectionCoverage::capture(&owner.document, &target.admit(&owner.document)?)
        .map_err(|_| Error::Contract("text rebase current coverage"))?;
    let current = coverage.text().iter().try_fold(0_u64, |sum, span| {
        sum.checked_add(span.end().get() - span.start().get()).ok_or(Error::Offset)
    })?;
    let original = segments.iter().try_fold(0_u64, |sum, segment| {
        sum.checked_add(u64::from(segment.length)).ok_or(Error::Offset)
    })?;
    Ok(current == original
        && segments.iter().all(|segment| {
            coverage.text().iter().any(|span| {
                span.block().as_str() == segment.current.block
                    && span.start().get() <= u64::from(segment.current.offset)
                    && u64::from(segment.current.offset) + u64::from(segment.length)
                        <= span.end().get()
            })
        }))
}
pub(super) fn resolve(
    owner: &RichReplica,
    source: &Source<'_>,
    request: &ReplaceTextRange,
    policy: Policy,
) -> Result<Target, Error> {
    let selection =
        Selection::TextRange { anchor: request.anchor.clone(), focus: request.focus.clone() };
    let (anchor, mut focus, segments) = match resolve_source_selection(
        owner,
        source.anchor,
        source.canonical,
        selection.clone(),
    )? {
        AffineTextRangeResolution::Pending { missing } => {
            return Ok(Target::NotReady(Rebase::Pending { missing }));
        }
        AffineTextRangeResolution::Conflict { reason } => {
            return Ok(Target::NotReady(Rebase::Conflict { reason: Conflict::Range { reason } }));
        }
        AffineTextRangeResolution::Resolved { anchor, focus, segments, .. } => {
            (anchor, focus, segments)
        }
    };
    if segments.iter().any(|segment| segment.source_formats != segment.current_formats) {
        return Ok(Target::NotReady(Rebase::Conflict { reason: Conflict::FormattingChanged }));
    }
    let targets = targets(owner, source, &selection)?;
    if !targets.is_empty() {
        return Ok(Target::NotReady(Rebase::Conflict {
            reason: Conflict::TargetsChanged { targets },
        }));
    }
    // Before/After can map around new text even though the original selected set was empty.
    // Keep a true insertion collapsed at its original directional anchor's mapped affinity.
    if request.anchor.block == request.focus.block && request.anchor.offset == request.focus.offset
    {
        focus = anchor.clone();
    }
    let target = Selection::TextRange { anchor, focus };
    match policy {
        Policy::RejectInterveningText if !only_originals(owner, &target, &segments)? => {
            Ok(Target::NotReady(Rebase::Conflict { reason: Conflict::InterveningText }))
        }
        Policy::RejectInterveningText => Ok(Target::Ready(target)),
    }
}
