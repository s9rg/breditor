//! Deterministic host-reserved content IDs; traversal and identity domains remain native.
use super::{RichClipboardError, RichClipboardIdAllocator, RichClipboardIdentityKind};
use crate::rich_content::{BlockId, CausalStamp, ChangeId, ReplicaId};
/// One permanently consumed paste namespace. It grants no schema, writer or shared-clock authority.
pub struct RichClipboardNamespace {
    prefix: String,
    next: u64,
    stamp: CausalStamp,
}
impl RichClipboardNamespace {
    /// Use a semantic local clock; shared callers must supply their actual authored priority instead.
    /// # Errors
    /// Invalid or oversized prefixes reject. Host historical uniqueness remains mandatory.
    pub fn try_new(prefix: &str) -> Result<Self, RichClipboardError> {
        Self::with_stamp(
            prefix,
            CausalStamp::new(
                1,
                ChangeId::new(ReplicaId::try_new(1).map_err(|_| RichClipboardError::Invariant)?, 0),
            ),
        )
    }
    /// Bind a native authoring clock while keeping the same deterministic identity traversal.
    /// # Errors
    /// Prefixes must leave room for typed counter suffixes within the stable-ID budget.
    pub fn with_stamp(prefix: &str, stamp: CausalStamp) -> Result<Self, RichClipboardError> {
        BlockId::try_new(prefix).map_err(|_| RichClipboardError::Allocation)?;
        if prefix.len() > 90 {
            return Err(RichClipboardError::Allocation);
        }
        Ok(Self { prefix: prefix.into(), next: 0, stamp })
    }
}
impl RichClipboardIdAllocator for RichClipboardNamespace {
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
        let value = format!("{}:{suffix}:{}", self.prefix, self.next);
        self.next = self.next.checked_add(1).ok_or(RichClipboardError::Allocation)?;
        Ok(value)
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        Ok(self.stamp)
    }
}
