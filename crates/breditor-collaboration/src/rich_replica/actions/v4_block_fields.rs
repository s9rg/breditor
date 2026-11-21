//! Shared V4 block-field commands: ordered-list numbering, bookmarks (set, clear and
//! link-preserving rename) and section open state.
//!
//! Each command owns only its own independently replicated field
//! (`property:breditor/list-style`, `property:breditor/list-reversed`,
//! `property:breditor/bookmark`, `property:breditor/details-open`), so concurrent edits
//! of different fields merge and the same field resolves by the existing deterministic
//! register order (highest causal stamp wins). The native V4 action is always captured
//! and admitted first against the basis, so the shared command has exactly the local
//! semantics and errors, and the published projection is compared with the native
//! result. One command (or one rename) is one writer-local history group.
use super::SetFormat;
use crate::{Error, register::Stamp};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    rich_content::{
        RichBookmarkError, RichBookmarkName, RichDocument, RichLayoutChange, RichListNumberStyle,
        RichListNumberingPatch,
        actions::{
            RichActionError, SetBookmark as CoreSetBookmark, SetDetailsOpen as CoreSetDetailsOpen,
            SetListNumbering as CoreSetListNumbering,
        },
    },
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

const LIST_STYLE: &str = "breditor/list-style";
const LIST_REVERSED: &str = "breditor/list-reversed";
const BOOKMARK: &str = "breditor/bookmark";
const DETAILS_OPEN: &str = "breditor/details-open";
const LINK: &str = "breditor-inline/link";
const HREF: &str = "breditor-inline/href";
const NEW_WINDOW: &str = "breditor-inline/new-window";

fn field(property: &str) -> String {
    format!("property:{property}")
}
fn prepare(doc: &LoroDoc, block: &str, property: &str) -> Result<(), Error> {
    super::prepare_field(doc, block, &field(property))
}
/// Write one owned optional property: `Some` sets it, `None` removes it.
fn write(
    doc: &LoroDoc,
    block: &str,
    property: &str,
    value: Option<Value>,
    stamp: Stamp,
) -> Result<(), Error> {
    let patch = value.map_or_else(
        || super::super::model::Patch { sets: BTreeMap::new(), removes: vec![property.into()] },
        |value| super::super::model::Patch::set(property, value),
    );
    super::super::model::write_patch(doc, block, &field(property), &patch, stamp)
}
fn require_v4(doc: &LoroDoc) -> Result<(), Error> {
    if super::super::protocol::Protocol::read(doc)?.v4() {
        Ok(())
    } else {
        Err(Error::Contract("shared V4 block field requires model 14"))
    }
}
/// Map a native bookmark failure to a stable, payload-free shared error.
fn bookmark_error(error: &RichActionError) -> Error {
    match error {
        RichActionError::Bookmark(RichBookmarkError::Duplicate) => {
            Error::Contract("shared bookmark name is already used in this document")
        }
        RichActionError::Bookmark(RichBookmarkError::Missing) => {
            Error::Contract("shared bookmark does not exist")
        }
        RichActionError::Bookmark(RichBookmarkError::Target) => {
            Error::Contract("shared bookmark requires a paragraph, heading or code block")
        }
        _ => Error::Contract("shared bookmark admission"),
    }
}
fn name(value: &str) -> Result<RichBookmarkName, Error> {
    RichBookmarkName::try_new(value).map_err(|_| Error::Contract("shared bookmark name grammar"))
}

/// One explicit numbering-style intent: keep, clear (host default) or one closed token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ListStyleChange {
    /// Keep the observed style.
    Keep,
    /// Remove the explicit style (the host/user-agent default).
    Clear,
    /// `decimal`, `lower-alpha`, `upper-alpha`, `lower-roman` or `upper-roman`.
    Set(String),
}

