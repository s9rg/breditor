//! Admit both frames of one serialized decision before writing either frame.
use super::{Event, Log, frame};
use crate::{Error, Result};

const _: () = assert!(2 * (super::MAX_RECORD + super::HEADER) <= super::MAX_LOG);

impl Log {
    pub(crate) fn append_pair(
        &mut self,
        prepare: Event,
        commit: impl FnOnce(u64) -> Event,
    ) -> Result<(u64, u64)> {
        self.ready()?;
        let prepared_at = self.next;
        let committed_at =
            prepared_at.checked_add(1).ok_or(Error::Contract("log global sequence"))?;
        let prepare = frame::encode(prepare, self.family, prepared_at, self.previous)?;
        let commit = frame::encode(commit(prepared_at), self.family, committed_at, prepare.digest)?;

        // Two bounded records fit in an empty WAL. Check retained capacity and
        // whether a continuation is available, then let each append rotate at
        // the usual frame boundary so the durable sequence stays unchanged.
        if self.check_append_capacity(2, prepare.bytes + commit.bytes)? {
            self.check_rotation_staging_capacity()?;
        }
        self.append_encoded(&prepare)?;
        let result = self.ready().and_then(|()| self.append_encoded(&commit));
        if result.is_err() {
            self.invalidate();
        }
        Ok((prepared_at, result?))
    }
}
