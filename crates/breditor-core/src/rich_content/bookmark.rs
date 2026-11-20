//! Named bookmarks and internal links of the explicit candidate rich V4.
//!
//! A bookmark is one optional, user-visible name on a text block (paragraph,
//! heading or code block), stored as the block property `breditor/bookmark`. The
//! **name** is the reference target: it travels with its block through moves,
//! wraps, kind changes (paragraph, heading, code block) and Undo, and it is unique
//! per document (a duplicate is a `DuplicateContentId` admission failure, the same
//! law as stable content identities).
//!
//! An internal link is an ordinary standard inline link whose target is exactly
//! `#` + a bookmark name. V4 admits that target as a separate bounded grammar; the
//! external link policy is unchanged. An internal link never opens a new window.
//!
//! **Reference integrity.** A link may point at a name no block carries (a
//! *dangling* or *broken* link): deleting, clearing or cutting a bookmarked block
//! never fails because of incoming links. Instead the document reports broken
//! links exactly ([`RichBookmarkIndex::broken_links`]) and renderers mark them.
//! Renaming through [`crate::rich_content::actions::SetBookmark::rename`] rewrites
//! every referencing link in the same history group, so a rename never breaks a link.
use super::{BlockId, RichDocument};
use crate::{
    document::{ElementNode, Format, NodeRef, PropertyMap, PropertyValue},
    identity::QualifiedName,
    state::EditorContext,
};

/// AST key (`breditor/bookmark`) of the optional bookmark name on a text block.
pub(crate) const BOOKMARK: &str = "bookmark";
/// Inclusive UTF-8 ceiling of one bookmark name.
pub const RICH_BOOKMARK_NAME_MAX_BYTES: usize = 64;
/// Prefix of an internal link target: `#` + bookmark name.
pub const RICH_INTERNAL_LINK_PREFIX: char = '#';

const LINK_FORMAT: &str = "breditor-inline/link";
const LINK_HREF: &str = "breditor-inline/href";
const LINK_NEW_WINDOW: &str = "breditor-inline/new-window";

/// Payload-free bookmark admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichBookmarkError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("bookmarks require the explicit rich V4 profile")]
    Profile,
    /// Bookmarks belong only to an existing paragraph, heading or code block.
    #[error("bookmark requires a paragraph, heading or code block")]
    Target,
    /// The name is outside the bounded bookmark-name grammar.
    #[error("invalid bookmark name")]
    Value,
    /// Another block already carries this name.
    #[error("bookmark name is already used in this document")]
    Duplicate,
    /// A rename names a bookmark that no block carries.
    #[error("bookmark does not exist")]
    Missing,
}

/// One admitted bookmark name: `[A-Za-z][A-Za-z0-9_-]{0,63}`, compared exactly.
///
/// The grammar is ASCII so a name is safe verbatim as a URL fragment, inside an
/// HTML `id` (`bm-` + name) and as a DOCX bookmark name. Case is significant.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct RichBookmarkName(String);

impl RichBookmarkName {
    /// Admit one name without repair (no trimming, case folding or normalization).
    /// # Errors
    /// Returns [`RichBookmarkError::Value`] outside the grammar.
    pub fn try_new(value: impl Into<String>) -> Result<Self, RichBookmarkError> {
        let value = value.into();
        if is_valid_name(&value) { Ok(Self(value)) } else { Err(RichBookmarkError::Value) }
    }
    /// Exact name.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
    /// The internal link target `#` + name.
    #[must_use]
    pub fn link_target(&self) -> String {
        format!("{RICH_INTERNAL_LINK_PREFIX}{}", self.0)
    }
}

/// Whether `value` is in the bounded bookmark-name grammar.
#[must_use]
pub fn is_valid_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= RICH_BOOKMARK_NAME_MAX_BYTES
        && bytes[0].is_ascii_alphabetic()
        && bytes.iter().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

/// The bookmark name of an internal link target, or `None` for any other href.
#[must_use]
pub fn internal_link_name(href: &str) -> Option<&str> {
    href.strip_prefix(RICH_INTERNAL_LINK_PREFIX).filter(|name| is_valid_name(name))
}

pub(crate) fn supports_kind(kind: &str) -> bool {
    matches!(kind, "breditor/paragraph" | "breditor/heading" | "breditor/code-block")
}

pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    supports_kind(kind) && name.namespace() == "breditor" && name.local_name() == BOOKMARK
}

