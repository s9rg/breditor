//! Closed typed rich-flow drafts with host-supplied identities and asset references.
//!
//! These are ABI-local construction requests, not the document or replication protocol.
//! Canonical formats use the literal-array codec. Complete tree admission occurs once
//! through the owner; no DOM HTML, network URL or asset bytes enter this boundary.

use super::support::{checked, nullable};
use crate::{BreditorError, rich_editor::selection::CellRecord};
use breditor_core::{
    block::OrderedListStart,
    codec::RichFormatsJsonCodec,
    document::{TextFragment, TextRun},
    rich_content::{
        AssetGeneration, AssetId, BlockId, ColumnId, ImageAlt, ImageBinding, ImageDraft, ImageId,
        ImageSize, RichBlockDraft, RichFlowParent, RichFlowPosition, RichListDraft,
        RichListItemDraft, RichListKind, RowId, TableCellDraft, TableColumnDraft, TableDraft,
        TableId, TableRowDraft,
    },
    state::EditorContext,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(super) enum FlowRecord {
    Paragraph(TextRecord),
    Heading(HeadingRecord),
    List(ListRecord),
    Image(ImageRecord),
    Table(TableRecord),
}
impl FlowRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<RichBlockDraft, BreditorError> {
        match self {
            Self::Paragraph(record) => record.draft(context),
            Self::Heading(record) => checked(RichBlockDraft::heading(
                &checked(BlockId::try_new(record.block))?,
                record.level,
                &fragment(context, &record.text, &record.formats_json)?,
            )),
            Self::Image(record) => Ok(record.draft(context)?.into()),
            Self::Table(record) => Ok(record.draft(context)?.into()),
            Self::List(record) => {
                let items = record
                    .items
                    .into_iter()
                    .map(|item| {
                        let mut body = item.body.into_iter();
                        let head = body.next().ok_or(super::invalid())?.draft(context)?;
                        checked(RichListItemDraft::try_new(
                            &checked(BlockId::try_new(item.block))?,
                            head,
                            body.map(|value| value.draft(context)).collect::<Result<_, _>>()?,
                        ))
                    })
                    .collect::<Result<_, BreditorError>>()?;
                Ok(checked(RichListDraft::try_new(
                    &checked(BlockId::try_new(record.block))?,
                    list_kind(record.start)?,
                    items,
                ))?
                .into())
            }
        }
    }
}
pub(super) fn fragment(
    context: &EditorContext,
    text: &str,
    formats: &str,
) -> Result<TextFragment, BreditorError> {
    let formats = checked(RichFormatsJsonCodec::new(context.clone()).decode(formats))?;
    if text.is_empty() {
        return Ok(TextFragment::empty());
    }
    Ok(checked(TextRun::try_new(text, formats))?.into())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct TextRecord {
    block: String,
    text: String,
    formats_json: String,
}
impl TextRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<RichBlockDraft, BreditorError> {
        checked(RichBlockDraft::paragraph(
            &checked(BlockId::try_new(self.block))?,
            &fragment(context, &self.text, &self.formats_json)?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct HeadingRecord {
    block: String,
    level: u8,
    text: String,
    formats_json: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ListRecord {
    block: String,
    #[serde(deserialize_with = "nullable")]
    start: Option<u32>,
    items: Vec<ItemRecord>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ItemRecord {
    block: String,
    body: Vec<FlowRecord>,
}
pub(super) fn list_kind(start: Option<u32>) -> Result<RichListKind, BreditorError> {
    Ok(match start {
        None => RichListKind::Bullet,
        Some(value) => RichListKind::Ordered(checked(OrderedListStart::try_new(value))?),
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SizeRecord {
    width: u32,
    height: u32,
}
impl SizeRecord {
    pub(super) fn size(self) -> Result<ImageSize, BreditorError> {
        checked(ImageSize::try_new(self.width, self.height))
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum AltRecord {
    Decorative,
    Description { text: String },
}
impl AltRecord {
    pub(super) fn alt(self) -> Result<ImageAlt, BreditorError> {
        match self {
            Self::Decorative => Ok(ImageAlt::decorative()),
            Self::Description { text } => checked(ImageAlt::try_description(text)),
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ImageRecord {
    block: String,
    image: String,
    asset: String,
    generation: String,
    alt: AltRecord,
    #[serde(deserialize_with = "nullable")]
    size: Option<SizeRecord>,
    #[serde(deserialize_with = "nullable")]
    caption: Option<TextRecord>,
}
impl ImageRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<ImageDraft, BreditorError> {
        let binding = ImageBinding::new(
            checked(ImageId::try_new(self.image))?,
            checked(AssetId::try_new(self.asset))?,
            checked(AssetGeneration::try_new(self.generation))?,
            self.alt.alt()?,
            self.size.map(SizeRecord::size).transpose()?,
        );
        checked(ImageDraft::try_new(
            &checked(BlockId::try_new(self.block))?,
            &binding,
            self.caption.map(|value| value.draft(context)).transpose()?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ColumnRecord {
    id: String,
    width: u32,
}
impl ColumnRecord {
    pub(super) fn draft(self) -> Result<TableColumnDraft, BreditorError> {
        checked(TableColumnDraft::try_new(checked(ColumnId::try_new(self.id))?, self.width))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CellDraftRecord {
    block: String,
    column: String,
    header: bool,
    body: Vec<FlowRecord>,
}
impl CellDraftRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<TableCellDraft, BreditorError> {
        checked(TableCellDraft::try_new(
            &checked(BlockId::try_new(self.block))?,
            checked(ColumnId::try_new(self.column))?,
            self.header,
            self.body.into_iter().map(|value| value.draft(context)).collect::<Result<_, _>>()?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RowRecord {
    block: String,
    id: String,
    cells: Vec<CellDraftRecord>,
}
impl RowRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<TableRowDraft, BreditorError> {
        checked(TableRowDraft::try_new(
            &checked(BlockId::try_new(self.block))?,
            checked(RowId::try_new(self.id))?,
            self.cells.into_iter().map(|value| value.draft(context)).collect::<Result<_, _>>()?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct TableRecord {
    block: String,
    table: String,
    columns: Vec<ColumnRecord>,
    rows: Vec<RowRecord>,
}
impl TableRecord {
    pub(super) fn draft(self, context: &EditorContext) -> Result<TableDraft, BreditorError> {
        checked(TableDraft::try_new(
            &checked(BlockId::try_new(self.block))?,
            checked(TableId::try_new(self.table))?,
            self.columns.into_iter().map(ColumnRecord::draft).collect::<Result<_, _>>()?,
            self.rows.into_iter().map(|value| value.draft(context)).collect::<Result<_, _>>()?,
        ))
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum ParentRecord {
    Document,
    Cell { cell: CellRecord },
    ListItem { block: String },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PositionRecord {
    parent: ParentRecord,
    #[serde(deserialize_with = "nullable")]
    before: Option<String>,
}
impl PositionRecord {
    pub(super) fn position(self) -> Result<RichFlowPosition, BreditorError> {
        Ok(RichFlowPosition::new(
            match self.parent {
                ParentRecord::Document => RichFlowParent::Document,
                ParentRecord::Cell { cell } => RichFlowParent::Cell(cell.into_cell()?),
                ParentRecord::ListItem { block } => {
                    RichFlowParent::ListItem(checked(BlockId::try_new(block))?)
                }
            },
            self.before.map(BlockId::try_new).map(checked).transpose()?,
        ))
    }
}