/// Set V4 ordered-list marker style and/or counting order on one ordered list.
///
/// `start` is the list's existing paired kind/start field: change it with
/// [`super::SetListKind`] in the same group so both are one Undo step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetListNumbering {
    /// Stable ordered-list block identity.
    pub list: String,
    /// Style intent.
    pub style: ListStyleChange,
    /// `Some(true)` reverses, `Some(false)` removes reversal, `None` keeps (explicit null).
    #[serde(deserialize_with = "Option::deserialize")]
    pub reversed: Option<bool>,
}
impl SetListNumbering {
    fn patch(&self) -> Result<RichListNumberingPatch, Error> {
        let style = match &self.style {
            ListStyleChange::Keep => RichLayoutChange::Keep,
            ListStyleChange::Clear => RichLayoutChange::Clear,
            ListStyleChange::Set(token) => RichLayoutChange::Set(
                RichListNumberStyle::from_token(token)
                    .ok_or(Error::Contract("shared list numbering style token"))?,
            ),
        };
        RichListNumberingPatch::try_new(style, self.reversed, None)
            .map_err(|_| Error::Contract("shared list numbering intent"))
    }
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        require_v4(doc)?;
        prepare(doc, &self.list, LIST_STYLE)?;
        prepare(doc, &self.list, LIST_REVERSED)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let patch = self.patch()?;
        let action = CoreSetListNumbering::capture(
            document,
            &super::super::paragraphs::id(&self.list)?,
            &patch,
        )
        .map_err(|_| Error::Contract("shared list numbering capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared list numbering admission"))?
        else {
            return Ok(());
        };
        match patch.style() {
            RichLayoutChange::Keep => {}
            RichLayoutChange::Clear => write(doc, &self.list, LIST_STYLE, None, stamp)?,
            RichLayoutChange::Set(style) => {
                write(doc, &self.list, LIST_STYLE, Some(json!(style.code())), stamp)?;
            }
        }
        if let Some(reversed) = patch.reversed() {
            write(doc, &self.list, LIST_REVERSED, reversed.then_some(Value::Bool(true)), stamp)?;
        }
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}

/// Set, replace or clear (`None`) one text block's bookmark; links are never rewritten.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetBookmark {
    /// Stable paragraph, heading or code-block identity.
    pub block: String,
    /// Bookmark name (`[A-Za-z][A-Za-z0-9_-]{0,63}`), or an explicit null to clear.
    #[serde(deserialize_with = "Option::deserialize")]
    pub name: Option<String>,
}
impl SetBookmark {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        require_v4(doc)?;
        super::super::creation::activate_text(doc, &self.block)?;
        prepare(doc, &self.block, BOOKMARK)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let name = self.name.as_deref().map(name).transpose()?;
        let action = CoreSetBookmark::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            name.as_ref(),
        )
        .map_err(|error| bookmark_error(&error))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|error| bookmark_error(&error))?
        else {
            return Ok(());
        };
        write(doc, &self.block, BOOKMARK, self.name.as_ref().map(|name| json!(name)), stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}

/// Rename bookmark `from` to `to` and retarget every same-window `#from` link in every
/// text block to `#to`, in one group (the native link-preserving rename).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameBookmark {
    /// Existing bookmark name.
    pub from: String,
    /// New, unused bookmark name.
    pub to: String,
}