/// Exact bookmark name of one element, if any (validated by admission).
pub(crate) fn name_of(node: &ElementNode) -> Option<&str> {
    super::ast_properties::property(node, BOOKMARK).and_then(PropertyValue::as_string)
}

/// Complete-tree value law for one block's bookmark property.
pub(crate) fn validate(node: &ElementNode) -> Result<(), &'static str> {
    match super::ast_properties::property(node, BOOKMARK) {
        None => Ok(()),
        Some(value) if value.as_string().is_some_and(is_valid_name) => Ok(()),
        Some(_) => Err("invalid bookmark name"),
    }
}

fn link_property<'a>(format: &'a Format, name: &'static str) -> Option<&'a PropertyValue> {
    format.properties().get(&QualifiedName::from_known_static(name))
}

/// Whether `format` is a standard inline link.
pub(crate) fn is_link(format: &Format) -> bool {
    format.kind().as_str() == LINK_FORMAT
}

/// The internal target name of a standard link format, if its href starts with `#`.
/// `Some(Err(()))` marks a `#` target outside the grammar.
pub(crate) fn link_fragment(format: &Format) -> Option<Result<&str, ()>> {
    if !is_link(format) {
        return None;
    }
    let href = link_property(format, LINK_HREF)?.as_string()?;
    let fragment = href.strip_prefix(RICH_INTERNAL_LINK_PREFIX)?;
    Some(if is_valid_name(fragment) { Ok(fragment) } else { Err(()) })
}

/// V4 value law of one link format: a `#` target is `#` + a bookmark name and
/// never opens a new window. External targets keep their unchanged policy.
pub(crate) fn validate_link(format: &Format) -> Result<(), &'static str> {
    match link_fragment(format) {
        None => Ok(()),
        Some(Err(())) => Err("internal link target is not # followed by a bookmark name"),
        Some(Ok(_)) => {
            if link_property(format, LINK_NEW_WINDOW).and_then(PropertyValue::as_boolean)
                == Some(true)
            {
                Err("an internal link never opens a new window")
            } else {
                Ok(())
            }
        }
    }
}

/// `format` with its internal target `#from` replaced by `#to`; other formats unchanged.
pub(crate) fn retarget_link(format: &Format, from: &str, to: &RichBookmarkName) -> Option<Format> {
    if link_fragment(format) != Some(Ok(from)) {
        return None;
    }
    let href = QualifiedName::from_known_static(LINK_HREF);
    let properties = PropertyMap::try_from_sorted(
        format
            .properties()
            .iter()
            .map(|(name, value)| {
                if *name == href {
                    (name.clone(), PropertyValue::from_string(to.link_target()))
                } else {
                    (name.clone(), value.clone())
                }
            })
            .collect(),
    )
    .ok()?;
    Some(Format::new(format.kind().clone(), properties))
}

/// One bookmark in document order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichBookmarkEntry {
    name: RichBookmarkName,
    block: BlockId,
}

impl RichBookmarkEntry {
    /// Exact name.
    #[must_use]
    pub const fn name(&self) -> &RichBookmarkName {
        &self.name
    }
    /// Stable identity of the block carrying it.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
}

/// One internal link occurrence: the text block holding it and its target name.
///
/// Adjacent text runs carrying one equal link are one occurrence.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichInternalLink {
    block: BlockId,
    target: RichBookmarkName,
}

impl RichInternalLink {
    /// Stable identity of the text block holding the link.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Target bookmark name (without `#`).
    #[must_use]
    pub const fn target(&self) -> &RichBookmarkName {
        &self.target
    }
}

/// Exact bookmark and internal-link inventory of one admitted V4 snapshot.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RichBookmarkIndex {
    bookmarks: Vec<RichBookmarkEntry>,
    links: Vec<RichInternalLink>,
}

