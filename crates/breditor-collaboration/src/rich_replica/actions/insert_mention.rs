//! V4 mention insertion: one guarded replacement of a typed `@query` trigger by `@label` (the
//! mention) plus one plain space, with exactly the local `insertMention` semantics.
//!
//! The command is planned by the frozen local session itself (`RichLocalSession::insert_mention`
//! over the current projection: profile, snapping, target kinds and the styles of the range
//! start), then lowered to the original source-preserving `ReplaceTextRange` causal edit, which
//! verifies the complete core result before anything is kept.
use super::super::selection::{Selection, TextPoint};
use super::{RangeTextRun, ReplaceTextRange};
use crate::{Error, anchor::Affinity, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    rich_content::{
        RichDocument, RichLocalSession, RichMention, RichMentionId, RichMentionKind,
        RichMentionLabel, RichSelectionKind, RichTextPoint,
    },
    session::HistoryCapacity,
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One mention entity reference: the durable `(kind, id)` and the label snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MentionEntity {
    /// Closed kind: `user`, `page` or `tag`.
    pub kind: String,
    /// Durable host identity.
    pub id: String,
    /// Display snapshot stored without the `@` prefix.
    pub label: String,
}
impl MentionEntity {
    /// Admit the exact frozen V4 domains (no trimming or normalization).
    /// # Errors
    /// Rejects an unknown kind, an invalid identity or label.
    pub fn admit(&self) -> Result<RichMention, Error> {
        Ok(RichMention::new(
            RichMentionKind::parse(&self.kind).map_err(|_| Error::Contract("mention kind"))?,
            RichMentionId::try_new(&self.id).map_err(|_| Error::Contract("mention id"))?,
            RichMentionLabel::try_new(&self.label).map_err(|_| Error::Contract("mention label"))?,
        ))
    }
    /// The exact stored reference of one admitted mention.
    #[must_use]
    pub fn from_mention(mention: &RichMention) -> Self {
        Self {
            kind: mention.kind().as_str().into(),
            id: mention.id().as_str().into(),
            label: mention.label().as_str().into(),
        }
    }
}

/// Replace one text range (normally the typed `@query`) in a paragraph, heading or section
/// summary by the mention and one plain space.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertMention {
    /// Directional anchor of the replaced range (a caret inserts at a point).
    pub anchor: TextPoint,
    /// Directional focus of the replaced range.
    pub focus: TextPoint,
    /// The inserted entity.
    pub mention: MentionEntity,
}

/// The exact local plan: the lowered edit, the core result, the caret after the space and the
/// pending typing formats (the trigger's styles, never a mention).
pub(in crate::rich_replica) struct MentionPlan {
    pub replace: ReplaceTextRange,
    pub document: RichDocument,
    pub caret: TextPoint,
    pub pending: Vec<Value>,
}

impl InsertMention {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        ReplaceTextRange { anchor: self.anchor.clone(), focus: self.focus.clone(), runs: vec![] }
            .prepare(doc)
    }
    pub(in crate::rich_replica) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<MentionPlan, Error> {
        let context = super::super::paragraphs::context(codec);
        if !context.schema().supports_rich_mentions() {
            return Err(Error::Contract("shared mentions require rich language V4"));
        }
        let mention = self.mention.admit()?;
        // Admission snaps endpoints out of existing mentions, exactly like the local owner.
        let target =
            Selection::TextRange { anchor: self.anchor.clone(), focus: self.focus.clone() }
                .admit(document)?;
        let RichSelectionKind::TextRange { anchor, focus } = target.kind() else {
            return Err(Error::Contract("shared mention target"));
        };
        let (anchor, focus) = (point(anchor)?, point(focus)?);
        let mut preview = RichLocalSession::try_new(
            context.clone(),
            document.clone(),
            None,
            HistoryCapacity::try_new(0).map_err(|_| Error::Contract("mention preview history"))?,
        )
        .map_err(|_| Error::Contract("mention preview"))?;
        preview
            .insert_mention(&preview.snapshot(), target.kind(), &mention)
            .map_err(|_| Error::Contract("shared mention admission"))?;
        let state = preview.state();
        let formats = RichFormatsJsonCodec::new(context);
        let base = state.pending_formats().ok_or(Error::Contract("mention pending formats"))?;
        let pending: Vec<Value> = serde_json::from_str(
            &formats.encode(base).map_err(|_| Error::Contract("mention formats"))?,
        )?;
        let mut with_mention: Vec<_> = base.iter().cloned().collect();
        with_mention.push(mention.format());
        with_mention.sort_by(|a, b| a.kind().as_str().cmp(b.kind().as_str()));
        let marked: Vec<Value> = serde_json::from_str(
            &formats
                .encode(
                    &breditor_core::document::FormatSet::try_from_formats(with_mention)
                        .map_err(|_| Error::Contract("mention format"))?,
                )
                .map_err(|_| Error::Contract("mention format"))?,
        )?;
        let caret = match state.selection().map(breditor_core::rich_content::RichSelection::kind) {
            Some(RichSelectionKind::TextRange { focus, .. }) => point(focus)?,
            _ => return Err(Error::Contract("mention caret")),
        };
        let (start, end) = super::super::range_plan::ordered(document, &anchor, &focus)?;
        let (start, end) = (start.clone(), end.clone());
        Ok(MentionPlan {
            replace: ReplaceTextRange {
                anchor: start,
                focus: end,
                runs: vec![
                    RangeTextRun { text: mention.text(), formats: marked },
                    RangeTextRun { text: " ".into(), formats: pending.clone() },
                ],
            },
            document: state.document().clone(),
            caret,
            pending,
        })
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        self.plan(codec, document)?.replace.apply(doc, codec, document, stamp)
    }
}

fn point(value: &RichTextPoint) -> Result<TextPoint, Error> {
    Ok(TextPoint {
        block: value.block().as_str().into(),
        offset: u32::try_from(value.offset().get()).map_err(|_| Error::Offset)?,
        affinity: match value.affinity() {
            breditor_core::position::Affinity::Before => Affinity::Before,
            breditor_core::position::Affinity::After => Affinity::After,
        },
    })
}
