//! Derived publication boundaries; never a new durable journal or authored repair.
use super::{
    super::{RichReplica, session::writer_id},
    frame::{GroupKind, WriterDependency},
};
use crate::Error;
use loro::VersionVector;
use std::collections::BTreeMap;
pub(in crate::rich_replica) struct Window {
    pub from: i32,
    pub through: i32,
    pub(super) kind: GroupKind,
    pub dependencies: Vec<WriterDependency>,
}
impl RichReplica {
    pub(in crate::rich_replica) fn note_writer_window(
        &mut self,
        before: &VersionVector,
        genesis: bool,
    ) -> Result<(), Error> {
        let writer = writer_id(self.writer())?;
        let from = before.get(&writer).copied().unwrap_or(0);
        let through = self.doc.state_vv().get(&writer).copied().unwrap_or(0);
        if from == through {
            return Ok(());
        }
        if from < 0 || through < from || self.writer_windows.last().map_or(0, |w| w.through) != from
        {
            return Err(Error::Contract("shared authored group continuity"));
        }
        let dependencies = before
            .iter()
            .filter(|(peer, count)| **peer != writer && **count > 0)
            .map(|(peer, count)| (*peer, *count))
            .collect::<BTreeMap<_, _>>()
            .into_iter()
            .map(|(peer, count)| WriterDependency {
                writer: peer.to_string(),
                counter: count.to_string(),
            })
            .collect();
        self.writer_windows.push(Window {
            from,
            through,
            kind: if genesis { GroupKind::Genesis } else { GroupKind::Action },
            dependencies,
        });
        Ok(())
    }
}
