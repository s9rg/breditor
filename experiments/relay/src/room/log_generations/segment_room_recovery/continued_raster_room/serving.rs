//! Keep the completed restore and its original client files under custody while serving.
use super::{
    RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity, clients::RetainedClients,
    restore::check_completion,
};
use crate::{
    ContinuedAssetStore, Error, Result, Room,
    log::generations::{GenerationDirectory, GenerationDirectoryWitness},
    server::ContinuedRasterRoomBackupIdentity,
};

pub(crate) struct ContinuedServingCustody {
    directory: GenerationDirectory,
    witness: GenerationDirectoryWitness,
    identity: RecoveredContinuedRasterRoomIdentity,
    clients: RetainedClients,
}

impl ContinuedServingCustody {
    pub(crate) fn check(&self, room: &Room) -> Result<()> {
        self.directory.guard_witness(&self.witness)?;
        check_completion(&self.directory, &self.identity)?;
        self.clients.check(&room.recovered_discussion_source_digests())?;
        self.directory.guard()
    }

    pub(crate) fn check_retained_alternates(
        &self,
        target: &RecoveredContinuedRasterRoom,
    ) -> Result<()> {
        if let Some(alternatives) = &self.clients.alternatives {
            for pin in alternatives.pins() {
                if ![&target.clients.journals, &target.clients.alternatives]
                    .into_iter()
                    .flatten()
                    .any(|cohort| cohort.contains(pin))
                {
                    return Err(Error::Contract("continued takeover omitted a retained alternate"));
                }
            }
        }
        Ok(())
    }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn activation_backup(&self) -> &ContinuedRasterRoomBackupIdentity {
        &self.completed.backup
    }

    pub(crate) fn into_serving_parts(self) -> (Room, ContinuedAssetStore, ContinuedServingCustody) {
        let Self { room, assets, clients, directory, identity, completed } = self;
        let custody =
            ContinuedServingCustody { directory, witness: completed.directory, identity, clients };
        (room, assets, custody)
    }
}
