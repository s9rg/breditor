//! Native-derived source witnesses. Packets cannot supply weaker guards or choose conflict winners.
use super::packet::{DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope};
use crate::{
    Error,
    rich_replica::{
        Command,
        selection::{Selection, TextPoint},
    },
};
use breditor_core::rich_content::{
    RichCoverageExtent, RichDocument, RichLayoutChange, RichSelectionCoverage,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

/// Exact semantic source dependency which changed before the proposed edit could be prepared.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SuggestionConflictTarget {
    /// Explicit whole-document operation or a batch whose intermediate targets need that scope.
    Document,
    /// Complete affected source subtree, including text and inline formatting.
    Block {
        /// Stable original block identity.
        block: String,
    },
    /// Original native scalar identities, even when replacement text has equal semantic content.
    Characters {
        /// Stable original text block identity.
        block: String,
    },
    /// Retained ancestor kind/properties without its unrelated descendant text.
    Header {
        /// Stable original block identity.
        block: String,
    },
    /// Direct structural order, not text in unrelated sibling subtrees.
    Children {
        /// Stable parent identity, or the explicit document root.
        parent: Option<String>,
    },
    /// One independently owned semantic property plus target kind/entity binding.
    Property {
        /// Stable original block identity.
        block: String,
        /// Exact schema-qualified property name; absence differs from a value.
        property: String,
    },
    /// One retained column definition; another column's width does not conflict.
    Column {
        /// Stable original table block identity.
        block: String,
        /// Stable source column identity.
        column: String,
    },
}
pub(super) struct ReadSet<'a> {
    root: &'a Value,
    document: &'a RichDocument,
    doc: &'a loro::LoroDoc,
    codec: &'a breditor_core::codec::DocumentJsonCodecV2,
    values: BTreeMap<SuggestionConflictTarget, Value>,
}
fn node<'a>(root: &'a Value, block: &str) -> Option<&'a Value> {
    super::super::creation::find(root, block)
}
fn parent<'a>(root: &'a Value, block: &str) -> Option<&'a Value> {
    let children = root["children"].as_array()?;
    if children.iter().any(|child| child["properties"]["breditor/block-id"].as_str() == Some(block))
    {
        return Some(root);
    }
    children.iter().find_map(|child| parent(child, block))
}
fn id(value: &Value) -> Option<String> {
    value["properties"]["breditor/block-id"].as_str().map(str::to_owned)
}
impl SuggestionConflictTarget {
    fn read(&self, root: &Value, doc: &loro::LoroDoc) -> Result<Option<Value>, Error> {
        Ok(match self {
            Self::Document => Some(root.clone()),
            Self::Block { block } => node(root, block).cloned(),
            Self::Characters { block } => node(root, block).map(|node| super::text_witness::capture(doc, block, node)).transpose()?,
            Self::Header { block } => node(root, block).map(|value| json!({"type":value["type"],"properties":value["properties"],"entity":value.get("entityId")})),
            Self::Children { parent } => {
                let value = if let Some(block) = parent { node(root, block) } else { Some(root) };
                value.map(|value| {
                    let children = value["children"].as_array().ok_or(Error::Contract("suggestion source children"))?.iter().filter(|child| child["kind"] == "element").map(|child| id(child).ok_or(Error::Contract("suggestion source child identity"))).collect::<Result<Vec<_>, _>>()?;
                    Ok::<_, Error>(json!({"type":value["type"],"entity":value.get("entityId"),"children":children}))
                }).transpose()?
            }
            Self::Property { block, property } => node(root, block).map(|value| json!({"type":value["type"],"entity":value.get("entityId"),"present":value["properties"].get(property).is_some(),"value":value["properties"].get(property)})),
            Self::Column { block, column } => node(root, block).and_then(|value| value["properties"]["breditor/columns"].as_array()?.iter().find(|value| value["id"].as_str() == Some(column))).cloned(),
        })
    }
}
impl<'a> ReadSet<'a> {
    /// A new explicit sparse revision proves only its stored removal intent. This does not
    /// change the original masked child's exact-document Accept witness or explicit Document scope.
    pub(super) fn capture_text_rebase(
        root: &'a Value,
        document: &'a RichDocument,
        doc: &'a loro::LoroDoc,
        codec: &'a breditor_core::codec::DocumentJsonCodecV2,
        draft: &DocumentSuggestionDraft,
    ) -> Result<Self, Error> {
        if let DocumentSuggestionEdit::Commands(commands) = &draft.edit
            && let [Command::ReplaceMaskedGeneralTextRangeV1(value)] = commands.as_slice()
        {
            let mut result = Self { root, document, doc, codec, values: BTreeMap::new() };
            if draft.scope == DocumentSuggestionScope::Document {
                result.add(SuggestionConflictTarget::Document)?;
            }
            result.range(&value.range.anchor, &value.range.focus)?;
            return Ok(result);
        }
        Self::capture(root, document, doc, codec, draft)
    }
    /// A text rebase proves selected scalar identity/marks separately. Ignore only those text
    /// bodies, not their metadata or enclosing structural/subtree guards. Retained row/cell
    /// axes keep header/child-order witnesses rather than whole-body text guards. Whole atoms
    /// retain complete witnesses, including text in descendants that they would remove.
    pub(super) fn text_rebase_conflicts(
        &self,
        current: &Value,
        doc: &loro::LoroDoc,
        text_blocks: &std::collections::BTreeSet<String>,
    ) -> Result<Vec<SuggestionConflictTarget>, Error> {
        let mut conflicts = vec![];
        for (target, before) in &self.values {
            let (target, before) = match target {
                SuggestionConflictTarget::Characters { block } if text_blocks.contains(block) => {
                    continue;
                }
                SuggestionConflictTarget::Block { block }
                    if text_blocks.contains(block)
                        || node(self.root, block).is_some_and(|value| {
                            matches!(
                                value["type"].as_str(),
                                Some("breditor/table-row" | "breditor/table-cell")
                            )
                        }) =>
                {
                    let header = SuggestionConflictTarget::Header { block: block.clone() };
                    let before = header.read(self.root, self.doc)?;
                    if header.read(current, doc)? != before {
                        conflicts.push(header);
                    }
                    continue;
                }
                _ => (target, before),
            };
            if target.read(current, doc)?.as_ref() != Some(before) {
                conflicts.push(target.clone());
            }
        }
        conflicts.sort();
        conflicts.dedup();
        Ok(conflicts)
    }

