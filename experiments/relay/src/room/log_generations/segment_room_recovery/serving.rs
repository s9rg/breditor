//! Explicit authenticated reference serving under a genuine host-selected deployment epoch.
use super::{
    GenerationDirectory, RasterCustody, RecoveredRelaySegmentRoom, RelaySegmentClientJournalPin,
    client_journals::RetainedJournals, client_uploads::RetainedUploads,
    discussion_sources::is_participant,
};
use crate::{
    Error, Result, Room,
    assets::AssetStore,
    log::generations::GenerationFileWitness,
    server::{Authentication, RoomDeploymentLease, router_with_recovered_segment},
};

use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

pub(crate) struct RelaySegmentServingCustody {
    directory: GenerationDirectory,
    raster: RasterCustody,
    _uploads: Option<RetainedUploads>,
    journals: Option<RetainedJournals>,
    pub(super) alternatives: Option<RetainedJournals>,
}

impl RelaySegmentServingCustody {
    pub(crate) fn check(&self) -> Result<()> {
        self.directory.guard()?;
        self.raster.guard_root()?;
        for journals in [&self.journals, &self.alternatives].into_iter().flatten() {
            journals.check()?;
        }
        Ok(())
    }

    pub(crate) fn check_alternate_continuity(
        &self,
        target: &RecoveredRelaySegmentRoom,
    ) -> Result<()> {
        if let Some(alternates) = &self.alternatives {
            let destinations = [&target.journals, &target.alternatives];
            for pin in alternates.pins() {
                if !destinations
                    .iter()
                    .filter_map(|entry| entry.as_ref())
                    .any(|cohort| cohort.contains(pin))
                {
                    return Err(Error::Contract(
                        "relay segment handover omitted a retained alternate",
                    ));
                }
            }
        }
        Ok(())
    }

    pub(crate) fn export_alternates(
        &self,
        destination: &Path,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        self.check()?;
        let Some(alternates) = &self.alternatives else {
            return Ok(Vec::new());
        };
        self.export_journals(
            destination,
            (0..alternates.pins().len()).map(|index| (alternates, index)),
        )
    }

    pub(crate) fn export_recovered_discussion_sources(
        &self,
        requested: &BTreeSet<[u8; 32]>,
        destination: &Path,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        let mut selected = BTreeMap::new();
        for journals in [&self.journals, &self.alternatives].into_iter().flatten() {
            for (index, pin) in journals.pins().iter().enumerate() {
                if is_participant(pin) && requested.contains(&pin.sha256) {
                    selected.insert(pin.sha256, (journals, index));
                }
            }
        }
        if selected.len() != requested.len() {
            return Err(Error::Contract("relay segment is missing a recovered discussion source"));
        }
        self.export_journals(destination, selected.into_values())
    }

    fn export_journals<'a>(
        &self,
        destination: &Path,
        sources: impl Iterator<Item = (&'a RetainedJournals, usize)>,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        self.check()?;
        let mut sources = sources.peekable();
        if sources.peek().is_none() {
            return Ok(Vec::new());
        }
        let directory = GenerationDirectory::create(destination)?;
        let mut pins = Vec::new();
        for (position, (journals, index)) in sources.enumerate() {
            let name = format!("{position}.participant");
            let mut file = directory.create_file(&name, &[])?;
            let witness = GenerationFileWitness::of(&file)?;
            journals.copy(index, &mut file)?;
            file.sync_all()?;
            witness.guard(&file, &directory.path.join(name))?;
            pins.push(journals.pins()[index].clone());
        }
        directory.sync()?;
        directory.guard()?;
        self.check()?;
        Ok(pins)
    }
}

impl RecoveredRelaySegmentRoom {
    /// Serve the restored room and rasters behind the existing deployment epoch and
    /// ordinary account/Origin authentication. Supply a fresh lease from the same
    /// authority all participating hosts use. Obtain approval for the exact backup cut
    /// and reconcile durable client/provider work before commissioning a replacement.
    ///
    /// # Errors
    /// Wrong room, unavailable or superseded lease, or changed custody refuses.
    pub fn into_serving_router(
        self,
        authentication: Authentication,
        lease: RoomDeploymentLease,
    ) -> Result<axum::Router> {
        if self.requires_verified_handover() {
            return Err(Error::Contract("client inputs require verified handover"));
        }
        let (router, _) = router_with_recovered_segment(self, authentication, lease)?;
        Ok(router)
    }

    pub(crate) fn into_deployment_parts(
        self,
    ) -> Result<(Room, AssetStore, RelaySegmentServingCustody)> {
        self.check_custody()?;
        let Self { room, assets, directory, raster, uploads, journals, alternatives, .. } = self;
        Ok((
            room,
            assets,
            RelaySegmentServingCustody {
                directory,
                raster,
                _uploads: uploads,
                journals,
                alternatives,
            },
        ))
    }
}