impl RichBookmarkIndex {
    /// Read every bookmark and internal link in document order.
    /// # Errors
    /// Rejects incompatible profile/proof/limits with [`RichBookmarkError::Profile`].
    pub fn read(
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Self, RichBookmarkError> {
        if !context.schema().supports_rich_bookmarks()
            || !document.document().is_proven_for(context.schema(), context.limits())
        {
            return Err(RichBookmarkError::Profile);
        }
        Ok(Self::scan(document))
    }

    pub(crate) fn scan(document: &RichDocument) -> Self {
        let mut index = Self::default();
        visit(document.document().root(), &mut index);
        index
    }

    /// Every bookmark in document order.
    #[must_use]
    pub fn bookmarks(&self) -> &[RichBookmarkEntry] {
        &self.bookmarks
    }
    /// Every internal link occurrence in document order.
    #[must_use]
    pub fn links(&self) -> &[RichInternalLink] {
        &self.links
    }
    /// Block carrying `name`, if any.
    #[must_use]
    pub fn block_of(&self, name: &str) -> Option<&BlockId> {
        self.bookmarks.iter().find(|entry| entry.name.as_str() == name).map(|entry| &entry.block)
    }
    /// Internal links whose target no block carries, in document order.
    #[must_use]
    pub fn broken_links(&self) -> Vec<&RichInternalLink> {
        self.links.iter().filter(|link| self.block_of(link.target.as_str()).is_none()).collect()
    }
}

fn block_id(node: &ElementNode) -> Option<BlockId> {
    super::ast_properties::string(node, "block-id").ok().and_then(|id| BlockId::try_new(id).ok())
}

fn visit(node: &NodeRef, index: &mut RichBookmarkIndex) {
    let Some(element) = node.as_element() else { return };
    if let Some(name) = name_of(element)
        && let (Ok(name), Some(block)) = (RichBookmarkName::try_new(name), block_id(element))
    {
        index.bookmarks.push(RichBookmarkEntry { name, block });
    }
    let mut previous: Option<&Format> = None;
    for child in element.children() {
        let Some(text) = child.as_text() else {
            previous = None;
            continue;
        };
        let link = text.formats().iter().find(|format| is_link(format));
        if let Some(format) = link
            && previous != Some(format)
            && let Some(Ok(target)) = link_fragment(format)
            && let (Ok(target), Some(block)) =
                (RichBookmarkName::try_new(target), block_id(element))
        {
            index.links.push(RichInternalLink { block, target });
        }
        previous = link;
    }
    for child in element.children() {
        visit(child, index);
    }
}

/// `node` with every internal link `#from` retargeted to `#to`; `None` when unchanged.
pub(crate) fn retarget_block(node: &NodeRef, from: &str, to: &RichBookmarkName) -> Option<NodeRef> {
    let element = node.as_element()?;
    let mut changed = false;
    let children = element
        .children()
        .iter()
        .map(|child| {
            let Some(text) = child.as_text() else { return Some(child.clone()) };
            if !text.formats().iter().any(|format| retarget_link(format, from, to).is_some()) {
                return Some(child.clone());
            }
            changed = true;
            let formats = crate::document::FormatSet::try_from_formats(
                text.formats()
                    .iter()
                    .map(|format| retarget_link(format, from, to).unwrap_or_else(|| format.clone()))
                    .collect(),
            )
            .ok()?;
            Some(NodeRef::text(
                crate::document::TextNode::try_new(text.text().to_owned(), formats).ok()?,
            ))
        })
        .collect::<Option<Vec<_>>>()?;
    if !changed {
        return None;
    }
    Some(NodeRef::element(element.try_with_children(children).ok()?))
}

/// Text blocks (in document order) holding at least one internal link to `from`.
pub(crate) fn referencing_blocks(document: &RichDocument, from: &str) -> Vec<BlockId> {
    let mut blocks = Vec::new();
    for link in RichBookmarkIndex::scan(document).links {
        if link.target.as_str() == from && !blocks.contains(&link.block) {
            blocks.push(link.block);
        }
    }
    blocks
}

impl RichDocument {
    /// Exact bookmark name carried by `block`, if any.
    #[must_use]
    pub fn bookmark(&self, block: &BlockId) -> Option<RichBookmarkName> {
        let path = self.block_path(block)?;
        let node = self.document().node_at(path).ok()?.as_element()?;
        name_of(node).and_then(|name| RichBookmarkName::try_new(name).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_grammar_accepts_and_rejects_exactly() {
        for good in ["a", "Intro", "section-2", "a_b", "Z9", &"a".repeat(64)] {
            assert!(is_valid_name(good), "{good}");
        }
        for bad in [
            "",
            "1abc",
            "-a",
            "_a",
            "a b",
            "a.b",
            "a#b",
            "é",
            "a/b",
            "a%20",
            &"a".repeat(65),
            " a",
            "a\n",
        ] {
            assert!(!is_valid_name(bad), "{bad:?}");
        }
        assert_eq!(internal_link_name("#intro"), Some("intro"));
        assert_eq!(internal_link_name("intro"), None);
        assert_eq!(internal_link_name("#"), None);
        assert_eq!(internal_link_name("#1"), None);
        assert_eq!(internal_link_name("https://example.com/#a"), None);
    }
}