/// One maximal run of an internal link to `target` in one text block (UTF-16).
struct LinkRun {
    block: String,
    offset: u32,
    length: u32,
}
fn link_target(format: &Value) -> Option<&str> {
    (format["type"] == LINK && format["properties"][NEW_WINDOW] == false)
        .then(|| format["properties"][HREF].as_str())
        .flatten()
}
fn link_runs(document: &Value, target: &str) -> Result<Vec<LinkRun>, Error> {
    fn visit(node: &Value, target: &str, out: &mut Vec<LinkRun>) -> Result<(), Error> {
        let Some(children) = node["children"].as_array() else { return Ok(()) };
        let block = node["properties"]["breditor/block-id"].as_str();
        let mut offset = 0_u32;
        for child in children {
            if child["kind"] == "element" {
                visit(child, target, out)?;
                continue;
            }
            let length =
                u32::try_from(child["text"].as_str().unwrap_or_default().encode_utf16().count())
                    .map_err(|_| Error::Offset)?;
            let linked = child["formats"]
                .as_array()
                .is_some_and(|formats| formats.iter().any(|f| link_target(f) == Some(target)));
            if linked && let Some(block) = block {
                match out.last_mut() {
                    Some(run) if run.block == block && run.offset + run.length == offset => {
                        run.length += length;
                    }
                    _ => out.push(LinkRun { block: block.into(), offset, length }),
                }
            }
            offset = offset.checked_add(length).ok_or(Error::Offset)?;
        }
        Ok(())
    }
    let mut out = vec![];
    visit(&document["root"], target, &mut out)?;
    Ok(out)
}
fn document_json(codec: &DocumentJsonCodecV2, document: &RichDocument) -> Result<Value, Error> {
    Ok(serde_json::from_str(
        &codec
            .encode(document.document())
            .map_err(|_| Error::Contract("shared bookmark basis encoding"))?,
    )?)
}
fn holder(document: &Value, name: &str) -> Option<String> {
    fn visit(node: &Value, name: &str) -> Option<String> {
        if node["properties"][BOOKMARK] == name {
            return node["properties"]["breditor/block-id"].as_str().map(str::to_owned);
        }
        node["children"].as_array()?.iter().find_map(|child| visit(child, name))
    }
    visit(&document["root"], name)
}
impl RenameBookmark {
    pub(super) fn prepare(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
    ) -> Result<(), Error> {
        require_v4(doc)?;
        let basis = document_json(codec, document)?;
        let block =
            holder(&basis, &self.from).ok_or(Error::Contract("shared bookmark does not exist"))?;
        prepare(doc, &block, BOOKMARK)?;
        for run in link_runs(&basis, &format!("#{}", self.from))? {
            super::super::text_flow::prepare_root(doc, &run.block)?;
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        let (from, to) = (name(&self.from)?, name(&self.to)?);
        let action =
            CoreSetBookmark::rename(document, &from, &to).map_err(|e| bookmark_error(&e))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|error| bookmark_error(&error))?
        else {
            return Ok(());
        };
        let basis = document_json(codec, document)?;
        let block =
            holder(&basis, &self.from).ok_or(Error::Contract("shared bookmark does not exist"))?;
        write(doc, &block, BOOKMARK, Some(json!(self.to)), stamp)?;
        // Flow interval resolution reads committed contributions only.
        doc.commit();
        let format = json!({"type":LINK,"properties":{HREF:to.link_target(),NEW_WINDOW:false}});
        for run in link_runs(&basis, &from.link_target())? {
            let LinkRun { block, offset, length } = run;
            SetFormat { block, offset, length, format: format.clone(), enabled: true }
                .apply(doc, stamp, ordinal)?;
            doc.commit();
        }
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}

/// Expand (`true`) or collapse (`false`) one section; persisted document state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetDetailsOpen {
    /// Stable section (`breditor/details`) identity.
    pub block: String,
    /// Desired open state; collapsed is stored as absence.
    pub open: bool,
}
impl SetDetailsOpen {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        require_v4(doc)?;
        prepare(doc, &self.block, DETAILS_OPEN)
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &DocumentJsonCodecV2,
        document: &RichDocument,
        stamp: Stamp,
    ) -> Result<(), Error> {
        let action = CoreSetDetailsOpen::capture(
            document,
            &super::super::paragraphs::id(&self.block)?,
            self.open,
        )
        .map_err(|_| Error::Contract("shared section open capture"))?;
        let Some(edit) = action
            .apply(&super::super::paragraphs::context(codec), document)
            .map_err(|_| Error::Contract("shared section open admission"))?
        else {
            return Ok(());
        };
        write(doc, &self.block, DETAILS_OPEN, self.open.then_some(Value::Bool(true)), stamp)?;
        super::super::paragraphs::verify(doc, codec, edit.document())
    }
}
