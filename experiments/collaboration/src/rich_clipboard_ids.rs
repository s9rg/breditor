//! Browser hosts allocate durable IDs before dispatch; semantic paste never invents asset bytes.
use crate::Error;
use breditor_core::rich_content::{
    CausalStamp, ChangeId, ReplicaId, RichClipboardError, RichClipboardIdAllocator,
    RichClipboardIdentityKind,
};
use serde::Deserialize;
use std::collections::VecDeque;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Kind {
    Block,
    Table,
    Row,
    Column,
    Image,
    AssetGeneration,
    Merge,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AllocatedId {
    kind: Kind,
    id: String,
}
pub(crate) struct Ids(VecDeque<AllocatedId>);
impl Ids {
    pub fn new(ids: Vec<AllocatedId>) -> Result<Self, Error> {
        if ids.len() > 20_000 {
            return Err(Error::Limit("clipboard allocated identities"));
        }
        for id in &ids {
            crate::actions::validate_id(&id.id)?;
        }
        Ok(Self(ids.into()))
    }
}
impl RichClipboardIdAllocator for Ids {
    fn next(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        let id = self.0.pop_front().ok_or(RichClipboardError::Allocation)?;
        let matches = matches!(
            (&id.kind, kind),
            (Kind::Block, RichClipboardIdentityKind::Block)
                | (Kind::Table, RichClipboardIdentityKind::Table)
                | (Kind::Row, RichClipboardIdentityKind::Row)
                | (Kind::Column, RichClipboardIdentityKind::Column)
                | (Kind::Image, RichClipboardIdentityKind::Image)
                | (Kind::AssetGeneration, RichClipboardIdentityKind::AssetGeneration)
                | (Kind::Merge, RichClipboardIdentityKind::Merge)
        );
        if !matches {
            return Err(RichClipboardError::Allocation);
        }
        Ok(id.id)
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        // Needed only to admit semantic re-keying. Shared actions discard this placeholder
        // and author every intent with their actual causal operation stamp.
        Ok(CausalStamp::new(
            1,
            ChangeId::new(ReplicaId::try_new(1).map_err(|_| RichClipboardError::Allocation)?, 0),
        ))
    }
}
