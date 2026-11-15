//! Join selected files to the actual native document and review registrations.
use super::{
    RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily, RelaySegmentJournalOwner,
    RelaySegmentReviewJournalFamily,
};
use crate::{
    Error, RecoveryDocumentClock, RecoveryDocumentRegistration, RecoveryReviewRegistration, Result,
    RoomParticipantInventoryMetadata,
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy)]
pub(super) enum DocumentInput<'a> {
    Native(RelaySegmentDocumentJournalFamily),
    Paired(&'a RecoveryReviewRegistration),
    Delivery(&'a RecoveryReviewRegistration),
}

pub(super) struct DocumentSource<'a> {
    pub index: usize,
    pub row: &'a RecoveryDocumentRegistration,
    pub input: DocumentInput<'a>,
}

pub(super) struct ReviewSource<'a> {
    pub index: usize,
    pub row: &'a RecoveryReviewRegistration,
    pub family: RelaySegmentReviewJournalFamily,
}

pub(super) struct SelectedSources<'a> {
    pub document_clocks: BTreeMap<&'a str, &'a RecoveryDocumentClock>,
    pub review_rows: BTreeMap<&'a str, &'a RecoveryReviewRegistration>,
    pub documents: Vec<DocumentSource<'a>>,
    pub reviews: BTreeMap<&'a str, Vec<ReviewSource<'a>>>,
    pub missing_document_writers: Vec<String>,
}

impl<'a> SelectedSources<'a> {
    pub fn read(
        participants: &'a RoomParticipantInventoryMetadata,
        pins: &'a [RelaySegmentClientJournalPin],
    ) -> Result<Self> {
        let rows = participants
            .writers
            .iter()
            .map(|row| (row.clock.writer.as_str(), row))
            .collect::<BTreeMap<_, _>>();
        let review_rows = participants
            .review
            .iter()
            .flat_map(|inventory| &inventory.writers)
            .map(|row| (row.clock.actor.as_str(), row))
            .collect::<BTreeMap<_, _>>();
        let document_clocks = rows
            .values()
            .map(|row| &row.clock)
            .chain(participants.server_authors.iter().map(|row| &row.clock))
            .map(|clock| (clock.writer.as_str(), clock))
            .collect();
        let mut selected = Self {
            document_clocks,
            review_rows,
            documents: Vec::new(),
            reviews: BTreeMap::new(),
            missing_document_writers: Vec::new(),
        };
        let mut missing = rows.clone();
        let mut declared_review = BTreeSet::new();
        for (index, pin) in pins.iter().enumerate() {
            match &pin.owner {
                RelaySegmentJournalOwner::Document { writer, family } => {
                    let row = take_document(&mut missing, writer)?;
                    selected.documents.push(DocumentSource {
                        index,
                        row,
                        input: DocumentInput::Native(*family),
                    });
                }
                RelaySegmentJournalOwner::PairedSession { writer, actor }
                | RelaySegmentJournalOwner::IndependentDelivery { writer, actor } => {
                    let row = take_document(&mut missing, writer)?;
                    let review =
                        selected.review_row(&mut declared_review, actor, row.principal.as_str())?;
                    selected.documents.push(DocumentSource {
                        index,
                        row,
                        input: if matches!(
                            pin.owner,
                            RelaySegmentJournalOwner::PairedSession { .. }
                        ) {
                            DocumentInput::Paired(review)
                        } else {
                            DocumentInput::Delivery(review)
                        },
                    });
                }
                RelaySegmentJournalOwner::Review { actor, document_writer, family } => {
                    let document = rows.get(document_writer.as_str()).ok_or(Error::Contract(
                        "client journal review document writer is not registered",
                    ))?;
                    let row =
                        selected.review_row(&mut declared_review, actor, &document.principal)?;
                    selected
                        .reviews
                        .entry(document_writer.as_str())
                        .or_default()
                        .push(ReviewSource { index, row, family: *family });
                }
            }
        }
        selected.missing_document_writers = missing.into_keys().map(str::to_owned).collect();
        Ok(selected)
    }

    fn review_row(
        &self,
        declared: &mut BTreeSet<&'a str>,
        actor: &'a str,
        document_principal: &str,
    ) -> Result<&'a RecoveryReviewRegistration> {
        let row = self
            .review_rows
            .get(actor)
            .ok_or(Error::Contract("client journal review actor is not registered"))?;
        if row.principal != document_principal {
            return Err(Error::Contract("client journal review document principal differs"));
        }
        if !declared.insert(actor) {
            return Err(Error::Contract("duplicate client journal review actor"));
        }
        Ok(row)
    }
}

fn take_document<'a>(
    missing: &mut BTreeMap<&str, &'a RecoveryDocumentRegistration>,
    writer: &str,
) -> Result<&'a RecoveryDocumentRegistration> {
    missing
        .remove(writer)
        .ok_or(Error::Contract("client journal document writer is not registered"))
}
