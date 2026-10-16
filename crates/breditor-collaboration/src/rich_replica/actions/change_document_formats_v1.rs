//! One document-family semantic intent lowers to original owned format annotations, never root JSON.
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec, decode_rich_selection_format_changes},
    rich_content::{
        RichDocument, RichLocalOutcome, RichLocalSession, RichSelectionCoverage, RichSelectionKind,
    },
    session::HistoryCapacity,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Closed additive document-family formatting action; existing selection command ceilings are unchanged.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeDocumentFormatsV1 {
    /// Strict schema-bound native format intent, retained without collapsing duplicate JSON fields.
    pub changes_json: String,
}
impl ChangeDocumentFormatsV1 {
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<Option<(RichDocument, Vec<super::Command>)>, Error> {
        let context = super::super::paragraphs::context(codec);
        let changes = decode_rich_selection_format_changes(&context, &self.changes_json)
            .map_err(|_| Error::Contract("document format intent"))?;
        let mut preview = RichLocalSession::try_new(
            context.clone(),
            document.clone(),
            Some(RichSelectionKind::Document),
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("document format history"))?,
        )
        .map_err(|_| Error::Contract("document format preview"))?;
        if preview
            .change_selection_formats(&preview.snapshot(), &changes)
            .map_err(|_| Error::Contract("document format admission"))?
            == RichLocalOutcome::Unchanged
        {
            return Ok(None);
        }
        let coverage = RichSelectionCoverage::document(document)
            .map_err(|_| Error::Contract("document format coverage"))?;
        let commands = super::super::selection_formats::document_commands(
            document,
            &coverage,
            &changes,
            &RichFormatsJsonCodec::new(context),
        )?;
        Ok(Some((preview.state().document().clone(), commands)))
    }
    pub(in crate::rich_replica) fn preview(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        self.plan(codec, document)?.ok_or(Error::Contract("document format no-op saved action"))?;
        Ok(())
    }
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        let (_, commands) = self
            .plan(codec, document)?
            .ok_or(Error::Contract("document format no-op saved action"))?;
        for command in commands {
            command.prepare(doc, codec, document)?;
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let (expected, commands) = self
            .plan(codec, document)?
            .ok_or(Error::Contract("document format no-op saved action"))?;
        for (ordinal, command) in commands.iter().enumerate() {
            // One document intent has one captured semantic priority, independent of traversal
            // length and immutable preparation. Ordinals keep its owned annotations distinct.
            command.apply(doc, codec, document, stamp, ordinal)?;
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, &expected)
    }
}
