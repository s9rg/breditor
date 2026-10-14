//! Explicit scalar-aligned UTF-16 conversion at the replication boundary.

use loro::{
    ContainerTrait, LoroDoc, LoroText,
    cursor::{Cursor, PosType, Side},
};
use serde::{Deserialize, Serialize};

use crate::Error;

/// Which side of an insertion remains attached to a caret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Affinity {
    /// Prefer the preceding character's right edge.
    Before,
    /// Prefer the following character's left edge.
    After,
}

/// A durable cursor; coordinates are never used as its persistent identity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextAnchor {
    cursor: Vec<u8>,
    // Loro's binary cursor omits origin_pos. Retain its Unicode coordinate
    // explicitly for future UndoItemMeta use, instead of assuming decode keeps it.
    origin_unicode: u32,
}

/// Directional body selection; anchor/focus order is never sorted away.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextRange {
    /// Fixed end of a directional selection.
    pub anchor: TextAnchor,
    /// Moving end of a directional selection.
    pub focus: TextAnchor,
}

/// Convert an admitted UTF-16 offset to the engine's event coordinate system.
///
/// # Errors
/// Rejects out-of-bounds offsets and the interior of a surrogate pair.
pub fn event_offset(text: &LoroText, offset: u32) -> Result<usize, Error> {
    let offset = usize::try_from(offset).map_err(|_| Error::Offset)?;
    let unicode =
        text.convert_pos(offset, PosType::Utf16, PosType::Unicode).ok_or(Error::Offset)?;
    if text.convert_pos(unicode, PosType::Unicode, PosType::Utf16) != Some(offset) {
        return Err(Error::Offset);
    }
    text.convert_pos(offset, PosType::Utf16, PosType::Event).ok_or(Error::Offset)
}

impl TextAnchor {
    pub(crate) fn empty(container: loro::ContainerID, affinity: Affinity) -> Self {
        let side = if affinity == Affinity::Before { Side::Left } else { Side::Right };
        Self { cursor: Cursor::new(None, container, side, 0).encode(), origin_unicode: 0 }
    }

    /// Capture an insertion-affine cursor at a scalar boundary.
    ///
    /// # Errors
    /// Rejects invalid offsets and positions not backed by an attached container.
    pub fn capture(text: &LoroText, offset: u32, affinity: Affinity) -> Result<Self, Error> {
        let event = event_offset(text, offset)?;
        let unicode =
            text.convert_pos(event, PosType::Event, PosType::Unicode).ok_or(Error::Offset)?;
        // A cursor on the next character always follows insertions before it.
        // Before affinity instead binds to the preceding scalar, not to a
        // UTF-16 code unit (which could be half an emoji).
        let (position, side) = if matches!(affinity, Affinity::Before) && unicode > 0 {
            (
                text.convert_pos(unicode - 1, PosType::Unicode, PosType::Event)
                    .ok_or(Error::Offset)?,
                Side::Right,
            )
        } else {
            (event, if matches!(affinity, Affinity::Before) { Side::Left } else { Side::Middle })
        };
        let cursor = if unicode == 0 && matches!(affinity, Affinity::Before) {
            Cursor::new(None, text.id(), Side::Left, 0)
        } else if text.len_unicode() == 0 && matches!(affinity, Affinity::After) {
            Cursor::new(None, text.id(), Side::Right, 0)
        } else {
            text.get_cursor(position, side).ok_or(Error::Anchor)?
        };
        let origin =
            text.convert_pos(position, PosType::Event, PosType::Unicode).ok_or(Error::Offset)?;
        Ok(Self {
            cursor: cursor.encode(),
            origin_unicode: u32::try_from(origin).map_err(|_| Error::Offset)?,
        })
    }

    /// Resolve against this exact live text container, without creating one.
    ///
    /// # Errors
    /// Rejects malformed/oversized cursors, mismatched or deleted containers,
    /// unavailable retained history, and any non-scalar result.
    pub fn resolve(&self, doc: &LoroDoc, text: &LoroText) -> Result<u32, Error> {
        let cursor = self.engine_cursor()?;
        if text.is_deleted() || cursor.container != text.id() {
            return Err(Error::Anchor);
        }
        let query = doc.get_cursor_pos(&cursor).map_err(|_| Error::Anchor)?;
        let mut position = query.current.pos;
        // Loro returns the position of the surviving character, and returns
        // its side separately. A deleted-character fallback already represents
        // the resulting gap and must not advance over the next character.
        if query.update.is_none() && cursor.id.is_some() && cursor.side == Side::Right {
            let unicode = text
                .convert_pos(position, PosType::Event, PosType::Unicode)
                .ok_or(Error::Anchor)?;
            position = text
                .convert_pos(unicode + 1, PosType::Unicode, PosType::Event)
                .ok_or(Error::Anchor)?;
        }
        let utf16 =
            text.convert_pos(position, PosType::Event, PosType::Utf16).ok_or(Error::Anchor)?;
        let result = u32::try_from(utf16).map_err(|_| Error::Offset)?;
        event_offset(text, result)?;
        Ok(result)
    }

    pub(crate) fn engine_cursor(&self) -> Result<Cursor, Error> {
        if self.cursor.len() > 1024 {
            return Err(Error::Limit("cursor bytes"));
        }
        let decoded = Cursor::decode(&self.cursor).map_err(|_| Error::Anchor)?;
        Ok(Cursor::new(
            decoded.id,
            decoded.container,
            decoded.side,
            usize::try_from(self.origin_unicode).map_err(|_| Error::Offset)?,
        ))
    }
}