    pub fn capture(
        root: &'a Value,
        document: &'a RichDocument,
        doc: &'a loro::LoroDoc,
        codec: &'a breditor_core::codec::DocumentJsonCodecV2,
        draft: &DocumentSuggestionDraft,
    ) -> Result<Self, Error> {
        let mut result = Self { root, document, doc, codec, values: BTreeMap::new() };
        if draft.scope == DocumentSuggestionScope::Document {
            result.add(SuggestionConflictTarget::Document)?;
        }
        match &draft.edit {
            DocumentSuggestionEdit::Commands(commands) => {
                for command in commands {
                    result.command(command)?;
                }
            }
            DocumentSuggestionEdit::GeneralText(action) => {
                result.range(&action.range.anchor, &action.range.focus)?;
            }
        }
        Ok(result)
    }
    pub fn conflicts(
        &self,
        current: &Value,
        doc: &loro::LoroDoc,
    ) -> Result<Vec<SuggestionConflictTarget>, Error> {
        self.values
            .iter()
            .filter_map(|(target, before)| match target.read(current, doc) {
                Ok(Some(after)) if after == *before => None,
                Ok(_) => Some(Ok(target.clone())),
                Err(error) => Some(Err(error)),
            })
            .collect()
    }
    fn add(&mut self, target: SuggestionConflictTarget) -> Result<(), Error> {
        if self.values.contains_key(&target) {
            return Ok(());
        }
        let subtree = match &target {
            SuggestionConflictTarget::Document => Some(self.root),
            SuggestionConflictTarget::Block { block } => node(self.root, block),
            _ => None,
        };
        let mut text_blocks = vec![];
        if let Some(subtree) = subtree {
            super::text_witness::blocks(subtree, &mut text_blocks);
        }
        if let Some(value) = target.read(self.root, self.doc)? {
            self.values.insert(target, value);
        }
        for block in text_blocks {
            self.add(SuggestionConflictTarget::Characters { block })?;
        }
        if self.values.len() > 20_000 {
            return Err(Error::Limit("suggestion source witnesses"));
        }
        Ok(())
    }
    fn block(&mut self, block: &str) -> Result<(), Error> {
        self.add(SuggestionConflictTarget::Block { block: block.into() })
    }
    fn children(&mut self, parent: Option<&str>) -> Result<(), Error> {
        self.add(SuggestionConflictTarget::Children { parent: parent.map(str::to_owned) })
    }
    fn property(&mut self, block: &str, property: &str) -> Result<(), Error> {
        self.add(SuggestionConflictTarget::Property {
            block: block.into(),
            property: property.into(),
        })
    }
    fn placed(&mut self, block: &str) -> Result<(), Error> {
        self.block(block)?;
        self.context(block)
    }
    fn context(&mut self, block: &str) -> Result<(), Error> {
        let mut block = block.to_owned();
        while let Some(value) = parent(self.root, &block) {
            let parent_id = id(value);
            self.children(parent_id.as_deref())?;
            let Some(parent_id) = parent_id else {
                break;
            };
            self.add(SuggestionConflictTarget::Header { block: parent_id.clone() })?;
            block = parent_id;
        }
        Ok(())
    }
    fn table_shape(&mut self, block: &str) -> Result<(), Error> {
        self.add(SuggestionConflictTarget::Header { block: block.into() })?;
        self.children(Some(block))
    }
    fn column_cells(&mut self, block: &str, column: &str) -> Result<(), Error> {
        self.table_shape(block)?;
        let cells = node(self.root, block)
            .and_then(|value| value["children"].as_array())
            .into_iter()
            .flatten()
            .flat_map(|row| row["children"].as_array().into_iter().flatten())
            .filter(|cell| cell["properties"]["breditor/column-id"].as_str() == Some(column))
            .filter_map(id)
            .collect::<Vec<_>>();
        for cell in cells {
            self.block(&cell)?;
            self.context(&cell)?;
        }
        Ok(())
    }
    fn grid(&mut self, anchor: &str, focus: &str) -> Result<(), Error> {
        let Ok(selection) = super::super::cell_bodies::selection(self.document, anchor, focus)
        else {
            return self.add(SuggestionConflictTarget::Document);
        };
        let coverage = RichSelectionCoverage::capture(self.document, &selection)
            .map_err(|_| Error::Contract("suggestion grid coverage"))?;
        self.coverage(&coverage)
    }
    fn caption(&mut self, block: &str) -> Result<(), Error> {
        self.children(Some(block))?;
        let children = node(self.root, block)
            .and_then(|value| value["children"].as_array())
            .into_iter()
            .flatten()
            .filter_map(id)
            .collect::<Vec<_>>();
        for child in children {
            self.block(&child)?;
        }
        Ok(())
    }
    fn siblings(&mut self, first: &str, last: &str) -> Result<(), Error> {
        let Some(parent) = parent(self.root, first) else {
            return self.add(SuggestionConflictTarget::Document);
        };
        let children =
            parent["children"].as_array().ok_or(Error::Contract("suggestion sibling source"))?;
        let start = children.iter().position(|child| id(child).as_deref() == Some(first));
        let end = children.iter().position(|child| id(child).as_deref() == Some(last));
        let (Some(start), Some(end)) = (start, end) else {
            return self.add(SuggestionConflictTarget::Document);
        };
        if start > end {
            return self.add(SuggestionConflictTarget::Document);
        }
        let parent_id = id(parent);
        let blocks = children[start..=end].iter().filter_map(id).collect::<Vec<_>>();
        self.children(parent_id.as_deref())?;
        for block in blocks {
            self.block(&block)?;
        }
        Ok(())
    }
    fn range(&mut self, anchor: &TextPoint, focus: &TextPoint) -> Result<(), Error> {
        let selection = Selection::TextRange { anchor: anchor.clone(), focus: focus.clone() };
        let Ok(selection) = selection.admit(self.document) else {
            return self.add(SuggestionConflictTarget::Document);
        };
        let coverage = RichSelectionCoverage::capture(self.document, &selection)
            .map_err(|_| Error::Contract("suggestion range coverage"))?;
        self.coverage(&coverage)
    }
    fn coverage(&mut self, coverage: &RichSelectionCoverage) -> Result<(), Error> {
        for value in coverage.nodes() {
            let block = value.block().as_str();
            self.add(if value.extent() == RichCoverageExtent::Whole {
                SuggestionConflictTarget::Block { block: block.into() }
            } else {
                SuggestionConflictTarget::Header { block: block.into() }
            })?;
            self.children(Some(block))?;
            self.children(value.parent().map(breditor_core::rich_content::BlockId::as_str))?;
        }
        for value in coverage.text() {
            self.block(value.block().as_str())?;
        }
        Ok(())
    }
    // Exhaustive matching is deliberate: a new command cannot acquire an empty/guessed read set.
    #[allow(clippy::too_many_lines)] // Keep the complete command family exhaustively checked together.
    fn command(&mut self, command: &Command) -> Result<(), Error> {
        match command {
            Command::ChangeDocumentFormatsV1(_)
            | Command::ChangeDocumentLayoutV1(_)
            | Command::PasteDocumentClipboardV1(_)
            | Command::ReplaceMaskedGeneralTextRangeV1(_)
            | Command::ReplaceDocumentPlainTextV1(_) => {
                self.add(SuggestionConflictTarget::Document)?;
            }
            Command::InsertText(value) => self.block(&value.block)?,
            Command::DeleteText(value) => self.block(&value.block)?,
            Command::SetFormat(value) => self.block(&value.block)?,
            Command::ReplaceTextRange(value) => self.range(&value.anchor, &value.focus)?,
            Command::PasteFlowAtText(value) => self.range(&value.anchor, &value.focus)?,
            Command::PasteGeneralFlowAtTextV1(value) => {
                self.range(&value.deletion.range.anchor, &value.deletion.range.focus)?;
            }
            Command::InsertGeneralParagraphV1(value) => match &value.selection {
                Selection::TextRange { anchor, focus } => self.range(anchor, focus)?,
                Selection::Node { block } => self.placed(block)?,
                Selection::Grid { .. } => self.add(SuggestionConflictTarget::Document)?,
            },
            Command::SetHeading(value) => {
                self.property(&value.block, "breditor/level")?;
            }
            Command::SetCodeBlock(value) => self.block(&value.block)?,
            Command::SetCodeLanguage(value) => self.property(&value.block, "breditor/language")?,
            Command::SetTaskChecked(value) => self.property(&value.block, "breditor/checked")?,
            Command::SetBlockLayout(value) => {
                let patch = breditor_core::codec::decode_rich_block_layout_patch(
                    &super::super::paragraphs::context(self.codec),
                    &value.patch_json,
                )
                .map_err(|_| Error::Contract("suggestion layout patch"))?;
                for (property, changed) in [
                    ("breditor/block-align", !matches!(patch.alignment(), RichLayoutChange::Keep)),
                    (
                        "breditor/block-direction",
                        !matches!(patch.direction(), RichLayoutChange::Keep),
                    ),
                    ("breditor/block-indent", !matches!(patch.indent(), RichLayoutChange::Keep)),
                    (
                        "breditor/line-height-percent",
                        !matches!(patch.line_height(), RichLayoutChange::Keep),
                    ),
                ] {
                    if changed {
                        self.property(&value.block, property)?;
                    }
                }
            }
            Command::SplitTextBlock(value) => self.placed(&value.block)?,
            Command::JoinTextBlocks(value) => {
                self.placed(&value.left)?;
                self.placed(&value.right)?;
            }
            Command::SplitListItem(value) => self.placed(&value.block)?,
            Command::SplitTaskItem(value) => self.placed(&value.block)?,
            Command::WrapList(value) => self.siblings(&value.first, &value.last)?,
            Command::WrapTaskList(value) => self.siblings(&value.first, &value.last)?,
            Command::WrapBlockquote(value) => self.siblings(&value.first, &value.last)?,
            Command::UnwrapList(value) => self.placed(&value.container)?,
            Command::UnwrapTaskList(value) => self.placed(&value.container)?,
            Command::UnwrapBlockquote(value) => self.placed(&value.wrapper)?,
            Command::SetListKind(value) => self.placed(&value.container)?,
            Command::IndentListItems(value) => self.placed(&value.container)?,
            Command::OutdentListItems(value) => self.placed(&value.container)?,
            Command::IndentTaskItems(value) => self.placed(&value.container)?,
            Command::OutdentTaskItems(value) => self.placed(&value.container)?,
            Command::ExitTaskItem(value) => self.placed(&value.container)?,
            Command::JoinListItems(value) => self.placed(&value.container)?,
            Command::JoinTaskItems(value) => self.placed(&value.container)?,
            Command::InsertBlocks(value) => self.children(value.parent.as_deref())?,
            Command::PasteBlocks(value) => self.children(value.parent.as_deref())?,
            Command::InsertHorizontalRule(value) => self.children(value.parent.as_deref())?,
            Command::DeleteHorizontalRule(value) => self.placed(&value.block)?,
            Command::MoveBlock(value) => {
                self.placed(&value.block)?;
                self.children(value.parent.as_deref())?;
            }
            Command::DeleteBlock(value) => self.placed(&value.block)?,
            Command::SetImageAlt(value) => {
                self.property(&value.block, "breditor/alt-text")?;
                self.property(&value.block, "breditor/decorative")?;
            }
            Command::ReplaceImage(value) => {
                self.property(&value.block, "breditor/asset-id")?;
                self.property(&value.block, "breditor/asset-generation")?;
            }
            Command::ResizeImage(value) => {
                self.property(&value.block, "breditor/width")?;
                self.property(&value.block, "breditor/height")?;
            }
            Command::SetImageCaption(value) => self.caption(&value.block)?,
            Command::ResizeColumn(value) => self.add(SuggestionConflictTarget::Column {
                block: value.block.clone(),
                column: value.column.clone(),
            })?,
            Command::InsertColumn(value) => self.table_shape(&value.block)?,
            Command::InsertRow(value) => self.table_shape(&value.block)?,
            Command::MoveColumn(value) => self.table_shape(&value.block)?,
            Command::DeleteColumn(value) => self.column_cells(&value.block, &value.column)?,
            Command::MergeCells(value) => {
                self.table_shape(&value.block)?;
                self.grid(&value.anchor, &value.focus)?;
            }
            Command::SplitCell(value) => self.placed(&value.cell)?,
            Command::SetHeader(value) => {
                for cell in &value.cells {
                    self.property(cell, "breditor/header")?;
                    self.context(cell)?;
                }
            }
            Command::ClearTableCells(value) => {
                self.grid(&value.anchor, &value.focus)?;
            }
            Command::PasteTableCells(value) => {
                self.grid(&value.anchor, &value.focus)?;
            }
            Command::WrapDetails(value) => self.siblings(&value.first, &value.last)?,
            Command::UnwrapDetails(value) => self.placed(&value.wrapper)?,
            Command::InsertPageBreak(_) => self.children(None)?,
            Command::DeletePageBreak(value) => self.placed(&value.block)?,
            Command::AddTableCaption(value) => self.table_shape(&value.block)?,
            Command::RemoveTableCaption(value) => self.table_shape(&value.block)?,
        }
        Ok(())
    }
}
