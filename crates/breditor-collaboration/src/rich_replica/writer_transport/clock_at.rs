//! Pure historical-author prefix reads. No local group export or causal mutation.
use super::{WriterClock, frame, version::Version};
use crate::{
    Error,
    rich_replica::{RichReplica, session::writer_id},
};

impl RichReplica {
    /// Enumerate applied authors with nonempty native prefixes, in numeric writer order.
    /// This includes service authors. It is neither a registration set nor a lease.
    #[must_use]
    pub fn applied_writer_ids(&self) -> Vec<String> {
        let version = self.doc.state_vv();
        let mut writers = version
            .iter()
            .filter(|(_, through)| **through > 0)
            .map(|(writer, _)| *writer)
            .collect::<Vec<_>>();
        writers.sort_unstable();
        writers.into_iter().map(|writer| writer.to_string()).collect()
    }

    /// Read any applied author's exact original-transport prefix at a canonical
    /// exclusive counter. Unlike local group export, this also reads peers and
    /// server authors after their later operations have arrived.
    ///
    /// This is a causal prefix, not proof of a semantic action boundary, server
    /// acknowledgement, current permission or ownership of that author's Undo.
    /// No document, journal, observation, pending input or history is changed.
    /// # Errors
    /// Rejects noncanonical/reserved writers, invalid/future counters and native
    /// lineage encoding failure without importing or repairing any operations.
    pub fn writer_clock_at(&self, writer: &str, through: &str) -> Result<WriterClock, Error> {
        self.writer_clock_at_version(writer, through, Version::Original)
    }

    /// Read the same arbitrary-author cut with the existing packing-independent
    /// transport V2 digest. The caller selects the transport explicitly; no old
    /// digest, wire frame or saved history is upgraded or translated.
    /// # Errors
    /// Rejects noncanonical/reserved writers, invalid/future counters and native
    /// lineage encoding failure. Unknown authors admit only their empty prefix.
    pub fn writer_clock_at_v2(&self, writer: &str, through: &str) -> Result<WriterClock, Error> {
        self.writer_clock_at_version(writer, through, Version::Atomic)
    }

    fn writer_clock_at_version(
        &self,
        writer: &str,
        through: &str,
        version: Version,
    ) -> Result<WriterClock, Error> {
        let id = writer_id(writer)?;
        let end = frame::counter(through)?;
        let applied = self.doc.state_vv().get(&id).copied().unwrap_or(0);
        if end > applied {
            return Err(Error::Contract("writer prefix exceeds applied history"));
        }
        Ok(WriterClock {
            writer: writer.into(),
            through: through.into(),
            prefix_digest: version.operations(self, id, 0, end)?,
        })
    }
}
