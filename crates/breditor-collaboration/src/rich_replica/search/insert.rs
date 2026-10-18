//! Reuse original character insertion/format ownership with scalar-safe bounded chunks.
use super::super::{
    actions::{RangeTextRun, ReplaceTextRange},
    selection::TextPoint,
};
use crate::{Error, anchor::Affinity, register::Stamp};
use breditor_core::{
    codec::{DocumentJsonCodecV2, RichFormatsJsonCodec},
    rich_content::RichSearchTextEdit,
};
use loro::LoroDoc;

pub(super) fn insert(
    doc: &LoroDoc,
    codec: &DocumentJsonCodecV2,
    edit: &RichSearchTextEdit,
    stamp: Stamp,
) -> Result<(), Error> {
    let offset = u32::try_from(edit.start().get()).map_err(|_| Error::Offset)?;
    let point =
        TextPoint { block: edit.block().as_str().into(), offset, affinity: Affinity::After };
    let format_codec = RichFormatsJsonCodec::new(super::super::paragraphs::context(codec));
    let mut runs = Vec::new();
    for run in edit.inserted() {
        let formats: Vec<serde_json::Value> = serde_json::from_str(
            &format_codec
                .encode(run.formats())
                .map_err(|_| Error::Contract("search insertion formats"))?,
        )?;
        let mut remaining = run.text();
        while !remaining.is_empty() {
            let mut end = remaining.len().min(64 * 1024);
            while !remaining.is_char_boundary(end) {
                end -= 1;
            }
            runs.push(RangeTextRun { text: remaining[..end].into(), formats: formats.clone() });
            remaining = &remaining[end..];
        }
    }
    ReplaceTextRange { anchor: point.clone(), focus: point, runs }.insert(
        doc,
        edit.block().as_str(),
        offset,
        stamp,
    )
}
