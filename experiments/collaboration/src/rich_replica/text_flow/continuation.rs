//! Unmarked concurrent insertions after a routed interval retain its source ownership.
//!
//! Loro's boundary expansion can leave a concurrent append outside the style's EOF
//! anchor. Only characters absent from the routing action's causal past continue
//! that interval. Previously observed/restored original text never inherits by proximity.
use crate::{Error, anchor::event_offset, register::Stamp};
use loro::{Frontiers, ID, LoroDoc, LoroText, VersionVector, cursor::Side};

pub(super) struct Continuation {
    fragment: String,
    seen: VersionVector,
}
impl Continuation {
    pub fn new(doc: &LoroDoc, stamp: Stamp, fragment: String) -> Result<Self, Error> {
        let (_, writer, counter) = stamp.words();
        let id = ID::new(writer, i32::try_from(counter).map_err(|_| Error::Anchor)?);
        let seen = doc
            .frontiers_to_vv(&Frontiers::from_id(id))
            .ok_or(Error::Contract("routing causal past"))?;
        Ok(Self { fragment, seen })
    }
    pub fn fragment(&self) -> &str {
        &self.fragment
    }
    pub fn unobserved(&self, text: &LoroText, offset: u32) -> Result<bool, Error> {
        let cursor =
            text.get_cursor(event_offset(text, offset)?, Side::Middle).ok_or(Error::Anchor)?;
        let id = cursor.id.ok_or(Error::Anchor)?;
        Ok(self.seen.get(&id.peer).copied().unwrap_or(0) <= id.counter)
    }
}

pub(super) struct Segment {
    pub start: u32,
    pub text: String,
    pub fragment: String,
}
pub(super) fn segments(
    prior: &mut Option<Continuation>,
    text: &LoroText,
    start: u32,
    content: &str,
    birth: &str,
) -> Result<Vec<Segment>, Error> {
    let mut result: Vec<Segment> = vec![];
    let mut offset = start;
    for character in content.chars() {
        let inherited = if let Some(previous) = prior.as_ref() {
            if previous.unobserved(text, offset)? {
                Some(previous.fragment().to_owned())
            } else {
                None
            }
        } else {
            None
        };
        if inherited.is_none() {
            *prior = None;
        }
        let fragment = inherited.unwrap_or_else(|| birth.into());
        if let Some(last) = result.last_mut()
            && last.fragment == fragment
        {
            last.text.push(character);
        } else {
            if result.len() >= 20_000 {
                return Err(Error::Limit("text-flow continuation segments"));
            }
            result.push(Segment { start: offset, text: character.to_string(), fragment });
        }
        offset = offset
            .checked_add(u32::try_from(character.len_utf16()).map_err(|_| Error::Offset)?)
            .ok_or(Error::Offset)?;
    }
    Ok(result)
}
