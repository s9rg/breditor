//! A fresh host-reserved paste namespace avoids mirroring Rust's allocation traversal in JS.
use crate::Error;
use breditor_core::rich_content::{
    CausalStamp, ChangeId, ReplicaId, RichClipboardError, RichClipboardIdAllocator,
    RichClipboardIdentityKind,
};

/// One permanently consumed paste prefix; the host must never reuse it, including after failure.
pub struct ClipboardNamespace {
    prefix: String,
    next: u64,
}
impl ClipboardNamespace {
    /// Validate a bounded fresh host namespace, not a copied document/content identity.
    /// # Errors
    /// Rejects invalid prefixes or insufficient suffix room. Historical uniqueness remains host-owned.
    pub fn try_new(prefix: &str) -> Result<Self, Error> {
        crate::actions::validate_id(prefix)?;
        if prefix.len() > 90 {
            return Err(Error::Limit("clipboard namespace bytes"));
        }
        Ok(Self { prefix: prefix.into(), next: 0 })
    }
}
impl RichClipboardIdAllocator for ClipboardNamespace {
    fn next(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        let suffix = match kind {
            RichClipboardIdentityKind::Block => "b",
            RichClipboardIdentityKind::Table => "t",
            RichClipboardIdentityKind::Row => "r",
            RichClipboardIdentityKind::Column => "c",
            RichClipboardIdentityKind::Image => "i",
            RichClipboardIdentityKind::AssetGeneration => "g",
            RichClipboardIdentityKind::Merge => "m",
        };
        let id = format!("{}:{suffix}:{}", self.prefix, self.next);
        self.next = self.next.checked_add(1).ok_or(RichClipboardError::Allocation)?;
        Ok(id)
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        // Admission-only semantic clock. Paste actions replace this with their actual authored stamp.
        Ok(CausalStamp::new(
            1,
            ChangeId::new(ReplicaId::try_new(1).map_err(|_| RichClipboardError::Allocation)?, 0),
        ))
    }
}
