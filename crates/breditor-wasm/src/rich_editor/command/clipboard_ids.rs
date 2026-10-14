//! Per-authored-paste identity namespace supplied by the host; never rolled back or copied.
use super::support::checked;
use crate::{BreditorError, rich_editor::selection::decimal};
use breditor_core::rich_content::{
    BlockId, CausalStamp, ChangeId, ReplicaId, RichClipboardError, RichClipboardIdAllocator,
    RichClipboardIdentityKind,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Allocation {
    prefix: String,
    #[serde(deserialize_with = "decimal")]
    replica: u64,
    #[serde(deserialize_with = "decimal")]
    counter: u64,
    #[serde(deserialize_with = "decimal")]
    lamport: u64,
}
pub(super) struct Allocator {
    prefix: String,
    next: u64,
    stamp: CausalStamp,
}
impl Allocation {
    pub(super) fn allocator(self) -> Result<Allocator, BreditorError> {
        checked(BlockId::try_new(&self.prefix))?;
        if self.prefix.len() > 90 {
            return Err(super::invalid());
        }
        Ok(Allocator {
            prefix: self.prefix,
            next: 0,
            stamp: CausalStamp::new(
                self.lamport,
                ChangeId::new(checked(ReplicaId::try_new(self.replica))?, self.counter),
            ),
        })
    }
}
impl RichClipboardIdAllocator for Allocator {
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
