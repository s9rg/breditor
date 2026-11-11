//! Test-only stops after actual filesystem publications; never a replacement persistence model.
use super::state::Generations;
use crate::{Error, Result, log::Log};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RotationPoint {
    ContinuationReady,
    IntentSynced,
    ContinuationPublished,
    ManifestSynced,
    HeadSynced,
    StageRetired,
    IntentRetired,
    MemoryUpdated,
}
impl Generations {
    pub(super) fn interrupt(&self, point: RotationPoint) -> Result<()> {
        if self.stop_after == Some(point) {
            return Err(Error::Contract("test interruption after durable physical prefix"));
        }
        Ok(())
    }
}
impl Log {
    pub(crate) fn append_incomplete_header_for_test(&self) -> Result<()> {
        use std::io::Write;
        // Preserve the actual held append cursor and use an actual incomplete OS write prefix.
        self.file.try_clone()?.write_all(&[1, 2, 3])?;
        self.file.sync_all()?;
        Ok(())
    }
    pub(crate) fn append_interrupted_grant_for_test(
        &self,
        complete_corruption: bool,
    ) -> Result<Vec<u8>> {
        use super::super::{Event, frame};
        use crate::Role;
        use std::io::Write;

        let frame = frame::encode(
            Event::Grant {
                actor: "owner".into(),
                principal: "interrupted-reader".into(),
                role: Some(Role::Reader),
            },
            self.family,
            self.next,
            self.previous,
        )?;
        let mut bytes = frame.header.to_vec();
        if complete_corruption {
            bytes.extend(frame.payload);
            bytes[frame.header.len()] ^= 1;
        } else {
            bytes.extend(&frame.payload[..frame.payload.len() / 2]);
        }
        self.file.try_clone()?.write_all(&bytes)?;
        self.file.sync_all()?;
        Ok(bytes)
    }

    pub(crate) fn interrupt_rotation_for_test(&mut self, point: RotationPoint) -> Result<()> {
        self.ready()?;
        self.generations
            .as_mut()
            .ok_or(Error::Contract("generation layout required"))?
            .stop_after = Some(point);
        Ok(())
    }
}
