//! Descriptive immutable range admission remains separate from retained source/current proof.
use super::{AffineTextRangeInfo, packet::Packet};
use crate::{Error, rich_replica::RichReplica};
impl RichReplica {
    /// Read immutable range metadata, not an applicable edit or proof that source operations exist.
    /// # Errors
    /// Invalid binding, family, digest, closed fields, non-text selection or limits refuse.
    pub fn read_affine_text_range(&self, input: &str) -> Result<AffineTextRangeInfo, Error> {
        Ok(Packet::read(self, input)?.info())
    }
}
