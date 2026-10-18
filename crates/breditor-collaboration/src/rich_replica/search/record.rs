//! Closed source-bound semantic replay record. Queries and templates are never durable commands.
use super::super::{paragraphs, selection::TextPoint};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::TextRun,
    position::TextOffset,
    rich_content::{
        BlockId, RICH_SEARCH_MAX_INSERTED_BYTES, RICH_SEARCH_MAX_MATCHES, RichDocument,
        RichSearchReplacePlan, RichSearchTextReplacement,
    },
};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{IgnoredAny, SeqAccess, Visitor},
};
use sha2::{Digest, Sha256};
use std::{fmt, fmt::Write};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::rich_replica) struct SearchActionV1 {
    source_digest: String,
    #[serde(deserialize_with = "bounded_edits")]
    edits: Vec<SemanticEdit>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SemanticEdit {
    anchor: TextPoint,
    focus: TextPoint,
    text: String,
}

impl fmt::Debug for SearchActionV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SearchActionV1")
            .field("edits", &self.edits.len())
            .finish_non_exhaustive()
    }
}
fn digest(codec: &DocumentJsonCodecV2, document: &RichDocument) -> Result<String, Error> {
    let source =
        codec.encode(document.document()).map_err(|_| Error::Contract("search source encoding"))?;
    let mut output = String::with_capacity(64);
    for byte in Sha256::new()
        .chain_update(b"breditor/search-source/1\0")
        .chain_update(source.as_bytes())
        .finalize()
    {
        write!(&mut output, "{byte:02x}").map_err(|_| Error::Contract("search source digest"))?;
    }
    Ok(output)
}
impl SearchActionV1 {
    pub(super) fn capture(
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        plan: &RichSearchReplacePlan,
    ) -> Result<Self, Error> {
        plan.validate_for(document).map_err(|_| Error::Contract("search source binding"))?;
        let edits = plan
            .edits()
            .iter()
            .map(|edit| {
                let point = |offset: u64| -> Result<TextPoint, Error> {
                    Ok(TextPoint {
                        block: edit.block().as_str().into(),
                        offset: u32::try_from(offset).map_err(|_| Error::Offset)?,
                        affinity: Affinity::After,
                    })
                };
                Ok(SemanticEdit {
                    anchor: point(edit.start().get())?,
                    focus: point(edit.end().get())?,
                    text: edit.inserted().iter().map(TextRun::text).collect(),
                })
            })
            .collect::<Result<_, Error>>()?;
        Ok(Self { source_digest: digest(codec, document)?, edits })
    }
    pub(super) fn plan(
        &self,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<RichSearchReplacePlan, Error> {
        if self.source_digest != digest(codec, document)? {
            return Err(Error::Contract("search replay source differs"));
        }
        if self.edits.is_empty() || self.edits.len() > RICH_SEARCH_MAX_MATCHES {
            return Err(Error::Limit("search semantic edit count"));
        }
        let mut inserted = 0usize;
        let mut replacements = Vec::with_capacity(self.edits.len());
        for edit in &self.edits {
            inserted = inserted
                .checked_add(edit.text.len())
                .ok_or(Error::Limit("search semantic insertion"))?;
            if inserted > RICH_SEARCH_MAX_INSERTED_BYTES {
                return Err(Error::Limit("search semantic insertion"));
            }
            if edit.anchor.block != edit.focus.block
                || edit.anchor.affinity != Affinity::After
                || edit.focus.affinity != Affinity::After
            {
                return Err(Error::Contract("canonical search semantic range"));
            }
            replacements.push(
                RichSearchTextReplacement::try_new(
                    BlockId::try_new(&edit.anchor.block)
                        .map_err(|_| Error::Contract("search semantic block"))?,
                    TextOffset::from(edit.anchor.offset),
                    TextOffset::from(edit.focus.offset),
                    &edit.text,
                )
                .map_err(|_| Error::Contract("search semantic replacement"))?,
            );
        }
        let plan = RichSearchReplacePlan::try_from_semantic_replacements(document, &replacements)
            .map_err(|_| Error::Contract("search semantic admission"))?;
        if plan.edits().len() != self.edits.len()
            || plan
                .preview(&paragraphs::context(codec), document)
                .map_err(|_| Error::Contract("search semantic preview"))?
                .document()
                == document.document()
        {
            return Err(Error::Contract("search semantic change required"));
        }
        Ok(plan)
    }
}
fn bounded_edits<'de, D: Deserializer<'de>>(reader: D) -> Result<Vec<SemanticEdit>, D::Error> {
    struct Edits;
    impl<'de> Visitor<'de> for Edits {
        type Value = Vec<SemanticEdit>;
        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("bounded search semantic edits")
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
            let mut edits = Vec::new();
            while edits.len() < RICH_SEARCH_MAX_MATCHES {
                match sequence.next_element()? {
                    Some(edit) => edits.push(edit),
                    None => return Ok(edits),
                }
            }
            if sequence.next_element::<IgnoredAny>()?.is_some() {
                return Err(serde::de::Error::custom("search semantic edit count"));
            }
            Ok(edits)
        }
    }
    reader.deserialize_seq(Edits)
}
