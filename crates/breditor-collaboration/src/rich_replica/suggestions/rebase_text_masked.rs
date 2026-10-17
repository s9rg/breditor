//! Derive current removal masks solely from the complete native original-character proof.
use super::{DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope};
use crate::{
    Error,
    rich_replica::{
        AffineTextSegment, Command, RichReplica,
        actions::{MaskedTextSpanV1, ReplaceMaskedGeneralTextRangeV1},
        general_range_plan,
        selection::Selection,
    },
};
use breditor_core::{
    document::TextFragment,
    position::TextOffset,
    rich_content::{
        actions::{RichMaskedGeneralRangePlan, RichMaskedTextSpan},
        allocate_general_range_paragraphs,
    },
};

pub(super) fn draft(
    owner: &RichReplica,
    selection: &Selection,
    segments: &[AffineTextSegment],
    inserted: &TextFragment,
    prefix: &str,
) -> Result<DocumentSuggestionDraft, Error> {
    let spans = segments
        .iter()
        .map(|segment| {
            RichMaskedTextSpan::try_new(
                super::super::paragraphs::id(&segment.current.block)?,
                TextOffset::try_new(u64::from(segment.current.offset))
                    .map_err(|_| Error::Offset)?,
                TextOffset::try_new(u64::from(
                    segment.current.offset.checked_add(segment.length).ok_or(Error::Offset)?,
                ))
                .map_err(|_| Error::Offset)?,
            )
            .map_err(|_| Error::Contract("text rebase native original mask"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let plan = RichMaskedGeneralRangePlan::capture(
        &owner.document,
        &selection.admit(&owner.document)?,
        inserted,
        &spans,
    )
    .map_err(|_| Error::Contract("text rebase masked structure plan"))?;
    let empty = allocate_general_range_paragraphs(prefix, plan.empty_blocks().len())
        .map_err(|_| Error::Contract("text rebase masked namespace"))?;
    let spans = spans
        .iter()
        .map(|span| {
            Ok(MaskedTextSpanV1 {
                block: span.block().as_str().into(),
                start: u32::try_from(span.start().get()).map_err(|_| Error::Offset)?,
                end: u32::try_from(span.end().get()).map_err(|_| Error::Offset)?,
            })
        })
        .collect::<Result<Vec<_>, Error>>()?;
    let draft = DocumentSuggestionDraft {
        scope: DocumentSuggestionScope::Commands,
        edit: DocumentSuggestionEdit::Commands(vec![Command::ReplaceMaskedGeneralTextRangeV1(
            ReplaceMaskedGeneralTextRangeV1 {
                range: general_range_plan::request(&owner.codec, selection, inserted)?,
                spans,
                empty: empty.iter().map(|id| id.as_str().into()).collect(),
            },
        )]),
    };
    let after = super::evaluate_commands::evaluate(
        owner,
        &owner.doc,
        &owner.document,
        owner.document_json(),
        &draft,
    )?;
    if after == owner.document_json() {
        return Err(Error::Contract("text rebase masked source effect required"));
    }
    Ok(draft)
}
